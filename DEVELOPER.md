# pi-tdd — Developer Guide

## Architecture

```
pi-tdd/src/
├── index.ts              # Extension entry. Registers gates, tools, command, events, widget.
├── gates.ts              # Mode system (build/plan/tdd), tool blocking, system prompt injection
├── config.ts             # Service config loader, AGENT_RUNTIME mapping, MAX_TDD_ITER
├── state.ts              # Cycle state machine: pointer + flow + cycle helpers
├── init.ts               # /init — project analysis, scaffolding, gap detection
├── widget.ts             # Live mode-aware widget (build/plan/tdd)
├── test-runner.ts        # Test exec + parsers (pytest/vitest/jest) + compileChangedPython
├── subagent.ts           # Unified subagentCall() with runtime name mapping + reads
├── types.ts              # TypeScript types (Mode, TddFlow, TddPointer, TestResult, etc.)
├── utils.ts              # Shared helpers (repoRoot)
├── tools/
│   ├── tdd_start.ts      # tdd_start — creates locked cycle, writes pointer, multi-service tracking
│   ├── tdd_next.ts       # tdd_next — artifact auto-detection, multi-service status
│   ├── tdd_red.ts        # tdd_red — RED gate (active cycle check, collect error rejection)
│   ├── tdd_green.ts      # tdd_green — GREEN gate (testPath validation, compile check, lastGreen)
│   ├── tdd_status.ts     # tdd_status — markdown table with full cycle details
│   └── tdd_done.ts       # tdd_done — graceful release, already-unlocked detection
```

## State model

### `.tdd/flow.json` (pointer)

```json
{ "activeService": "api", "activeCycleId": "a3f2b1", "services": ["api", "web"] }
```

Multi-service tracking. Points to the currently active cycle.

### `.tdd/<service>/<cycleId>/flow.json` (cycle state)

```json
{
  "service": "api",
  "cycleId": "a3f2b1",
  "feature": "user auth",
  "skill": "api-tech",
  "dir": "services/api",
  "step": "architect",
  "testPaths": [],
  "planPath": ".tdd/api/a3f2b1/PLAN.md",
  "startedAt": "2026-07-20T...",
  "locked": true
}
```

Steps: `architect` → `red-writer` → `green-impl` → `reviewer` → `done`. Lock prevents starting a new cycle while one is active.

### `.tdd/<service>/<cycleId>/red.json` (RED manifest)

Written by `tdd_red`. Records test paths, red verification status, attempt counter, and `lastGreen` tracking.

## Mode system

Three modes managed in `gates.ts`:

| Mode | Write/Edit | Bash | System Prompt | Widget |
|---|---|---|---|---|
| `build` | ✅ allowed | ✅ allowed | BUILD_SYSTEM_PROMPT | 🟢 Build |
| `plan` | ❌ blocked | ✅ allowed | PLAN_SYSTEM_PROMPT | 🔵 Plan |
| `tdd` | ❌ blocked (except .tdd/) | blocked for redirects/cp/mv/tee | TDD_SYSTEM_PROMPT + active cycle info | 🧪 TDD flow |

Every mode injects a system prompt via `before_agent_start` so the agent always knows its constraints and reminders (e.g. don't call tdd_* tools outside /tdd).

A `modeBanner()` (📍 CURRENT MODE: ...) is appended LAST, after the mode-specific prompt, on every turn. It explicitly tells the agent that any earlier mode reference in the conversation is stale and to trust the banner over history — this prevents confusion when the user switches modes mid-conversation with /build, /plan, /tdd. Each mode command (`/build`, `/plan`, `/tdd`) also sends a persisted `mode-switch-notice` message into the conversation so the switch is visible in history, not just in the ephemeral system prompt.

Gates don't apply to subagents (`PI_SUBAGENT_DEPTH` check) — except the `.env` hard block, which applies unconditionally in every mode, to the main agent and subagents alike.

### `.env` hard block

`write`/`edit` calls targeting `.env`, `.env.local`, or any `.env.*` (excluding `.env.example`) are rejected before mode logic runs. Bash commands that redirect (`>`, `>>`) or use `cp`/`mv`/`tee`/`echo`/`printf`/`cat` against `.env*` files are blocked the same way. No exceptions, no agent bypass.

### TDD tool gate

`tdd_start`, `tdd_next`, `tdd_red`, `tdd_green`, `tdd_status`, `tdd_done` are only callable in `tdd` mode. Calling any of them from `build` or `plan` mode is rejected with a reason stating the agent must be in tdd mode. This prevents the main agent from starting or manipulating a TDD cycle outside the guided flow.

### Subagent delegation block in plan mode

`subagent` and `subagent_wait` (registered by the `pi-subagents` extension) are blocked in `plan` mode. Without this, the main agent could bypass the write/edit block by delegating the write to a subagent, which has its own write access unaffected by the parent's mode gate. Blocked in `plan` only — `build` and `tdd` both need subagent delegation to function (TDD mode's entire flow is subagent calls).

## How to add a new test runner

1. Add the runner type in `types.ts` (`TestRunner` union)
2. Add detection markers in `init.ts` (`TEST_FRAMEWORK_MARKERS`)
3. Add a `parse<Runner>()` function in `test-runner.ts`
4. Add `buildCmdTemplate()` cases in `init.ts`

## How to add a new phase

1. Add the phase icon in `widget.ts` (`PHASE_ICONS`)
2. Add the transition logic in `tdd_next.ts` (artifact auto-detection)
3. If it has a verification gate, add a new tool in `tools/`

## Embedded agents

The three behavioral agents are embedded as string constants in `init.ts`. `/init` copies them to `.pi/agents/`.

Each agent has full Pi subagent frontmatter:

| Field | architect | red-writer | green-impl |
|---|---|---|---|
| `package` | tdd | tdd | tdd |
| `model` | inherit | inherit | inherit |
| `systemPromptMode` | replace | replace | replace |
| `inheritProjectContext` | false | false | false |
| `inheritSkills` | false | false | false |
| `defaultContext` | fork | fresh | fork |
| `permission` | bash read-only | bash test/lint/typecheck | bash test/lint/typecheck + install |

Key design choices:
- **architect**: reads only + write to `.tdd/`. Fork context for codebase access. Narrow bash (read-only).
- **red-writer**: writes tests + stubs. Fresh context (no prior bias). Self-verification with concrete bash commands.
- **green-impl**: minimum production code. Fork context. Full validation pipeline (tests + types + lint).

All three have `memory` + `memory_search` for cross-session learning, plus structured REPORT and MEMORY sections.

The `AGENT_RUNTIME` mapping in `config.ts` maps internal role names to runtime agent names. Per-service overrides via `agents` field in `tdd-services.json`.

## Widget refresh

The widget is mode-aware. `setWidgetState(ctx, mode)` displays 🟢/🔵/🧪 per mode. Tools call `refreshWidget()` for instant update after state changes. `session_start` and `agent_settled` provide fallback refresh.

## Testing the extension locally

```bash
pi -ne -e ./src/index.ts                             # dry-run: verify load
pi -e ./src/index.ts -p "test"                       # run a prompt
pi -e ./src/index.ts -p "test" --model <model>       # test with specific model
```

## Design decisions

| Decision | Why |
|---|---|
| Behavioral agents | RED and GREEN need opposite mindsets |
| Skills at call time | One agent roster, all services |
| Generic config (JSON) | Works with any project, not hardcoded |
| `tdd_` prefix on tools | Zero collision with other extensions |
| Mode system gates | Prevent main agent from skipping TDD discipline |
| Artifact auto-detection (tdd_next) | Robust against manual state drift |
| Python compile check | Catch broken implementations beyond test failures |
| `repoRoot()` via git | Portable — works in worktrees |
