# Mumbo My Jumbo

File obfuscation skill for Claude Code. Obfuscates sensitive entities in `.md` files for safe public sharing.

## Project Structure

```
SKILL.md              — Skill definition (frontmatter + workflow)
scripts/replace.js    — Reads replacement map, applies to files in-place
scripts/rename.js     — Computes and executes file/directory renames
CLAUDE.md             — This file
.gitignore            — Ignore patterns
docs/brainstorms/     — Brainstorm documents
docs/plans/           — Implementation plans
```

## Conventions

- SKILL.md uses imperative/infinitive form (verb-first instructions), not second person
- Scripts are Node.js (CommonJS) — no npm dependencies, no package.json
- Runtime tracking file `.mumbo-index.json` is created in the target folder during a run and auto-deleted after
- Requires Node.js 18+ (no npm dependencies — scripts use only Node.js stdlib)
