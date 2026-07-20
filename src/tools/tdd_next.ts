import { Type } from "typebox";
import { loadServiceConfig } from "../config";
import { readFlow, readPointer } from "../state";
import { redWriterCall, greenImplCall } from "../subagent";
import { repoRoot } from "../utils";

export function registerTddNext(pi: any): void {
	pi.registerTool({
		name: "tdd_next",
		label: "TDD Next Step",
		description: "Get the next step in the TDD flow. Returns the exact subagent call for the next phase.",
		promptSnippet: "Get the next step in the TDD flow",
		parameters: Type.Object({
			service: Type.Optional(Type.String({ description: "Switch active service (optional)." })),
		}),
		async execute(_toolCallId: string, params: any) {
			const wt = repoRoot();
			const config = loadServiceConfig(wt);
			const ptr = readPointer(wt);
			if (!ptr) throw new Error("No active TDD cycle. Call tdd_start() first.");
			const flow = readFlow(wt, ptr.activeService, ptr.activeCycleId);
			if (!flow) throw new Error(`Flow not found: ${ptr.activeService}/${ptr.activeCycleId}.`);

			const cfg = config[flow.service];
			if (!cfg) throw new Error(`Unknown service '${flow.service}'.`);

			const step = flow.step;
			if (step === "architect") {
				const call = redWriterCall(cfg, flow.feature, `.tdd/${flow.service}/${flow.cycleId}/PLAN.md`);
				return { content: [{ type: "text", text: [
					`Step 2/6: RED (write failing tests)`, ``,
					call, ``,
					`After red-writer completes, call: tdd_red({ service: "${flow.service}", planPath: ".tdd/${flow.service}/${flow.cycleId}/PLAN.md", testPaths: [...] })`,
				].join("\n") }] };
			}
			if (step === "red-writer" || step === "red_verify") {
				return { content: [{ type: "text", text: [
					`Step 3/6: RED VERIFY — call tdd_red() with test paths from red-writer.`,
				].join("\n") }] };
			}
			if (step === "green-impl" || step === "done" || step === "reviewer") {
				return { content: [{ type: "text", text: [
					`Flow at '${step}'. Call tdd_status() to see current state, or tdd_done() to release.`,
				].join("\n") }] };
			}
			return { content: [{ type: "text", text: `Unknown step: ${step}` }] };
		},
	});
}
