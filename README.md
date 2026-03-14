# Mumbo My Jumbo

A Claude Code skill that obfuscates sensitive entities in markdown files for safe public sharing. Perfect for sharing your Claude Code setups (skills, CLAUDE.md, plans) without leaking company names, people, URLs, or internal terms.

## How It Works

Mumbo My Jumbo uses a three-stage pipeline:

1. **Detect** — A Haiku agent reads all your markdown files and identifies sensitive entities (company names, people, domains, API keys, etc.), producing a JSON replacement map
2. **Replace** — A Node.js script performs fast, single-pass longest-first substitution across all files; a verification pass catches anything the script missed, and a Sonnet agent rewrites those sections
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
  Replacements:        47
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

- Claude Code with access to Haiku and Sonnet models

No additional dependencies needed — Node.js ships with Claude Code.

## Project Structure

```
SKILL.md                        — Skill definition (workflow + frontmatter)
scripts/
  replace.js                    — Reads replacement map, applies to files in-place
  rename.js                     — Computes and executes file/directory renames
tests/
  fixtures/                     — 10 test scenarios with input + expected maps
  helpers.js                    — Shared test fixture helpers
  test-replace.js               — Unit + CLI tests for replace.js
  test-replace-integration.js   — Integration tests against fixtures
  test-rename.js                — Unit + CLI tests for rename.js
  test-rename-integration.js    — Integration tests with real directory trees
```

## How the Scripts Work

### replace.js

Reads a JSON replacement map and applies replacements directly to files. Entities are sorted longest-first to prevent partial matches (e.g., "Acme Corporation" is replaced before "Acme"). Uses single-pass regex alternation to prevent double-substitution.

```bash
node scripts/replace.js map.json file1.md file2.md
# Outputs JSON summary: {"files_modified": 2, "total_replacements": 15, "results": [...]}
```

### rename.js

Takes a replacement map file as an argument and file paths via stdin. Computes renames, checks for collisions, executes them deepest-first, and outputs a JSON array of completed renames.

```bash
find target/ -not -path '*/.*' | node scripts/rename.js map.json
```

Key behaviors:

- Single-pass regex replacement (no double-substitution bugs)
- Case-insensitive matching with Unicode NFC normalization
- Collision detection (exits with code 1 if two paths would map to the same name)
- Hidden files/directories are automatically skipped

## Running Tests

```bash
node --test tests/test-*.js
```

## License

Private skill — not published to any package registry.
