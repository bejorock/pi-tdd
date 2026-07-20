# pi-tdd — Pi extension

This repo **is** the pi-tdd extension itself, not a project using it. For the user-facing reference see README.md.

Enforces RED→GREEN TDD discipline through three behavioral subagents with hard-wired mindsets, plus a mode system (build/plan/tdd) for tool blocking and system prompt guidance.

## Project layout

```
src/
├── index.ts           # Entry: registers gates, 6 tools, /init command, widget
├── gates.ts           # Mode system: build/plan/tdd, tool blocking, TDD_SYSTEM_PROMPT, /build /plan /tdd /mode
├── config.ts          # loadServiceConfig() from .pi/tdd-services.json, AGENT_RUNTIME, MAX_TDD_ITER
├── state.ts           # Cycle state machine: TddPointer (multi-service), TddFlow, cycle helpers
├── init.ts            # /init — auto-discover services, detect frameworks, scaffold agents
├── widget.ts          # Mode-aware widget: 🟢 Build / 🔵 Plan / 🧪 TDD
├── test-runner.ts     # Test exec + pytest/vitest/jest parsers + compileChangedPython + collectError
├── subagent.ts        # Unified subagentCall(agent, skill, task, dataDir, reads?)
├── types.ts           # Mode, TddFlow, TddPointer, TestResult, ServiceConfig
├── utils.ts           # repoRoot() via git rev-parse
├── tools/
│   ├── tdd_start.ts   # Start locked cycle, multi-service pointer
│   ├── tdd_next.ts    # Artifact auto-detection, multi-service status
│   ├── tdd_red.ts     # RED gate: active cycle check, test existence, collectError rejection
│   ├── tdd_green.ts   # GREEN gate: testPath validation, compile check, lastGreen, auto-retry
│   ├── tdd_status.ts  # Markdown table with full cycle details
│   └── tdd_done.ts    # Graceful release, already-unlocked check
```

## Architecture

- **Flow**: `tdd_start → architect → tdd_next → red-writer → tdd_red → green-impl → tdd_green → reviewer → tdd_done`
- **Cycle isolation**: random 6-char ID, state under `.tdd/<service>/<id>/`
- **Lock**: one active cycle at a time, pointer at `.tdd/flow.json` with `services: string[]`
- **RED manifest**: `red.json` with `lastGreen`, `lastSummary`, `lastGreenAt` tracking
- **Gates**: `tool_call` blocks write/edit in plan/tdd, bash redirects in tdd, subagent bypass via `PI_SUBAGENT_DEPTH`
- **Generic**: config from `.pi/tdd-services.json`, not hardcoded

## Key conventions

- `typebox` (not `@sinclair/typebox`) for tool parameter schemas
- No build step — Pi loads `.ts` via jiti at runtime
- All tools prefixed `tdd_`, commands use `/` prefix
- `repoRoot()` for all filesystem paths
- `AGENT_RUNTIME` maps roles to agent names; per-service overrides in tdd-services.json

## Commands (dev workflow)

```bash
npm install                                        # install dependencies (typebox)
pi -ne -e ./src/index.ts                           # dry-run: verify load
pi -e ./src/index.ts -p "test"                     # smoke test
```

> No build step, no bundler. Pi loads `.ts` directly via jiti.
