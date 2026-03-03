---
title: "feat: Rename files and directories containing sensitive entities"
type: feat
date: 2026-03-02
deepened: 2026-03-02
---

# Rename Files and Directories Containing Sensitive Entities

## Enhancement Summary

**Deepened on:** 2026-03-02
**Agents used:** Python reviewer, pattern recognition, performance oracle, security sentinel, simplicity reviewer, architecture strategist, best practices researcher

### Key Improvements
1. Critical bug in MVP: sequential `str.replace()` causes double-replacement — must use single-pass `re.sub`
2. Case-variant generation should be deterministic Python, not LLM — more reliable and testable
3. Use `os.rename()` directly instead of shelling out to `mv` — eliminates escaping risks
4. Simplification: remove `needs_case_rename()` and crash recovery (YAGNI)
5. Missing collision check: must also check against existing non-renamed paths

## Overview

Extend the obfuscation skill to rename files and directories whose names contain sensitive entities from the replacement map. Currently, Step 9 warns about sensitive filenames but does not rename them. This feature promotes warnings to actual renames — applied automatically, to all file types, for both files and directories.

## Problem Statement / Motivation

When sharing obfuscated project folders, sensitive entity names leak through file and directory names even though the file _content_ is properly obfuscated. A folder named `acme-deploy-runbook/` or a file named `jane-onboarding-checklist.md` immediately reveals the company name or person, defeating the purpose of content obfuscation.

## Proposed Solution

1. **Extend detection (Step 4)** to also scan file/directory names, adding filename-form variants (kebab-case, snake_case, etc.) to the replacement map
2. **Add a new "Rename Paths" step** after all content modifications (after Step 8, before Step 9)
3. **Add a `generate_renames.py` script** (consistent with `generate_sed.py` pattern) that computes the rename plan
4. **Update the summary** to report rename counts and list each rename

### Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| When to rename | After Step 8 (content done), before Step 9 | Content modification steps use original paths — renaming last avoids stale paths |
| Matching strategy | Substring, longest-first | Consistent with sed content replacement |
| Collision handling | Abort rename step, warn | "Fail hard before modifications" philosophy |
| Target folder itself | Do NOT rename | Would break skill's working directory and index path; warn in summary instead |
| Hidden files/dirs | Skip | Consistent with Step 3 exclusion; warn in summary |
| `.mumbo-index.json` | Exclude from renames | Must remain accessible for cleanup |
| Scope | All file types + directories | User-specified requirement |
| Confirmation | Automatic | User-specified; renames shown in summary |
| Rename execution | `os.rename()` in Python | No shell escaping risks; atomic on APFS |
| CLI interface | Map from file arg (not stdin) | stdin is consumed for paths — deliberate divergence from `generate_sed.py` |
| Variant generation | Deterministic Python post-processing | LLMs unreliable at mechanical string transforms like kebab/snake conversion |

## Technical Considerations

### Order of Operations

Renaming happens between Step 8 and Step 9. The full pipeline becomes:

```
Steps 1-5 → Detection, index creation (original paths)
Step 6     → Sed content replacement (original paths)
Step 7     → Verification (original paths)
Step 8     → Contextual rewrite (original paths)
Step 8.5   → NEW: Rename files and directories
Step 9     → Summary and cleanup (reports renames, uses new paths for index deletion)
```

### Bottom-Up Rename Ordering

Renames must process deepest paths first so parent paths remain valid while children are renamed:

```
# Given:
target/acme-docs/acme-guide.md
target/acme-docs/

# Correct order:
1. target/acme-docs/acme-guide.md  →  target/acme-docs/northwind-guide.md
2. target/acme-docs/               →  target/northwind-docs/
```

Sort by path depth descending (component count), then alphabetically. Only rename the basename — parent components are handled when their own entry is processed.

### Detection Extension (Step 4) + Deterministic Variant Generation

The Haiku detection agent currently reads file content only. It must also receive the list of file and directory names so it can detect entities appearing in path names that may not appear in content.

**Split responsibility (architecture insight):** The LLM agent identifies canonical entities and replacements only. A deterministic Python post-processing function then generates all case variants (kebab-case, snake_case, etc.) from the canonical pairs. This is more reliable, exhaustive, and testable than asking the LLM to produce mechanical string transforms.

For example, the LLM detects `Acme Corp` → `Northwind Inc`. Then Python generates:

```json
{
  "Acme Corp": {"replacement": "Northwind Inc", "type": "company"},
  "acme-corp": {"replacement": "northwind-inc", "type": "company"},
  "acme_corp": {"replacement": "northwind_inc", "type": "company"}
}
```

This also fixes cross-file references: sed will replace `acme-corp-guide.md` → `northwind-inc-guide.md` in content before the rename step even runs.

### Collision Detection

Before executing any renames, compute the full plan and check for duplicates. On macOS (case-insensitive FS), use `.casefold()` for collision checks (more correct than `.lower()` for Unicode).

**Two kinds of collisions to check:**
1. Two renamed paths mapping to the same target (e.g., `FOO.md` and `foo.md` both → `bar.md`)
2. A renamed path colliding with an existing non-renamed path (e.g., renaming `acme.md` → `northwind.md` when `northwind.md` already exists)

If collisions are found: abort the entire rename step, list collisions as warnings in the summary.

### Rename Execution

Use `os.rename()` directly from Python — not shell `mv`. This eliminates all shell-escaping risks with special characters in filenames (spaces, brackets, quotes). `os.rename()` calls the `rename(2)` syscall directly, which is atomic on APFS.

### Unicode Normalization

Normalize entity strings and basenames to NFC before matching. APFS preserves the normalization form written (unlike HFS+ which forced NFD), so string matching can miss entities if the map and filenames use different forms. Use `unicodedata.normalize('NFC', s)` on both sides.

## Acceptance Criteria

### Functional

- [x] Files containing entity substrings in their basename are renamed using the replacement map
- [x] Directories containing entity substrings in their name are renamed
- [x] Renames apply to all file types, not just `.md`
- [x] Renames process deepest paths first (bottom-up)
- [x] Longest entity matches are applied first (consistent with sed)
- [x] The replacement map includes filename-form variants (kebab, snake) from Step 4
- [x] Collisions are detected before any renames execute; the rename step is aborted with warnings if collisions exist
- [x] Hidden files/directories are skipped; warned in summary
- [x] `.mumbo-index.json` is excluded from renames
- [x] The target folder itself is not renamed; warned in summary if it matches
- [x] Collision check covers both renamed-vs-renamed and renamed-vs-existing paths
- [x] Summary includes: `Paths renamed: N` count and a list of `old → new` mappings

### Non-Functional

- [x] `generate_renames.py` has no dependencies beyond Python 3
- [x] Unit tests cover: matching, ordering, collision detection, hidden-file exclusion
- [x] Integration tests verify end-to-end rename with fixture directories (using `pytest` `tmp_path`)
- [x] Strip trailing path separators from stdin input defensively

## `scripts/generate_renames.py` Interface

### Input

- **Arg 1** (required): path to replacement map JSON file
- **stdin**: paths to consider, one per line

### Output (stdout)

JSON array of rename pairs, sorted deepest-first:

```json
[
  {"old": "target/acme-docs/acme-guide.md", "new": "target/acme-docs/northwind-guide.md"},
  {"old": "target/acme-docs", "new": "target/northwind-docs"}
]
```

### Behavior

| Scenario | Exit Code | Stdout | Stderr |
|---|---|---|---|
| Renames computed | 0 | JSON array of pairs | — |
| No renames needed | 0 | `[]` | — |
| Collision detected | 1 | `[]` | `"Error: collision — X and Y both map to Z"` |
| Invalid JSON | 1 | — | `"Error: invalid JSON — ..."` |
| File not found | 1 | — | `"Error: file not found — ..."` |

### Core Functions

```
scripts/generate_renames.py

def apply_replacements(basename: str, sorted_entities: list) -> str
    """Single-pass longest-first replacement using re.sub with alternation.
    CRITICAL: Do NOT use sequential str.replace() — it causes double-replacement
    when a replacement output matches a shorter entity."""

def compute_renames(paths: list[str], entities: dict) -> list[dict]
    """Compute rename pairs, sorted deepest-first. Skip hidden entries.
    Pre-sorts entities once, strips trailing separators from paths."""

def check_collisions(renames: list[dict], all_paths: list[str]) -> list[str]
    """Detect target path collisions (case-insensitive via casefold).
    Checks both renamed-vs-renamed and renamed-vs-existing collisions."""

def load_replacement_map(source: str) -> dict
    """Load entities from JSON file. Separate from generate_sed.py's version
    (which also accepts stdin) — deliberate divergence since stdin is used for paths."""

def main()
    """CLI entry point: read map file, read paths from stdin, compute and output renames."""
```

## SKILL.md Changes

### Step 3 — Scan for Files

Add a second scan for ALL file/directory paths (not just `.md`):

```
- Also collect all file and directory paths within the target folder (all types, excluding hidden)
- Pass these path names to the detection agent in Step 4
```

### Step 4 — Detection Pass

Extend the agent prompt to also scan file/directory names for entities. The LLM identifies canonical entities only. Then add a deterministic post-processing step (Python function, not LLM) to generate filename-form variants:
  - kebab-case (acme-corp)
  - snake_case (acme_corp)

Merge variants into the replacement map before writing the index in Step 5.

### New Step 8.5 — Rename Files and Directories

Run `scripts/generate_renames.py` with the replacement map file and all paths piped to stdin.
Execute returned renames deepest-first using `os.rename()` (not shell `mv`).
If any individual rename fails, log the error and continue.

Error handling: If the script exits 1 (collision detected), skip all renames and log warnings for the summary.

### Step 9 — Summary

Update the summary format:

```
Obfuscation complete.
  Files scanned:       N
  Files modified:      N
  Sed substitutions:   N
  Sections rewritten:  N (in M files)
  Paths renamed:       N
  Warnings:            N

Renames:
  acme-docs/acme-guide.md → northwind-docs/northwind-guide.md
  acme-docs/ → northwind-docs/

Warnings:
  - Target folder name matches entities: acme-project (not renamed)
  - Hidden files match entities: .acme-config (not renamed)
```

Remove the old "Potentially sensitive filenames" warning — it's replaced by actual renames + the new warnings for skipped items.

## Dependencies & Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Collision causes rename abort | Low | Good replacement maps have unique outputs; warn clearly |
| Cross-file references broken | Medium | Deterministic variant generation adds filename-form entities → sed fixes references |
| Entity in dirname but not in content | Medium | Step 4 extension scans path names too |
| Double-replacement in `apply_replacements` | High (if using `str.replace`) | Must use single-pass `re.sub` with alternation |

## Test Plan

Follow the existing 3-layer pyramid pattern. New test files:

1. **`tests/test_apply_renames.py`** (Unit) — Tests `apply_replacements()` as a pure function. Analogous to `test_escape.py`. Key cases: longest-first ordering, no double-replacement, no-match passthrough, empty entities.

2. **`tests/test_compute_renames.py`** (Unit) — Tests `compute_renames()`, `check_collisions()`. Class-based, analogous to `test_generate.py`. Key cases: depth ordering, hidden-file skip, collision detection (renamed-vs-renamed and renamed-vs-existing).

3. **`tests/test_renames_main.py`** (Unit/CLI) — Tests exit codes via subprocess. Analogous to `test_main.py`. Uses same `run_script` helper pattern.

4. **`tests/test_renames_integration.py`** (Integration) — Creates directory trees in `tmp_path`, runs the full rename pipeline, verifies results. New fixture format: directory-tree specs (not the existing file-content triplets).

No E2E layer needed — renames are fully deterministic (no LLM involvement).

## References & Research

### Internal

- Current filename warning: `SKILL.md:142-145`
- Sed script pattern: `scripts/generate_sed.py`
- Original design decision (warn, don't rename): `docs/plans/2026-03-02-feat-build-file-obfuscation-skill-plan.md:187-188`
- Existing test fixtures: `tests/fixtures/` (10 triplets for content; need directory-tree fixtures for renames)

### Research Insights (from deepening)

**Python renaming best practices:**
- `os.rename()` → atomic `rename(2)` syscall on APFS; no shell escaping needed
- `pathlib.Path.rename()` calls the same syscall — either works
- Never shell out to `mv` for renames — injection risk with special characters
- `shutil.move()` has a copy+delete fallback that is non-atomic — avoid

**macOS APFS specifics:**
- Case-insensitive but case-preserving — use `.casefold()` for comparison
- Normalization-preserving (unlike HFS+ which forced NFD) — normalize to NFC before matching
- 255-byte filename limit per component — validate with `len(name.encode('utf-8'))`

**Critical implementation note — double-replacement bug:**
Sequential `str.replace()` in a loop causes a replacement's output to be re-matched by later entities. Example: entity `North` → `Acme`, entity `Acme` → `Zephyr` — basename `North-docs` becomes `Zephyr-docs` (double-replaced). Fix: use `re.sub()` with alternation pattern (tries longest first, single pass, replaced text never re-scanned).

### SpecFlow Analysis

18 edge cases identified and addressed:
- Order of operations (rename after content modification)
- Collision detection (case-insensitive on macOS)
- Target folder exclusion
- Hidden file exclusion
- Cross-reference fixup via detection extension
- Bottom-up traversal ordering
- Partial failure recovery
- Collision with existing non-renamed paths

## Implementation Notes

Key implementation details to get right (from research):

1. **`apply_replacements()` must use single-pass `re.sub`** — build a regex alternation of all entities (longest first), use a callback for replacements. Sequential `str.replace()` causes double-replacement bugs.

2. **Sort entities once** in `compute_renames()`, not per-call in `apply_replacements()`. Follows the pattern in `generate_sed.py:47`.

3. **Sort renames by depth then alphabetically** for deterministic test output: `key=lambda r: (-depth, r["old"])`.

4. **Strip trailing path separators** from stdin input — `os.path.basename("dir/")` returns `""`, silently skipping the entry.

5. **Hidden file check (`basename.startswith(".")`) already covers `.mumbo-index.json`** — no need for a separate check.
