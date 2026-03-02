# Mumbo My Jumbo

File obfuscation skill for Claude Code. Obfuscates sensitive entities in `.md` files for safe public sharing.

## Project Structure

```
SKILL.md              — Skill definition (frontmatter + workflow)
scripts/generate_sed.py — Converts replacement map JSON → sed commands
CLAUDE.md             — This file
.gitignore            — Ignore patterns
docs/brainstorms/     — Brainstorm documents
docs/plans/           — Implementation plans
```

## Conventions

- SKILL.md uses imperative/infinitive form (verb-first instructions), not second person
- `scripts/generate_sed.py` targets macOS BSD sed (`sed -i ''`)
- Runtime tracking file `.mumbo-index.json` is created in the target folder during a run and auto-deleted after
- No dependencies beyond Python 3 and BSD sed (both ship with macOS)
