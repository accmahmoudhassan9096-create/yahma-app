const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function loadUtilsAndExcel() {
  const sandbox = {
    window: {},
    console,
    Array, Map, Set, String, Number, Boolean, JSON, Math, Date, parseInt, parseFloat, isNaN,
    Intl
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;

  // Load modules/utils.js
  vm.runInNewContext(read('modules/utils.js'), sandbox, { filename: 'modules/utils.js' });

  // Stub needed globals for fleet-excel.js
  sandbox.XLSX = {
    read: () => ({ SheetNames: [], Sheets: {} }),
    utils: { sheet_to_json: () => [] }
  };
  vm.runInNewContext(read('modules/fleet-excel.js'), sandbox, { filename: 'modules/fleet-excel.js' });

  return sandbox;
}

test('normalizeDateValue converts Hijri dates to Gregorian YYYY-MM-DD', () => {
  const env = loadUtilsAndExcel();
  const utils = env.YahmaUtils;

  // 1446-08-15 (Hijri Sha'ban 15, 1446 AH corresponds to approx 2025-02-14)
  const gregIso = utils.normalizeDateValue('1446-08-15');
  assert.ok(/^2025-02-\d{2}$/.test(gregIso), `Expected 2025-02-xx, got ${gregIso}`);

  // Slash format 1446/08/15
  const slashIso = utils.normalizeDateValue('1446/08/15');
  assert.strictEqual(slashIso, gregIso);

  // DD/MM/YYYY format: 15/08/1446
  const dmyIso = utils.normalizeDateValue('15/08/1446');
  assert.strictEqual(dmyIso, gregIso);

  // Gregorian date remains unchanged
  assert.strictEqual(utils.normalizeDateValue('2025-10-25'), '2025-10-25');
  assert.strictEqual(utils.normalizeDateValue('25/10/2025'), '2025-10-25');
});

test('fmtDate always displays dates in Gregorian DD/MM/YYYY', () => {
  const env = loadUtilsAndExcel();
  const utils = env.YahmaUtils;

  // Gregorian date
  assert.strictEqual(utils.fmtDate('2026-05-15'), '15/05/2026');

  // Hijri date 1446-01-01 -> approx 07/07/2024
  const formatted = utils.fmtDate('1446-01-01');
  assert.ok(/^\d{2}\/\d{2}\/2024$/.test(formatted), `Expected DD/MM/2024, got ${formatted}`);
  // Verify it does NOT contain 1446
  assert.ok(!formatted.includes('1446'), `Formatted date should not contain Hijri year 1446: ${formatted}`);
});

test('FleetExcel toDateStr handles both Gregorian and Hijri dates', () => {
  const env = loadUtilsAndExcel();
  const excel = env.YahmaFleetExcel;

  // Gregorian ISO
  assert.strictEqual(excel.toDateStr('2025-03-10'), '2025-03-10');

  // Hijri slash
  const parsed = excel.toDateStr('1446/08/15');
  assert.ok(/^2025-02-\d{2}$/.test(parsed), `Expected 2025-02-xx, got ${parsed}`);

  // Hijri hyphen
  const parsedHyphen = excel.toDateStr('1446-08-15');
  assert.strictEqual(parsedHyphen, parsed);
});
