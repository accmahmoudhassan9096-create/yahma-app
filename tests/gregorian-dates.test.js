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

test('formatArabicDate outputs numeric dates without Arabic month names', () => {
  const env = loadUtilsAndExcel();
  // Stub needed DOM / globals for router-payments
  env.document = { getElementById: () => null, querySelectorAll: () => [] };
  env.localStorage = { getItem: () => null, setItem: () => null };
  vm.runInNewContext(read('core/router-payments.js'), env, { filename: 'core/router-payments.js' });
    vm.runInNewContext(read('core/router-payments-item.js'), env, { filename: 'core/router-payments-item.js' });
    vm.runInNewContext(read('core/router-payments-bulk.js'), env, { filename: 'core/router-payments-bulk.js' });
    vm.runInNewContext(read('core/router-payments-pending.js'), env, { filename: 'core/router-payments-pending.js' });
    vm.runInNewContext(read('core/router-payments-paid.js'), env, { filename: 'core/router-payments-paid.js' });
    vm.runInNewContext(read('core/router-payments-renewed.js'), env, { filename: 'core/router-payments-renewed.js' });
  const formatArabicDate = env.formatArabicDate;

  // With timestamp (e.g. user screenshot 19 أكتوبر 2026)
  const formatted = formatArabicDate('2026-10-19T16:15:00');
  assert.ok(formatted.includes('19/10/2026'), `Expected 19/10/2026 in ${formatted}`);
  assert.ok(!formatted.includes('أكتوبر'), `Should not contain Arabic month name: ${formatted}`);
  assert.ok(formatted.includes('04:15') || formatted.includes('4:15'), `Expected time in ${formatted}`);

  // Date only string
  const dateOnly = formatArabicDate('2026-10-19');
  assert.strictEqual(dateOnly, '19/10/2026');
});
