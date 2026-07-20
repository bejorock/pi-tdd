import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Type } from "typebox";
import { loadServiceConfig } from "../config";
import { cycleIdFromPath, readFlow, writeFlow } from "../state";
import { greenImplCall } from "../subagent";
import { runServiceTests, tailOutput } from "../test-runner";
import { repoRoot } from "../utils";

export function registerTddRed(pi: any): void {
	pi.registerTool({
		name: "tdd_red",
		label: "TDD Red (verify tests fail)",
		description: "TDD RED gate. Verifies tests actually FAIL and registers them as authority.",
		promptSnippet: "Verify the RED tests fail for a service",
		promptGuidelines: [
			"Call AFTER the red-writer agent writes tests.",
			"tdd_red runs tests and confirms they FAIL. Only then proceed to green-impl.",
		],
		parameters: Type.Object({
			service: Type.String({ description: "Service slug." }),
			planPath: Type.String({ description: "Plan file." }),
			testPaths: Type.Array(Type.String(), { description: "Test file paths." }),
		}),
		async execute(_toolCallId: string, params: any) {
			const { service, planPath, testPaths } = params as { service: string; planPath: string; testPaths: string[] };
			const wt = repoRoot();
			const config = loadServiceConfig(wt);
			const cfg = config[service];
			if (!cfg) throw new Error(`Unknown service '${service}'.`);

			if (!existsSync(join(wt, planPath))) {
				throw new Error(`Plan file not found: ${planPath}. Run the architect agent first.`);
			}

			const { result, stdout } = runServiceTests(cfg, testPaths, wt);
			const tail = tailOutput(stdout);
			if (!result.ran) throw new Error(`RED FAILED: tests did not run.\n\n${tail}`);
			if (result.failed === 0) throw new Error(`RED FAILED: tests already PASS (${result.passed} passed). RED requires FAIL.\n\n${tail}`);

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
			if (flow) { flow.step = "green-impl"; flow.testPaths = testPaths; writeFlow(wt, flow); }

			const call = greenImplCall(cfg, flow?.feature ?? "feature", planPath);
			return { content: [{ type: "text", text: [
				`✅ RED verified for '${service}': ${result.failed} failing, ${result.passed} passing.`,
				`Manifest written: ${planPath.replace("PLAN.md", "red.json")}`, ``,
				`Step 4/6: GREEN (implement)`, ``,
				call, ``,
				`After green-impl completes, call:`,
				`  tdd_green({ service: "${service}", planPath: "${planPath}", testPaths: ${JSON.stringify(testPaths)} })`, ``,
				`---- output (tail) ----`, tail,
			].join("\n") }] };
		},
	});
}
