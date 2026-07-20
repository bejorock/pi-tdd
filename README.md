# pi-tdd

Guided **Test-Driven Development** extension for the [Pi coding agent](https://github.com/earendil-works/pi-coding-agent).

Enforces strict RED→GREEN discipline by splitting TDD into **three behavioral subagents** — each with a hard-wired mindset and never allowed to cross into another's territory.

## How it works

| Agent | Role | Never |
|---|---|---|
| 📐 **architect** | Reads codebase, writes plan | Implements or writes tests |
| 🔴 **red-writer** | Writes failing tests + stubs | Implements production code |
| 🟢 **green-impl** | Minimum code to pass | Touches or weakens tests |

## Installation

```bash
pi install git:github.com/bejorock/pi-tdd
```

## Modes

The extension adds three modes with tool blocking:

| Command | Mode | Effect |
|---|---|---|
| `/build` | Build | All tools enabled (default) |
| `/plan` | Plan | `write`/`edit` blocked — read-only planning |
| `/tdd` | TDD | Code writes blocked, `.tdd/` workspace allowed, bash redirects blocked |

In TDD mode, the system prompt is augmented with flow instructions, gate rules, and mode restrictions.

## Quick start

```bash
# 1. Scaffold the project
/tdd:init

# 2. Enter TDD mode
/tdd

# 3. Start a cycle
tdd_start({ service: "api", feature: "user auth" })

# 4. Follow the flow
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
tdd_green   →  🟢✅ green_verify(gate: tests MUST pass + compile)
                👀 reviewer     (code review)
tdd_done    →  ✅ done          (lock released)
```

## Commands & Tools

| Name | Type | What |
|---|---|---|
| `/tdd:init` | Command | Analyze project, scaffold config + agents, report gaps |
| `/build` | Command | Switch to build mode (all tools enabled) |
| `/plan` | Command | Switch to plan mode (write tools blocked) |
| `/tdd` | Command | Switch to TDD mode (guided flow, code writes blocked) |
| `/mode` | Command | Show current mode |
| `tdd_start` | Tool | Start a new locked TDD cycle |
| `tdd_next` | Tool | Get the next phase's subagent call (auto-detects from artifacts) |
| `tdd_red` | Tool | RED gate — verify tests FAIL (rejects passing + collection errors) |
| `tdd_green` | Tool | GREEN gate — verify tests PASS, compile changed Python, max 100 retries |
| `tdd_status` | Tool | Show active cycle details (markdown table) |
| `tdd_done` | Tool | Release cycle lock |

## Configuration

After running `/tdd:init`, edit `.pi/tdd-services.json`:

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

## Gating

- **`tdd_red`** — runs tests, verifies FAIL (rejects already-passing, collection errors). Writes `.tdd/<service>/<id>/red.json` as authority.
- **`tdd_green`** — runs EXACT registered tests, verifies PASS. Validates testPaths match red manifest. Compiles changed `.py` files (pytest only). Tracks `lastGreen` in manifest.

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

Build/plan modes show simple green/blue status bars.

## License

MIT
