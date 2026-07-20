import { Type } from "typebox";
import { readFlow, readPointer } from "../state";
import { repoRoot } from "../utils";

export function registerTddStatus(pi: any): void {
	pi.registerTool({
		name: "tdd_status",
		label: "TDD Status",
		description: "Show current TDD cycle status: active cycle ID, service, phase, lock state, and artifact paths.",
		promptSnippet: "Show the current TDD cycle status",
		promptGuidelines: ["Use to check which cycle is active and what phase it's in."],
		parameters: Type.Object({}),
		async execute() {
			const wt = repoRoot();
			const pointer = readPointer(wt);
			if (!pointer) return { content: [{ type: "text", text: "No active TDD cycle. Call tdd_start() to begin." }] };
			const flow = readFlow(wt, pointer.activeService, pointer.activeCycleId);
			if (!flow) return { content: [{ type: "text", text: `Pointer exists but flow not found for ${pointer.activeService}/${pointer.activeCycleId}.` }] };
			return { content: [{ type: "text", text: [
				`## TDD Cycle Status`, ``,
				`| Field | Value |`, `|---|---|`,
				`| Service | \`${flow.service}\` |`,
				`| Cycle ID | \`${flow.cycleId}\` |`,
				`| Feature | ${flow.feature} |`,
				`| Phase | ${flow.step} |`,
				`| Locked | ${flow.locked ? "🔒 yes" : "🔓 no"} |`,
				`| Plan | ${flow.planPath} |`,
				`| Test paths | ${flow.testPaths.length > 0 ? flow.testPaths.join(", ") : "(none yet)"} |`,
				`| Started | ${flow.startedAt} |`,
			].join("\n") }] };
		},
	});
}
