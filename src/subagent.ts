import type { ServiceConfig } from "./types";

/** Generate the subagent call template string for a phase */
export function architectCall(cfg: ServiceConfig, feature: string, planPath: string): string {
	return `subagent({ agent: "erica.architect", skill: "${cfg.skill}", task: "Map codebase for feature: ${feature}. Write plan to ${planPath} and context to .tdd/<svc>/<id>/context.md", cwd: "${cfg.dir}" })`;
}

export function redWriterCall(cfg: ServiceConfig, feature: string, planPath: string): string {
	return `subagent({ agent: "erica.red-writer", skill: "${cfg.skill}", task: "Write FAILING tests for: ${feature}. Read ${planPath}. Tests MUST fail (true RED). Self-verify before reporting. NEVER implement production code.", cwd: "${cfg.dir}" })`;
}

export function greenImplCall(cfg: ServiceConfig, feature: string, planPath: string): string {
	return `subagent({ agent: "erica.green-impl", skill: "${cfg.skill}", task: "Make tests pass for: ${feature}. Read ${planPath}. Implement minimum code. NEVER weaken a test.", cwd: "${cfg.dir}" })`;
}

export function reviewerCall(cfg: ServiceConfig, feature: string, planPath: string): string {
	return `subagent({ agent: "reviewer", skill: "${cfg.skill}", task: "Review implementation for: ${feature}. Check scope, stray debug, test quality.", cwd: "${cfg.dir}" })`;
}
