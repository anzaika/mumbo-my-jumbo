'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const FIXTURE_DIR = path.join(__dirname, 'fixtures');

/** Discover fixture IDs by looking for *.key.json files. */
function discoverFixtureIds() {
  return fs.readdirSync(FIXTURE_DIR)
    .filter(f => f.endsWith('.key.json'))
    .map(f => f.replace('.key.json', ''))
    .sort();
}

/** Load the answer key (entity list) for a fixture. */
function loadAnswerKey(id) {
  const data = JSON.parse(
    fs.readFileSync(path.join(FIXTURE_DIR, `${id}.key.json`), 'utf8')
  );
  return data.entities;
}

/** Load the full replacement map for a fixture. */
function loadMap(id) {
  return JSON.parse(
    fs.readFileSync(path.join(FIXTURE_DIR, `${id}.map.json`), 'utf8')
  );
}

/**
 * Copy a fixture .md file to a temp directory.
 * Returns { tmpDir, filePath }.
 * Also writes the map.json alongside for CLI tests.
 */
function copyFixtureToTemp(id) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mumbo-test-'));
  const srcMd = path.join(FIXTURE_DIR, `${id}.md`);
  const dstMd = path.join(tmpDir, `${id}.md`);
  fs.copyFileSync(srcMd, dstMd);

  const srcMap = path.join(FIXTURE_DIR, `${id}.map.json`);
  const dstMap = path.join(tmpDir, `${id}.map.json`);
  fs.copyFileSync(srcMap, dstMap);

  return { tmpDir, filePath: dstMd };
}

/** Remove a temp directory and all its contents. */
function cleanupTmp(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

module.exports = {
  FIXTURE_DIR,
  discoverFixtureIds,
  loadAnswerKey,
  loadMap,
  copyFixtureToTemp,
  cleanupTmp,
};
