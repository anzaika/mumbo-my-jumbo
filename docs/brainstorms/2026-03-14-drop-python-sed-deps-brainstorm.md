# Brainstorm: Eliminate Python and sed Dependencies

**Date:** 2026-03-14
**Status:** Draft

## What We're Building

Rewrite the two Python scripts (`generate_sed.py`, `generate_renames.py`) in Node.js and have Node.js perform file replacements directly — eliminating both Python 3 and BSD sed as dependencies.

## Why This Approach

**The problem:** The skill claims "everything ships with macOS" but Python 3 doesn't ship with recent macOS (removed in Monterey 12.3). A non-technical user on a fresh MacBook hits a wall before the skill even runs. BSD sed also has portability issues (GNU sed on Linux behaves differently).

**The insight:** Claude Code is an npm package, so Node.js is already installed on every machine that can run this skill. Rewriting the scripts in Node.js means zero additional dependencies.

**Before:**
```
Claude Code → requires Node.js (guaranteed)
This skill  → requires Python 3 (NOT guaranteed) + BSD sed (macOS-only)
```

**After:**
```
Claude Code → requires Node.js (guaranteed)
This skill  → uses Node.js (already there)
```

## Key Decisions

1. **Rewrite scripts in Node.js** — Both scripts are small (80 + 150 lines) and use only basic operations: JSON parsing, string replacement, regex, path manipulation, Unicode normalization. All available in Node.js stdlib.

2. **Node.js replaces sed too** — Instead of generating sed commands, the replacement script reads files, applies replacements longest-first (sequential or single regex with alternation), and writes them back. No shell escaping, no BSD/GNU differences.

3. **Tests move to a JS test runner** — The existing pytest suite is a dev-only concern (users don't run tests), but it should be rewritten alongside the scripts for consistency. A lightweight runner like `node --test` (built-in since Node 18) keeps it dependency-free.

4. **SKILL.md workflow changes are minimal** — Steps 6 and 8.5 change from "run Python script" to "run Node script". The overall flow stays identical.

5. **Delete old Python scripts and tests** — The Python files (`scripts/generate_sed.py`, `scripts/generate_renames.py`, `tests/`) are removed after the Node.js equivalents are in place. No parallel maintenance.

## What Changes

| Component | Before | After |
|-----------|--------|-------|
| `scripts/generate_sed.py` | Python, outputs sed commands | `scripts/replace.js` — reads map, replaces in files directly |
| `scripts/generate_renames.py` | Python, outputs rename JSON | `scripts/rename.js` — same logic in Node.js |
| File replacement (Step 6) | Python script + BSD sed | Single Node.js script |
| File renaming (Step 8.5) | Python script + Bash mv | Single Node.js script |
| Tests | pytest (Python) | `node --test` (built-in) |
| README requirements | "macOS, Python 3, Claude Code" | "Claude Code" |

## What Doesn't Change

- SKILL.md workflow structure (9 steps, same order)
- Detection pass (Haiku agent)
- Verification pass (Haiku agents)
- Contextual rewrite (Sonnet agents)
- `.mumbo-index.json` tracking file
- Error handling principles

## Open Questions

None — approach is straightforward.
