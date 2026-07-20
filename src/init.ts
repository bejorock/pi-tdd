import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { InitGap, InitResult, ServiceConfig, TestRunner } from "./types";

const AGENT_DEFS: Record<string, string> = {
	"tdd.architect.md": `---
name: tdd.architect
description: Recon + plan agent. Maps codebase and writes .tdd/<service>/<id>/context.md + PLAN.md. Analyzes existing code, identifies patterns, but NEVER writes production code or tests.
tools: read, grep, glob, ls, find, bash, write, edit, ask_user_question, todo, memory, memory_search, hypa_read, hypa_grep, hypa_find, hypa_ls, hypa_shell
model: inherit
---

You are the **architect** — recon + plan only. You read, analyze, and plan. You never implement.

## Your job
1. Read and map the codebase relevant to the feature
2. Write .tdd/<service>/<cycleId>/context.md — discovered patterns, module layout, existing tests, conventions
3. Write .tdd/<service>/<cycleId>/PLAN.md — concrete implementation plan with file paths, function names, test approach

## Rules
- NEVER write production code or test files
- Plan must reference actual files — no hand-waving
- If you need clarification, use ask_user_question
- Save durable learnings with memory tool
`,
	"tdd.red-writer.md": `---
name: tdd.red-writer
description: Writes FAILING tests + minimal stubs. Self-verifies before reporting. NEVER implements production code.
tools: read, write, edit, grep, glob, ls, find, bash, ask_user_question, todo, memory, memory_search, hypa_read, hypa_grep, hypa_find, hypa_ls, hypa_shell
model: inherit
---

You are the **red-writer** — you write tests that MUST fail. RED only. Self-verify.

## Your job
1. Read the PLAN.md — understand what needs testing
2. Write test files that test the planned behavior
3. Write MINIMAL stubs so tests compile/import but FAIL on assertions
4. RUN the tests to verify they actually FAIL (true RED)
5. If any test PASSES, rewrite it until it FAILS
6. Report the test files you wrote

## Rules
- NEVER implement production code — stubs only (functions that throw/return None/empty)
- Every test MUST fail for the right reason (assertion failure, not import error)
- Self-verify: run tests before reporting
- If a test accidentally passes, fix it
`,
	"tdd.green-impl.md": `---
name: tdd.green-impl
description: Minimum implementation to pass RED-registered tests. NEVER weakens or deletes tests.
tools: read, write, edit, grep, glob, ls, find, bash, ask_user_question, todo, memory, memory_search, hypa_read, hypa_grep, hypa_find, hypa_ls, hypa_shell
model: inherit
---

You are the **green-impl** — minimum code to make tests pass. NEVER touch the tests.

## Your job
1. Read the PLAN.md and the test files
2. Implement ONLY enough production code to make ALL tests pass
3. Run tests to verify GREEN

## Rules
- MINIMUM implementation — no gold-plating
- NEVER modify, weaken, or delete a test
- NEVER skip or mark tests as xfail
- If stuck, ask (don't go rogue)
`,
};

const TEST_FRAMEWORK_MARKERS: Array<{ file: string; runner: TestRunner }> = [
	{ file: "pytest.ini", runner: "pytest" },
	{ file: "pyproject.toml", runner: "pytest" }, // need to check content
	{ file: "vitest.config.ts", runner: "vitest" },
	{ file: "vitest.config.js", runner: "vitest" },
	{ file: "jest.config.ts", runner: "jest" },
	{ file: "jest.config.js", runner: "jest" },
];

const PACKAGE_MANAGER_FILES: Array<{ file: string; pm: string }> = [
	{ file: "uv.lock", pm: "uv" },
	{ file: "poetry.lock", pm: "poetry" },
	{ file: "pnpm-lock.yaml", pm: "pnpm" },
	{ file: "package.json", pm: "npm" }, // default JS
	{ file: "yarn.lock", pm: "yarn" },
];

const COMMON_SERVICE_DIRS = ["apps", "packages", "services", "libs"];

export function runInit(projectRoot: string): InitResult {
	const agentsDir = join(projectRoot, ".pi", "agents");
	mkdirSync(agentsDir, { recursive: true });

	const services: Record<string, ServiceConfig> = {};
	const gaps: InitGap[] = [];
	const agentsCreated: string[] = [];

	// 1. Discover services
	const discovered = discoverServices(projectRoot);
	if (discovered.length === 0) {
		gaps.push({ service: "*", severity: "warn", message: "No service directories found (apps/, packages/, services/, libs/). Create one to use TDD." });
	}

	const cmdTemplates: Record<string, string> = {};
	for (const svcDir of discovered) {
		const name = svcDir.split("/").pop()!;
		const runner = detectTestFramework(join(projectRoot, svcDir));

		if (!runner) {
			gaps.push({ service: name, severity: "error", message: `No test framework detected in ${svcDir}. Add vitest.config.ts, jest.config.js, or pytest.ini.` });
			continue;
		}

		const pm = detectPackageManager(join(projectRoot, svcDir));
		const cmdTemplate = buildCmdTemplate(runner, pm);
		const skill = guessSkill(name);

		services[name] = { dir: svcDir, skill, runner, cmd: (p) => cmdTemplate.replace(/\{paths\}/g, p.join(" ")) };
		cmdTemplates[name] = cmdTemplate;

		// Check for skill existence
		const skillPath = join(projectRoot, ".pi", "skills", skill, "SKILL.md");
		if (!existsSync(skillPath)) {
			gaps.push({ service: name, severity: "warn", message: `Skill '${skill}' not found at .pi/skills/${skill}/SKILL.md. Create it for service-specific patterns.` });
		}

		// Check for test directory
		const testDirs = ["tests", "test", "__tests__", "spec"];
		const hasTests = testDirs.some(d => existsSync(join(projectRoot, svcDir, d)));
		if (!hasTests) {
			gaps.push({ service: name, severity: "warn", message: `No test directory found in ${svcDir}. Create tests/ or __tests__/.` });
		}
	}

	// 2. Copy agent definitions if missing
	for (const [filename, content] of Object.entries(AGENT_DEFS)) {
		const dest = join(agentsDir, filename);
		if (!existsSync(dest)) {
			writeFileSync(dest, content);
			agentsCreated.push(filename);
		}
	}

	// 3. Write config
	const configPath = join(projectRoot, ".pi", "tdd-services.json");
	const configWritten = !existsSync(configPath) || Object.keys(services).length > 0;
	if (Object.keys(services).length > 0) {
		const json = Object.fromEntries(
			Object.entries(services).map(([k, v]) => [k, { dir: v.dir, skill: v.skill, runner: v.runner, cmdTemplate: cmdTemplates[k] ?? buildCmdTemplate(v.runner, "") }]),
		);
		writeFileSync(configPath, JSON.stringify(json, null, 2));
	}

	return { services, gaps, agentsCreated, configWritten };
}

function discoverServices(root: string): string[] {
	const found: string[] = [];
	for (const dir of COMMON_SERVICE_DIRS) {
		const full = join(root, dir);
		if (!existsSync(full)) continue;
		for (const entry of readdirSync(full, { withFileTypes: true })) {
			if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
				found.push(`${dir}/${entry.name}`);
			}
		}
	}
	return found;
}

function detectTestFramework(svcDir: string): TestRunner | null {
	for (const { file, runner } of TEST_FRAMEWORK_MARKERS) {
		const p = join(svcDir, file);
		if (!existsSync(p)) continue;
		if (file === "pyproject.toml") {
			try {
				const content = readFileSync(p, "utf8");
				if (content.includes("[tool.pytest") || content.includes("pytest")) return "pytest";
			} catch {}
			continue;
		}
		return runner;
	}
	return null;
}

function detectPackageManager(svcDir: string): string {
	for (const { file, pm } of PACKAGE_MANAGER_FILES) {
		if (existsSync(join(svcDir, file))) return pm;
	}
	return "npm";
}

function buildCmdTemplate(runner: TestRunner, pm: string): string {
	switch (runner) {
		case "pytest":
			if (pm === "uv") return "uv run pytest {paths} -q";
			if (pm === "poetry") return "poetry run pytest {paths} -q";
			return "pytest {paths} -q";
		case "vitest":
			if (pm === "pnpm") return "pnpm exec vitest run {paths} --reporter=json";
			return "npx vitest run {paths} --reporter=json";
		case "jest":
			if (pm === "pnpm") return "pnpm exec jest {paths} --json";
			return "npx jest {paths} --json";
		default:
			return "echo 'unknown runner'";
	}
}

function guessSkill(dirName: string): string {
	// Guess a skill name from directory: "my-api" → "my-api-tech"
	return `${dirName}-tech`;
}
