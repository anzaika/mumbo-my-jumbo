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

- **In-place obfuscation**: Modifies files directly. Safety via git commit or backup before changes.
- **Markdown files only**: `.md` is the primary format for Claude Code skills and configs.
- **Auto-detection**: No manual seed list. The skill scans files and identifies sensitive entities automatically (company names, people, URLs, internal jargon).
- **Two-tier replacement**:
  - Tier 1: Build a replacement map and apply simple string substitution (fast, no LLM cost per replacement).
  - Tier 2: AI-powered contextual rewrite for sections that need it.
- **Cost-conscious model selection**: Use Haiku for detection and verification passes. Only use a larger model (Sonnet) for contextual rewrites when needed.

## Planned Flow

1. Scan target folder for `.md` files
2. **Detection pass** (Haiku): Read all files, identify sensitive entities, build a consistent replacement map (e.g., `"Acme Corp" → "Northwind Inc"`, `"Jane Doe" → "Alex Chen"`)
3. **Simple substitution**: Apply the map across all files — pure string replacement, no LLM cost
4. **Contextual rewrite pass** (Haiku/Sonnet): For sections where substitution alone isn't sufficient, rewrite preserving structure and meaning
5. **Verification pass** (Haiku): Scan results to confirm no sensitive data leaked through

## Open Questions

- Git commit before obfuscation as the undo mechanism, or separate backup?
- Dry-run / preview mode before applying changes?
- URL handling: domain-only replacement or full URL rewrite?

## Next Steps

-> `/workflows:plan` for implementation details
