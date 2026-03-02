---
date: 2026-03-01
topic: file-obfuscation-skill
---

# Mumbo My Jumbo — File Obfuscation Skill

## What We're Building

A Claude Code skill that obfuscates sensitive content in a folder of `.md` files (skills, CLAUDE.md, brainstorm docs, plans) so they can be shared publicly without leaking private or NDA-covered information.

The core use case: you have a powerful Claude Code setup (skills, configs, workflows) that you want to share with friends or colleagues, but the files contain company names, internal URLs, people's names, and other identifying information you can't expose.

## Why This Approach

We considered three replacement strategies:
1. **Realistic substitution** — replace "Acme Corp" with "Northwind Inc"
2. **Generic placeholders** — replace with `[COMPANY_NAME]`
3. **AI-powered contextual rewrite** — LLM rewrites sections preserving structure

We chose a **hybrid of 1 + 3**: realistic substitution as the cheap default, with contextual AI rewrite for sections where simple find/replace would break meaning or miss nuance. This produces output that looks like a real working setup (not obviously redacted) while handling complex cases well.

## Key Decisions

- **In-place obfuscation, no backup**: Modifies files directly. No automatic backup, no git assumptions. The skill shows a prominent warning before running that files will be changed in place. Users are responsible for making their own copies if needed.
- **One-shot, no preview**: Point at a folder and it runs. No dry-run mode, no approval step, no interactive review of the replacement map.
- **Markdown files only**: `.md` is the primary format for Claude Code skills and configs.
- **LLM-powered detection**: No manual seed list. Haiku reads all files and identifies sensitive entities (company names, people, URLs, domain-specific terms).
- **Domain-only URL replacement**: URLs are handled by swapping the domain while preserving the path (e.g., `https://internal.acmecorp.com/api/v2/users` → `https://internal.northwind.com/api/v2/users`).
- **Two-tier replacement with verification trigger**:
  - Tier 1: Build a replacement map and apply simple string substitution (fast, no LLM cost per replacement).
  - Tier 2: Run a verification pass after substitution. Only sections flagged by the verifier as still leaking sensitive context get an AI-powered contextual rewrite. Most files won't need Tier 2.
- **Cost-conscious model selection**: Use Haiku for detection and verification passes. Only use a larger model (Sonnet) for contextual rewrites when needed.
- **`sed` for Tier 1 substitution**: The replacement map is compiled into a sed script and applied via `sed -i` — fast, no LLM cost, available on macOS out of the box.
- **Parallel execution**: Detection is centralized (one agent builds the global replacement map from all files). After the map is built, substitution, verification, and rewrite fan out per file in parallel using multiple agents.
- **JSON index for tracking**: A `.mumbo-index.json` file tracks progress during the run — files processed, replacement map, verification results, rewrite status per file. Auto-deleted after the run completes and a summary is printed to console. No sensitive artifacts left on disk.

## Planned Flow

1. **Warning**: Display prominent disclaimer that files will be modified in place
2. Scan target folder for `.md` files
3. **Detection pass** (Haiku, centralized): One agent reads all files, identifies sensitive entities, builds a consistent replacement map (e.g., `"Acme Corp" → "Northwind Inc"`, `"Jane Doe" → "Alex Chen"`)
4. **Create index**: Write `.mumbo-index.json` with the replacement map and file list for progress tracking
5. **Simple substitution** (parallel, `sed`): Generate a sed script from the map, run `sed -i` against each file. No LLM cost, parallel per file.
6. **Verification pass** (Haiku, parallel per file): Each agent checks its file for sections that still leak sensitive context. Update index with results.
7. **Contextual rewrite pass** (Sonnet, parallel per flagged file): Rewrite only the flagged sections, preserving structure and meaning. Update index.
8. **Summary & cleanup**: Print summary to console (files processed, substitutions made, sections rewritten, any warnings). Delete `.mumbo-index.json`.

## Resolved Questions

- **Undo mechanism**: None. Show a warning, user is responsible for their own backups. No git assumptions.
- **Dry-run / preview**: No. One-shot execution, keep it simple.
- **URL handling**: Domain-only replacement, preserve paths.
- **Tier 2 trigger**: Verification-triggered. Run substitution first, then a verification pass flags leaking sections, and only those get an AI rewrite.
- **Parallelism**: Centralized detection, then fan-out per file for substitution/verification/rewrite.
- **Tooling**: `sed -i` for fast string replacement. No extra dependencies.
- **Index file**: JSON tracking file used during the run, auto-deleted after summary is printed. No sensitive artifacts left behind.

## Next Steps

-> `/workflows:plan` for implementation details
