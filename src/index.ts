import type { Mode } from "./types";
import { registerGates } from "./gates";
import { registerTddStart } from "./tools/tdd_start";
import { registerTddNext } from "./tools/tdd_next";
import { registerTddRed } from "./tools/tdd_red";
import { registerTddGreen } from "./tools/tdd_green";
import { registerTddStatus } from "./tools/tdd_status";
import { registerTddDone } from "./tools/tdd_done";
import { runInit } from "./init";
import { repoRoot } from "./utils";

export default function (pi: any): void {
	const currentMode: { value: Mode } = { value: "build" };

	// Mode system: gates + tool blocking + system prompt + /build /plan /tdd /mode
	registerGates(pi, currentMode);

	// ---- Tools (agent-callable) ----
	registerTddStart(pi);
	registerTddNext(pi);
	registerTddRed(pi);
	registerTddGreen(pi);
	registerTddStatus(pi);
	registerTddDone(pi);

	// ---- Command: /init ----
	pi.registerCommand("init", {
		description: "Analyze project and scaffold TDD config + agents. Reports gaps.",
		handler: async (_args: any, ctx: any) => {
			const root = repoRoot();
			const result = runInit(root);

			const lines: string[] = [];

			lines.push(`🔍 TDD Init — ${root}`, "");

			if (Object.keys(result.services).length > 0) {
				lines.push("Services detected:", ...Object.entries(result.services).map(
					([k, v]) => `  • ${k} → ${v.dir} (${v.runner}, skill: ${v.skill})`,
				), "");
			}

			if (result.agentsCreated.length > 0) {
				lines.push("Agents created:", ...result.agentsCreated.map(a => `  • ${a}`), "");
			}

			if (result.gaps.length > 0) {
				lines.push("⚠️  Gaps to address:");
				for (const gap of result.gaps) {
					const prefix = gap.severity === "error" ? "❌" : "⚠️";
					lines.push(`  ${prefix} [${gap.service}] ${gap.message}`);
				}
				lines.push("");
			} else {
				lines.push("✅ No gaps found!", "");
			}

			if (result.configWritten) {
				lines.push("Config written: .pi/tdd-services.json");
			}

			lines.push("", "Next: /tdd to enter TDD mode, then tdd_start({ service: \"...\", feature: \"...\" }) to begin.");
			ctx.ui.notify(`TDD scaffolded: ${Object.keys(result.services).length} services, ${result.gaps.length} gaps`, "info");

			return { content: [{ type: "text", text: lines.join("\n") }] };
		},
	});
}
