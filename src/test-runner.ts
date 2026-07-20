import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ServiceConfig, TestResult } from "./types";

export function runServiceTests(
	cfg: ServiceConfig,
	testPaths: string[],
	wt: string,
): { result: TestResult; stdout: string; exitCode: number } {
	const cwd = join(wt, cfg.dir);
	if (!existsSync(cwd)) throw new Error(`Service dir not found: ${cwd}`);

	const relPaths = testPaths.map((p) => {
		const prefix = cfg.dir + "/";
		return p.startsWith(prefix) ? p.slice(prefix.length) : p;
	});

	const isPython = cfg.runner === "pytest";
	const env = isPython ? { ...process.env, PYTHONPATH: cwd } : { ...process.env };

	let stdout = "";
	let stderr = "";
	let exitCode = 0;
	try {
		stdout = execSync(cfg.cmd(relPaths), { cwd, stdio: ["ignore", "pipe", "pipe"], timeout: 180_000, env }).toString();
	} catch (e: any) {
		stdout = e.stdout?.toString() ?? "";
		stderr = e.stderr?.toString() ?? "";
		exitCode = e.status ?? 1;
	}

	const combined = stdout + (stderr ? "\n" + stderr : "");
	const result = cfg.runner === "vitest" ? parseVitest(stdout) : cfg.runner === "jest" ? parseJest(combined) : parsePytest(combined);
	return { result, stdout: combined, exitCode };
}

function parsePytest(stdout: string): TestResult {
	const failedMatch = /(\d+)\s+failed/i.exec(stdout);
	const passedMatch = /(\d+)\s+passed/i.exec(stdout);
	const failed = failedMatch ? Number(failedMatch[1]) : 0;
	const passed = passedMatch ? Number(passedMatch[1]) : 0;
	const noTests = /no tests ran/i.test(stdout);
	const collectError = /(?:errors?\b|cannot collect|collection error)/i.test(stdout) && failed === 0 && passed === 0;
	const summaryLine = stdout.split("\n").find((l) => /=/.test(l) && /(passed|failed|error)/i.test(l))?.trim() ?? "";
	return { failed, passed, ran: failed + passed > 0 && !noTests, collectError, summary: summaryLine };
}

function parseVitest(stdout: string): TestResult {
	const start = stdout.indexOf("{");
	const end = stdout.lastIndexOf("}");
	let numTotal = 0;
	let numPassed = 0;
	let numFailed = 0;
	if (start !== -1 && end > start) {
		try {
			const j = JSON.parse(stdout.slice(start, end + 1)) as {
				numTotalTests?: number;
				numPassedTests?: number;
				numFailedTests?: number;
			};
			numTotal = j.numTotalTests ?? 0;
			numPassed = j.numPassedTests ?? 0;
			numFailed = j.numFailedTests ?? 0;
		} catch { /* malformed JSON */ }
	}
	return {
		failed: numFailed,
		passed: numPassed,
		ran: numTotal > 0,
		collectError: false,
		summary: `Tests: ${numPassed} passed, ${numFailed} failed, ${numTotal} total`,
	};
}

function parseJest(out: string): TestResult {
	try {
		const m = out.match(/Tests:\s+(\d+)\s+failed,\s+(\d+)\s+passed,\s+(\d+)\s+total/);
		if (m) {
			const failed = parseInt(m[1]);
			const passed = parseInt(m[2]);
			return { ran: true, passed, failed, collectError: false, summary: `${passed} passed, ${failed} failed` };
		}
	} catch {}
	return { ran: false, passed: 0, failed: 0, collectError: false, summary: "Could not parse jest output" };
}

export function tailOutput(stdout: string, n = 30): string {
	return stdout.split("\n").filter((l) => l.trim().length > 0).slice(-n).join("\n");
}

export function compileChangedPython(serviceDir: string, wt: string): { ok: boolean; errors: string; compiled: number } {
	let changed = "";
	try {
		changed = execSync(`git diff --name-only HEAD -- "${serviceDir}"`, { cwd: wt, stdio: ["ignore", "pipe", "pipe"] }).toString();
	} catch { /* no tracked changes */ }
	try {
		changed += "\n" + execSync(`git ls-files --others --exclude-standard -- "${serviceDir}"`, { cwd: wt, stdio: ["ignore", "pipe", "pipe"] }).toString();
	} catch { /* no untracked files */ }

	const pyFiles = changed.split("\n").map((s) => s.trim()).filter((p) => p && p.endsWith(".py"));
	if (pyFiles.length === 0) return { ok: true, errors: "", compiled: 0 };

	const abs = pyFiles.map((p) => join(wt, p));
	try {
		execSync(`python -m py_compile ${abs.map((a) => `"${a}"`).join(" ")}`, { cwd: wt, stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 });
		return { ok: true, errors: "", compiled: abs.length };
	} catch (e: any) {
		return { ok: false, errors: (e.stderr?.toString() ?? "") + (e.stdout?.toString() ?? ""), compiled: abs.length };
	}
}
