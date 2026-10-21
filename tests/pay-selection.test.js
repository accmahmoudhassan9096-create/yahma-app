/* ===== عقد التحديد الجماعي في تبويبات الدفع =====

   ⭐ الإصلاح الجذري (2026-10-21):
   - الـlisteners اتنقلت من tbody (بيتدمر كل render) لـcontent (بيفضل موجود)
   - الـclick handler بيشتغل على الـcheckbox مباشرة:
     المتصفح بيقلب checked قبل click، فنقرأها مباشرة بدون setTimeout
   - مش بنستنى change event (بيجي بتأخير على الموبايل)

   الاختبارات بتقفل العقد ده على الكود نفسه */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SRC = noComments(read('core/router-payments.js'));

test('منطق التحديد في دالة واحدة بس — applyPayCheck', () => {
  /* الـSet بيتحدّث في مكان واحد فقط: applyPayCheck */
  const addCalls = (SRC.match(/set\.add\(/g) || []).length;
  const delCalls = (SRC.match(/set\.delete\(/g) || []).length;
  assert.strictEqual(addCalls, 1,
    'set.add بيتنادى ' + addCalls + ' مرات — المفروض مرة واحدة (في applyPayCheck)');
  assert.strictEqual(delCalls, 1,
    'set.delete بيتنادى ' + delCalls + ' مرات — المفروض مرة واحدة (في applyPayCheck)');
});

test('الـguard بيتحط على content مش tbody (بيفضل بعد كل render)', () => {
  assert.ok(/content\._paySelectDelegate/.test(SRC),
    'الـguard لازم يكون على content._paySelectDelegate');
  assert.ok(!/tbody\._paySelectDelegate/.test(SRC),
    'tbody._paySelectDelegate ما المفروضش يكون موجود — tbody بيتدمر كل render');
});

test('الـclick handler على content مش tbody', () => {
  assert.ok(/content\.addEventListener\('click'/.test(SRC),
    'الـclick handler لازم يكون على content');
  assert.ok(!/tbody\.addEventListener\('click'/.test(SRC),
    'ما المفروضش يكون click listener على tbody');
});

test('الـclick handler بيعالج الـcheckbox مباشرة (بدون استنياء change)', () => {
  const clickHandler = /content\.addEventListener\('click'[\s\S]*?\n  \}\);/.exec(SRC);
  assert.ok(clickHandler, 'الـclick handler على content مفقود');
  const body = clickHandler[0];
  /* لازم يعالج الـcheckbox مباشرة — بيقرأ checked بعد ما المتصفح يقلبها */
  assert.ok(/closest\('input\[data-pay-check\]'\)/.test(body),
    'الـclick handler لازم يفحص لو الهدف checkbox');
  assert.ok(/applyPayCheck\(box\)/.test(body),
    'الـclick handler لازم ينادي applyPayCheck على الـcheckbox مباشرة');
});

test('applyPayCheck بتضيف/تحذف حسب checked — مش toggle عشوائي', () => {
  const fn = /function applyPayCheck\(box\)\s*\{[\s\S]*?\n    \}/.exec(SRC);
  assert.ok(fn, 'applyPayCheck(box) مفقودة');
  const body = fn[0];
  assert.ok(/if \(box\.checked\) set\.add\(id\); else set\.delete\(id\);/.test(body),
    'لازم: checked → add، غير checked → delete');
  assert.ok(!/set\.has\(id\)/.test(body),
    'ما استخدامش set.has — التحديد المتعدد بيتكسر');
  assert.ok(/classList\.toggle\('is-selected'/.test(body),
    'لازم الصف يتلوّن is-selected');
});

test('صف الـcheckbox بيتحدّث مع التحديد', () => {
  const fn = /function applyPayCheck\(box\)\s*\{[\s\S]*?\n    \}/.exec(SRC);
  assert.ok(fn, 'applyPayCheck مفقودة');
  assert.ok(/is-selected/.test(fn[0]), 'الصف لازم يتلوّن');
});

test('الـhead checkbox بيحدد الكل وبيشيل الكل', () => {
  assert.ok(/PAY_SELECTIONS\[tab\] = head\.checked \? new Set\(all\) : new Set\(\);/.test(SRC),
    'الهيدر لازم يحدد الكل (أو يشيله)');
  assert.ok(/selCount > 0 && selCount < allCount/.test(SRC),
    'الهيدر لازم يبقى indeterminate لو جزء محدد (selCount)');
});

test('التحديدات بتتبقى بعد البحث (الفلتر ما بيمسحش الـSet)', () => {
  const draw = /function draw\(\)\s*\{[\s\S]*?\n  \}/.exec(SRC);
  assert.ok(draw, 'draw() مفقودة');
  assert.ok(!/PAY_SELECTIONS\[[^\]]+\]\s*=\s*new Set\(\)/.test(draw[0]),
    'draw() ما بتمسحش التحديدات');
});
