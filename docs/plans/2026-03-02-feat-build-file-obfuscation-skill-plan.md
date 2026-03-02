---
title: Build File Obfuscation Skill
type: feat
date: 2026-03-02
---

# Build File Obfuscation Skill

## Overview

Build the "Mumbo My Jumbo" Claude Code skill that obfuscates sensitive content in a folder of `.md` files so they can be shared publicly without leaking private or NDA-covered information. Uses a hybrid approach: fast `sed` substitution for most replacements, with LLM-powered contextual rewrite only for sections where simple substitution isn't enough.

## Problem Statement / Motivation

Developers build powerful Claude Code setups (skills, CLAUDE.md configs, brainstorm docs, plans) that contain company names, internal URLs, people's names, API keys, and other identifying information. They want to share these setups but can't expose the sensitive content. Manual redaction is tedious and error-prone — and produces obviously-redacted output rather than realistic-looking files.

## Proposed Solution

A Claude Code skill invoked as `/mumbo-my-jumbo <folder_path>` that:

1. Warns the user and requires explicit confirmation
2. Scans the target folder for `.md` files
3. Uses Haiku to detect all sensitive entities and build a consistent replacement map
4. Applies fast `sed` substitution across all files
5. Verifies each file with Haiku for remaining leaks
6. Uses Sonnet to contextually rewrite only flagged sections
7. Cleans up tracking state and prints a summary

The skill is registered as a Claude Code command, invocable via `/mumbo-my-jumbo` slash command. The folder path is passed as an argument (e.g., `/mumbo-my-jumbo ./my-skills/`).

## File Structure

```
mumbo-my-jumbo/                  # repo root (this IS the skill directory)
├── SKILL.md                      # Skill definition, workflow, and command registration
├── scripts/
│   └── generate_sed.py           # Converts replacement map JSON → sed commands
├── CLAUDE.md                     # Project conventions
├── .gitignore                    # Ignore .claude/, .mumbo-index.json, etc.
└── docs/
    ├── brainstorms/
    │   └── 2026-03-01-file-obfuscation-skill-brainstorm.md
    └── plans/
        └── 2026-03-02-feat-build-file-obfuscation-skill-plan.md
```

Users install by adding this repo's path to their Claude Code skill configuration. The skill becomes available as the `/mumbo-my-jumbo` slash command.

## Technical Approach

### SKILL.md

The main skill file with frontmatter and workflow instructions.

**Frontmatter:**

```yaml
---
name: mumbo-my-jumbo
description: "Obfuscate sensitive entities in markdown files for safe public sharing. Use when sharing Claude Code setups (skills, CLAUDE.md, plans) without leaking company names, people, URLs, or internal terms. Triggers on 'obfuscate', 'redact', 'anonymize files', 'share skills safely', 'mumbo'."
---
```

**Workflow** (imperative form, 9 steps):

#### Step 1: Accept Input and Validate

- Accept target folder path as required argument
- Validate: path exists, is a directory, user has write access
- If path is invalid, print error and exit

#### Step 2: Warning and Confirmation

Display prominent warning:

```
⚠️  WARNING: This will modify files IN PLACE.
    No backup. No undo. No dry-run.
    Target: <folder_path>
    You are responsible for making copies before proceeding.
```

Require explicit yes/no confirmation via AskUserQuestion before proceeding. If user declines, exit immediately.

#### Step 3: Scan for Files

- Glob `<folder_path>/**/*.md` recursively
- Exclude hidden files/directories (`.hidden/`, `.notes.md`) by default
- Do not follow symlinks (safety: prevents modifying files outside target)
- If zero files found, print message and exit
- Print file count: "Found N markdown files"

#### Step 4: Detection Pass (Haiku, Centralized)

Single Haiku agent reads all file content and identifies sensitive entities.

**Entity categories to detect:**
- Company names (internal/proprietary, NOT well-known public companies like Google, AWS)
- People's names (employees, contacts — NOT public figures)
- Domains and URLs (internal domains, not public services)
- Email addresses (full address: local part + domain)
- API keys, tokens, and secrets (in code blocks or inline)
- Internal tool names, project codenames, team names
- IP addresses and internal hostnames

**Output format — JSON replacement map:**

```json
{
  "entities": {
    "Acme Corp": { "replacement": "Northwind Inc", "type": "company" },
    "Acme Corporation": { "replacement": "Northwind Industries", "type": "company" },
    "Jane Doe": { "replacement": "Alex Chen", "type": "person" },
    "jane.doe@acmecorp.com": { "replacement": "alex.chen@northwind.com", "type": "email" },
    "acmecorp.com": { "replacement": "northwind.com", "type": "domain" },
    "sk-abc123...": { "replacement": "sk-REDACTED-KEY", "type": "secret" }
  },
  "files": ["path/to/file1.md", "path/to/file2.md"]
}
```

**Context window strategy:** If combined file content is too large for a single Haiku call, chunk files into groups and make multiple detection calls. Merge replacement maps across chunks, deduplicating entities. The first chunk's mapping takes precedence for any given entity.

**Detection prompt guidance:**
- Replace internal/proprietary entities with realistic-sounding alternatives
- Leave well-known public entities unchanged (Google, AWS, React, Kubernetes, etc.)
- Generate consistent replacements: if "Acme" appears, all variants (Acme Corp, Acme Corporation, ACME) should map to consistent Northwind variants
- For secrets/API keys, use obviously-fake placeholders (`sk-REDACTED-KEY`, `ghp_EXAMPLE_TOKEN`)
- Include case variations of entity names in the map

#### Step 5: Write Index

Create `.mumbo-index.json` in the target folder containing the replacement map and file list. Used for progress tracking during the run; auto-deleted after summary.

#### Step 6: Generate and Apply Sed Script

Run `scripts/generate_sed.py` with the replacement map to produce sed commands.

Apply sed commands per file. Parallel execution where possible (independent files).

**Error handling:** If sed fails on a specific file, log the error in the index, skip that file, and continue with remaining files. Report failures in the summary.

#### Step 7: Verification Pass (Haiku, Parallel Per File)

Fan out one Haiku agent per file using the Agent tool.

Each agent:
- Reads the post-substitution file content
- Receives the replacement map as context (so it knows what was already replaced)
- Checks for remaining sensitive content that sed missed
- Flags specific heading-delimited sections (from one `#`/`##`/`###` heading to the next)
- Reports: file path, flagged section heading, reason it's still sensitive

Update index with verification results.

If no files are flagged, skip to Step 9.

#### Step 8: Contextual Rewrite (Sonnet, Parallel Per Flagged File)

Fan out one Sonnet agent per flagged file.

Each agent receives:
- The full replacement map (for consistency with existing substitutions)
- The flagged section content with surrounding context
- Instructions: rewrite the section to remove sensitive content while preserving structure, meaning, and markdown formatting. Use the same replacement names from the map — do not invent new ones.

Apply rewrites by replacing the flagged sections in the file.

**Error handling:** If Sonnet fails or times out on a file, log it in the index and continue. Report in summary.

#### Step 9: Summary and Cleanup

Print summary to console:

```
Obfuscation complete.
  Files scanned:       20
  Files modified:      18
  Sed substitutions:   142
  Sections rewritten:  3 (in 2 files)
  Warnings:            1

Warnings:
  - Potentially sensitive filenames: acme-deploy-guide.md, jane-onboarding.md
```

- Flag filenames containing entities from the replacement map (warn, don't rename)
- Delete `.mumbo-index.json` after successful summary print

### scripts/generate_sed.py

Python script (~80 lines) that:

**Input:** Replacement map JSON (from stdin or file argument)

**Output:** Sed commands to stdout, one per line

**Key implementation details:**

1. **Sort by length descending** — longest entity strings first to prevent partial matches ("Acme Corporation" before "Acme Corp" before "Acme")
2. **Escape sed special characters** in search patterns: `\`, `/`, `&`, `.`, `*`, `[`, `]`, `^`, `$`
3. **Escape replacement special characters**: `\`, `/`, `&`
4. **Use `/` as delimiter** but escape any `/` in the strings. Alternative: use `|` as delimiter if entities contain many `/` characters
5. **macOS BSD sed syntax**: `sed -i '' 's/search/replace/g' "$FILE"` — the empty string `''` after `-i` is required
6. **Handle case variations**: For each entity, generate both exact-case and common case variants if the detection pass flagged them
7. **Domain-only URL replacement**: For URL entities, replace only the domain portion while preserving the path

**Example output:**

```bash
sed -i '' 's/Acme Corporation/Northwind Industries/g' "$FILE"
sed -i '' 's/Acme Corp/Northwind Inc/g' "$FILE"
sed -i '' 's/jane\.doe@acmecorp\.com/alex.chen@northwind.com/g' "$FILE"
sed -i '' 's/acmecorp\.com/northwind.com/g' "$FILE"
sed -i '' 's/Jane Doe/Alex Chen/g' "$FILE"
```

## Error Handling

| Step | Failure Mode | Behavior |
|------|-------------|----------|
| Validation | Bad path | Print error, exit |
| Scan | No .md files | Print message, exit |
| Detection | API error/timeout | Abort, no files modified yet |
| Sed | Fails on file N | Log error, skip file, continue |
| Verification | API error on file N | Log warning, skip file, continue |
| Rewrite | Sonnet timeout on file N | Log warning, skip file, continue |
| Interruption (Ctrl-C) | Mid-pipeline | Leave .mumbo-index.json for debugging |

Principle: fail hard before any files are modified (detection). After modifications begin, log errors and continue — partial obfuscation is better than crashing mid-way with no summary.

## Acceptance Criteria

- [ ] `SKILL.md` with complete workflow instructions and frontmatter
- [ ] `scripts/generate_sed.py` converts JSON replacement map to sed commands
- [ ] generate_sed.py handles: longest-first ordering, special char escaping, macOS sed syntax
- [ ] `.gitignore` excludes `.claude/`, `.mumbo-index.json`, `.DS_Store`
- [ ] `CLAUDE.md` with project conventions
- [ ] Skill displays warning and requires confirmation before modifying files
- [ ] Detection pass produces JSON replacement map with realistic substitutions
- [ ] Detection covers: companies, people, emails, domains, secrets, internal terms
- [ ] Detection distinguishes internal entities from well-known public entities
- [ ] Context window chunking for large file sets
- [ ] Sed substitution applies per file with error handling
- [ ] Verification pass identifies remaining sensitive content per heading-delimited section
- [ ] Contextual rewrite handles flagged sections only, using replacement map for consistency
- [ ] `.mumbo-index.json` created during run, deleted after summary
- [ ] Summary prints: files scanned, modified, substitutions, rewrites, warnings, sensitive filenames
- [ ] Error handling: fail-hard before modifications, log-and-continue after

## Success Metrics

- Files are obfuscated with realistic substitutions (not obviously redacted)
- No sensitive entities remain after full pipeline
- Most files complete in Tier 1 (sed only), minimizing LLM cost
- Skill runs end-to-end without manual intervention after initial confirmation

## Dependencies & Risks

**Dependencies:**
- Python 3 (for generate_sed.py) — available on macOS by default
- Claude Code with Haiku and Sonnet model access
- BSD sed (macOS built-in)

**Risks:**
- **Large file sets**: Context window limits may require chunking in detection pass (mitigated by chunking strategy)
- **Complex entity patterns**: Abbreviated references, possessives ("Jane's"), case variations may be missed by sed (mitigated by verification + rewrite pass)
- **sed edge cases**: Multi-line patterns or entities spanning lines won't be caught by sed (mitigated by verification pass)
- **Replacement consistency**: Sonnet rewrites must use the same replacement names as sed (mitigated by passing replacement map to Sonnet)
- **Re-run after failure**: Partially-obfuscated files may confuse detection pass (no mitigation — user is responsible for backups per brainstorm decision)

## References

- Brainstorm: `docs/brainstorms/2026-03-01-file-obfuscation-skill-brainstorm.md`
- Sibling skill pattern: `rotten-tomatoes-skill/rotten-tomatoes-lookup/SKILL.md`
- Skill creator guide: `compound-engineering-plugin/.../skill-creator/SKILL.md`
