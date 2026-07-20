import { execSync } from "node:child_process";
import { join } from "node:path";
import type { ServiceConfig } from "./types";

export interface TestResult {
	ran: boolean;
	passed: number;
	failed: number;
	summary: string;
}

export function runServiceTests(
	cfg: ServiceConfig,
	testPaths: string[],
	wt: string,
): { result: TestResult; stdout: string } {
	const cwd = join(wt, cfg.dir);
	const cmd = cfg.cmd(testPaths);
	let stdout = "";
	try {
		stdout = execSync(cmd, { cwd, stdio: ["ignore", "pipe", "pipe"], timeout: 120_000 }).toString();
	} catch (e: any) {
		stdout = (e.stdout?.toString() ?? "") + (e.stderr?.toString() ?? "");
	}
	const result = parseResult(cfg.runner, stdout);
	return { result, stdout };
}

function parseResult(runner: string, stdout: string): TestResult {
	switch (runner) {
		case "pytest":
			return parsePytest(stdout);
		case "vitest":
			return parseVitest(stdout);
		case "jest":
			return parseJest(stdout);
		default:
			return { ran: false, passed: 0, failed: 0, summary: `Unknown runner: ${runner}` };
	}
}

function parsePytest(out: string): TestResult {
	const passed = (out.match(/(\d+) passed/g) ?? []).map(s => parseInt(s)).reduce((a, b) => a + b, 0);
	const failed = (out.match(/(\d+) failed/g) ?? []).map(s => parseInt(s)).reduce((a, b) => a + b, 0);
	const errors = (out.match(/(\d+) error[s]?/g) ?? []).map(s => parseInt(s)).reduce((a, b) => a + b, 0);
	const ran = passed + failed + errors > 0;
	return { ran, passed, failed: failed + errors, summary: `${passed} passed, ${failed} failed, ${errors} errors` };
}

function parseVitest(out: string): TestResult {
	try {
		const json = JSON.parse(out);
		const passed = json.numPassedTests ?? 0;
		const failed = json.numFailedTests ?? 0;
		return { ran: passed + failed > 0, passed, failed, summary: `${passed} passed, ${failed} failed` };
	} catch {
		const m = out.match(/Tests\s+(\d+)\s+failed\s+\|\s+(\d+)\s+passed/);
		if (m) {
			const failed = parseInt(m[1]);
			const passed = parseInt(m[2]);
			return { ran: true, passed, failed, summary: `${passed} passed, ${failed} failed` };
		}
		return { ran: false, passed: 0, failed: 0, summary: "Could not parse vitest output" };
	}
}

function parseJest(out: string): TestResult {
	try {
		const m = out.match(/Tests:\s+(\d+)\s+failed,\s+(\d+)\s+passed,\s+(\d+)\s+total/);
		if (m) {
			const failed = parseInt(m[1]);
			const passed = parseInt(m[2]);
			return { ran: true, passed, failed, summary: `${passed} passed, ${failed} failed` };
		}
	} catch {}
	return { ran: false, passed: 0, failed: 0, summary: "Could not parse jest output" };
}

export function tailOutput(stdout: string, lines = 60): string {
	const all = stdout.split("\n");
	return all.slice(-lines).join("\n");
}
