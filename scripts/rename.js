#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Load entities from a JSON replacement map file.
 */
function loadMap(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return data.entities || {};
}

/**
 * Build a compiled regex and lookup from sorted entities.
 * Returns { regex, lookup } for reuse across multiple basenames.
 */
function buildRenameRegex(sortedEntities) {
  if (sortedEntities.length === 0) return { regex: null, lookup: {} };

  const patterns = sortedEntities.map(([entity]) =>
    entity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );
  const regex = new RegExp(patterns.join('|'), 'gi');

  const lookup = {};
  for (const [entity, replacement] of sortedEntities) {
    lookup[entity.normalize('NFC').toLowerCase()] = replacement;
  }

  return { regex, lookup };
}

/**
 * Single-pass longest-first replacement on a basename.
 * Case-insensitive matching with Unicode NFC normalization.
 *
 * Case-insensitive because filenames may not match the exact casing in the
 * replacement map (e.g., "ACME-guide.md" should match map key "Acme").
 * This differs from replace.js, which uses case-sensitive matching because
 * the detection pass generates all case variants explicitly.
 *
 * Returns the new basename (unchanged if no match).
 */
function applyReplacements(basename, regex, lookup) {
  if (!regex) return basename;
  basename = basename.normalize('NFC');
  return basename.replace(regex, (match) => {
    return lookup[match.normalize('NFC').toLowerCase()];
  });
}

/**
 * Compute rename pairs from paths and entities.
 * Skips hidden entries (basename starts with '.').
 * Strips trailing separators.
 * Sorts output deepest-first by separator count, then alphabetically.
 */
function computeRenames(paths, entities) {
  // Pre-sort entities longest-first
  const sortedEntities = Object.entries(entities)
    .map(([k, v]) => [k, typeof v === 'object' ? v.replacement : v])
    .sort((a, b) => b[0].length - a[0].length);

  // Compile regex once for all basenames
  const { regex, lookup } = buildRenameRegex(sortedEntities);

  const renames = [];
  for (const rawPath of paths) {
    const p = rawPath.replace(/[/\\]+$/, '');
    if (!p) continue;
    const basename = path.basename(p);
    if (basename.startsWith('.')) continue;
    const newBasename = applyReplacements(basename, regex, lookup);
    if (newBasename !== basename) {
      const parent = path.dirname(p);
      const newPath = parent === '.' ? newBasename : path.join(parent, newBasename);
      renames.push({ old: p, new: newPath });
    }
  }

  // Sort by depth descending (separator count), then alphabetically
  renames.sort((a, b) => {
    const depthA = a.old.split(path.sep).length;
    const depthB = b.old.split(path.sep).length;
    if (depthB !== depthA) return depthB - depthA;
    return a.old.localeCompare(b.old);
  });

  return renames;
}

/**
 * Detect target path collisions (case-insensitive via NFC + toLowerCase).
 * Checks renamed-vs-renamed and renamed-vs-existing collisions.
 */
function checkCollisions(renames, allPaths) {
  const errors = [];

  // Renamed-vs-renamed collisions
  const seen = {};
  for (const r of renames) {
    const key = r.new.normalize('NFC').toLowerCase();
    if (key in seen) {
      errors.push(`${seen[key]} and ${r.old} both map to ${r.new}`);
    } else {
      seen[key] = r.old;
    }
  }

  // Build set of paths not being renamed
  const renamedSources = new Set(
    renames.map(r => r.old.normalize('NFC').toLowerCase())
  );
  const existing = new Set(
    allPaths
      .map(p => p.replace(/[/\\]+$/, '').normalize('NFC').toLowerCase())
      .filter(p => !renamedSources.has(p))
  );

  // Renamed-vs-existing collisions
  for (const r of renames) {
    const key = r.new.normalize('NFC').toLowerCase();
    if (existing.has(key)) {
      errors.push(`${r.old} maps to ${r.new} which already exists`);
    }
  }

  return errors;
}

function main() {
  if (process.argv.length < 3) {
    process.stderr.write('Error: missing replacement map file argument\n');
    process.exit(1);
  }

  const mapFile = process.argv[2];

  let entities;
  try {
    entities = loadMap(mapFile);
  } catch (e) {
    if (e.code === 'ENOENT') {
      process.stderr.write(`Error: file not found — ${mapFile}\n`);
    } else if (e instanceof SyntaxError) {
      process.stderr.write(`Error: invalid JSON — ${e.message}\n`);
    } else {
      process.stderr.write(`Error: ${e.message}\n`);
    }
    process.exit(1);
  }

  if (Object.keys(entities).length === 0) {
    process.stdout.write('[]\n');
    process.exit(0);
  }

  // Read paths from stdin
  let input = '';
  try {
    input = fs.readFileSync(0, 'utf8');
  } catch (e) {
    // No stdin
  }
  const paths = input.split('\n').map(l => l.trim()).filter(Boolean);

  const renames = computeRenames(paths, entities);
  const collisions = checkCollisions(renames, paths);

  if (collisions.length > 0) {
    for (const c of collisions) {
      process.stderr.write(`Error: collision — ${c}\n`);
    }
    process.stdout.write('[]\n');
    process.exit(1);
  }

  // Execute renames deepest-first
  for (const r of renames) {
    try {
      fs.renameSync(r.old, r.new);
    } catch (e) {
      process.stderr.write(`Error renaming ${r.old}: ${e.message}\n`);
    }
  }

  process.stdout.write(JSON.stringify(renames, null, 2) + '\n');
}

module.exports = { loadMap, buildRenameRegex, applyReplacements, computeRenames, checkCollisions };

if (require.main === module) {
  main();
}
