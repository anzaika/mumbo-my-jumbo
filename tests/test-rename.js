'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { buildRenameRegex, applyReplacements, computeRenames, checkCollisions } = require('../scripts/rename');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'rename.js');

// --- Helper to call applyReplacements with compiled regex ---

function apply(basename, sortedEntities) {
  const { regex, lookup } = buildRenameRegex(sortedEntities);
  return applyReplacements(basename, regex, lookup);
}

// --- Unit tests for applyReplacements ---

describe('applyReplacements', () => {
  it('single entity', () => {
    assert.equal(apply('acme-guide.md', [['acme', 'northwind']]), 'northwind-guide.md');
  });

  it('longest-first ordering', () => {
    assert.equal(apply('acme-corp-guide.md', [['acme-corp', 'northwind-inc'], ['acme', 'northwind']]), 'northwind-inc-guide.md');
  });

  it('no double-replacement', () => {
    assert.equal(apply('north-docs', [['north', 'acme'], ['acme', 'zephyr']]), 'acme-docs');
  });

  it('no match passthrough', () => {
    assert.equal(apply('readme.md', [['acme', 'northwind']]), 'readme.md');
  });

  it('empty entities', () => {
    assert.equal(apply('readme.md', []), 'readme.md');
  });

  it('multiple occurrences', () => {
    assert.equal(apply('acme-acme.md', [['acme', 'northwind']]), 'northwind-northwind.md');
  });

  it('case-insensitive matching', () => {
    assert.equal(apply('ACME-guide.md', [['Acme', 'Northwind']]), 'Northwind-guide.md');
  });

  it('overlapping entities (longer wins)', () => {
    assert.equal(apply('acme-corporation-guide.md', [['acme-corporation', 'northwind-industries'], ['acme', 'northwind']]), 'northwind-industries-guide.md');
  });

  it('entity is entire basename', () => {
    assert.equal(apply('acme', [['acme', 'northwind']]), 'northwind');
  });

  it('special regex chars in entity', () => {
    assert.equal(apply('acme.corp-guide.md', [['acme.corp', 'northwind.co']]), 'northwind.co-guide.md');
  });
});

// --- Unit tests for computeRenames ---

describe('computeRenames', () => {
  it('basic rename', () => {
    const entities = { acme: { replacement: 'northwind', type: 'company' } };
    const renames = computeRenames(['target/acme-guide.md'], entities);
    assert.equal(renames.length, 1);
    assert.deepEqual(renames[0], { old: 'target/acme-guide.md', new: 'target/northwind-guide.md' });
  });

  it('depth ordering (deepest first)', () => {
    const entities = { acme: { replacement: 'northwind', type: 'company' } };
    const renames = computeRenames(['target/acme-docs', 'target/acme-docs/acme-guide.md'], entities);
    assert.equal(renames.length, 2);
    assert.equal(renames[0].old, 'target/acme-docs/acme-guide.md');
    assert.equal(renames[1].old, 'target/acme-docs');
  });

  it('hidden file skip', () => {
    const entities = { acme: { replacement: 'northwind', type: 'company' } };
    const renames = computeRenames(['.acme-config', 'target/.acme-hidden'], entities);
    assert.deepEqual(renames, []);
  });

  it('no rename needed', () => {
    const entities = { acme: { replacement: 'northwind', type: 'company' } };
    assert.deepEqual(computeRenames(['target/readme.md'], entities), []);
  });

  it('strips trailing separator', () => {
    const entities = { acme: { replacement: 'northwind', type: 'company' } };
    const renames = computeRenames(['target/acme-docs/'], entities);
    assert.equal(renames.length, 1);
    assert.equal(renames[0].old, 'target/acme-docs');
  });

  it('plain string values', () => {
    const entities = { acme: 'northwind' };
    const renames = computeRenames(['acme-guide.md'], entities);
    assert.deepEqual(renames[0], { old: 'acme-guide.md', new: 'northwind-guide.md' });
  });

  it('directory rename', () => {
    const entities = { acme: { replacement: 'northwind', type: 'company' } };
    const renames = computeRenames(['target/acme-docs'], entities);
    assert.deepEqual(renames[0], { old: 'target/acme-docs', new: 'target/northwind-docs' });
  });

  it('empty paths', () => {
    const entities = { acme: { replacement: 'northwind', type: 'company' } };
    assert.deepEqual(computeRenames([], entities), []);
  });

  it('empty entities', () => {
    assert.deepEqual(computeRenames(['target/acme.md'], {}), []);
  });
});

// --- Unit tests for checkCollisions ---

describe('checkCollisions', () => {
  it('no collisions', () => {
    const renames = [{ old: 'a.md', new: 'b.md' }];
    assert.deepEqual(checkCollisions(renames, ['a.md', 'c.md']), []);
  });

  it('renamed-vs-renamed collision', () => {
    const renames = [
      { old: 'FOO.md', new: 'bar.md' },
      { old: 'foo.md', new: 'bar.md' },
    ];
    const errors = checkCollisions(renames, ['FOO.md', 'foo.md']);
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes('both map to'));
  });

  it('renamed-vs-existing collision', () => {
    const renames = [{ old: 'acme.md', new: 'northwind.md' }];
    const errors = checkCollisions(renames, ['acme.md', 'northwind.md']);
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes('already exists'));
  });

  it('case-insensitive collision', () => {
    const renames = [{ old: 'acme.md', new: 'Northwind.md' }];
    const errors = checkCollisions(renames, ['acme.md', 'northwind.md']);
    assert.equal(errors.length, 1);
  });
});

// --- CLI exit code tests ---

function runScript(args, stdin) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    input: stdin || '',
    encoding: 'utf8',
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status,
  };
}

describe('CLI exit codes', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mumbo-rename-cli-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('exits 1 with no arguments', () => {
    const r = runScript([], 'some/path\n');
    assert.equal(r.exitCode, 1);
    assert.ok(r.stderr.toLowerCase().includes('missing'));
  });

  it('exits 1 for nonexistent file', () => {
    const r = runScript(['/tmp/does-not-exist-99999.json'], '');
    assert.equal(r.exitCode, 1);
    assert.ok(r.stderr.includes('file not found'));
  });

  it('exits 1 for malformed JSON', () => {
    const f = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(f, 'not json{{{', 'utf8');
    const r = runScript([f], '');
    assert.equal(r.exitCode, 1);
    assert.ok(r.stderr.includes('invalid JSON'));
  });

  it('empty entities outputs empty array', () => {
    const f = path.join(tmpDir, 'map.json');
    fs.writeFileSync(f, JSON.stringify({ entities: {} }), 'utf8');
    const r = runScript([f], 'some/path\n');
    assert.equal(r.exitCode, 0);
    assert.deepEqual(JSON.parse(r.stdout), []);
  });

  it('valid input returns renames', () => {
    const data = { entities: { acme: { replacement: 'northwind', type: 'company' } } };
    const f = path.join(tmpDir, 'map.json');
    fs.writeFileSync(f, JSON.stringify(data), 'utf8');
    // Create actual file so rename can execute
    const target = path.join(tmpDir, 'acme-guide.md');
    fs.writeFileSync(target, 'content', 'utf8');
    const r = runScript([f], `${target}\n`);
    assert.equal(r.exitCode, 0);
    const renames = JSON.parse(r.stdout);
    assert.equal(renames.length, 1);
    assert.ok(renames[0].old.endsWith('acme-guide.md'));
    assert.ok(renames[0].new.endsWith('northwind-guide.md'));
  });

  it('collision exits 1', () => {
    const data = {
      entities: {
        foo: { replacement: 'bar', type: 'company' },
        baz: { replacement: 'bar', type: 'company' },
      },
    };
    const f = path.join(tmpDir, 'map.json');
    fs.writeFileSync(f, JSON.stringify(data), 'utf8');
    const r = runScript([f], 'foo.md\nbaz.md\n');
    assert.equal(r.exitCode, 1);
    assert.ok(r.stderr.toLowerCase().includes('collision'));
  });
});
