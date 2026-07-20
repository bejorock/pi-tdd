import { Type } from "typebox";
import { readFlow, readPointer, writeFlow } from "../state";
import { refreshWidget } from "../widget";
import { repoRoot } from "../utils";

export function registerTddDone(pi: any): void {
	pi.registerTool({
		name: "tdd_done",
		label: "TDD Done",
		description: "Complete or abandon the active TDD cycle, releasing the lock.",
		parameters: Type.Object({
			success: Type.Optional(Type.Boolean({ description: "Was the cycle successful? Default true." })),
		}),
		async execute(_toolCallId: string, params: any) {
			const wt = repoRoot();
			const ptr = readPointer(wt);
			if (!ptr) throw new Error("No active TDD cycle to release.");
			const flow = readFlow(wt, ptr.activeService, ptr.activeCycleId);
			if (!flow) throw new Error(`Flow not found: ${ptr.activeService}/${ptr.activeCycleId}.`);

			flow.locked = false;
			flow.step = params?.success !== false ? "done" : flow.step;
			writeFlow(wt, flow);

			refreshWidget();

			const status = params?.success !== false ? "✅ completed" : "⚠️ abandoned";
			return { content: [{ type: "text", text: `🔄 Cycle ${flow.service}/${flow.cycleId} ${status}. Lock released. Ready for tdd_start().` }] };
		},
	});
}
