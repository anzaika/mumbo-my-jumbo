'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { computeRenames, checkCollisions } = require('../scripts/rename');

describe('rename integration', () => {
  let tmpDir;

  function createTree(structure) {
    for (const p of structure) {
      const full = path.join(tmpDir, p.replace(/\/$/, ''));
      if (p.endsWith('/')) {
        fs.mkdirSync(full, { recursive: true });
      } else {
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, `content of ${p}`, 'utf8');
      }
    }
  }

  function collectPaths() {
    const paths = [];
    function walk(dir, rel) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.name.startsWith('.')) continue;
        const relPath = rel ? path.join(rel, e.name) : e.name;
        if (e.isDirectory()) {
          paths.push(relPath);
          walk(path.join(dir, e.name), relPath);
        } else {
          paths.push(relPath);
        }
      }
    }
    walk(tmpDir, '');
    return paths;
  }

  function executeRenames(renames) {
    for (const r of renames) {
      fs.renameSync(path.join(tmpDir, r.old), path.join(tmpDir, r.new));
    }
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mumbo-rename-int-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('full rename pipeline', () => {
    createTree([
      'acme-docs/',
      'acme-docs/acme-guide.md',
      'acme-docs/readme.md',
    ]);
    const entities = { acme: { replacement: 'northwind', type: 'company' } };
    const paths = collectPaths();
    const renames = computeRenames(paths, entities);
    const collisions = checkCollisions(renames, paths);
    assert.deepEqual(collisions, []);

    executeRenames(renames);

    const result = collectPaths();
    assert.ok(result.includes('northwind-docs'), 'northwind-docs should exist');
    assert.ok(
      result.includes(path.join('northwind-docs', 'northwind-guide.md')),
      'northwind-guide.md should exist'
    );
    assert.ok(!result.some(p => p.includes('acme')), 'no acme paths should remain');
  });

  it('mixed file types', () => {
    createTree([
      'acme-config.yaml',
      'acme-deploy.sh',
      'readme.md',
    ]);
    const entities = { acme: { replacement: 'northwind', type: 'company' } };
    const paths = collectPaths();
    const renames = computeRenames(paths, entities);
    assert.equal(renames.length, 2); // yaml and sh, not readme
  });

  it('hidden files excluded', () => {
    createTree([
      '.acme-config',
      'acme-guide.md',
    ]);
    const entities = { acme: { replacement: 'northwind', type: 'company' } };
    const paths = collectPaths();
    const renames = computeRenames(paths, entities);
    assert.equal(renames.length, 1);
    assert.equal(renames[0].old, 'acme-guide.md');
  });

  it('collision aborts', () => {
    createTree(['foo.md', 'bar.md']);
    const entities = { foo: { replacement: 'bar', type: 'test' } };
    const paths = collectPaths();
    const renames = computeRenames(paths, entities);
    const collisions = checkCollisions(renames, paths);
    assert.equal(collisions.length, 1);
  });

  it('deep nesting', () => {
    createTree(['acme-project/acme-docs/acme-guide.md']);
    const entities = { acme: { replacement: 'northwind', type: 'company' } };
    const paths = collectPaths();
    const renames = computeRenames(paths, entities);

    // Should be ordered deepest first
    assert.equal(renames.length, 3);
    const depths = renames.map(r => r.old.split(path.sep).length);
    assert.ok(depths[0] >= depths[1], 'deepest first');

    executeRenames(renames);
    const result = collectPaths();
    assert.ok(result.every(p => !p.includes('acme')), 'no acme paths should remain');
  });
});
