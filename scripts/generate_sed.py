#!/usr/bin/env python3
"""Convert a JSON replacement map to sed commands.

Reads a replacement map from stdin or a file argument and prints
sed commands to stdout, one per line. Designed for macOS BSD sed.

Usage:
    echo '{"entities": {...}}' | python3 generate_sed.py
    python3 generate_sed.py replacements.json
"""

import json
import re
import sys


def escape_sed_pattern(s: str) -> str:
    """Escape special characters in a sed search pattern."""
    # BSD sed special chars in BRE: \ / & . * [ ] ^ $
    return re.sub(r'([\\/.&*\[\]^$])', r'\\\1', s)


def escape_sed_replacement(s: str) -> str:
    """Escape special characters in a sed replacement string."""
    # Only \ / & are special in the replacement part
    return re.sub(r'([\\/&])', r'\\\1', s)


def load_replacement_map(source) -> dict:
    """Load the replacement map from a file or stdin."""
    if source is not None:
        with open(source) as f:
            data = json.load(f)
    else:
        data = json.load(sys.stdin)

    return data.get("entities", {})


def generate_commands(entities: dict) -> list[str]:
    """Generate sed commands sorted longest-first.

    Longest entities are replaced first to prevent partial matches
    (e.g., "Acme Corporation" before "Acme Corp" before "Acme").
    """
    # Sort by entity string length descending
    sorted_entities = sorted(entities.items(), key=lambda x: len(x[0]), reverse=True)

    commands = []
    for entity, info in sorted_entities:
        replacement = info["replacement"] if isinstance(info, dict) else info
        pattern = escape_sed_pattern(entity)
        repl = escape_sed_replacement(replacement)
        commands.append(f"s/{pattern}/{repl}/g")

    return commands


def main():
    source = sys.argv[1] if len(sys.argv) > 1 else None

    try:
        entities = load_replacement_map(source)
    except json.JSONDecodeError as e:
        print(f"Error: invalid JSON — {e}", file=sys.stderr)
        sys.exit(1)
    except FileNotFoundError:
        print(f"Error: file not found — {source}", file=sys.stderr)
        sys.exit(1)

    if not entities:
        print("Warning: no entities in replacement map", file=sys.stderr)
        sys.exit(0)

    commands = generate_commands(entities)
    for cmd in commands:
        print(cmd)


if __name__ == "__main__":
    main()
