import type { ServiceConfig } from "./types";

export const MAX_TDD_ITER = 100;

/** Maps internal agent role names to Pi runtime agent names. Extend via tdd-services.json. */
export const AGENT_RUNTIME: Record<string, string> = {
	architect: "tdd.architect",
	"red-writer": "tdd.red-writer",
	"green-impl": "tdd.green-impl",
};

/** Load service config from .pi/tdd-services.json or return empty. Generic — not hardcoded. */
export function loadServiceConfig(projectRoot: string): Record<string, ServiceConfig> {
	const fs = require("node:fs");
	const path = require("node:path");
	const configPath = path.join(projectRoot, ".pi", "tdd-services.json");
	if (!fs.existsSync(configPath)) return {};
	try {
		const raw = JSON.parse(fs.readFileSync(configPath, "utf8")) as Record<string, {
			dir: string;
			skill: string;
			runner: "pytest" | "vitest" | "jest";
			cmdTemplate: string;
			agents?: Record<string, string>;
		}>;
		const parsed: Record<string, ServiceConfig> = {};
		for (const [key, val] of Object.entries(raw)) {
			// Merge per-service agent overrides into global AGENT_RUNTIME
			if (val.agents) {
				Object.assign(AGENT_RUNTIME, val.agents);
			}
			parsed[key] = {
				dir: val.dir,
				skill: val.skill,
				runner: val.runner,
				cmd: (p: string[]) => val.cmdTemplate.replace(/\{paths\}/g, p.join(" ")),
			};
		}
		return parsed;
	} catch {
		return {};
	}
}
