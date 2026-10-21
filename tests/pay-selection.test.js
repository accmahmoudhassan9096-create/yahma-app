/* ===== عقد التحديد الجماعي في تبويبات الدفع =====

   ⭐ الإصلاح الجذري (2026-10-21):
   الـlisteners اتنقلت من tbody (بيتدمر كل render) لـcontent (بيفضل موجود).
   ده حلّ مشكلة «لازم ضغطتين» ومشكلة «بس آخر سيارة بتتحدد».

   الاختبارات دي بتقفل العقد ده على الكود نفسه — زي باقي اختبارات
   الـrouter (مفيش DOM implementation في المشروع). */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SRC = noComments(read('core/router-payments.js'));

test('منطق التحديد في دالة واحدة بس — مش اتنين بيقلبوا نفس الـSet', () => {
  /* الـSet بيتحدّث في مكان واحد فقط: applyPayCheck */
  const addCalls = (SRC.match(/set\.add\(/g) || []).length;
  const delCalls = (SRC.match(/set\.delete\(/g) || []).length;
  assert.strictEqual(addCalls, 1,
    'set.add بيتنادى ' + addCalls + ' مرات — المفروض مرة واحدة (في applyPayCheck)');
  assert.strictEqual(delCalls, 1,
    'set.delete بيتنادى ' + delCalls + ' مرات — المفروض مرة واحدة (في applyPayCheck)');
});

test('الـclick handler بيخرج لو الهدف هو الـcheckbox نفسه', () => {
  /* الإصلاح الجذري: الـlisteners على content مش tbody —
     عشان يفضلوا بعد كل render. */
  const clickHandler = /content\.addEventListener\('click'[\s\S]*?\n  \}\);/.exec(SRC);
  assert.ok(clickHandler, 'الـclick handler على content مفقود');
  const body = clickHandler[0];
  assert.ok(/closest\('input\[data-pay-check\]'\)\) return;/.test(body),
    'الـclick handler لازم يخرج فوراً لو الهدف هو الـcheckbox');
});

test('الـchange handler بيحدّث التحديد من الحالة المرئية (checked)', () => {
  /* الإصلاح: الـlisteners على content مش tbody */
  const changeHandler = /content\.addEventListener\('change', function \(e\) \{[\s\S]*?\n {4}\}\);/.exec(SRC);
  assert.ok(changeHandler, 'الـchange handler على content مفقود');
  const body = changeHandler[0];
  assert.ok(/applyPayCheck\(box\)/.test(body),
    'الـchange handler لازم ينادي applyPayCheck(box)');
});

test('applyPayCheck بتضيف/تحذف حسب checked — مش toggle عشوائي', () => {
  /* الـsignature الجديدة: applyPayCheck(box) — بتاخد box بس،
     والـtab والـid بتتجيب من box.dataset */
  const fn = /function applyPayCheck\(box\)\s*\{[\s\S]*?\n    \}/.exec(SRC);
  assert.ok(fn, 'applyPayCheck(box) مفقودة');
  const body = fn[0];
  assert.ok(/if \(box\.checked\) set\.add\(id\); else set\.delete\(id\);/.test(body),
    'لازم: checked → add، غير checked → delete');
  /* التحديدات المتعددة لازم تفضل — يعني add/delete مش toggle */
  assert.ok(!/set\.has\(id\)/.test(body),
    'لازم ما uses set.has — التحديد المتعدد بيتكسر');
  /* والصف لازم يتلوّن */
  assert.ok(/classList\.toggle\('is-selected'/.test(body),
    'لازم الصف يتلوّن is-selected');
});

test('صف الـcheckbox بيتحدّث مع التحديد (مش بس الـcheckbox)', () => {
  const fn = /function applyPayCheck\(box\)\s*\{[\s\S]*?\n    \}/.exec(SRC);
  assert.ok(fn, 'applyPayCheck مفقودة');
  assert.ok(/is-selected/.test(fn[0]), 'الصف لازم يتلوّن');
});

test('الـhead checkbox بيحدد الكل وبيشيل الكل', () => {
  assert.ok(/PAY_SELECTIONS\[tab\] = head\.checked \? new Set\(all\) : new Set\(\);/.test(SRC),
    'الهيدر لازم يحدد الكل (أو يشيله)');
  /* الإصلاح: payBulkBarHtml بتستخدم selCount (من PAY_SELECTIONS.size) مش items.length */
  assert.ok(/selCount > 0 && selCount < allCount/.test(SRC),
    'الهيدر لازم يبقى indeterminate لو جزء محدد (selCount)');
});

test('التحديدات بتتبقى بعد البحث (الفلتر ما بيمسحش الـSet)', () => {
  /* draw() بتعيد بناء الصفوف — لازم ما تلمسش PAY_SELECTIONS */
  const draw = /function draw\(\)\s*\{[\s\S]*?\n  \}/.exec(SRC);
  assert.ok(draw, 'draw() مفقودة');
  assert.ok(!/PAY_SELECTIONS\[[^\]]+\]\s*=\s*new Set\(\)/.test(draw[0]),
    'draw() ما بتمسحش التحديدات — غير كده البحث بيمسح كل حاجة');
});

test('الـguard بيتحط على content مش tbody (بيفضل بعد كل render)', () => {
  /* الإصلاح الجذري: content._paySelectDelegate مش tbody._paySelectDelegate */
  assert.ok(/content\._paySelectDelegate/.test(SRC),
    'الـguard لازم يكون على content._paySelectDelegate');
  assert.ok(!/tbody\._paySelectDelegate/.test(SRC),
    'tbody._paySelectDelegate ما المفروضش يكون موجود — tbody بيتدمر كل render');
});
