import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Type } from "typebox";
import { MAX_TDD_ITER, loadServiceConfig } from "../config";
import { activeServiceFlow, advanceFlow, cycleIdFromPath, readFlow } from "../state";
import { subagentCall } from "../subagent";
import { compileChangedPython, runServiceTests, tailOutput } from "../test-runner";
import { repoRoot } from "../utils";

export function registerTddGreen(pi: any): void {
	pi.registerTool({
		name: "tdd_green",
		label: "TDD Green (verify tests pass)",
		description: "TDD GREEN gate. Verifies registered tests now PASS, compiles changed Python modules. Requires valid tdd_red manifest.",
		promptSnippet: "Verify the RED-registered tests now pass",
		promptGuidelines: [
			"Call AFTER green-impl agent. Pass the SAME test paths that tdd_red registered.",
			"If not green, re-run green-impl, then tdd_green again (up to 100 attempts).",
		],
		parameters: Type.Object({
			service: Type.String({ description: "Service slug." }),
			planPath: Type.String({ description: "Plan path (must match tdd_red manifest)." }),
			testPaths: Type.Array(Type.String(), { description: "Test paths (must match tdd_red manifest)." }),
		}),
		async execute(_toolCallId: string, params: any) {
			const { service, planPath, testPaths } = params as { service: string; planPath: string; testPaths: string[] };
			const wt = repoRoot();

			// Gate: require active cycle
			const active = activeServiceFlow(wt);
			if (!active) throw new Error("No active TDD cycle. Call tdd_start() first.");

			const tddDir = join(wt, dirname(planPath));
			const manifestPath = join(tddDir, "red.json");
			if (!existsSync(manifestPath)) throw new Error(`No valid RED for '${service}'. Call tdd_red first.`);

			const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
				planPath: string; testPaths: string[]; redVerified: boolean; attempts?: number;
				lastGreen?: boolean; lastSummary?: string; lastGreenAt?: string;
			};
			if (!manifest.redVerified) throw new Error(`RED not verified for '${service}'. Call tdd_red first.`);
			if (manifest.planPath !== planPath) throw new Error(`planPath mismatch.`);
			const reg = manifest.testPaths.slice().sort().join("\n");
			const prov = testPaths.slice().sort().join("\n");
			if (reg !== prov) throw new Error(`testPaths mismatch.\n--- registered ---\n${reg}\n--- provided ---\n${prov}`);

			const attempt = Number(manifest.attempts ?? 0) + 1;
			if (attempt > MAX_TDD_ITER) throw new Error(`MAX_ITER (${MAX_TDD_ITER}) reached.`);

			const config = loadServiceConfig(wt);
			const cfg = config[service];
			if (!cfg) throw new Error(`Unknown service '${service}'.`);

			const { result, stdout } = runServiceTests(cfg, testPaths, wt);
			const tail = tailOutput(stdout);
			let green = result.ran && result.failed === 0 && result.passed >= 1;
			let compileMsg = "";
			if (green && cfg.runner === "pytest") {
				const cc = compileChangedPython(cfg.dir, wt);
				if (!cc.ok) {
					green = false;
					compileMsg = `\n---- py_compile errors ----\n${tailOutput(cc.errors)}\n\nTests pass, but changed Python modules do not COMPILE.`;
				} else {
					compileMsg = cc.compiled > 0 ? `\n✅ Compile check: ${cc.compiled} changed .py file(s) compile cleanly.` : "";
				}
			}

			manifest.attempts = attempt;
			manifest.lastSummary = result.summary;
			manifest.lastGreenAt = new Date().toISOString();
			manifest.lastGreen = green;
			writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

			if (green) advanceFlow(wt, service, cycleIdFromPath(planPath), "green_verify");
			const flow = readFlow(wt, service, cycleIdFromPath(planPath));

			const lines = green
				? [
					`✅ GREEN for '${service}' (attempt ${attempt}/${MAX_TDD_ITER}): ${result.passed} passed, 0 failed.`,
					compileMsg, ``,
					`Step 5/6: REVIEW`, ``,
					subagentCall("reviewer", "",
						`Review implementation for: ${flow?.feature ?? "feature"}. Check ${planPath}. Verify tests intact, minimal code, no gold-plating.`,
						cfg.dir, [planPath],
					), ``,
					`After review, call tdd_next() to complete the flow.`,
				]
				: [
					`🔴 NOT GREEN for '${service}' (attempt ${attempt}/${MAX_TDD_ITER}): ${result.failed} failed, ${result.passed} passed.`, ``,
					`Re-run green-impl:`, ``,
					subagentCall("green-impl", cfg.skill,
						`Make tests pass for: ${flow?.feature ?? "feature"}. Read ${planPath}. Previous attempt had ${result.failed} failing tests.`,
						cfg.dir, [planPath],
					), ``,
					`Then call tdd_green again with the same test paths.`, ``,
					`---- output (tail) ----`, tail, compileMsg,
				];
			return { content: [{ type: "text", text: lines.join("\n") }] };
		},
	});
}
