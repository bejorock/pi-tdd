import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Type } from "typebox";
import { loadServiceConfig } from "../config";
import { activeServiceFlow, cycleIdFromPath, readFlow, writeFlow } from "../state";
import { subagentCall } from "../subagent";
import { runServiceTests, tailOutput } from "../test-runner";
import { repoRoot } from "../utils";

export function registerTddRed(pi: any): void {
	pi.registerTool({
		name: "tdd_red",
		label: "TDD Red (verify tests fail)",
		description: "TDD RED gate. Verifies tests actually FAIL (true RED) and registers them as authority. Rejects already-passing tests and collection errors.",
		promptSnippet: "Verify the RED tests fail for a service",
		promptGuidelines: [
			"Call AFTER the red-writer agent writes tests.",
			"tdd_red runs the tests and confirms they FAIL. Only then proceed to green-impl.",
		],
		parameters: Type.Object({
			service: Type.String({ description: "Service slug." }),
			planPath: Type.String({ description: "Plan file (e.g. .tdd/<svc>/<id>/PLAN.md)." }),
			testPaths: Type.Array(Type.String(), { description: "Test file paths to verify." }),
		}),
		async execute(_toolCallId: string, params: any) {
			const { service, planPath, testPaths } = params as { service: string; planPath: string; testPaths: string[] };
			const wt = repoRoot();

			// Gate: require active cycle
			const active = activeServiceFlow(wt);
			if (!active) throw new Error("No active TDD cycle. Call tdd_start() first.");

			const config = loadServiceConfig(wt);
			const cfg = config[service];
			if (!cfg) throw new Error(`Unknown service '${service}'. Known: ${Object.keys(config).join(", ")}.`);

			if (!existsSync(join(wt, planPath))) {
				throw new Error(`Plan file not found: ${planPath}. Run the architect agent first.`);
			}

			const missing = testPaths.filter(p => {
				const rel = p.startsWith(cfg.dir + "/") ? p.slice(cfg.dir.length + 1) : p;
				return !existsSync(join(wt, cfg.dir, rel));
			});
			if (missing.length) throw new Error(`Test files not found: ${missing.join(", ")}.`);

			const { result, stdout } = runServiceTests(cfg, testPaths, wt);
			const tail = tailOutput(stdout);
			if (!result.ran) throw new Error(`RED verification FAILED: tests did not run.\n\n${tail}`);
			if (result.collectError) throw new Error(`RED verification FAILED: collection error (cannot collect tests).\n\n${tail}`);
			if (result.failed === 0) throw new Error(`RED verification FAILED: tests already PASS (${result.passed} passed). RED requires tests to FAIL.\n\n${tail}`);

			const tddDir = join(wt, dirname(planPath));
			mkdirSync(tddDir, { recursive: true });
			writeFileSync(join(tddDir, "red.json"), JSON.stringify({
				service, planPath, testPaths,
				redVerified: true,
				redAt: new Date().toISOString(),
				redSummary: result.summary,
				attempts: 0,
			}, null, 2));

			const id = cycleIdFromPath(planPath);
			const flow = readFlow(wt, service, id);
			if (flow) { flow.step = "green-impl"; flow.testPaths = testPaths; writeFlow(wt, service, flow); }

			const greenCall = subagentCall(
				"green-impl", cfg.skill,
				`Make tests pass for: ${flow?.feature ?? "feature"}. Read ${planPath}. Implement minimum code. NEVER weaken a test.`,
				cfg.dir, [planPath],
			);

			return { content: [{ type: "text", text: [
				`✅ RED verified for '${service}': ${result.failed} failing, ${result.passed} passing.`,
				`Manifest written: .tdd/${service}/${id}/red.json`, ``,
				`Step 3/6: GREEN (implement)`, ``,
				greenCall, ``,
				`After green-impl completes, call:`,
				`  tdd_green({ service: "${service}", planPath: "${planPath}", testPaths: ${JSON.stringify(testPaths)} })`, ``,
				`---- output (tail) ----`, tail,
			].join("\n") }] };
		},
	});
}
