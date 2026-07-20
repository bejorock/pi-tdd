import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Type } from "typebox";
import { loadServiceConfig, MAX_TDD_ITER } from "../config";
import { advanceFlow, cycleIdFromPath, readFlow } from "../state";
import { reviewerCall } from "../subagent";
import { runServiceTests, tailOutput } from "../test-runner";
import { repoRoot } from "../utils";

export function registerTddGreen(pi: any): void {
	pi.registerTool({
		name: "tdd_green",
		label: "TDD Green (verify tests pass)",
		description: "TDD GREEN gate. Verifies the exact RED-registered tests now PASS.",
		promptGuidelines: [
			"Call AFTER green-impl agent. Pass the SAME test paths that tdd_red registered.",
			"If not green, re-run green-impl with failing output, then tdd_green again (max 100 attempts).",
		],
		parameters: Type.Object({
			service: Type.String({ description: "Service slug." }),
			planPath: Type.String({ description: "Plan path (must match tdd_red manifest)." }),
			testPaths: Type.Array(Type.String(), { description: "Test paths (must match tdd_red manifest)." }),
		}),
		async execute(_toolCallId: string, params: any) {
			const { service, planPath, testPaths } = params as { service: string; planPath: string; testPaths: string[] };
			const wt = repoRoot();
			const config = loadServiceConfig(wt);
			const cfg = config[service];
			if (!cfg) throw new Error(`Unknown service '${service}'.`);

			const tddDir = join(wt, dirname(planPath));
			const redPath = join(tddDir, "red.json");
			if (!existsSync(redPath)) throw new Error(`No red manifest at ${redPath}. Run tdd_red first.`);

			const red = JSON.parse(readFileSync(redPath, "utf8"));
			if (red.attempts >= MAX_TDD_ITER) throw new Error(`Max GREEN attempts (${MAX_TDD_ITER}) exceeded.`);

			const { result, stdout } = runServiceTests(cfg, testPaths, wt);
			const tail = tailOutput(stdout);

			if (!result.ran) throw new Error(`GREEN FAILED: tests did not run.\n\n${tail}`);
			if (result.failed > 0) {
				red.attempts = (red.attempts ?? 0) + 1;
				writeFileSync(redPath, JSON.stringify(red, null, 2));
				throw new Error(`GREEN FAILED: ${result.failed} tests still failing (attempt ${red.attempts}/${MAX_TDD_ITER}).\n\n${tail}`);
			}

			// GREEN!
			const id = cycleIdFromPath(planPath);
			advanceFlow(wt, service, id, "reviewer");
			const flow = readFlow(wt, service, id);
			const call = reviewerCall(cfg, flow?.feature ?? "feature", planPath);

			return { content: [{ type: "text", text: [
				`✅ GREEN for '${service}': all ${result.passed} tests passing!`, ``,
				`Step 6/6: REVIEW`, ``,
				call, ``,
				`After review: tdd_done() to release.`, ``,
				`---- output (tail) ----`, tail,
			].join("\n") }] };
		},
	});
}
