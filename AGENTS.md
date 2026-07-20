# pi-tdd

Pi extension that enforces RED→GREEN TDD discipline through three behavioral subagents with hard-wired mindsets.

## Project layout

```
src/
├── index.ts           # Entry: registers 6 tools, 1 command, widget, events
├── config.ts          # Loads .pi/tdd-services.json → ServiceConfig[]
├── state.ts           # Cycle state machine: pointer + flow read/write
├── init.ts            # /tdd:init — project analysis, agent scaffolding
├── widget.ts          # Live below-editor TDD status widget
├── test-runner.ts     # Test exec + parsers (pytest, vitest, jest)
├── subagent.ts        # Subagent call template strings per phase
├── types.ts           # All TypeScript types
├── utils.ts           # repoRoot() via git rev-parse
├── tools/
│   ├── tdd_start.ts   # Start locked cycle → architect phase
│   ├── tdd_next.ts    # Get next phase instructions
│   ├── tdd_red.ts     # RED gate: verify tests FAIL
│   ├── tdd_green.ts   # GREEN gate: verify tests PASS
│   ├── tdd_status.ts  # Show active cycle
│   └── tdd_done.ts    # Release lock
```

## Architecture

- **Pipeline flow**: `tdd_start → [architect] → tdd_next → [red-writer] → tdd_red → [green-impl] → tdd_green → [reviewer] → tdd_done`
- **Cycle isolation**: random 6-char hex ID, state under `.tdd/<service>/<id>/`
- **Lock**: one active cycle at a time, pointer at `.tdd/flow.json`
- **RED manifest**: `red.json` written by `tdd_red`, consumed by `tdd_green` — same test paths enforced
- **Tool names use underscores** (not colons) for provider compatibility

## Key conventions

- `typebox` (not `@sinclair/typebox`) for tool parameter schemas — import `{ Type }` from `"typebox"`
- No build step — Pi loads `.ts` directly via jiti
- All tools prefixed `tdd_`, command `/tdd:init`
- No direct `node:child_process` exec in tool files — use `runServiceTests()` from `test-runner.ts`
- `repoRoot()` for all filesystem paths (portable across worktrees)

## Commands

```bash
npm install            # install dependencies (typebox)
pi -e ./src/index.ts   # test extension locally
```
