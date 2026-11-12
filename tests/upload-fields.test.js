/* ===== حقول رفع الشيت لكل تبويب =====

   طلب المستخدم: في تبويب التأمين، لما ترفع شيت تأمين لازم
   يتحدّث التأمين بس — مفيش لون ولا مدينة ولا مالك ولا فرع ولا
   حالة السيارة. قبل كده قائمة التأمين كانت فيها 9 حقول، فأي
   شيت ناقص كان بيكتب قيم فاضية/غلط في بيانات أساسية.

   الاختبار ده بيقفل العقد:
     ❶ كل قائمة رفع لازم كل حقل فيها يكون ليه تسمية عربية في
        رسالة التأكيد (مهمة قبلية موجودة في payment-cells.test.js).
     ❷ قائمة التأمين = حقول التأمين بس (3 حقول).
     ❸ مفيش حقل من حقول السيارة الأساسية (لون/مدينة/مالك/فرع/
        حالة السيارة) في قائمة التأمين.
     ❹ المنع الفعلي شغال: handleDomainUpdateFile بيحذف أي حقل
        بره القائمة من السطر قبل الدمج، فحتى لو الملف فيه أعمدة
        زائدة مش هتلمس السيارة. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function uploadFields() {
  const ren = noComments(read('modules/renewals-ui.js'));
  const m = /const UPLOAD_FIELDS = \{([\s\S]*?)\n  \};/.exec(ren);
  assert.ok(m, 'مالقتش UPLOAD_FIELDS في modules/renewals-ui.js');
  const out = {};
  [...m[1].matchAll(/(\w+)\s*:\s*\[([^\]]*)\]/g)].forEach((kv) => {
    out[kv[1]] = [...kv[2].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  });
  return out;
}

test('قائمة رفع التأمين = حقول التأمين بس', () => {
  const F = uploadFields();
  assert.ok(F.insurance, 'مفيش قائمة insurance');
  assert.deepStrictEqual(F.insurance.sort(),
    ['insuranceCompany', 'insuranceExpiry', 'insuranceStatus'],
    'قائمة التأمين لازم تكون حقول التأمين بس');
});

test('مفيش حقل أساسي (لون/مدينة/مالك/فرع/حالة السيارة) في قائمة التأمين', () => {
  const F = uploadFields();
  const forbidden = ['color', 'city', 'serial', 'owner', 'branch', 'carStatus',
    'inspectionStatus', 'licenseExpiry', 'licenseStatus', 'cardExpiry', 'cardStatus'];
  const hit = F.insurance.filter((f) => forbidden.includes(f));
  assert.deepStrictEqual(hit, [],
    'حقول كتير مينفعش تتلمس في تبويب التأمين:\n  ' + hit.join('\n  '));
});

test('قائمة الرخص والفحص لسه زي ما هي', () => {
  const F = uploadFields();
  assert.deepStrictEqual(F.license.sort(), ['licenseExpiry', 'licenseStatus']);
  assert.deepStrictEqual(F.inspection.sort(),
    ['accountNo', 'companyName', 'inspectionStatus', 'notes', 'serial']);
});

test('المنع الفعلي شغال — الحقول بره القائمة بتتشال قبل الدمج', () => {
  const imp = noComments(read('core/excel-import.js'));
  assert.ok(/const keep = new Set\(\['plate'\]\.concat\(fields\)\)/.test(imp),
    'handleDomainUpdate.js لازم يبني keep من القائمة');
  assert.ok(/Object\.keys\(record\.car\)\.forEach\(f=>\{ if\(!keep\.has\(f\)\) delete record\.car\[f\]; \}\)/.test(imp),
    'لازم يحذف الحقول بره keep من السطر');
  assert.ok(/record\.provided = \(record\.provided\|\|\[\]\)\.filter\(f=>keep\.has\(f\)\)/.test(imp),
    'لازم يفلتر provided على keep');
});
