import { AGENT_RUNTIME } from "./config";

export function subagentCall(
	agent: string,
	skill: string,
	task: string,
	dataDir: string,
	reads?: string[],
): string {
	const runtimeAgent = AGENT_RUNTIME[agent] ?? agent;
	const parts = [
		`subagent({`,
		`  agent: "${runtimeAgent}",`,
	];
	if (skill) {
		parts.push(`  skill: "${skill}",`);
	}
	parts.push(`  task: "${task} (work in ${dataDir})",`);
	if (reads && reads.length > 0) {
		parts.push(`  reads: ${JSON.stringify(reads)}`);
	}
	parts.push("})");
	return parts.join("\n");
}
