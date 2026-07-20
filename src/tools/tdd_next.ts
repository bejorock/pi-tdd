import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Type } from "typebox";
import { loadServiceConfig } from "../config";
import { activeServiceFlow, readFlow, readPointer, writeFlow, writePointer } from "../state";
import { subagentCall } from "../subagent";
import { repoRoot } from "../utils";

export function registerTddNext(pi: any): void {
	pi.registerTool({
		name: "tdd_next",
		label: "TDD Next (get next step)",
		description: "Get the next step in the TDD flow. Checks artifacts, determines current state, and returns exact instructions.",
		promptSnippet: "Get the next step in the TDD flow",
		promptGuidelines: [
			"Call tdd_next() after each step completes.",
			"It checks what artifacts exist and tells you exactly what to do next.",
		],
		parameters: Type.Object({
			service: Type.Optional(Type.String({ description: "Switch active service. If omitted, uses current active service." })),
		}),
		async execute(_toolCallId: string, params: any) {
			const { service: switchTo } = params as { service?: string };
			const wt = repoRoot();

			if (switchTo) {
				const pointer = readPointer(wt);
				if (pointer && pointer.services.includes(switchTo)) {
					pointer.activeService = switchTo;
					writePointer(wt, pointer);
				}
			}

			const flow = activeServiceFlow(wt);
			if (!flow) throw new Error("No TDD flow in progress. Call tdd_start({ service, feature }) first.");

			const cfg = loadServiceConfig(wt)[flow.service];
			if (!cfg) throw new Error(`Unknown service '${flow.service}'.`);

			const planExists = existsSync(join(wt, flow.planPath));
			const cycleDir = dirname(flow.planPath);
			const redManifest = existsSync(join(wt, cycleDir, "red.json"));
			let greenVerified = false;
			if (redManifest) {
				try {
					const m = JSON.parse(readFileSync(join(wt, cycleDir, "red.json"), "utf8")) as { lastGreen?: boolean };
					greenVerified = m.lastGreen === true;
				} catch { /* ignore */ }
			}

			let step: string;
			let instructions: string;

			if (!planExists) {
				step = "architect";
				instructions = subagentCall(
					"architect", flow.skill,
					`Recon + plan for ${flow.service}: ${flow.feature}. Write .tdd/${flow.service}/${flow.cycleId}/context.md + ${flow.planPath}.`,
					flow.dir,
				);
			} else if (!redManifest) {
				step = "red-writer";
				flow.step = "red-writer";
				writeFlow(wt, flow.service, flow);
				instructions = subagentCall(
					"red-writer", flow.skill,
					`Write failing tests for: ${flow.feature}. Read ${flow.planPath} and create test files + stub modules. Self-verify tests fail.`,
					flow.dir, [flow.planPath],
				);
			} else if (!greenVerified) {
				step = "green-impl";
				flow.step = "green-impl";
				writeFlow(wt, flow.service, flow);
				instructions = [
					`RED is verified. Now implement to make tests pass.`, ``,
					subagentCall("green-impl", flow.skill,
						`Make tests pass for: ${flow.feature}. Read ${flow.planPath}. Implement minimum code. NEVER weaken a test.`,
						flow.dir, [flow.planPath],
					), ``,
					`After green-impl completes, call:`,
					`  tdd_green({ service: "${flow.service}", planPath: "${flow.planPath}", testPaths: ${JSON.stringify(flow.testPaths)} })`,
				].join("\n");
			} else {
				step = "reviewer";
				flow.step = "done";
				writeFlow(wt, flow.service, flow);
				instructions = [
					`✅ TDD flow COMPLETE for '${flow.service}': ${flow.feature}`, ``,
					`All gates passed. Final step: review.`, ``,
					subagentCall("reviewer", "",
						`Review implementation for: ${flow.feature}. Check ${flow.planPath}. Verify tests intact, minimal code, no gold-plating.`,
						flow.dir, [flow.planPath],
					), ``,
					`Then: commit and move to the next service (or call tdd_start for another).`,
				].join("\n");
			}

			// Multi-service status
			const pointer = readPointer(wt);
			const svcs = pointer?.services ?? [flow.service];
			const svcStatuses = svcs.map(s => {
				const f = readFlow(wt, s, flow.cycleId);
				const red = existsSync(join(wt, cycleDir, "red.json"));
				let green = false;
				if (red) {
					try {
						const m = JSON.parse(readFileSync(join(wt, cycleDir, "red.json"), "utf8")) as { lastGreen?: boolean };
						green = m.lastGreen === true;
					} catch { /* */ }
				}
				const icon = green ? "✅" : red ? "🟡" : f ? "🔵" : "⚪";
				return `${icon} ${s}: ${f?.step ?? (green ? "done" : "pending")}`;
			}).join("\n");

			const statusLine = `Flow: ${flow.service} | Step: ${step} | Feature: ${flow.feature}\n\nServices:\n${svcStatuses}`;
			return { content: [{ type: "text", text: `${statusLine}\n\n${instructions}` }] };
		},
	});
}
