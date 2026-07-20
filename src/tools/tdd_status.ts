import { Type } from "typebox";
import { readFlow, readPointer } from "../state";
import { repoRoot } from "../utils";

const PHASE_ICONS: Record<string, string> = {
	architect: "📐", "red-writer": "🔴", red_verify: "🔴✅",
	"green-impl": "🟢", green_verify: "🟢✅", reviewer: "👀", done: "✅",
};

export function registerTddStatus(pi: any): void {
	pi.registerTool({
		name: "tdd_status",
		label: "TDD Status",
		description: "Show current TDD cycle status.",
		parameters: Type.Object({}),
		async execute() {
			const wt = repoRoot();
			const ptr = readPointer(wt);
			if (!ptr) return { content: [{ type: "text", text: "No active TDD cycle. Call tdd_start() to begin." }] };
			const flow = readFlow(wt, ptr.activeService, ptr.activeCycleId);
			if (!flow) return { content: [{ type: "text", text: `Pointer exists but flow not found: ${ptr.activeService}/${ptr.activeCycleId}` }] };
			const icon = PHASE_ICONS[flow.step] ?? "⏳";
			return { content: [{ type: "text", text: [
				`🧪 TDD Cycle: ${flow.service}/${flow.cycleId}`,
				`Phase: ${icon} ${flow.step}`,
				`Feature: ${flow.feature}`,
				`Locked: ${flow.locked}`,
				flow.testPaths ? `Tests: ${flow.testPaths.join(", ")}` : null,
			].filter(Boolean).join("\n") }] };
		},
	});
}
