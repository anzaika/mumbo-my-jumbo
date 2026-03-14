'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { loadMap, buildReplacementRegex, replaceInFile } = require('../scripts/replace');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'replace.js');

// --- Unit tests for buildReplacementRegex ---

describe('buildReplacementRegex', () => {
  it('sorts entities longest-first (prevents partial match)', () => {
    const entities = {
      'Acme': { replacement: 'Northwind', type: 'company' },
      'Acme Corporation': { replacement: 'Northwind Industries', type: 'company' },
      'Acme Corp': { replacement: 'Northwind Inc', type: 'company' },
    };
    const { regex, lookup } = buildReplacementRegex(entities);
    // "Acme Corporation" must be replaced as a whole, not as "Acme" + " Corporation"
    assert.equal(
      'Acme Corporation and Acme Corp and Acme'.replace(regex, m => lookup[m]),
      'Northwind Industries and Northwind Inc and Northwind'
    );
  });

  it('handles dict-style values', () => {
    const entities = { 'Jane Doe': { replacement: 'Alex Chen', type: 'person' } };
    const { regex, lookup } = buildReplacementRegex(entities);
    assert.equal('Hello Jane Doe!'.replace(regex, m => lookup[m]), 'Hello Alex Chen!');
  });

  it('handles plain string values', () => {
    const entities = { 'Jane Doe': 'Alex Chen' };
    const { regex, lookup } = buildReplacementRegex(entities);
    assert.equal('Hello Jane Doe!'.replace(regex, m => lookup[m]), 'Hello Alex Chen!');
  });

  it('escapes regex special chars in entity names', () => {
    const entities = { 'acme.corp/api': { replacement: 'northwind.co/api', type: 'domain' } };
    const { regex, lookup } = buildReplacementRegex(entities);
    // Should match literal . and / not regex wildcards
    assert.equal(
      'Visit acme.corp/api today'.replace(regex, m => lookup[m]),
      'Visit northwind.co/api today'
    );
    // Should NOT match "acmeXcorp/api" (dot is escaped, not a wildcard)
    assert.equal(
      'Visit acmeXcorp/api today'.replace(regex, m => lookup[m]),
      'Visit acmeXcorp/api today'
    );
  });

  it('returns null regex for empty entities', () => {
    const { regex, lookup } = buildReplacementRegex({});
    assert.equal(regex, null);
    assert.deepEqual(lookup, {});
  });

  it('prevents double-substitution (single-pass)', () => {
    const entities = {
      'north': { replacement: 'acme', type: 'company' },
      'acme': { replacement: 'zephyr', type: 'company' },
    };
    const { regex, lookup } = buildReplacementRegex(entities);
    // "north" → "acme" in single pass; "acme" should NOT become "zephyr"
    assert.equal('north docs'.replace(regex, m => lookup[m]), 'acme docs');
  });

  it('replaces all occurrences globally', () => {
    const entities = { 'Acme': { replacement: 'Northwind', type: 'company' } };
    const { regex, lookup } = buildReplacementRegex(entities);
    assert.equal(
      'Acme and Acme again'.replace(regex, m => lookup[m]),
      'Northwind and Northwind again'
    );
  });

  it('handles non-ASCII entities', () => {
    const entities = { 'Müller GmbH': { replacement: 'Schmidt AG', type: 'company' } };
    const { regex, lookup } = buildReplacementRegex(entities);
    assert.equal(
      'Contact Müller GmbH today'.replace(regex, m => lookup[m]),
      'Contact Schmidt AG today'
    );
  });
});

// --- Unit tests for loadMap ---

describe('loadMap', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mumbo-loadmap-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads valid JSON and extracts entities', () => {
    const data = { entities: { Acme: { replacement: 'Northwind', type: 'company' } } };
    const f = path.join(tmpDir, 'map.json');
    fs.writeFileSync(f, JSON.stringify(data), 'utf8');
    assert.deepEqual(loadMap(f), data.entities);
  });

  it('ignores extra keys', () => {
    const data = { entities: { A: 'B' }, other_key: 'ignored' };
    const f = path.join(tmpDir, 'map.json');
    fs.writeFileSync(f, JSON.stringify(data), 'utf8');
    assert.deepEqual(loadMap(f), { A: 'B' });
  });

  it('returns empty object when entities key missing', () => {
    const data = { something_else: 'value' };
    const f = path.join(tmpDir, 'map.json');
    fs.writeFileSync(f, JSON.stringify(data), 'utf8');
    assert.deepEqual(loadMap(f), {});
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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mumbo-cli-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('exits 1 with no arguments', () => {
    const r = runScript([]);
    assert.equal(r.exitCode, 1);
    assert.ok(r.stderr.includes('missing'));
  });

  it('exits 1 with map file only (no target files)', () => {
    const f = path.join(tmpDir, 'map.json');
    fs.writeFileSync(f, '{"entities":{}}', 'utf8');
    const r = runScript([f]);
    assert.equal(r.exitCode, 1);
    assert.ok(r.stderr.includes('no target files'));
  });

  it('exits 1 for nonexistent map file', () => {
    const r = runScript(['/tmp/does-not-exist-12345.json', 'some-file.md']);
    assert.equal(r.exitCode, 1);
    assert.ok(r.stderr.includes('file not found'));
  });

  it('exits 1 for malformed JSON', () => {
    const f = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(f, 'not json{{{', 'utf8');
    const target = path.join(tmpDir, 'target.md');
    fs.writeFileSync(target, 'content', 'utf8');
    const r = runScript([f, target]);
    assert.equal(r.exitCode, 1);
    assert.ok(r.stderr.includes('invalid JSON'));
  });

  it('exits 0 with empty entities and warning', () => {
    const f = path.join(tmpDir, 'map.json');
    fs.writeFileSync(f, '{"entities":{}}', 'utf8');
    const target = path.join(tmpDir, 'target.md');
    fs.writeFileSync(target, 'content', 'utf8');
    const r = runScript([f, target]);
    assert.equal(r.exitCode, 0);
    assert.ok(r.stderr.includes('no entities'));
    const output = JSON.parse(r.stdout);
    assert.equal(output.files_modified, 0);
    assert.equal(output.total_replacements, 0);
  });

  it('replaces entities and outputs JSON summary', () => {
    const map = { entities: { Acme: { replacement: 'Northwind', type: 'company' } } };
    const mapFile = path.join(tmpDir, 'map.json');
    fs.writeFileSync(mapFile, JSON.stringify(map), 'utf8');
    const target = path.join(tmpDir, 'target.md');
    fs.writeFileSync(target, 'Hello Acme and Acme again', 'utf8');
    const r = runScript([mapFile, target]);
    assert.equal(r.exitCode, 0);
    const output = JSON.parse(r.stdout);
    assert.equal(output.files_modified, 1);
    assert.equal(output.total_replacements, 2);
    // Verify file was actually modified
    assert.equal(fs.readFileSync(target, 'utf8'), 'Hello Northwind and Northwind again');
  });

  it('handles file read errors gracefully', () => {
    const map = { entities: { Acme: { replacement: 'Northwind', type: 'company' } } };
    const mapFile = path.join(tmpDir, 'map.json');
    fs.writeFileSync(mapFile, JSON.stringify(map), 'utf8');
    const r = runScript([mapFile, '/tmp/nonexistent-file-99999.md']);
    assert.equal(r.exitCode, 0); // continues past errors
    assert.ok(r.stderr.includes('Error processing'));
    const output = JSON.parse(r.stdout);
    assert.ok(output.results[0].error);
  });
});
