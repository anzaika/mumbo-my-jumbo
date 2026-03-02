---
title: "feat: Add Test Suite for File Obfuscation Skill"
type: feat
date: 2026-03-02
---

# feat: Add Test Suite for File Obfuscation Skill

## Overview

Implement a 3-layer test pyramid for the mumbo-my-jumbo file obfuscation skill. Unit tests validate `generate_sed.py` pure functions. Integration tests apply sed commands to fixture documents and grep for surviving entities. E2E tests run the full detection-sed-verification pipeline with both deterministic grep and an LLM judge.

## Problem Statement / Motivation

The skill has **zero tests**. Its purpose is preventing sensitive data leaks — the highest-stakes failure mode is entities surviving into obfuscated output. A test suite catches regressions in sed escaping, entity ordering, and pipeline correctness before they leak real data.

## Proposed Solution

### Test Pyramid Architecture

```
┌─────────────────────────────┐
│   E2E Tests (slow)          │  Full pipeline: detect → sed → verify
│   @pytest.mark.slow         │  Verification: grep + LLM judge
├─────────────────────────────┤
│   Integration Tests (fast)  │  Sed on fixtures, grep for survivors
│   No LLM calls              │
├─────────────────────────────┤
│   Unit Tests (instant)      │  Pure function tests for generate_sed.py
│   No I/O                    │
└─────────────────────────────┘
```

### Directory Structure

```
tests/
├── conftest.py                  # Shared fixtures, LLM judge helper, marker config
├── fixtures/
│   ├── 01-companies.md          # Fixture document
│   ├── 01-companies.key.json    # Answer key (entities to verify are removed)
│   ├── 01-companies.map.json    # Replacement map (input to generate_sed.py)
│   ├── 02-people.md
│   ├── 02-people.key.json
│   ├── 02-people.map.json
│   └── ...                      # 8-10 fixture triplets
├── test_escape.py               # Unit: escape_sed_pattern, escape_sed_replacement
├── test_generate.py             # Unit: generate_commands, load_replacement_map
├── test_main.py                 # Unit: main() exit codes and stderr
├── test_integration.py          # Integration: sed on fixtures, grep verification
└── test_e2e.py                  # E2E: full pipeline (marked slow)
pyproject.toml                   # pytest config with marker registration
```

Tests discover fixtures by globbing for `*.key.json` files in the fixtures directory — no manifest needed.

## Technical Considerations

### Fixture Triplet Format

Each fixture consists of three files:

**`.md` file** — A realistic markdown document containing known sensitive entities.

**`.key.json` file** — Answer key listing every sensitive entity and its category:

```json
{
  "entities": {
    "Acme Corporation": "company",
    "Jane Doe": "person",
    "jane.doe@acmecorp.com": "email",
    "https://acmecorp.com/api/v2": "url",
    "sk-prod-abc123def456": "api_key",
    "192.168.1.100": "ip_address"
  }
}
```

Tests iterate the keys for grep verification — if any key string appears in the obfuscated output, the test fails.

**`.map.json` file** — Replacement map in the format `generate_sed.py` expects:

```json
{
  "entities": {
    "Acme Corporation": { "replacement": "Northwind Industries", "type": "company" },
    "Jane Doe": { "replacement": "Alex Chen", "type": "person" },
    "jane.doe@acmecorp.com": { "replacement": "alex.chen@northwind.com", "type": "email" }
  }
}
```

Integration tests use the `.map.json` to generate sed commands deterministically. E2E tests generate the map via Haiku and only use `.key.json` for verification.

### E2E Invocation Architecture

E2E tests **reimplement the pipeline steps in Python** rather than invoking the SKILL.md workflow. The SKILL.md uses Claude Code tools (Agent, AskUserQuestion, etc.) that cannot be called from pytest.

Pipeline steps in E2E tests:

1. **Detection** — Call Haiku API directly with the detection prompt from SKILL.md Step 4
2. **Sed generation** — Import and call `generate_commands()` from `scripts/generate_sed.py`
3. **Sed application** — Shell out to BSD `sed` via `subprocess.run()`
4. **Verification grep** — Check for surviving entities from `.key.json`
5. **LLM judge** — Call Haiku API with the judge prompt

This tests the pipeline logic separately from the skill orchestration — the right trade-off given that the orchestration is just Claude Code following SKILL.md instructions.

### LLM Judge Contract

Prompt template (defined in `conftest.py`):

```
You are a security reviewer checking whether obfuscation was successful.

## Original Document
{original}

## Obfuscated Document
{obfuscated}

## Replacement Map
{replacement_map}

Check if ANY sensitive information from the original survives in the obfuscated version:
- Exact entity matches
- Partial entity matches (substrings that could identify real entities)
- Entities missed entirely
- Contextual clues that could reverse the obfuscation

Respond in JSON only:
{
  "pass": true/false,
  "leaked_entities": ["list of surviving sensitive strings"],
  "reasoning": "brief explanation"
}
```

**Pass/fail criteria**: Test passes if `pass` is `true` AND `leaked_entities` is empty.

**Model**: Haiku (cheap, fast, sufficient for verification).

**Error handling**: If API call fails or response is not valid JSON, test is marked as an error (not a pass or fail).

### Fixture Isolation

All tests that apply sed commands use pytest's `tmp_path` fixture:

1. Copy fixture `.md` file to `tmp_path`
2. Apply sed commands to the copy
3. Assert against the copy
4. `tmp_path` auto-cleans after the test

Original fixtures are never modified.

### Replacement Collision Edge Case

When a replacement value contains a substring matching another entity's search pattern, sequential sed application can corrupt the output:

- Entity "Acme" → "NorthAcme" (replacement contains "North")
- Entity "North" → "South"
- Longest-first runs "North"→"South" first (5 > 4 chars), then "Acme"→"NorthAcme" — introducing "North" *after* its command already ran. The "North" in "NorthAcme" survives uncaught.

Longest-first ordering prevents partial matches on *input text* but does NOT prevent replacement-introduces-entity collisions. This is a **detection-side responsibility** — the LLM should generate replacement values that don't contain other entities' patterns. The test should:

1. Verify that when replacement values are collision-free, sed produces correct output
2. Document the known limitation: if the detection pass generates colliding replacements, sed cannot fix it

### pytest Configuration

`pyproject.toml`:

```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
markers = [
    "slow: marks tests as slow/expensive (E2E with API calls)",
]
```

Run fast tests: `pytest -m "not slow"`
Run all tests: `pytest`

### Importing generate_sed.py

Since `scripts/generate_sed.py` is a standalone script (not a package), tests import it by adding the scripts directory to `sys.path` in `conftest.py`:

```python
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))
```

## Acceptance Criteria

### Unit Tests — `test_escape.py`

- [x] `escape_sed_pattern()` escapes each BRE special char: `\ / & . * [ ] ^ $`
- [x] `escape_sed_pattern()` handles compound strings with multiple special chars (e.g., `acme.corp/api`)
- [x] `escape_sed_pattern()` passes through clean strings unchanged
- [x] `escape_sed_pattern()` handles empty string
- [x] `escape_sed_replacement()` escapes `\ / &`
- [x] `escape_sed_replacement()` passes through clean strings unchanged

### Unit Tests — `test_generate.py`

- [x] `generate_commands()` returns commands sorted longest-first by entity key length
- [x] `generate_commands()` handles dict-style values (`{"replacement": "...", "type": "..."}`)
- [x] `generate_commands()` handles plain string values (the `isinstance` branch)
- [x] `generate_commands()` produces valid `s/pattern/replacement/g` format
- [x] `generate_commands()` handles entities with sed special chars in both key and value
- [x] `generate_commands()` returns empty list for empty entities dict
- [x] `load_replacement_map()` loads valid JSON from file path
- [x] `load_replacement_map()` extracts `entities` key from JSON
- [x] `load_replacement_map()` returns empty dict when `entities` key is missing

### Unit Tests — `test_main.py`

- [x] `main()` exits 1 with stderr on malformed JSON input
- [x] `main()` exits 1 with stderr on nonexistent file path
- [x] `main()` exits 0 with stderr warning on empty entities
- [x] `main()` prints sed commands to stdout for valid input

### Integration Tests — `test_integration.py`

- [x] For each fixture: generated sed commands eliminate all answer-key entities from output
- [x] Overlapping entities are handled correctly (no partial-match corruption)
- [x] Entities inside markdown links are replaced without breaking link syntax
- [x] Entities inside fenced code blocks are replaced
- [x] Entities inside inline code are replaced
- [x] Entities inside bold/italic formatting are replaced
- [x] Dense documents (20+ entities) are fully processed
- [x] Empty replacement map leaves document unchanged
- [x] Replacement collision scenario does not corrupt output

### E2E Tests — `test_e2e.py`

- [x] Full pipeline (detect → sed → verify) eliminates all answer-key entities
- [x] LLM judge confirms no sensitive information survives
- [x] E2E tests skip gracefully when `ANTHROPIC_API_KEY` is not set

### Infrastructure

- [x] `pyproject.toml` configures pytest with `slow` marker registered
- [x] `conftest.py` provides shared fixtures: `fixture_dir`, `load_answer_key`, `tmp_fixture`, `llm_judge`
- [x] `pytest -m "not slow"` runs only unit + integration tests
- [x] `pytest` runs all tests including E2E
- [x] Fixture corpus covers all entity categories and edge cases per manifest

## Fixture Corpus Plan

| # | Filename | Primary Categories | Edge Cases |
|---|----------|-------------------|------------|
| 01 | `01-companies-and-products.md` | company, internal_tool | overlapping entities ("Acme", "Acme Corp", "Acme Corporation") |
| 02 | `02-people-and-roles.md` | person | case variations ("jane doe", "Jane Doe", "JANE DOE") |
| 03 | `03-emails-and-contacts.md` | email, person | entities with `.` and `@` requiring sed escaping |
| 04 | `04-urls-and-domains.md` | url | `/` in entities (sed delimiter), entities inside markdown links |
| 05 | `05-api-keys-and-secrets.md` | api_key | entities in fenced code blocks, inline code, indented blocks |
| 06 | `06-ip-addresses-and-infra.md` | ip_address, internal_tool | `.` patterns, entities in tables |
| 07 | `07-mixed-dense.md` | all categories | 20+ entities, high density, multiple entities per paragraph |
| 08 | `08-markdown-formatting.md` | company, person | entities in bold, italic, headings, YAML frontmatter |
| 09 | `09-overlapping-and-collisions.md` | company, person | replacement collisions, substring entities, longest-first ordering |
| 10 | `10-code-heavy.md` | api_key, url, ip_address | fenced blocks, inline code, mixed code and prose |

## Dependencies & Risks

- **BSD sed**: Integration tests require macOS BSD sed. Won't work on Linux. Acceptable — the skill itself targets macOS.
- **Anthropic Python SDK**: E2E tests call the Haiku API directly. Requires `pip install anthropic` and `ANTHROPIC_API_KEY` env var. Tests skip if either is missing.
- **LLM non-determinism**: E2E detection produces different replacement maps each run. Tests assert on absence of original entities, not specific replacement values.
- **Fixture generation**: Fixtures are hand-written once and committed. Each is a realistic markdown document with embedded entities — LLM-assisted drafting is fine but each fixture needs manual review to ensure the answer key is complete and edge cases are correctly placed.
- **Fixture maintenance**: If `generate_sed.py` escaping logic changes, unit tests catch it first. Fixtures and answer keys remain stable.

## References

- `scripts/generate_sed.py:17` — `escape_sed_pattern()`
- `scripts/generate_sed.py:23` — `escape_sed_replacement()`
- `scripts/generate_sed.py:29` — `load_replacement_map()`
- `scripts/generate_sed.py:40` — `generate_commands()`
- `scripts/generate_sed.py:59` — `main()` with error handling
- `SKILL.md` — Full 9-step workflow definition
- `docs/brainstorms/2026-03-02-testing-strategy-brainstorm.md` — Design decisions
