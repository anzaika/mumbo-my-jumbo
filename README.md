# Mumbo My Jumbo

Obfuscate sensitive entities in markdown files for safe public sharing. Perfect for sharing your Claude Code setups (skills, CLAUDE.md, plans) without leaking company names, people, URLs, or internal terms.

## Installation

Open Terminal on your Mac and paste this command:

```bash
git clone https://github.com/anzaika/mumbo-my-jumbo.git ~/.claude/skills/mumbo-my-jumbo
```

If your Mac asks you to install "Command Line Tools", click **Install** and wait for it to finish, then run the command again.

Restart Claude Code. The `/mumbo` command is now available.

To update later:

```bash
cd ~/.claude/skills/mumbo-my-jumbo && git pull
```

## Usage

**First, copy your folder.** This skill modifies files in place with no undo.

```bash
cp -r my-folder my-folder-backup
```

Then in Claude Code:

```
/mumbo my-folder
```

You'll see a confirmation prompt, then a summary when it's done:

```
Obfuscation complete.
  Files scanned:       12
  Files modified:      9
  Replacements:        47
  Sections rewritten:  2 (in 1 files)
  Paths renamed:       3
  Warnings:            0
```

Check the result. If you're happy, delete the backup. If not, delete the modified folder and rename the backup back.

## What Gets Obfuscated

| Category                   | Example           | Becomes              |
| -------------------------- | ----------------- | -------------------- |
| Company names              | Acme Corporation  | Northwind Industries |
| People                     | Jane Doe          | Alex Chen            |
| Email addresses            | jane@acmecorp.com | alex@northwind.com   |
| Domains/URLs               | acmecorp.com/docs | northwind.com/docs   |
| API keys & secrets         | sk-abc123...      | sk-REDACTED-KEY      |
| Internal tools & codenames | Project Phoenix   | Project Aurora       |
| IP addresses               | 10.0.1.42         | 10.0.2.99            |

Well-known public names (Google, AWS, React, PostgreSQL, etc.) are left untouched.

## Requirements

- **Claude Code** on a Max subscription, or with API access that includes Haiku and Sonnet models

No other software needed. Node.js ships with Claude Code.

## Cost

On a **Max subscription**, each run uses roughly the equivalent of one medium-complexity coding task. Cost scales slowly with folder size because most of it is fixed overhead.

On **API billing**, expect ~$3-8 per run depending on the number of files.

## How It Works

1. **Detect** — Claude reads all your markdown files and builds a list of sensitive entities with fake replacements
2. **Replace** — A script swaps every entity for its replacement across all files; a second pass catches anything the script missed and rewrites those sections
3. **Rename** — Files and directories whose names contain sensitive entities get renamed to match

The result: your files read naturally with realistic-sounding fake names, and nothing sensitive leaks through content or filenames.

---

## For Contributors

### Project Structure

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

### How the Scripts Work

**replace.js** — Reads a JSON replacement map and applies replacements directly to files. Entities are sorted longest-first to prevent partial matches. Uses single-pass regex alternation to prevent double-substitution. Rejects symlinks and writes atomically.

```bash
node scripts/replace.js map.json file1.md file2.md
```

**rename.js** — Takes a replacement map file as argument and file paths via stdin. Computes renames with case-insensitive matching and Unicode NFC normalization, checks for collisions, executes deepest-first.

```bash
find target/ -not -path '*/.*' | node scripts/rename.js map.json
```

### Running Tests

```bash
node --test tests/test-*.js
```

71 tests, zero npm dependencies. Requires Node.js 18+.
