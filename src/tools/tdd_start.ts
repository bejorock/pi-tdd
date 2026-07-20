import { Type } from "typebox";
import { loadServiceConfig } from "../config";
import type { TddFlow } from "../types";
import { cycleId, cyclePlanPath, readFlow, readPointer, writeFlow, writePointer } from "../state";
import { subagentCall } from "../subagent";
import { repoRoot } from "../utils";
import { refreshWidget } from "../widget";

export function registerTddStart(pi: any): void {
	pi.registerTool({
		name: "tdd_start",
		label: "TDD Start (initialize flow)",
		description: "Initialize TDD flow for a service. Creates .tdd/flow.json with state machine. Returns step 1 instructions (architect agent call).",
		promptSnippet: "Start TDD flow for a service and feature",
		promptGuidelines: [
			"Call tdd_start({ service, feature }) ONCE per feature.",
			"Then follow the returned instructions to call the architect agent.",
		],
		parameters: Type.Object({
			service: Type.String({ description: "Service slug from tdd-services.json." }),
			feature: Type.String({ description: "Feature description (e.g. 'user auth')." }),
		}),
		async execute(_toolCallId: string, params: any) {
			const { service, feature } = params as { service: string; feature: string };
			const wt = repoRoot();
			const config = loadServiceConfig(wt);
			const cfg = config[service];
			if (!cfg) throw new Error(`Unknown service '${service}'. Known: ${Object.keys(config).join(", ")}. Run /init or add it to .pi/tdd-services.json.`);

			// Check for locked cycle
			const pointer = readPointer(wt);
			if (pointer) {
				const existing = readFlow(wt, pointer.activeService, pointer.activeCycleId);
				if (existing?.locked) {
					throw new Error(`Active cycle '${pointer.activeService}/${pointer.activeCycleId}' is still locked. Call tdd_done() first.`);
				}
			}

			const id = cycleId();
			const pp = cyclePlanPath(service, id);

			const flow: TddFlow = {
				service, feature,
				skill: cfg.skill,
				dir: cfg.dir,
				step: "architect",
				testPaths: [],
				planPath: pp,
				cycleId: id,
				locked: true,
				startedAt: new Date().toISOString(),
			};
			writeFlow(wt, service, flow);

			const newPointer = pointer
				? { ...pointer, activeService: service, activeCycleId: id }
				: { activeService: service, activeCycleId: id, services: [service] };
			if (!newPointer.services.includes(service)) newPointer.services.push(service);
			writePointer(wt, newPointer);

			refreshWidget();

			const call = subagentCall(
				"architect", cfg.skill,
				`Recon + plan for ${service}: ${feature}. Write .tdd/${service}/${id}/context.md + ${flow.planPath}.`,
				cfg.dir,
			);
			return {
				content: [{
					type: "text",
					text: [
						`🧪 TDD flow started for '${service}': ${feature}`, ``,
						`Step 1/6: ARCHITECT (recon + plan)`, ``,
						call, ``,
						`After architect completes, call: tdd_next()`,
					].join("\n"),
				}],
			};
		},
	});
}
