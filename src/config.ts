import type { ServiceConfig } from "./types";

export const MAX_TDD_ITER = 100;

/** Load service config from .pi/tdd-services.json or return empty */
export function loadServiceConfig(projectRoot: string): Record<string, ServiceConfig> {
	const fs = require("node:fs");
	const path = require("node:path");
	const configPath = path.join(projectRoot, ".pi", "tdd-services.json");
	if (!fs.existsSync(configPath)) return {};
	try {
		const raw = JSON.parse(fs.readFileSync(configPath, "utf8")) as Record<string, {
			dir: string; skill: string; runner: "pytest" | "vitest" | "jest";
			cmdTemplate: string;
		}>;
		const parsed: Record<string, ServiceConfig> = {};
		for (const [key, val] of Object.entries(raw)) {
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
