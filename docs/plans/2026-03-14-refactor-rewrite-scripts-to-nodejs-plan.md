---
title: "Rewrite Python Scripts to Node.js, Eliminate sed"
type: refactor
status: active
date: 2026-03-14
origin: docs/brainstorms/2026-03-14-drop-python-sed-deps-brainstorm.md
---

# Rewrite Python Scripts to Node.js, Eliminate sed

## Overview

Rewrite `generate_sed.py` and `generate_renames.py` in Node.js. The new scripts perform file operations directly — no separate sed invocation needed. This eliminates Python 3 and BSD sed as dependencies, leaving only Node.js (already required by Claude Code).

(See brainstorm: `docs/brainstorms/2026-03-14-drop-python-sed-deps-brainstorm.md`)

## Problem Statement

Python 3 doesn't ship with macOS since Monterey 12.3. A non-technical user on a fresh MacBook can't run this skill without installing Python first. BSD sed also has portability issues vs GNU sed. Both are unnecessary since Node.js is guaranteed (Claude Code is an npm package).

## Proposed Solution

Two new self-contained Node.js scripts replace the entire Python+sed pipeline:

- `scripts/replace.js` — reads a JSON replacement map + file paths, applies longest-first replacements in-place, outputs a JSON summary
- `scripts/rename.js` — reads a JSON replacement map + paths, computes + executes renames, outputs a JSON summary

### Script Contracts

#### `scripts/replace.js`

```
Usage:  node scripts/replace.js <map.json> <file1.md> [file2.md ...]

Input:  - First arg: path to replacement map JSON file
        - Remaining args: paths to files to process
        (stdin-as-map mode from generate_sed.py is dropped — not needed)

Output: JSON to stdout:
        {
          "files_modified": 3,
          "total_replacements": 47,
          "results": [
            {"file": "path/to/file.md", "replacements": 12},
            {"file": "path/to/other.md", "replacements": 0}
          ]
        }
        All processed files appear in results (including count: 0).

Exit:   0 = success (including empty map, with warning to stderr)
        1 = invalid JSON, missing map file, or no file args

Errors: If a target file can't be read/written, log to stderr, skip it,
        include it in results with "error": "message", continue.

Behavior:
  - Single-pass replacement via regex alternation (NOT sequential per-entity).
    Prevents double-substitution. Matches generate_renames.py's approach.
  - Entities sorted longest-first in the alternation pattern.
  - Case-sensitive matching (matches sed behavior; the LLM detection pass
    is instructed to include case variants in the map).
  - Explicit 'utf8' encoding for all fs.readFileSync/writeFileSync calls.
  - Empty-map warning to stderr, exit 0, no files touched.
```

#### `scripts/rename.js`

```
Usage:  node scripts/rename.js <map.json> < paths.txt
        (or: find target/ -not -path '*/.*' | node scripts/rename.js map.json)

Input:  - First arg: path to replacement map JSON file
        - Stdin: one path per line

Output: JSON array to stdout:
        [{"old": "dir/acme-guide.md", "new": "dir/northwind-guide.md"}, ...]
        Sorted deepest-first (same contract as generate_renames.py).
        On collision: empty array [] to stdout, errors to stderr.

Exit:   0 = success (including empty map or no renames needed)
        1 = missing arg, invalid JSON, file not found, or collision detected

Behavior:
  - Single-pass case-insensitive matching with Unicode NFC normalization.
    Identical semantics to generate_renames.py's apply_replacements().
  - Collision detection: renamed-vs-renamed and renamed-vs-existing.
  - Renames executed internally via fs.renameSync() (deepest-first).
  - If collision detected: exit 1, print errors to stderr, output [],
    NO renames executed.
  - If an individual fs.renameSync() fails: log to stderr, continue.
  - Hidden entries (basename starts with '.') skipped.
  - Trailing path separators stripped.
```

## Technical Considerations

### Python → Node.js Behavioral Differences

1. **File encoding**: Node.js `fs.readFileSync` returns a Buffer by default. Must pass `'utf8'` explicitly — silent corruption otherwise. Add a non-ASCII fixture (`"Müller GmbH"`) to tests.

2. **Single-pass vs sequential**: `generate_sed.py` + sed applied replacements sequentially (one per entity), which could theoretically cause double-substitution. The new `replace.js` uses single-pass regex alternation — this is strictly safer. Document as intentional improvement.

3. **Unicode normalization**: `generate_renames.py` uses `unicodedata.normalize('NFC')` + `str.casefold()`. Node.js equivalent: `str.normalize('NFC')` + building regex with `i` flag. `String.prototype.normalize()` is available since Node 12.

4. **Path separator**: Node.js `path.sep` is `/` on macOS. Depth-sorting by separator count works identically to Python's `os.sep`. Not a concern for macOS-only deployment.

5. **Module format**: Scripts use CommonJS (`require`/`module.exports`), not ESM. CommonJS works with plain `.js` files and no `package.json`. ESM would require either `.mjs` extensions or a `package.json` with `"type": "module"` — unnecessary config for a zero-dependency project. Test files also use CommonJS.

### SKILL.md Changes (Beyond Steps 6 and 8.5)

SpecFlow analysis identified that **Step 4** also references Python: "generate filename-form variants deterministically **in Python**." This must be updated to reference Node.js or the orchestrator's inline logic. Three steps need updating total:
- Step 4: Change "in Python" to "in JavaScript" or "using a script"
- Step 6: Replace entire Python+sed invocation with `node scripts/replace.js`
- Step 8.5: Replace Python invocation and `os.rename()` reference with `node scripts/rename.js`

## Acceptance Criteria

- [ ] `scripts/replace.js` passes all unit + integration tests (ported from `test_generate.py`, `test_escape.py`, `test_main.py`, `test_integration.py`)
- [ ] `scripts/rename.js` passes all unit + integration tests (ported from `test_apply_renames.py`, `test_compute_renames.py`, `test_renames_main.py`, `test_renames_integration.py`)
- [ ] Both scripts work with `node` (no npm dependencies)
- [ ] Tests run with `node --test` (no npm dependencies)
- [ ] Test fixtures (`.md`, `.map.json`, `.key.json`) are reused unchanged
- [ ] A non-ASCII entity fixture exists and passes
- [ ] A double-substitution test exists for `replace.js` and passes (single-pass guarantee)
- [ ] SKILL.md Steps 4, 6, and 8.5 reference Node.js scripts
- [ ] CLAUDE.md updated: no mention of Python or sed
- [ ] README.md updated: requirements say "Claude Code" only
- [ ] All Python files deleted: `scripts/generate_sed.py`, `scripts/generate_renames.py`, `tests/*.py`, `tests/conftest.py`, `pyproject.toml`
- [ ] `.venv/` directory deleted
- [ ] `.gitignore` cleaned up (remove Python-specific entries, add Node-specific if needed)
- [ ] E2E tests (`test_e2e.py`) are deleted — documented as conscious decision; E2E coverage is manual or future work with optional `@anthropic-ai/sdk` npm dependency

## Implementation Phases

### Phase 1: `scripts/replace.js` + Tests

Create the replacement script and port its test suite.

**Files to create:**
- `scripts/replace.js`
- `tests/test-replace.js` (ports `test_generate.py`, `test_escape.py`, `test_main.py`)
- `tests/test-replace-integration.js` (ports `test_integration.py`)
- `tests/helpers.js` (shared fixture discovery + loading, replaces `conftest.py`)

**Port from Python — function mapping:**
| Python | Node.js |
|--------|---------|
| `escape_sed_pattern(s)` | Not needed — no sed escaping. Replaced by `buildAlternationRegex(entities)` |
| `escape_sed_replacement(s)` | Not needed |
| `generate_commands(entities)` | `replaceInFile(filePath, sortedEntities)` — reads, replaces, writes |
| `load_replacement_map(source)` | `loadMap(filePath)` |

**Test helpers (`tests/helpers.js`):**
```js
// Shared across all test files
discoverFixtureIds()    // globs tests/fixtures/*.key.json
loadAnswerKey(id)       // reads {id}.key.json
loadMap(id)             // reads {id}.map.json
copyFixtureToTemp(id)   // copies {id}.md to os.tmpdir() subdir, returns path
```

**Key tests to port:**
- Longest-first ordering (prevents partial match)
- Empty entities (exit 0 + warning)
- Malformed JSON (exit 1)
- Missing file (exit 1)
- All 10 fixture integration tests
- NEW: double-substitution prevention test
- NEW: non-ASCII entity test (`"Müller GmbH"`)

### Phase 2: `scripts/rename.js` + Tests

Create the rename script and port its test suite.

**Files to create:**
- `scripts/rename.js`
- `tests/test-rename.js` (ports `test_apply_renames.py`, `test_compute_renames.py`, `test_renames_main.py`)
- `tests/test-rename-integration.js` (ports `test_renames_integration.py`)

**Port from Python — function mapping:**
| Python | Node.js |
|--------|---------|
| `apply_replacements(basename, sorted_entities)` | `applyReplacements(basename, sortedEntities)` |
| `compute_renames(paths, entities)` | `computeRenames(paths, entities)` |
| `check_collisions(renames, all_paths)` | `checkCollisions(renames, allPaths)` |
| `load_replacement_map(filepath)` | Reuse `loadMap()` from helpers.js |

**Key tests to port:**
- Case-insensitive matching
- Longest-first ordering (no double-replacement)
- Depth-ordered output (deepest-first)
- Hidden file skipping
- Trailing separator stripping
- Collision detection: renamed-vs-renamed, renamed-vs-existing
- Exit codes: missing arg, invalid JSON, collision
- Integration: create temp tree → compute → rename → verify

### Phase 3: Update Documentation

**SKILL.md:**
- Step 4: "in Python" → "in JavaScript" (deterministic variant generation)
- Step 6: Replace `generate_sed.py` + sed invocation with `node scripts/replace.js` invocation. Simplify — no more "generate commands then apply"; one script does both.
- Step 8.5: Replace `generate_renames.py` + `os.rename()` with `node scripts/rename.js`. Remove "call from Python or use a simple inline script" instruction.

**CLAUDE.md:**
- Update project structure (new filenames)
- Change "No dependencies beyond Python 3 and BSD sed" to "No dependencies beyond Node.js (ships with Claude Code)"
- Remove `scripts/generate_sed.py` reference

**README.md:**
- Requirements: "Claude Code" only (remove macOS, Python 3)
- How It Works: replace sed mention with Node.js
- Project Structure: new filenames
- Code examples: `node scripts/replace.js` instead of `python3 scripts/generate_sed.py`
- Running Tests: `node --test tests/` instead of `python3 -m pytest tests/`

**.gitignore:**
- Remove: `__pycache__/`, `*.pyc`, `.venv/`, `.pytest_cache/`
- Add (if needed): `node_modules/` (defensive, though there should be none)

### Phase 4: Delete Python Files

Remove after all Node.js scripts + tests + docs are in place and passing:

- `scripts/generate_sed.py`
- `scripts/generate_renames.py`
- `tests/test_escape.py`
- `tests/test_generate.py`
- `tests/test_main.py`
- `tests/test_integration.py`
- `tests/test_apply_renames.py`
- `tests/test_compute_renames.py`
- `tests/test_renames_main.py`
- `tests/test_renames_integration.py`
- `tests/test_e2e.py`
- `tests/conftest.py`
- `pyproject.toml`
- `.venv/` (entire directory)

## Dependencies & Risks

**Risk: Node.js version compatibility.** `node --test` requires Node 18+. Claude Code likely requires a recent Node version already, but this should be verified. Mitigation: document minimum Node version in README.

**Risk: Fixture format changes.** The existing `.map.json` fixtures include sed-specific escaping tests. These still test the replacement logic (longest-first ordering, special chars in entity names) but the escaping tests for sed metacharacters become less relevant since we're not generating sed commands. The fixtures remain valid but some test assertions will change.

**Conscious gap: E2E tests are dropped.** The Python E2E tests used the Anthropic SDK. Porting them would introduce an npm dependency, contradicting the zero-dependency goal. E2E coverage is manual for now. The built-in verification pass (Step 7) provides runtime safety.

## Sources & References

- **Origin brainstorm:** [docs/brainstorms/2026-03-14-drop-python-sed-deps-brainstorm.md](docs/brainstorms/2026-03-14-drop-python-sed-deps-brainstorm.md) — key decisions: rewrite in Node.js, drop sed, delete Python files, use node --test
- **Testing strategy:** [docs/brainstorms/2026-03-02-testing-strategy-brainstorm.md](docs/brainstorms/2026-03-02-testing-strategy-brainstorm.md) — 3-layer test pyramid, fixture design
- **Original skill plan:** [docs/plans/2026-03-02-feat-build-file-obfuscation-skill-plan.md](docs/plans/2026-03-02-feat-build-file-obfuscation-skill-plan.md) — 9-step workflow, error handling principles
- Current scripts: `scripts/generate_sed.py`, `scripts/generate_renames.py`
- Test fixtures: `tests/fixtures/*.md`, `tests/fixtures/*.map.json`, `tests/fixtures/*.key.json`
