/* اختبارات طبقة الصلاحيات بعد فتح التعديل لـ«مشاهدة».
   نفس نهج باقي الاختبارات: بنحمّل الملف الحقيقي في sandbox. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function loadPerms(role, opts) {
  const sandbox = {
    console,
    currentRole: role,
    _demoMode: !!(opts && opts.demo),
    yahmaGetTab: function () { return (opts && opts.tab) || 'fleet'; }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync(path.join(ROOT, 'core', 'permissions.js'), 'utf8'),
    sandbox,
    { filename: 'permissions.js' }
  );
  return sandbox.YahmaPerms;
}

test('«مشاهدة» بقت تعدّل في تبويب الأسطول', () => {
  const p = loadPerms('view', { tab: 'fleet' });
  assert.strictEqual(p.canManage(), true, 'canManage مفتوح');
  assert.strictEqual(p.inTab('fleet'), true, 'الأسطول مسموح');
  assert.strictEqual(p.canEditNow(), true, 'canEditNow في تبويب الأسطول');
});

test('«مشاهدة» تفضل مقفولة في باقي التبويبات', () => {
  const p = loadPerms('view', { tab: 'renewals' });
  assert.strictEqual(p.inTab('renewals'), false, 'دورة الدفع شغل تشغيل');
  assert.strictEqual(p.canEditNow(), false, 'ما فيش تعديل في تبويب الفحص');
  ['payments', 'paid', 'renewed', 'audit', 'transfers', 'branches'].forEach((t) => {
    assert.strictEqual(p.inTab(t), false, t + ' مقفول');
  });
});

test('«مشاهدة» ما تقدرش تحذف في أي تبويب', () => {
  const fleet = loadPerms('view', { tab: 'fleet' });
  assert.strictEqual(fleet.canBulk(), true, 'يقدر يحدد ويستخدم إجراءات جماعية');
  assert.strictEqual(fleet.canDelete(), false, 'الحذف ممنوع');
  assert.strictEqual(fleet.canAdminister(), false, 'إدارة المستخدمين ممنوعة');
  ['renewals', 'payments', 'transfers'].forEach((t) => {
    assert.strictEqual(loadPerms('view', { tab: t }).canDelete(), false, t + ': الحذف ممنوع');
  });
});

test('الحذف للمدير بس — الدنيا التانية مالها', () => {
  assert.strictEqual(loadPerms('admin', { tab: 'fleet' }).canDelete(), true);
  assert.strictEqual(loadPerms('manager', { tab: 'fleet' }).canDelete(), false);
  assert.strictEqual(loadPerms('ops', { tab: 'renewals' }).canDelete(), false);
  assert.strictEqual(loadPerms('view', { tab: 'fleet' }).canDelete(), false);
});

test('«تشغيل» ماسكةش دورة الدفع زي ما هي', () => {
  const p = loadPerms('ops', { tab: 'renewals' });
  assert.strictEqual(p.canEditNow(), true, 'بيعدّل في الفحص');
  assert.strictEqual(p.canBulk(), true, 'الشريط الجماعي ظاهر');
  assert.strictEqual(loadPerms('ops', { tab: 'fleet' }).canEditNow(), false, 'مش بيعدّل في الأسطول');
});

test('«إداري» و«مدير» مفيهم منع', () => {
  ['admin', 'manager'].forEach((r) => {
    const p = loadPerms(r, { tab: 'fleet' });
    assert.strictEqual(p.canManage(), true);
    assert.strictEqual(p.canBulk(), true);
    ['fleet', 'renewals', 'payments', 'transfers', 'reports', 'audit'].forEach((t) => {
      assert.strictEqual(p.inTab(t), true, r + ' × ' + t);
    });
  });
});

test('دور مش معروف بيتعامل معاه كـ«مشاهدة» مش كـ«إداري»', () => {
  const p = loadPerms('superuser', { tab: 'fleet' });
  assert.strictEqual(p.role(), 'view', 'مش معروف ← view');
  assert.strictEqual(p.canEditNow(), true, 'يدخل تبويب الأسطول زي المشاهدة');
  assert.strictEqual(p.canDelete(), false, 'ومفيش صلاحية إضافية');
});

test('الوضع التجريبي بيفتح كل حاجة زي الأول', () => {
  const p = loadPerms('view', { tab: 'audit', demo: true });
  assert.strictEqual(p.canEditNow(), true);
  assert.strictEqual(p.canDelete(), true);
  assert.strictEqual(p.canAdminister(), true);
});

test('قائمة تبويبات «مشاهدة» مقيّدة بنوعها', () => {
  const p = loadPerms('view', { tab: 'fleet' });
  assert.ok(Array.isArray(p.VIEW_EDIT_TABS));
  assert.strictEqual(p.VIEW_EDIT_TABS.indexOf('fleet') >= 0, true, 'الأسطول موجود');
  assert.strictEqual(p.VIEW_EDIT_TABS.indexOf('renewals'), -1, 'الفحص مش موجود');
});

/* الواجهة والقاعدة لازم يتفقوا على نفس الأعمدة المحمية.
   لو القاعدة رفضت عمود والواجهة سمحت بيه، المستخدم بيخسر الحفظ كله
   مش العمود بس. الاختبار ده بيمنع القائمتين ينفصلوا. */
test('حقول النموذج المحمية مطابقة لـtrigger في القاعدة', () => {
  const form = fs.readFileSync(path.join(ROOT, 'modules', 'vehicle-form.js'), 'utf8');
  const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'user-edit-access.sql'), 'utf8');
  const list = /const PROTECTED = \[([\s\S]*?)\n  \];/.exec(form);
  assert.ok(list, 'قائمة PROTECTED موجودة في النموذج');
  /* المسافات في الـSQL متظبطة للمحاذاة — بنطبّعها قبل المقارنة
     عشان الاختبار يبقى عن المعنى مش عن المسافات. */
  const sqlFlat = sql.replace(/\s+/g, ' ');
  const fields = [...list[1].matchAll(/field:\s*'([A-Za-z]+)'/g)].map((m) => m[1]);
  assert.ok(fields.length >= 10, 'القائمة فيها الحقول الأساسية');
  /* تحويل camelCase لعمود مش صحيح هنا: ownernumber ميكتبة من غير
     فاصل. فاستخدمنا الخريطة الصريحة من ترحيل القاعدة نفسه. */
  const COLUMN = {
    plate: 'plate', brand: 'brand', type: 'type', model: 'model', serial: 'serial',
    owner: 'owner', ownerNumber: 'ownernumber', branch: 'branch', carStatus: 'carstatus',
    dailyRate: 'dailyrate', rentedDaysMonth: 'renteddays', maintenanceCost: 'maintenancecost'
  };
  fields.forEach((f) => {
    const column = COLUMN[f];
    assert.ok(column, 'في خريطة عمود لـ ' + f);
    assert.ok(sqlFlat.includes('new.' + column + ' is distinct from old.' + column),
      'العمود ' + column + ' محمي في trigger القاعدة');
  });
  /* حقول jsonb-بس ما ليها عمود — لازم نتأكد إنها مش متسابتش */
  ['monthlyRate', 'minMonthlyRate', 'chassisNo', 'gps'].forEach((f) => {
    assert.ok(fields.indexOf(f) === -1, f + ' مالها عمود — ما تتحمّلهاش كحقل محمي');
  });
});

/* الباج ده رجع فعلاً: كنا بنقفل بـreadOnly بس، والـselect
   مالهوش readOnly — فحقول زي «حالة السيارة» و«حالة التأمين»
   كانت بتفضل قابلة للتغيير. الاختبار بيمنع رجوعه. */
test('قفل الحقول بيغطي الـselect كمان مش الـinput بس', () => {
  const form = fs.readFileSync(path.join(ROOT, 'modules', 'vehicle-form.js'), 'utf8');
  assert.ok(/isSelect\s*\?\s*el\.disabled/.test(form.replace(/\s+/g, ' '))
    || /el\.disabled\s*=\s*!editable/.test(form),
  'الـselect بيقفل بـdisabled');
  assert.ok(/isLocked/.test(form), 'في دالة isLocked للحالة');
});