import { Type } from "typebox";
import { readFlow, readPointer, writeFlow } from "../state";
import { repoRoot } from "../utils";
import { refreshWidget } from "../widget";

export function registerTddDone(pi: any): void {
	pi.registerTool({
		name: "tdd_done",
		label: "TDD Done (release cycle)",
		description: "Release the current TDD cycle lock. Call after tdd_green passes. Unlocks the cycle so a new tdd_start can begin.",
		promptSnippet: "Mark the current TDD cycle as complete",
		promptGuidelines: [
			"Only call after a successful tdd_green.",
			"Call this to mark the cycle complete before starting a new feature.",
		],
		parameters: Type.Object({
			success: Type.Optional(Type.Boolean({ description: "True if completed successfully (default: true)." })),
		}),
		async execute(_toolCallId: string, params: any) {
			const { success = true } = (params ?? {}) as { success?: boolean };
			const wt = repoRoot();
			const pointer = readPointer(wt);
			if (!pointer) return { content: [{ type: "text", text: "No active TDD cycle to release." }] };
			const flow = readFlow(wt, pointer.activeService, pointer.activeCycleId);
			if (!flow) return { content: [{ type: "text", text: `Flow not found for ${pointer.activeService}/${pointer.activeCycleId}.` }] };
			if (!flow.locked) return { content: [{ type: "text", text: `Cycle ${pointer.activeService}/${pointer.activeCycleId} is already unlocked.` }] };

			flow.locked = false;
			flow.step = success ? "done" : flow.step;
			writeFlow(wt, pointer.activeService, flow);

			refreshWidget();

			const status = success ? "✅ completed" : "⚠️ abandoned";
			return { content: [{ type: "text", text: `Cycle ${flow.service}/${flow.cycleId} ${status}. Lock released. Ready for tdd_start().` }] };
		},
	});
}
