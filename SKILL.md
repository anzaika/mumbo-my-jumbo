---
name: mumbo-my-jumbo
description: "Obfuscate sensitive entities in markdown files for safe public sharing. Use when sharing Claude Code setups (skills, CLAUDE.md, plans) without leaking company names, people, URLs, or internal terms. Triggers on 'obfuscate', 'redact', 'anonymize files', 'share skills safely', 'mumbo'."
allowed-tools: Read, Edit, Write, Glob, Grep, Bash, Agent, AskUserQuestion
---

# Mumbo My Jumbo — File Obfuscation Skill

Obfuscate sensitive content in a folder of `.md` files so they can be shared publicly without leaking private or NDA-covered information. Uses a hybrid approach: fast `sed` substitution for most replacements, with LLM-powered contextual rewrite only for sections where simple substitution fails.

## Workflow

### Step 1: Accept Input and Validate

Accept a target folder path as a required argument (passed after the slash command).

- Validate the path exists and is a directory
- If invalid, print an error and stop

### Step 2: Warning and Confirmation

Display a prominent warning using output text:

```
WARNING: This will modify files IN PLACE.
No backup. No undo. No dry-run.
Target: <folder_path>
You are responsible for making copies before proceeding.
```

Use AskUserQuestion with a yes/no choice to require explicit confirmation. If the user declines, stop immediately.

### Step 3: Scan for Files

- Glob `<folder_path>/**/*.md` recursively
- Exclude hidden files and directories (paths containing `/.`)
- Do not follow symlinks
- If zero files found, print a message and stop
- Print: "Found N markdown files"

### Step 4: Detection Pass (Haiku, Centralized)

Launch a single Haiku agent (using Agent tool with `model: "haiku"`) that reads all file contents and identifies sensitive entities.

**Entity categories to detect:**
- Company names (internal/proprietary — NOT well-known public companies like Google, AWS, Microsoft)
- People's names (employees, contacts — NOT public figures)
- Domains and URLs (internal domains — not public services like github.com, npmjs.com)
- Email addresses (full address: local part + domain)
- API keys, tokens, and secrets (in code blocks or inline)
- Internal tool names, project codenames, team names
- IP addresses and internal hostnames

**Agent prompt must instruct:**
- Replace internal/proprietary entities with realistic-sounding alternatives
- Leave well-known public entities unchanged (Google, AWS, React, Kubernetes, PostgreSQL, etc.)
- Generate consistent replacements: all variants of an entity (e.g., "Acme", "Acme Corp", "Acme Corporation", "ACME") map to consistent variants of the replacement
- Include case variations in the map
- For secrets/API keys, use obviously-fake placeholders (`sk-REDACTED-KEY`, `ghp_EXAMPLE_TOKEN`)
- For domains in URLs, replace only the domain portion — preserve the path

**Required output format — JSON replacement map:**

```json
{
  "entities": {
    "Acme Corporation": { "replacement": "Northwind Industries", "type": "company" },
    "Acme Corp": { "replacement": "Northwind Inc", "type": "company" },
    "Jane Doe": { "replacement": "Alex Chen", "type": "person" },
    "jane.doe@acmecorp.com": { "replacement": "alex.chen@northwind.com", "type": "email" },
    "acmecorp.com": { "replacement": "northwind.com", "type": "domain" },
    "sk-abc123...": { "replacement": "sk-REDACTED-KEY", "type": "secret" }
  }
}
```

**Context window strategy:** If combined file content exceeds what fits in a single Haiku call, chunk files into groups and make multiple detection calls. Merge replacement maps across chunks — the first chunk's mapping takes precedence for any given entity.

### Step 5: Write Index

Create `.mumbo-index.json` in the target folder containing:
- The replacement map from Step 4
- The list of scanned file paths
- Status tracking fields (per-file sed result, verification result, rewrite result)

This file is used for progress tracking during the run and is auto-deleted after the summary is printed.

### Step 6: Generate and Apply Sed Script

Run `scripts/generate_sed.py` (located relative to this skill's directory) with the replacement map JSON piped to stdin. The script outputs sed commands to stdout.

Apply the sed commands to each file. Run files in parallel where possible (independent files).

The `generate_sed.py` script handles:
- Sorting entities longest-first to prevent partial matches
- Escaping sed special characters in both search and replacement strings
- macOS BSD sed syntax (`sed -i ''`)

**Error handling:** If sed fails on a specific file, log the error in the index, skip that file, and continue. Report failures in the summary.

### Step 7: Verification Pass (Haiku, Parallel Per File)

Fan out one Haiku agent per file using the Agent tool with `model: "haiku"`.

Each agent:
- Reads the post-substitution file content
- Receives the replacement map as context
- Checks for remaining sensitive content that sed missed
- Flags specific heading-delimited sections (from one `#`/`##`/`###` heading to the next)
- Returns: file path, list of flagged section headings, reason each section is still sensitive

Update the index with verification results.

If no files are flagged, skip directly to Step 9.

### Step 8: Contextual Rewrite (Sonnet, Parallel Per Flagged File)

Fan out one Sonnet agent per flagged file using the Agent tool with `model: "sonnet"`.

Each agent receives:
- The full replacement map (for consistency with existing substitutions)
- The flagged section content with surrounding context
- Instructions: rewrite the section to remove sensitive content while preserving structure, meaning, and markdown formatting. Use the same replacement names from the map — do not invent new ones.

Apply rewrites by replacing the flagged sections in the file using the Edit tool.

**Error handling:** If Sonnet fails or times out on a file, log it in the index and continue. Report in the summary.

### Step 9: Summary and Cleanup

Print a summary to the console:

```
Obfuscation complete.
  Files scanned:       N
  Files modified:      N
  Sed substitutions:   N
  Sections rewritten:  N (in M files)
  Warnings:            N

Warnings:
  - Potentially sensitive filenames: acme-deploy-guide.md, jane-onboarding.md
```

- Check filenames against the replacement map. Flag any filenames containing entity strings (warn only — do not rename)
- Delete `.mumbo-index.json` after successfully printing the summary

## Error Handling Principles

- **Before modifications begin** (Steps 1-4): fail hard and stop. No files have been touched.
- **After modifications begin** (Steps 6-8): log errors and continue. Partial obfuscation is better than crashing mid-way with no summary.
- **On interruption** (Ctrl-C): leave `.mumbo-index.json` in place for debugging.
