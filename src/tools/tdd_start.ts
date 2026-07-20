import { Type } from "typebox";
import { loadServiceConfig, MAX_TDD_ITER } from "../config";
import type { TddFlow } from "../types";
import { cycleId, cyclePlanPath, readFlow, readPointer, writeFlow, writePointer } from "../state";
import { architectCall } from "../subagent";
import { refreshWidget } from "../widget";
import { repoRoot } from "../utils";

export function registerTddStart(pi: any): void {
	pi.registerTool({
		name: "tdd_start",
		label: "TDD Start",
		description: "Start a new TDD cycle. Creates a locked cycle, writes pointer, returns architect subagent call.",
		promptSnippet: "Start a TDD flow for a service and feature",
		parameters: Type.Object({
			service: Type.String({ description: "Service slug from tdd-services.json." }),
			feature: Type.String({ description: "Feature description." }),
		}),
		async execute(_toolCallId: string, params: any) {
			const { service, feature } = params as { service: string; feature: string };
			const wt = repoRoot();
			const config = loadServiceConfig(wt);
			const cfg = config[service];
			if (!cfg) throw new Error(`Unknown service '${service}'. Run /tdd:init or add it to .pi/tdd-services.json.`);

			// Check for locked cycle
			const ptr = readPointer(wt);
			if (ptr) {
				const existing = readFlow(wt, ptr.activeService, ptr.activeCycleId);
				if (existing?.locked) {
					throw new Error(`Locked cycle exists: ${ptr.activeService}/${ptr.activeCycleId}. Run tdd_done() first.`);
				}
			}

			const id = cycleId();
			const planPath = cyclePlanPath(service, id);

			const flow: TddFlow = {
				service, cycleId: id, feature,
				step: "architect", locked: true,
			};
			writeFlow(wt, flow);
			writePointer(wt, { activeService: service, activeCycleId: id });

			refreshWidget();

			const call = architectCall(cfg, feature, planPath);
			return {
				content: [{
					type: "text",
					text: [
						`🧪 TDD cycle started: ${service}/${id} — ${feature}`, ``,
						`Step 1/6: ARCHITECT (recon + plan)`, ``,
						call, ``,
						`After architect completes, call: tdd_next()`,
					].join("\n"),
				}],
			};
		},
	});
}
