import type { Mode } from "./types";
import { loadServiceConfig } from "./config";
import { activeCycleDir, activeServiceFlow } from "./state";
import { repoRoot } from "./utils";
import { MODE_WIDGET, setWidgetState } from "./widget";

export const BUILD_SYSTEM_PROMPT = `

## BUILD MODE ACTIVE

You are in **build mode** — all tools are enabled with no restrictions.

### What you can do
- Read, write, and edit any file directly (no agent delegation required)
- Run bash commands freely (installs, migrations, server starts, applies)
- Implement features inline without going through TDD gates
- Use agents optionally for complex delegation, but you are not required to

### What this mode is for
- General implementation, fixes, refactoring, and debugging
- Running services, migrations, and infra commands
- Any work that does NOT need the TDD RED→GREEN discipline

### Reminders
- You are NOT in TDD mode — do NOT call tdd_start/tdd_next/tdd_red/tdd_green unless switching to /tdd
- You are NOT in plan mode — write and edit tools are fully available
- If the user switches mode with /plan or /tdd, the appropriate restrictions will activate`;

export const PLAN_SYSTEM_PROMPT = `

## PLAN MODE ACTIVE

You are in **plan mode** — read-only exploration and planning. Write/edit tools are blocked.

### What you can do
- Read any file, search code, run bash for exploration (grep, find, ls, tests)
- Delegate to read-only agents for research and planning
- Write planning artifacts ONLY via subagents (they have write access)
- Produce plans, architecture documents, research reports, and proposals

### What is blocked
- \`write\` and \`edit\` tool calls are rejected in this mode
- You cannot modify source files, configs, or tests directly
- Do NOT attempt to implement — plan first, then switch to /build or /tdd

### What this mode is for
- Researching the codebase before implementation
- Producing a concrete plan or proposal for the user to review
- Architecture decisions, API design, dependency analysis
- Multi-service coordination planning before TDD

### Reminders
- You are NOT in TDD mode — do NOT call tdd_start/tdd_next/tdd_red/tdd_green
- You are NOT in build mode — write/edit are blocked
- Switch to /build for implementation or /tdd for test-driven development`;

export const TDD_SYSTEM_PROMPT = `

## TDD MODE ACTIVE

You are in guided TDD flow. The extension enforces this workflow:

### Flow (6 steps per service)
1. **architect** → recon + plan → writes .tdd/context.md + .tdd/PLAN.md
2. **red-writer** → failing tests + stub modules (self-verifying, NEVER implements)
3. **tdd_red gate** → verify tests FAIL (rejects already-passing and collection errors)
4. **green-impl** → minimum implementation to pass tests (NEVER weakens them)
5. **tdd_green gate** → verify tests PASS (max 100 attempts, compiles changed .py)
6. **reviewer** → review implementation

Call \`tdd_start({ service, feature })\` to begin. Call \`tdd_next()\` after each step — it gives exact subagent call instructions.

### Gate rules
- \`tdd_red\`: tests MUST fail. Writes .tdd/<service>/<id>/red.json as authority.
- \`tdd_green\`: EXACT registered tests MUST pass. Changed .py modules MUST compile.

### Mode restrictions
- \`write\`/\`edit\` blocked for code paths; only active cycle .tdd/ workspace allowed
- Bash: no redirects (>  >>), heredocs (<<), tee, cp, mv — tests only
- Code writing is done by agents (red-writer, green-impl), not by you

### Tools
- \`tdd_status\` — show current cycle ID, phase, lock state
- \`tdd_done\` — release cycle lock when complete

### Multi-service
- Contract owner runs first — architect writes .tdd/contract/
- Consumers generate clients from the STATIC contract file, never a running server`;

// TDD orchestration tools — only usable in tdd mode
const TDD_TOOLS = new Set(["tdd_start", "tdd_next", "tdd_red", "tdd_green", "tdd_status", "tdd_done"]);

export function registerGates(pi: any, currentMode: { value: Mode }): void {

	function isSubagent(): boolean {
		const depth = process.env.PI_SUBAGENT_DEPTH;
		return depth !== undefined && depth !== "" && depth !== "0";
	}

	// Tool blocking
	pi.on("tool_call", async (event: any, _ctx: any) => {
		// .env / .env.local are READ-ONLY in ALL modes — no exceptions, no agent bypass
		if (["write", "edit"].includes(event.toolName)) {
			const args = event.args || event.parameters || {};
			const filePath: string = args.path || args.filePath || "";
			if (/(\/|^)\.env(\.local|\.\w+)?$/.test(filePath) && !/\.env\.example$/.test(filePath)) {
				return { block: true, reason: `[HARD BLOCK] .env and .env.local are READ-ONLY. Never write, edit, or overwrite any .env file. Read them only.` };
			}
		}
		if (event.toolName === "bash") {
			const args = event.args || event.parameters || {};
			const cmd: string = (args.command || "").toString();
			// Block any bash that writes to .env or .env.local
			if (/(?:cp|mv|tee|echo|printf|cat)\s[^|]*\.env(\.local|\.\w+)?(?:\s|$)/.test(cmd) ||
			    />{1,2}\s*\.env(\.local|\.\w+)?(?:\s|$)/.test(cmd)) {
				return { block: true, reason: `[HARD BLOCK] Writing to .env or .env.local via bash is forbidden. These files are READ-ONLY.` };
			}
		}

		// TDD tools only make sense inside tdd mode — block them everywhere else
		if (currentMode.value !== "tdd" && TDD_TOOLS.has(event.toolName)) {
			return { block: true, reason: `[${currentMode.value} mode] Tool '${event.toolName}' is a TDD tool — must be in tdd mode.` };
		}

		if (currentMode.value === "build") return;

		if (currentMode.value === "plan") {
			if (["write", "edit"].includes(event.toolName)) {
				return { block: true, reason: `[plan mode] Tool '${event.toolName}' is blocked — use read-only tools for planning.` };
			}
		}

		if (currentMode.value === "tdd") {
			if (isSubagent()) return;

			if (["write", "edit"].includes(event.toolName)) {
				const args = event.args || event.parameters || {};
				const path = args.path || args.filePath || "";
				const allowed = activeCycleDir(repoRoot());
				if (allowed && (path.startsWith(allowed) || path.startsWith("./" + allowed))) return;
				if (path === ".tdd/flow.json" || path === "./tdd/flow.json") return;
				return { block: true, reason: `[TDD mode] Tool '${event.toolName}' is blocked — use agents or write inside ${allowed ?? ".tdd/<service>/<id>/"}.` };
			}

			if (event.toolName === "bash") {
				const args = event.args || event.parameters || {};
				const cmd = (args.command || "").toString();
				if (/[>]{1,2}|<<|\btee\b|\bcp\b|\bmv\b/.test(cmd)) {
					return { block: true, reason: `[TDD mode] Bash writes blocked — use write tool for .tdd/ artifacts or agents for code.` };
				}
			}
		}
	});

	// System prompt injection — fires for every mode so the agent always knows where it is
	pi.on("before_agent_start", (event: any) => {
		if (currentMode.value === "tdd") {
			const wt = repoRoot();
			const config = loadServiceConfig(wt);
			const active = activeServiceFlow(wt);
			const services = Object.keys(config).join(", ") || "(none configured)";
			const activeInfo = active
				? `**Active cycle:** ${active.service}/${active.cycleId} (${active.feature})\n**Phase:** ${active.step}`
				: "No active cycle";
			event.systemPrompt += `\n## Available services\n${services}\n\n${activeInfo}${TDD_SYSTEM_PROMPT}`;
		} else if (currentMode.value === "plan") {
			event.systemPrompt += PLAN_SYSTEM_PROMPT;
		} else if (currentMode.value === "build") {
			event.systemPrompt += BUILD_SYSTEM_PROMPT;
		}
	});

	// Widget refresh
	pi.on("session_start", (_event: any, ctx: any) => setWidgetState(ctx, currentMode.value));
	pi.on("agent_settled", (_event: any, ctx: any) => setWidgetState(ctx, currentMode.value));

	// Mode commands
	pi.registerCommand("build", {
		description: "Switch to build mode (all tools enabled)",
		handler: async (_args: any, ctx: any) => {
			currentMode.value = "build";
			ctx.ui.notify("Mode: BUILD — all tools enabled", "info");
			if (ctx.hasUI) { ctx.ui.setStatus("mode", "BUILD"); setWidgetState(ctx, currentMode.value); }
		},
	});
	pi.registerCommand("plan", {
		description: "Switch to plan mode (write tools blocked, bash allowed)",
		handler: async (_args: any, ctx: any) => {
			currentMode.value = "plan";
			ctx.ui.notify("Mode: PLAN — write tools blocked, bash allowed", "info");
			if (ctx.hasUI) { ctx.ui.setStatus("mode", "PLAN"); setWidgetState(ctx, currentMode.value); }
		},
	});
	pi.registerCommand("tdd", {
		description: "Switch to TDD mode (guided TDD flow)",
		handler: async (_args: any, ctx: any) => {
			currentMode.value = "tdd";
			ctx.ui.notify("Mode: TDD — code writes blocked, .tdd/ allowed, bash allowed", "info");
			if (ctx.hasUI) {
				ctx.ui.setStatus("mode", "TDD");
				setWidgetState(ctx, currentMode.value);
				pi.sendMessage({
					customType: "tdd-mode-notice",
					content: [{ type: "text", text: "[TDD MODE ACTIVE] Code writes blocked (bash + .tdd/ writes allowed).\n\n**Start a feature:** tdd_start({ service: \"...\", feature: \"...\" })\n**Next step:**     tdd_next()\n**Gates:**         tdd_red / tdd_green\n\n**TDD Agents:** architect → red-writer → green-impl → reviewer\n**Lock:** tdd_status / tdd_done\n\nFlow: tdd_start → architect → red-writer → tdd_red → green-impl → tdd_green → reviewer → tdd_done" }],
					display: true,
				});
			}
		},
	});
	pi.registerCommand("mode", {
		description: "Show current mode",
		handler: async (_args: any, ctx: any) => {
			const modes: Record<Mode, string> = {
				build: "BUILD — all tools enabled",
				plan: "PLAN — write tools blocked, bash allowed",
				tdd: "TDD — code writes blocked, .tdd/ + bash allowed",
			};
			ctx.ui.notify(`Mode: ${modes[currentMode.value]}`, "info");
		},
	});
}
