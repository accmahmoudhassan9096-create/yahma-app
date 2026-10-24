/* دورة الفحص ← تحت الدفع ← تم الدفع ← تم التجديد — من يحرّكها؟

   الطلب:
   · «تشغيل» لما يعلّم على سيارة في تبويب الفحص: مفيش قدامه غير
     «تم الفحص» و«إلغاء التحديد». «تم الفحص» بينقلها لِ«تحت الدفع»
     تلقائيًا — مش بيسيبها في الفحص.
   · «إداري» (و«مدير النظام») يقدروا ينقلوا السيارات المحددة بين
     الأربعة تبويبات — أي مرحلة لأي مرحلة.

   الاختبارات دي بتحمي الحدين: شريط التشغيل ما يتوسّعش، وشريط
   الإداري ما يختفيش. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('شريط «الفحص» لحساب التشغيل: زر واحد بس — تم الفحص', () => {
  const js = read('modules/renewals-ui.js');
  /* الفرع التاني من canMoveCycle هو اللي بيشوفه التشغيل */
  const m = /canMoveCycle\s*\n\s*\?\s*'[^']*'\s*\n\s*:\s*'([^']*)'/.exec(js);
  assert.ok(m, 'مالقتش فرع شريط التشغيل في تبويب الفحص');
  const html = m[1];
  assert.strictEqual((html.match(/<button/g) || []).length, 1,
    'شريط التشغيل فيه أكتر من زر — المطلوب «تم الفحص» بس');
  assert.ok(html.includes('ren-bulk-insp-yes'), 'زر «تم الفحص» مش موجود');
  assert.ok(!html.includes('ren-insp-from-lic'), '«فحص من الرخص» ظاهر للتشغيل');
  assert.ok(!html.includes('ren-bulk-insp-no'), '«لم يُفحص» ظاهر للتشغيل');
});

test('«إلغاء التحديد» موجود دايمًا — والحذف للمدير بس', () => {
  const js = read('modules/renewals-ui.js');
  assert.ok(/id="ren-bulk-clear">إلغاء التحديد</.test(js), 'زر «إلغاء التحديد» اتشال');
  assert.ok(/\$\{canDelete\?'<button[^']*id="ren-bulk-delete"/.test(js),
    'زر «حذف المحددة» لازم يكون مقفول على canDelete (المدير)');
});

test('مجموعة «نقل المحددة (إداري)» ظاهرة للإداري والمدير', () => {
  const js = read('modules/renewals-ui.js');
  assert.ok(/const isManager=/.test(js), 'مفيش تعريف لدور «إداري»');
  assert.ok(/const canMoveCycle=isAdmin\|\|isManager;/.test(js),
    'صلاحية النقل لازم تكون للمدير والإداري');
  assert.ok(/\$\{canMoveCycle\?`/.test(js), 'مجموعة النقل مش مربوطة بـcanMoveCycle');
  ['ren-admin-to-payments', 'ren-admin-to-paid', 'ren-admin-to-renewed'].forEach((id) => {
    assert.ok(js.includes('id="' + id + '"'), 'مالقتش زر ' + id);
  });
});

test('التلات تبويبات التانية فيها «نقل المحددة (إداري)»', () => {
  const code = read('core/router-payments-bulk.js');
  assert.ok(/function payMovableRole\(\)/.test(code), 'مفيش بوابة لدور النقل');
  assert.ok(/r === 'admin' \|\| r === 'manager'/.test(code),
    'النقل لازم يبقى متاح للمدير والإداري');
  assert.ok(/PAY_CYCLE\.filter\(function \(t\) \{ return t !== tab; \}\)/.test(code),
    'أزرار النقل لازم تتبني من الدورة نفسها — مش قائمة يدوية');
  assert.ok(/data-pay-move=/.test(code), 'مفيش أزرار نقل في شريط الدفع');
  assert.ok(/querySelectorAll\('\[data-pay-move\]'\)/.test(code), 'أزرار النقل مش مربوطة بمعالج');
});

test('النقل بيمشي على دوال المفرد — مفيش مسار تاني للحقيقة', () => {
  const code = read('core/router-payments-bulk.js');
  assert.ok(/async function payMoveOne\(car, target\)/.test(code), 'مالقتش payMoveOne');
  ['back2', 'back', 'cancel', 'paid', 'renew'].forEach((a) => {
    assert.ok(code.includes('PAY_ITEM_ACTION.' + a + '('),
      'النقل مش بيستخدم PAY_ITEM_ACTION.' + a);
  });
  /* الوضع الجماعي بيكتم تأكيد كل سيارة (quiet=true) */
  assert.ok(/PAY_ITEM_ACTION\.(back2|back|cancel|paid|renew)\([^)]*,\s*true\)/.test(code),
    'النقل مش بيمرر quiet=true — هيفتح نافذة لكل سيارة');
});

test('النقل الجماعي: تأكيد واحد ورسم واحد', () => {
  const code = read('core/router-payments-bulk.js');
  const m = /async function runPayMove\(tab, target\) \{([\s\S]*?)\n\}/.exec(code);
  assert.ok(m, 'مالقتش runPayMove');
  const body = m[1];
  assert.strictEqual((body.match(/\bconfirm\(/g) || []).length, 1,
    'أكتر من نافذة تأكيد في النقل الجماعي');
  assert.strictEqual((body.match(/\brender\(\);/g) || []).length, 1,
    'النقل الجماعي بيرسم أكتر من مرة');
  assert.ok(!/Promise\.all/.test(body), 'مفيش Promise.all — الترتيب مقصود');
  assert.ok(/payBulkReport\(/.test(body), 'النقل مش بيستخدم تقرير الأرقام الموحّد');
  assert.ok(/selectedPayRows\(tab\)/.test(body), 'التحديد مش بيتقرا من خريطة الصفوف');
});

test('مفيش نداء للإجراءات الجماعية ناقص ctx — ولا طريقة تانية للتعطيل الصامت', () => {
  const code = read('modules/renewals-ui-bulk.js');
  assert.ok(!/renSelectedCars\(\s*\)/.test(code),
    'renSelectedCars() من غير ctx — بيرمي TypeError والزر بيموت صامت');
  assert.ok(!/renPlates\(cars\)/.test(code), 'renPlates(cars) من غير ctx');
  assert.ok(!/renBulkApply\(cars,/.test(code), 'renBulkApply(cars, …) من غير ctx');
  assert.ok(!/renBulkApply\(withDate,/.test(code), 'renBulkApply(withDate, …) من غير ctx');
  assert.ok(!/inspectionFromLicense\(\s*c\s*\)/.test(code), 'inspectionFromLicense(c) من غير ctx');
  assert.ok(!/pendingCarIds\(\s*\)/.test(code), 'pendingCarIds() من غير ctx');
  assert.ok(!/bulkAdvanceToPayment\(\s*cars\s*\)/.test(code), 'bulkAdvanceToPayment(cars) من غير ctx');
});

test('«تم الفحص» الجماعي بينقل فعلًا لِتحت الدفع (مش بيموت صامت)', async () => {
  const payments = makeFakePayments();
  const calls = { render: 0, alerts: [] };
  const sandbox = {
    console, setTimeout, clearTimeout, Date, Math, JSON, Promise,
    fleet: [],
    YahmaPayments: payments,
    saveData: async () => true,
    render: () => { calls.render++; },
    alert: (m) => { calls.alerts.push(String(m)); },
    confirm: () => true,
    log: () => {},
    yahmaErr: () => {}
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'modules/renewals-ui-bulk.js'), 'utf8'), ctx,
    { filename: 'modules/renewals-ui-bulk.js' });

  const car = { id: 'c1', plate: 'ABC 123', inspectionStatus: 'لم يفحص' };
  sandbox.fleet.push(car);
  const ids = new Set(['c1']);
  await sandbox.YahmaRenewalsBulk.bulkSetInspection({ selectedRenIds: ids }, 'تم الفحص', true);

  assert.strictEqual(car.inspectionStatus, 'تم الفحص', 'حالة الفحص ما اتغيرتش');
  assert.strictEqual(payments._rows.length, 1, 'مفيش طلب دفع اتسجّل — السيارة ما اتنقلتش');
  assert.strictEqual(payments._rows[0].status, 'pending');
  assert.strictEqual(ids.size, 0, 'التحديد ما اتشالش بعد التنفيذ');
  assert.ok(calls.render >= 1, 'الشاشة ما اتحدثتش');
});

test('«لم يُفحص» الجماعي بيحفظ الحالة من غير ما ينقل', async () => {
  const payments = makeFakePayments();
  const sandbox = {
    console, setTimeout, clearTimeout, Date, Math, JSON, Promise,
    fleet: [],
    YahmaPayments: payments,
    saveData: async () => true,
    render: () => {},
    alert: () => {},
    confirm: () => true,
    log: () => {},
    yahmaErr: () => {}
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'modules/renewals-ui-bulk.js'), 'utf8'), ctx,
    { filename: 'modules/renewals-ui-bulk.js' });

  const car = { id: 'c2', plate: 'DEF 456', inspectionStatus: 'تم الفحص' };
  sandbox.fleet.push(car);
  const ids = new Set(['c2']);
  await sandbox.YahmaRenewalsBulk.bulkSetInspection({ selectedRenIds: ids }, 'لم يفحص', false);

  assert.strictEqual(car.inspectionStatus, 'لم يفحص');
  assert.strictEqual(payments._rows.length, 0, '«لم يُفحص» المفروض ما ينقلش لتحت الدفع');
});

test('شريط الدفع للإداري: مجموعة نقل واحدة بدل الأزرار المكرّرة', () => {
  const code = read('core/router-payments-bulk.js');
  assert.ok(/const btns = moveBtns \? '' : actions\.map/.test(code),
    'أزرار الخطوة الواحدة لازم تتشال لما مجموعة النقل تظهر — منع التكرار');
});

test('النقل من شريط «الفحص» بيستخدم نفس المنطق', () => {
  const bulk = read('modules/renewals-ui-bulk.js');
  assert.ok(/currentRole!=="admin" && currentRole!=="manager"/.test(bulk),
    'النقل لازم يسمح للإداري كمان — مش المدير بس');
  assert.ok(/window\.payMoveOne/.test(bulk),
    'شريط الفحص بيعمل منطق نقل تاني بدل ما يستخدم payMoveOne');
  assert.ok(/window\.payMoveWarning/.test(bulk), 'تحذير الرجوع مش بيظهر في شريط الفحص');
});

/* ===== اختبار وظيفي: payMoveOne بيوصل لأي مرحلة من أي مرحلة =====

   بنحمّل ملفات الشحن نفسها في sandbox، وبنستبدل وحدة الدفع بمخزن
   في الذاكرة. مفيش شبكة ومفيش قاعدة بيانات — اللي بنختبره هو
   تسلسل الخطوات (bidirectional) نفسه. */
const { loadModule } = require('./harness');

function makeFakePayments() {
  return {
    _rows: [],
    _snapshot: {},
    localAll() { return this._rows.slice(); },
    localByStatus(s) { return this._rows.filter((r) => r.status === s); },
    isRenewed(r) { return String(r.note || '').indexOf('تم التجديد') === 0; },
    async requestPayment(input) {
      const cars = Array.isArray(input) ? input : [input];
      cars.forEach((car) => {
        this._rows = this._rows.filter((r) => String(r.carId) !== String(car.id));
        this._rows.push({ id: 'p-' + car.id, carId: String(car.id), status: 'pending', plate: car.plate, note: '' });
      });
      return { ok: true, moved: cars.length };
    },
    async rememberCarState() {},
    prevStateOf() { return this._snapshot; },
    async markPaid(id, carId) { const r = this._rows.find((x) => String(x.carId) === String(carId)); if (r) r.status = 'paid'; },
    async markLicenseRenewed(id, carId) { const r = this._rows.find((x) => String(x.carId) === String(carId)); if (r) r.note = 'تم التجديد'; },
    async revertPaidToPending(id, carId) { const r = this._rows.find((x) => String(x.carId) === String(carId)); if (r) { r.status = 'pending'; r.note = ''; } },
    async revertRenewedToPaid(id, carId) { const r = this._rows.find((x) => String(x.carId) === String(carId)); if (r) r.note = ''; },
    async revertPendingToInspection(id, carId) { this._rows = this._rows.filter((x) => String(x.carId) !== String(carId)); }
  };
}

const vm = require('vm');

function bootCycle() {
  const payments = makeFakePayments();
  const calls = { render: 0, alerts: [] };
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    Date,
    Math,
    JSON,
    Intl,
    Promise,
    YahmaPayments: payments,
    YahmaPerms: {
      role: () => 'admin', canEditNow: () => true, canBulk: () => true,
      canDelete: () => true, denyMessage: () => ''
    },
    currentRole: 'admin',
    saveData: async () => true,
    render: () => { calls.render++; },
    alert: (m) => { calls.alerts.push(String(m)); },
    confirm: () => true,
    log: () => {},
    yahmaErr: () => {},
    fleet: [],
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => []
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  const ctx = vm.createContext(sandbox);
  ['core/router-payments.js', 'core/router-payments-item.js', 'core/router-payments-bulk.js'].forEach((rel) => {
    const file = path.join(ROOT, rel);
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  });
  return { sandbox, payments, calls, ctx };
}

function seedStage(payments, car, stage) {
  payments._rows = [];
  if (stage === 'renewals') return;
  const row = { id: 'p-' + car.id, carId: String(car.id), status: stage === 'payments' ? 'pending' : 'paid', plate: car.plate, note: '' };
  if (stage === 'renewed') row.note = 'تم التجديد 2026-01-01';
  payments._rows.push(row);
}

const STAGES = ['renewals', 'payments', 'paid', 'renewed'];

test('payMoveOne بيوصل لأي مرحلة من أي مرحلة (16 تركيبة)', async () => {
  const { sandbox, payments } = bootCycle();
  assert.strictEqual(typeof sandbox.payMoveOne, 'function', 'payMoveOne مش متاحة');
  for (const from of STAGES) {
    for (const to of STAGES) {
      const car = { id: 'car-' + from, plate: 'TEST-' + from, inspectionStatus: 'سليم', licenseExpiry: '2020-01-01', licenseStatus: 'منتهي' };
      seedStage(payments, car, from);
      const res = await sandbox.payMoveOne(car, to);
      if (from === to) {
        assert.strictEqual(res, 'skipped', from + '→' + to + ' المفروض skipped');
      } else {
        assert.strictEqual(res, 'done', from + '→' + to + ' رجّع ' + res);
      }
      assert.strictEqual(sandbox.payStageOf(car.id), to, from + '→' + to + ' وقفت في ' + sandbox.payStageOf(car.id));
      if (to === 'renewals' && from !== to) {
        assert.strictEqual(car.inspectionStatus, 'لم يفحص', 'الرجوع للفحص لازم يرجّع الحالة «لم يفحص»');
      }
    }
  }
});

test('النقل لقدام بيحفظ حالة الفحص والرخصة (مش بيكتب وخلاص)', async () => {
  const { sandbox, payments } = bootCycle();
  const car = { id: 'car-x', plate: 'X-1', inspectionStatus: 'لم يفحص', licenseExpiry: '2020-01-01', licenseStatus: 'منتهي' };
  seedStage(payments, car, 'renewals');
  await sandbox.payMoveOne(car, 'renewed');
  assert.strictEqual(sandbox.payStageOf(car.id), 'renewed');
  assert.ok(car.licenseExpiry !== '2020-01-01', 'التجديد مش كتب تاريخ رخصة جديد');
  assert.strictEqual(car.licenseStatus, 'نشط', 'حالة الرخصة المفروض تبقى «نشط» بعد التجديد');
});

