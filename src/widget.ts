import { readFlow, readPointer } from "./state";
import type { Mode } from "./types";
import { repoRoot } from "./utils";

export const MODE_WIDGET = "pi-tdd-mode";

/** Stored UI context for live widget refresh from tools */
let _uiCtx: any = null;
let _currentMode: Mode = "build";

export function setWidgetState(ctx: any, mode: Mode): void {
	_uiCtx = ctx;
	_currentMode = mode;
	renderWidget();
}

/** Call from tools after state change for immediate widget refresh */
export function refreshWidget(): void {
	if (_uiCtx?.hasUI) {
		renderWidget();
	}
}

function renderWidget(): void {
	if (!_uiCtx?.hasUI) return;
	_uiCtx.ui.setWidget(MODE_WIDGET, getModeWidgetLines(_currentMode), { placement: "belowEditor" });
}

const PHASE_ICONS: Record<string, string> = {
	architect: "📐",
	"red-writer": "🔴",
	red_verify: "🔴✅",
	"green-impl": "🟢",
	green_verify: "🟢✅",
	reviewer: "👀",
	done: "✅",
};

function getTddWidgetLines(): string[] {
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

export function getModeWidgetLines(mode: Mode): string[] {
	switch (mode) {
		case "build":
			return ["\x1b[32m🟢 Build — all tools enabled\x1b[0m"];
		case "plan":
			return ["\x1b[34m🔵 Plan — write tools blocked (bash allowed)\x1b[0m"];
		case "tdd":
			return getTddWidgetLines();
	}
}
