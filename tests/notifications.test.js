/* ============================================================
   tests/notifications.test.js
   modules/notifications.js — تشغيل الملف فعلياً في بيئة وهمية
   ------------------------------------------------------------
   ⚠️notifications.js ملف inline (مش module) — مفيش له اختبار قبل
   كده، فأي خطأ في نطاق المتغيرات بيعدّي على CI ويسيب ReferenceError
   في الإنتاج كل 20 ثانية (زي ما حصل في idleDaysOf).

   الاختبار ده بيحمّل الملف في vm ويشغّل الـtimer اللي بيعمل
   notificationItems() — لو في أي ReferenceError، هيتسجّل.
   ============================================================ */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/* بيشغّل notifications.js مع وهمية كاملة */
function loadNotifications(fleet, idleDaysFor) {
  const errors = [];
  const timers = [];
  const badge = { textContent: '', classList: { toggle: () => {} } };

  const sandbox = {
    console, Date, Math, JSON, Intl, Promise, RegExp, Set, Map, Array, Object, String, Number, Boolean,
    setTimeout: () => 0, clearTimeout: () => {},
    setInterval: (fn) => { timers.push(fn); return timers.length; },
    clearInterval: () => {},
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {}, key: () => null, length: 0 },
    escapeHtml: (s) => String(s == null ? '' : s),
    fleet: fleet || [],
    /* كل حاجة سليمة — عشان الإشعار الوحيد يبقى إشعار الركود */
    dateStatus: () => ({ level: 'green', days: 9999, label: 'ساري' }),
    textTag: () => ({ level: 'green', label: 'ساري' }),
    fmtDate: (d) => String(d || ''),
    openModal: () => {},
    yahmaErr: (e, where) => errors.push({ message: String((e && e.message) || e), where }),
    document: {
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: (id) => (id === 'notify-badge' ? badge : null),
      createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, setAttribute() {}, querySelectorAll: () => [], querySelector: () => null, remove() {} }),
      addEventListener: () => {},
      body: { appendChild: () => {} }
    },
    YahmaSnapshots: idleDaysFor ? { idleDaysFor } : null
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.global = sandbox;

  vm.runInContext(read('modules/notifications.js'), vm.createContext(sandbox), { filename: 'notifications.js' });
  return { errors, timers, badge };
}

test('notifications.js: مفيش ReferenceError لما تتبني الإشعارات', () => {
  const { errors, timers } = loadNotifications([
    { id: 'c1', plate: '1111 أ ب ج', carStatus: 'متاحة للإيجار', cardExpiry: '', licenseExpiry: '' }
  ]);

  assert.ok(timers.length, 'الـtimer بتاع الإشعارات مش متركّب');
  timers.forEach((fn) => fn());

  assert.deepStrictEqual(errors, [], 'notifications.js رما خطأ: ' + JSON.stringify(errors));
});

test('notifications.js: إشعار «سيارة راكدة» بيشتغل من idle_since', () => {
  const { errors, timers, badge } = loadNotifications(
    [{ id: 'c1', plate: '1111 أ ب ج', carStatus: 'متاحة للإيجار', cardExpiry: '', licenseExpiry: '' }],
    () => 90
  );

  timers.forEach((fn) => fn());

  assert.deepStrictEqual(errors, [], 'notifications.js رما خطأ: ' + JSON.stringify(errors));
  assert.strictEqual(badge.textContent, '1', 'إشعار «سيارة راكدة» ماطلعش');
});

test('notifications.js: مفيش إشعار راكدة لو المدة أقل من 60 يوم', () => {
  const { errors, timers, badge } = loadNotifications(
    [{ id: 'c1', plate: '1111 أ ب ج', carStatus: 'متاحة للإيجار', cardExpiry: '', licenseExpiry: '' }],
    () => 20
  );

  timers.forEach((fn) => fn());

  assert.deepStrictEqual(errors, [], 'notifications.js رما خطأ: ' + JSON.stringify(errors));
  assert.strictEqual(badge.textContent, '0', 'طلع إشعار راكدة من غير سبب');
});

test('notifications.js: idleDaysOf متعرّفة قبل أول استخدام ليها', () => {
  const code = read('modules/notifications.js');
  const decl = code.indexOf('const idleDaysOf=');
  const use = code.indexOf('idleDaysOf(c)');
  assert.ok(decl > -1, 'idleDaysOf مش متعرّفة خالص');
  assert.ok(use > -1, 'idleDaysOf مش مستخدمة');
  assert.ok(decl < use, 'idleDaysOf متعرّفة بعد استخدامها — ReferenceError في الإنتاج');
});
