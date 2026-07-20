import { readFlow, readPointer } from "./state";
import { repoRoot } from "./utils";

export const MODE_WIDGET = "pi-tdd-mode";

const PHASE_ICONS: Record<string, string> = {
	architect: "📐",
	"red-writer": "🔴",
	red_verify: "🔴✅",
	"green-impl": "🟢",
	green_verify: "🟢✅",
	reviewer: "👀",
	done: "✅",
};

let _uiCtx: any = null;
let _tddActive = false;

export function setWidgetState(ctx: any, tddActive: boolean): void {
	_uiCtx = ctx;
	_tddActive = tddActive;
	renderWidget();
}

export function refreshWidget(): void {
	if (_uiCtx?.hasUI) renderWidget();
}

function renderWidget(): void {
	if (!_uiCtx?.hasUI) return;
	_uiCtx.ui.setWidget(MODE_WIDGET, getLines(), { placement: "belowEditor" });
}

function getLines(): string[] {
	if (!_tddActive) return [];
	try {
		const wt = repoRoot();
		const pointer = readPointer(wt);
		if (!pointer) return ["\x1b[35m🧪 TDD — no cycle\x1b[0m"];
		const flow = readFlow(wt, pointer.activeService, pointer.activeCycleId);
		if (!flow) return [`\x1b[35m🧪 TDD — ${pointer.activeService}/${pointer.activeCycleId}?\x1b[0m`];
		const icon = PHASE_ICONS[flow.step] ?? "⏳";
		const lock = flow.locked ? "🔒" : "🔓";
		const feat = flow.feature.length > 35 ? flow.feature.slice(0, 32) + "…" : flow.feature;
		return [
			`\x1b[35m🧪 TDD · ${flow.service}/${flow.cycleId} ${lock}\x1b[0m`,
			`${icon} ${flow.step} · ${feat}`,
		];
	} catch (e) {
		return [`\x1b[35m🧪 TDD — err: ${(e as Error).message.slice(0, 40)}\x1b[0m`];
	}
}
