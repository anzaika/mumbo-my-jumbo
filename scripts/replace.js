#!/usr/bin/env node
'use strict';

const fs = require('fs');

/**
 * Load entities from a JSON replacement map file.
 * Returns the "entities" object, or {} if missing.
 */
function loadMap(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return data.entities || {};
}

const MAX_ENTITIES = 5000;
const MAX_KEY_LEN = 500;

/**
 * Build a single regex alternation pattern from entities, sorted longest-first.
 * Returns { regex, lookup } where lookup maps matched text to its replacement.
 *
 * Case-sensitive matching: the LLM detection pass is instructed to include all
 * case variants explicitly (e.g., "Acme", "ACME", "acme" as separate keys).
 * This avoids collateral damage from case-insensitive matching on short strings.
 *
 * Single-pass replacement prevents double-substitution:
 * if "north" → "acme" and "acme" → "zephyr", "north" becomes "acme" (not "zephyr").
 */
function buildReplacementRegex(entities) {
  const sorted = Object.entries(entities)
    .map(([entity, info]) => ({
      entity,
      replacement: typeof info === 'object' ? info.replacement : info,
    }))
    .sort((a, b) => b.entity.length - a.entity.length);

  if (sorted.length === 0) return { regex: null, lookup: {} };

  if (sorted.length > MAX_ENTITIES) {
    throw new Error(`Too many entities: ${sorted.length} (max ${MAX_ENTITIES})`);
  }
  for (const { entity } of sorted) {
    if (entity.length > MAX_KEY_LEN) {
      throw new Error(`Entity key too long (${entity.length} chars): "${entity.slice(0, 80)}..."`);
    }
  }

  const patterns = sorted.map(({ entity }) =>
    entity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );
  const regex = new RegExp(patterns.join('|'), 'g');

  const lookup = {};
  for (const { entity, replacement } of sorted) {
    lookup[entity] = replacement;
  }

  return { regex, lookup };
}

/**
 * Replace all entities in a file using single-pass regex substitution.
 * Returns the number of replacements made.
 * Rejects symlinks to prevent writes outside the target directory.
 * Uses write-to-temp-then-rename for atomic writes.
 */
function replaceInFile(filePath, regex, lookup) {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile()) {
    throw new Error(`Not a regular file (symlink or directory): ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf8');
  let count = 0;
  const result = content.replace(regex, (match) => {
    count++;
    return lookup[match];
  });
  if (count > 0) {
    const tmp = filePath + '.mumbo-tmp';
    fs.writeFileSync(tmp, result, 'utf8');
    fs.renameSync(tmp, filePath);
  }
  return count;
}

function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    process.stderr.write('Error: missing replacement map file argument\n');
    process.exit(1);
  }

  const mapFile = args[0];
  const files = args.slice(1);

  if (files.length === 0) {
    process.stderr.write('Error: no target files specified\n');
    process.exit(1);
  }

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
    process.stderr.write('Warning: no entities in replacement map\n');
    const results = files.map(f => ({ file: f, replacements: 0 }));
    const output = { files_modified: 0, total_replacements: 0, results };
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
    process.exit(0);
  }

  const { regex, lookup } = buildReplacementRegex(entities);
  const results = [];
  let totalReplacements = 0;
  let filesModified = 0;

  for (const file of files) {
    try {
      const count = replaceInFile(file, regex, lookup);
      results.push({ file, replacements: count });
      totalReplacements += count;
      if (count > 0) filesModified++;
    } catch (e) {
      process.stderr.write(`Error processing ${file}: ${e.message}\n`);
      results.push({ file, error: e.message });
    }
  }

  const output = {
    files_modified: filesModified,
    total_replacements: totalReplacements,
    results,
  };
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
}

module.exports = { loadMap, buildReplacementRegex, replaceInFile };

if (require.main === module) {
  main();
}
