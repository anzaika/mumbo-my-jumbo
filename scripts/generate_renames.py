#!/usr/bin/env python3
"""Compute file/directory renames from a JSON replacement map.

Reads a replacement map from a file argument and paths from stdin.
Outputs a JSON array of rename pairs (deepest-first) to stdout.

Usage:
    find target/ | python3 generate_renames.py replacements.json
"""

import json
import os
import re
import sys
import unicodedata


def load_replacement_map(filepath: str) -> dict:
    """Load entities from a JSON file."""
    with open(filepath) as f:
        data = json.load(f)
    return data.get("entities", {})


def apply_replacements(basename: str, sorted_entities: list) -> str:
    """Single-pass longest-first replacement using re.sub with alternation.

    sorted_entities: list of (entity, replacement) tuples, sorted longest-first.
    """
    if not sorted_entities:
        return basename

    # Build alternation pattern from escaped entities
    patterns = [re.escape(entity) for entity, _ in sorted_entities]
    combined = "|".join(patterns)
    regex = re.compile(combined, re.IGNORECASE)

    # Build lookup from casefolded entity to replacement
    lookup = {unicodedata.normalize("NFC", entity).casefold(): repl
              for entity, repl in sorted_entities}

    def replacer(match):
        matched = unicodedata.normalize("NFC", match.group(0))
        return lookup[matched.casefold()]

    basename = unicodedata.normalize("NFC", basename)
    return regex.sub(replacer, basename)


def compute_renames(paths: list[str], entities: dict) -> list[dict]:
    """Compute rename pairs, sorted deepest-first.

    Skips hidden entries (basename starts with '.').
    Strips trailing separators from paths.
    """
    # Pre-sort entities once: longest-first
    sorted_entities = sorted(
        ((k, v["replacement"] if isinstance(v, dict) else v)
         for k, v in entities.items()),
        key=lambda x: len(x[0]),
        reverse=True,
    )

    renames = []
    for raw_path in paths:
        path = raw_path.rstrip(os.sep + "/")
        if not path:
            continue
        basename = os.path.basename(path)
        if basename.startswith("."):
            continue
        new_basename = apply_replacements(basename, sorted_entities)
        if new_basename != basename:
            parent = os.path.dirname(path)
            new_path = os.path.join(parent, new_basename) if parent else new_basename
            renames.append({"old": path, "new": new_path})

    # Sort by depth descending (component count), then alphabetically
    renames.sort(key=lambda r: (-r["old"].count(os.sep), r["old"]))
    return renames


def check_collisions(renames: list[dict], all_paths: list[str]) -> list[str]:
    """Detect target path collisions (case-insensitive via casefold).

    Checks both renamed-vs-renamed and renamed-vs-existing collisions.
    """
    errors = []

    # Renamed-vs-renamed collisions
    seen = {}
    for r in renames:
        key = unicodedata.normalize("NFC", r["new"]).casefold()
        if key in seen:
            errors.append(
                f"{seen[key]} and {r['old']} both map to {r['new']}"
            )
        else:
            seen[key] = r["old"]

    # Build set of paths not being renamed
    renamed_sources = {unicodedata.normalize("NFC", r["old"]).casefold()
                       for r in renames}
    existing = {unicodedata.normalize("NFC", p.rstrip(os.sep + "/")).casefold()
                for p in all_paths} - renamed_sources

    # Renamed-vs-existing collisions
    for r in renames:
        key = unicodedata.normalize("NFC", r["new"]).casefold()
        if key in existing:
            errors.append(
                f"{r['old']} maps to {r['new']} which already exists"
            )

    return errors


def main():
    if len(sys.argv) < 2:
        print("Error: missing replacement map file argument", file=sys.stderr)
        sys.exit(1)

    filepath = sys.argv[1]

    try:
        entities = load_replacement_map(filepath)
    except json.JSONDecodeError as e:
        print(f"Error: invalid JSON — {e}", file=sys.stderr)
        sys.exit(1)
    except FileNotFoundError:
        print(f"Error: file not found — {filepath}", file=sys.stderr)
        sys.exit(1)

    if not entities:
        print("[]")
        sys.exit(0)

    paths = [line for line in sys.stdin.read().splitlines() if line.strip()]

    renames = compute_renames(paths, entities)
    collisions = check_collisions(renames, paths)

    if collisions:
        for c in collisions:
            print(f"Error: collision — {c}", file=sys.stderr)
        print("[]")
        sys.exit(1)

    print(json.dumps(renames, indent=2))


if __name__ == "__main__":
    main()
