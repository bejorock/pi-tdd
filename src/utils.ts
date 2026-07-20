import { execSync } from "node:child_process";

export function repoRoot(): string {
	try {
		return execSync("git rev-parse --show-toplevel", {
			stdio: ["ignore", "pipe", "pipe"],
		}).toString().trim();
	} catch {
		return process.cwd();
	}
}
