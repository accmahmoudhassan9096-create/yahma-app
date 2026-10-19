'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function setupEnvironment() {
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    Date,
    Math,
    String,
    Number,
    Array,
    Object,
    Set,
    Map,
    JSON,
    RegExp,
    parseFloat,
    parseInt,
    isNaN,
    isFinite,
    localStorage: {
      _data: {},
      getItem(k) { return this._data[k] || null; },
      setItem(k, v) { this._data[k] = String(v); },
      removeItem(k) { delete this._data[k]; },
      clear() { this._data = {}; }
    },
    document: {
      getElementById() {
        return { textContent: '', innerHTML: '', value: '', appendChild() {}, style: {} };
      },
      querySelectorAll() { return []; }
    },
    window: {}
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  const ctx = vm.createContext(sandbox);

  // Load utilities, readiness, and core stores in order
  const scripts = [
    'modules/utils.js',
    'modules/readiness.js',
    'core/branches-store.js',
    'modules/dashboard-core.js',
    'modules/reports.js'
  ];

  for (const s of scripts) {
    const code = read(s);
    vm.runInContext(code, ctx);
  }

  return ctx;
}

test('أرقام لوحة التحكم تطابق أرقام التبويبات بالتمام والكمال', () => {
  const ctx = setupEnvironment();

  const testFleet = [
    // car 1: Everything valid (green)
    { id: 1, plate: '1111-AAA', inspectionStatus: 'تم الفحص', licenseExpiry: '2028-01-01', insuranceStatus: 'ساري', cardExpiry: '2028-01-01' },
    // car 2: License expired (red), others valid
    { id: 2, plate: '2222-BBB', inspectionStatus: 'تم الفحص', licenseExpiry: '2020-01-01', insuranceStatus: 'ساري', cardExpiry: '2028-01-01' },
    // car 3: Card expired (red), others valid
    { id: 3, plate: '3333-CCC', inspectionStatus: 'تم الفحص', licenseExpiry: '2028-01-01', insuranceStatus: 'ساري', cardExpiry: '2020-01-01' },
    // car 4: Insurance expired (red), others valid
    { id: 4, plate: '4444-DDD', inspectionStatus: 'تم الفحص', licenseExpiry: '2028-01-01', insuranceStatus: 'منتهي', cardExpiry: '2028-01-01' },
    // car 5: Inspection expired (red), others valid
    { id: 5, plate: '5555-EEE', inspectionStatus: 'منتهي', licenseExpiry: '2028-01-01', insuranceStatus: 'ساري', cardExpiry: '2028-01-01' },
    // car 6: License near expiry (soon/amber) - should NOT count as red in tabs
    { id: 6, plate: '6666-FFF', inspectionStatus: 'تم الفحص', licenseExpiry: new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10), insuranceStatus: 'ساري', cardExpiry: '2028-01-01' }
  ];

  const state = ctx.YahmaDashboardCore.computeDashboardState(testFleet);

  const tabRenewals = ctx.fleetForTab('renewals', testFleet);
  const tabLicense = ctx.fleetForTab('license-renewals', testFleet);
  const tabInsurance = ctx.fleetForTab('insurance-renewals', testFleet);
  const tabCards = ctx.fleetForTab('inspections', testFleet);

  assert.strictEqual(state.renInsp, tabRenewals.length, 'renInsp must match renewals tab count');
  assert.strictEqual(state.renLic, tabLicense.length, 'renLic must match license-renewals tab count');
  assert.strictEqual(state.renIns, tabInsurance.length, 'renIns must match insurance-renewals tab count');
  assert.strictEqual(state.renCard, tabCards.length, 'renCard must match inspections tab count');

  // Verify that car 6 (near expiry) did NOT inflate the expired counts
  assert.strictEqual(state.renLic, 1, 'Only car 2 has expired license');
  assert.strictEqual(state.renInsp, 1, 'Only car 5 has expired inspection');
  assert.strictEqual(state.renIns, 1, 'Only car 4 has expired insurance');
  assert.strictEqual(state.renCard, 1, 'Only car 3 has expired card');

  // Verify todayTasks navigation and counts
  const inspTask = state.todayTasks.find(t => t.go === 'renewals');
  assert.ok(inspTask, 'should have renewals task in todayTasks');
  assert.strictEqual(inspTask.n, state.renInsp, 'todayTasks renewals count must match renInsp');

  const licTask = state.todayTasks.find(t => t.go === 'license-renewals');
  assert.ok(licTask, 'should have license-renewals task in todayTasks');
  assert.strictEqual(licTask.n, state.renLic, 'todayTasks license count must match renLic');

  const cardTask = state.todayTasks.find(t => t.go === 'inspections');
  assert.ok(cardTask, 'should have inspections task in todayTasks');
  assert.strictEqual(cardTask.n, state.renCard, 'todayTasks card count must match renCard');
});
