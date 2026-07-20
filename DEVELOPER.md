# pi-tdd — Developer Guide

## Architecture

```
pi-tdd/src/
├── index.ts              # Extension entry. Registers tools, command, events, widget.
├── config.ts             # Loads .pi/tdd-services.json. Zero-config by default.
├── state.ts              # Cycle state machine: pointer, flow read/write, cycleId generation
├── init.ts               # /tdd:init — project analysis, scaffolding, gap detection
├── widget.ts             # Live TDD widget with stored UI context for instant refresh
├── test-runner.ts        # Generic test execution + output parsing (pytest, vitest, jest)
├── subagent.ts           # Subagent call templates per phase
├── types.ts              # TypeScript types (ServiceConfig, TddFlow, InitResult, etc.)
├── utils.ts              # Shared helpers (repoRoot)
├── tools/
│   ├── tdd_start.ts      # tdd_start — creates locked cycle, writes pointer
│   ├── tdd_next.ts       # tdd_next — returns next phase's subagent call
│   ├── tdd_red.ts        # tdd_red — runs tests, verifies FAIL, writes red.json manifest
│   ├── tdd_green.ts      # tdd_green — runs tests, verifies PASS, tracks attempts
│   ├── tdd_status.ts     # tdd_status — shows cycle details
│   └── tdd_done.ts       # tdd_done — releases lock, marks complete/abandoned
└── agents/               # (empty — embedded in init.ts)
```

## State model

### `.tdd/flow.json` (pointer)

```json
{ "activeService": "api", "activeCycleId": "a3f2b1" }
```

Points to the currently active cycle. Only one at a time.

### `.tdd/<service>/<cycleId>/flow.json` (cycle state)

```json
{
  "service": "api",
  "cycleId": "a3f2b1",
  "feature": "user auth",
  "step": "architect",
  "locked": true
}
```

Steps: `architect` → `red-writer` → `green-impl` → `reviewer` → `done`. Lock prevents starting a new cycle while one is active.

### `.tdd/<service>/<cycleId>/red.json` (RED manifest)

Written by `tdd_red` after verifying tests FAIL. Records test paths, output summary, and attempt counter. `tdd_green` reads this to know which tests to run and how many attempts remain.

### `.tdd/<service>/<cycleId>/PLAN.md` + `context.md`

Written by the architect agent. PLAN.md is the implementation plan; context.md captures codebase patterns discovered during recon.

## How to add a new test runner

1. Add the runner type in `types.ts` (`TestRunner` union)
2. Add detection markers in `init.ts` (`TEST_FRAMEWORK_MARKERS`)
3. Add a `parse<Runner>()` function in `test-runner.ts`
4. Add `buildCmdTemplate()` cases in `init.ts`

## How to add a new phase

1. Add the phase icon in `widget.ts` (`PHASE_ICONS`)
2. Add the subagent call template in `subagent.ts`
3. Add the transition logic in `tdd_next.ts`
4. If it has a verification gate, add a new tool in `tools/`

## Embedded agents

The three behavioral agents (`architect`, `red-writer`, `green-impl`) are embedded as string constants in `init.ts`. `/tdd:init` copies them to `.pi/agents/`. Key design choices:

- **architect**: reads only + write to `.tdd/`. Never touches production code.
- **red-writer**: writes tests + stubs. Self-verifies (runs tests, rewrites if passing). Never implements.
- **green-impl**: minimum production code. Never touches tests. Hard constraint in system prompt.

All three have Hermes memory (`memory`, `memory_search`) and Hypa tools (`hypa_read`, `hypa_grep`, `hypa_find`, `hypa_ls`, `hypa_shell`) for efficiency.

## Widget refresh

The widget stores UI context via `setWidgetState()` on `session_start`. Tools that change state (`tdd_start`, `tdd_done`) call `refreshWidget()` for instant update. `agent_settled` provides a fallback refresh at turn-end.

## Publishing

```bash
# From packages/pi-tdd/
npm publish
```

Or via GitHub Packages:

```json
// package.json
{
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  }
}
```

Users install with:
```bash
pi install pi-tdd
# or if private:
pi install @rekayasa/pi-tdd
```

## Testing the extension locally

```bash
# Link into a Pi project
cd some-project
pi install /path/to/pi-tdd

# Or test without installing:
pi -ne -e /path/to/pi-tdd/src/index.ts -p "test"
```

## Design decisions

| Decision | Why |
|---|---|
| Behavioral agents, not service agents | RED and GREEN need opposite mindsets. One agent doing both over-implements. |
| Skills at call time, not in agent config | One agent roster, all services. Skills provide specialization. |
| No chains for TDD | Chains cause `{previous}` context poisoning across phases. |
| Cycle isolation via random IDs | Multiple cycles per service possible. Lock ensures one active. |
| Embedded agents vs. separate files | Self-contained install. `/tdd:init` unpacks them. |
| `tdd_` prefix on all tool names | Zero collision with other extensions. |
| `repoRoot()` via git | Portable — no hardcoded paths. Works in worktrees. |
