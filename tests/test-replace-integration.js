'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { buildReplacementRegex, replaceInFile } = require('../scripts/replace');
const {
  discoverFixtureIds,
  loadAnswerKey,
  loadMap,
  copyFixtureToTemp,
  cleanupTmp,
} = require('./helpers');
const fs = require('fs');

const FIXTURE_IDS = discoverFixtureIds();
let tmpDir;

afterEach(() => {
  if (tmpDir) { cleanupTmp(tmpDir); tmpDir = null; }
});

/**
 * Apply replacements using the production replaceInFile, return file content.
 */
function applyReplacements(filePath, entities) {
  const { regex, lookup } = buildReplacementRegex(entities);
  if (!regex) return fs.readFileSync(filePath, 'utf8');
  replaceInFile(filePath, regex, lookup);
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Assert that no answer-key entities survive in the content.
 */
function checkNoEntitiesSurvive(content, answerKey, label) {
  const survivors = Object.keys(answerKey).filter(e => content.includes(e));
  assert.deepEqual(survivors, [], `Entities survived in ${label}: ${survivors.join(', ')}`);
}

// --- Parametrized fixture tests ---

describe('replace.js eliminates all entities per fixture', () => {
  for (const id of FIXTURE_IDS) {
    it(`fixture: ${id}`, () => {
      const { tmpDir: _tmpDir, filePath } = copyFixtureToTemp(id);
      tmpDir = _tmpDir;
      const map = loadMap(id);
      const answerKey = loadAnswerKey(id);

      const content = applyReplacements(filePath, map.entities);
      checkNoEntitiesSurvive(content, answerKey, id);
    });
  }
});

// --- Specific edge case tests ---

describe('edge cases', () => {
  it('overlapping entities handled correctly (longest-first)', () => {
    const id = '09-overlapping-and-collisions';
    const { tmpDir: _tmpDir, filePath } = copyFixtureToTemp(id);
    tmpDir = _tmpDir;
    const map = loadMap(id);
    const answerKey = loadAnswerKey(id);

    const content = applyReplacements(filePath, map.entities);
    checkNoEntitiesSurvive(content, answerKey, id);

    assert.ok(content.includes('Zephyr Industries'), 'Missing "Zephyr Industries"');
    assert.ok(content.includes('Zephyr Inc'), 'Missing "Zephyr Inc"');
    assert.ok(content.includes('Pinnacle Labs'), 'Missing "Pinnacle Labs"');
  });

  it('entities in markdown links preserved syntax', () => {
    const id = '04-urls-and-domains';
    const { tmpDir: _tmpDir, filePath } = copyFixtureToTemp(id);
    tmpDir = _tmpDir;
    const map = loadMap(id);
    const answerKey = loadAnswerKey(id);

    const content = applyReplacements(filePath, map.entities);
    checkNoEntitiesSurvive(content, answerKey, id);
    assert.ok(content.includes(']('), 'Markdown link syntax broken');
  });

  it('entities in fenced code blocks replaced', () => {
    const id = '05-api-keys-and-secrets';
    const { tmpDir: _tmpDir, filePath } = copyFixtureToTemp(id);
    tmpDir = _tmpDir;
    const map = loadMap(id);
    const answerKey = loadAnswerKey(id);

    const content = applyReplacements(filePath, map.entities);
    checkNoEntitiesSurvive(content, answerKey, id);
  });

  it('code-heavy document fully processed', () => {
    const id = '10-code-heavy';
    const { tmpDir: _tmpDir, filePath } = copyFixtureToTemp(id);
    tmpDir = _tmpDir;
    const map = loadMap(id);
    const answerKey = loadAnswerKey(id);

    const content = applyReplacements(filePath, map.entities);
    checkNoEntitiesSurvive(content, answerKey, id);
  });

  it('bold/italic formatting preserved', () => {
    const id = '08-markdown-formatting';
    const { tmpDir: _tmpDir, filePath } = copyFixtureToTemp(id);
    tmpDir = _tmpDir;
    const map = loadMap(id);
    const answerKey = loadAnswerKey(id);

    const content = applyReplacements(filePath, map.entities);
    checkNoEntitiesSurvive(content, answerKey, id);
    assert.ok(content.includes('**'), 'Bold markers missing');
    assert.ok(content.includes('*'), 'Italic markers missing');
  });

  it('dense document with 20+ entities fully processed', () => {
    const id = '07-mixed-dense';
    const { tmpDir: _tmpDir, filePath } = copyFixtureToTemp(id);
    tmpDir = _tmpDir;
    const map = loadMap(id);
    const answerKey = loadAnswerKey(id);
    const entityCount = Object.keys(map.entities).length;
    assert.ok(entityCount >= 20, `Expected 20+ entities, got ${entityCount}`);

    const content = applyReplacements(filePath, map.entities);
    checkNoEntitiesSurvive(content, answerKey, id);
  });

  it('empty replacement map leaves document unchanged', () => {
    const id = '01-companies-and-products';
    const { tmpDir: _tmpDir, filePath } = copyFixtureToTemp(id);
    tmpDir = _tmpDir;
    const original = fs.readFileSync(filePath, 'utf8');

    applyReplacements(filePath, {});
    assert.equal(fs.readFileSync(filePath, 'utf8'), original);
  });

  it('all replacements present in output (collision-free)', () => {
    const id = '09-overlapping-and-collisions';
    const { tmpDir: _tmpDir, filePath } = copyFixtureToTemp(id);
    tmpDir = _tmpDir;
    const map = loadMap(id);
    const answerKey = loadAnswerKey(id);

    const content = applyReplacements(filePath, map.entities);
    checkNoEntitiesSurvive(content, answerKey, id);

    for (const info of Object.values(map.entities)) {
      const replacement = typeof info === 'object' ? info.replacement : info;
      assert.ok(content.includes(replacement), `Replacement "${replacement}" missing`);
    }
  });

  it('prevents double-substitution in content', () => {
    const d = fs.mkdtempSync(require('os').tmpdir() + '/mumbo-dbl-');
    const filePath = require('path').join(d, 'test.md');
    fs.writeFileSync(filePath, 'Contact north team about north project', 'utf8');
    tmpDir = d;

    const entities = {
      'north': { replacement: 'acme', type: 'company' },
      'acme': { replacement: 'zephyr', type: 'company' },
    };
    const content = applyReplacements(filePath, entities);
    // "north" → "acme" in single pass; "acme" must NOT become "zephyr"
    assert.equal(content, 'Contact acme team about acme project');
  });
});
