# Mumbo My Jumbo

A Claude Code skill that obfuscates sensitive entities in markdown files for safe public sharing. Perfect for sharing your Claude Code setups (skills, CLAUDE.md, plans) without leaking company names, people, URLs, or internal terms.

## How It Works

Mumbo My Jumbo uses a three-stage pipeline:

1. **Detect** — A Haiku agent reads all your markdown files and identifies sensitive entities (company names, people, domains, API keys, etc.), producing a JSON replacement map
2. **Replace** — `sed` performs fast, longest-first substitution across all files; a verification pass catches anything sed missed, and a Sonnet agent rewrites those sections
3. **Rename** — Files and directories whose names contain sensitive entities get renamed to match

The result: your files read naturally with realistic-sounding fake names, and no sensitive information leaks through content or filenames.

## Quick Start

```
/mumbo path/to/folder
```

You'll see a confirmation prompt (this modifies files in place — no undo), then a summary:

```
Obfuscation complete.
  Files scanned:       12
  Files modified:      9
  Sed substitutions:   47
  Sections rewritten:  2 (in 1 files)
  Paths renamed:       3
  Warnings:            0
```

## What Gets Obfuscated

| Category                   | Example           | Replacement          |
| -------------------------- | ----------------- | -------------------- |
| Company names              | Acme Corporation  | Northwind Industries |
| People                     | Jane Doe          | Alex Chen            |
| Email addresses            | jane@acmecorp.com | alex@northwind.com   |
| Domains/URLs               | acmecorp.com/docs | northwind.com/docs   |
| API keys & secrets         | sk-abc123...      | sk-REDACTED-KEY      |
| Internal tools & codenames | Project Phoenix   | Project Aurora       |
| IP addresses               | 10.0.1.42         | 10.0.2.99            |

Well-known public entities (Google, AWS, React, PostgreSQL, etc.) are left untouched.

## Cost per Run

A single run uses three models: Opus (orchestrator), Haiku (detection + verification), and Sonnet (contextual rewrites). The Opus orchestrator drives the workflow and accounts for ~90% of the cost — the Haiku and Sonnet sub-agents are negligible by comparison.

| Folder size | Estimated cost |
| ----------- | -------------- |
| 5-10 files  | ~$3-5          |
| 20 files    | ~$4-6          |
| 50 files    | ~$5-8          |

Cost scales slowly because the orchestrator overhead is mostly fixed. On a **Max subscription**, each run consumes roughly the equivalent of a medium-complexity coding task.

## Requirements

- macOS (uses BSD `sed`)
- Python 3
- Claude Code with access to Haiku and Sonnet models

No additional dependencies needed — everything ships with macOS.

## Project Structure

```
SKILL.md                        — Skill definition (workflow + frontmatter)
scripts/
  generate_sed.py               — Converts replacement map → sed commands
  generate_renames.py           — Computes file/directory renames from the map
tests/
  fixtures/                     — 10 test scenarios with input + expected maps
  test_generate.py              — Tests for generate_sed.py
  test_escape.py                — Sed escaping edge cases
  test_apply_renames.py         — Unit tests for apply_replacements()
  test_compute_renames.py       — Unit tests for compute_renames() + collision detection
  test_renames_main.py          — CLI/exit-code tests for generate_renames.py
  test_renames_integration.py   — Integration tests with real directory trees
  test_e2e.py                   — End-to-end tests (requires API access)
```

## How the Scripts Work

### generate_sed.py

Reads a JSON replacement map and outputs sed commands. Entities are sorted longest-first to prevent partial matches (e.g., "Acme Corporation" is replaced before "Acme").

```bash
echo '{"entities": {"Acme": {"replacement": "Northwind", "type": "company"}}}' \
  | python3 scripts/generate_sed.py
# Output: s/Acme/Northwind/g
```

### generate_renames.py

Takes a replacement map file as an argument and file paths via stdin. Outputs a JSON array of `old`/`new` rename pairs, sorted deepest-first so child paths are renamed before parents.

```bash
find target/ -not -path '*/.*' | python3 scripts/generate_renames.py map.json
```

Key behaviors:

- Single-pass regex replacement (no double-substitution bugs)
- Case-insensitive matching with Unicode NFC normalization
- Collision detection (exits with code 1 if two paths would map to the same name)
- Hidden files/directories are automatically skipped

## Running Tests

```bash
python3 -m pytest tests/ --ignore=tests/test_e2e.py
```

The e2e tests require API access and are excluded by default.

## License

Private skill — not published to any package registry.
