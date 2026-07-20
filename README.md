# pi-tdd

Guided **Test-Driven Development** extension for the [Pi coding agent](https://github.com/earendil-works/pi-coding-agent).

Enforces strict RED→GREEN discipline by splitting TDD into **three behavioral subagents** — each with a hard-wired mindset and never allowed to cross into another's territory.

## How it works

| Agent | Role | Never |
|---|---|---|
| 📐 **architect** | Reads codebase, writes plan | Implements or writes tests |
| 🔴 **red-writer** | Writes failing tests + stubs | Implements production code |
| 🟢 **green-impl** | Minimum code to pass | Touches or weakens tests |

Each TDD cycle is isolated with a unique ID and a lock that prevents concurrent cycles.

## Installation

```bash
pi install git:github.com/bejorock/pi-tdd
```

> Requires Pi coding agent with [subagent support](https://github.com/earendil-works/pi-coding-agent).

## Quick start

```bash
# 1. Scaffold the project
/tdd:init

# 2. Start a cycle
tdd_start({ service: "api", feature: "user auth" })

# 3. Follow the flow
tdd_next()            # next phase instructions
tdd_red({...})        # verify tests FAIL
tdd_green({...})      # verify tests PASS
tdd_done()            # release lock
```

## Flow

```
tdd_start   →  📐 architect     (recon + plan)
tdd_next    →  🔴 red-writer    (failing tests + stubs)
tdd_red     →  🔴✅ red_verify  (gate: tests MUST fail)
                🟢 green-impl   (minimum implementation)
tdd_green   →  🟢✅ green_verify(gate: tests MUST pass)
                👀 reviewer     (code review)
tdd_done    →  ✅ done          (lock released)
```

## Commands & Tools

| Name | Type | What |
|---|---|---|
| `/tdd:init` | Command | Analyze project, scaffold config + agents, report gaps |
| `tdd_start` | Tool | Start a new locked TDD cycle |
| `tdd_next` | Tool | Get the next phase's subagent call |
| `tdd_red` | Tool | RED gate — run tests, verify they FAIL, write manifest |
| `tdd_green` | Tool | GREEN gate — run tests, verify they PASS (max 100 retries) |
| `tdd_status` | Tool | Show active cycle details |
| `tdd_done` | Tool | Release cycle lock, mark complete or abandoned |

## Configuration

After running `/tdd:init`, edit `.pi/tdd-services.json` for full control:

```json
{
  "api": {
    "dir": "services/api",
    "skill": "api-tech",
    "runner": "pytest",
    "cmdTemplate": "poetry run pytest {paths} -q"
  }
}
```

| Field | Description |
|---|---|
| `dir` | Path relative to repo root |
| `skill` | Skill name passed to subagents |
| `runner` | `pytest`, `vitest`, or `jest` |
| `cmdTemplate` | `{paths}` is replaced with space-joined test file paths |

## Requirements

- **Pi coding agent** with subagent support
- **Git repository**
- At least one **test framework**: pytest, vitest, or jest

## Live widget

When a TDD cycle is active, a live status widget appears below the editor:

```
🧪 TDD · api/a3f2b1 🔒
📐 architect · user auth
```

🔒 locked / 🔓 completed. Refreshes instantly on state changes.

## License

MIT
