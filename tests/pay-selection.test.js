/* ===== عقد التحديد الجماعي في تبويبات الدفع =====

   ⭐ العطل اللي اتصلح (2026-10-18):
   كان في تبويب «تحت الدفع» الـclick والـchange handlerين الاتنين
   بيقلبوا نفس الـSet. والـclick handler كان بيقفل التحديد غلط لأن
   المتصفح بيقلب حالة الـcheckbox *بعد* الـclick handlers (في Chrome
   الـchange event بيطلق بـchecked قديم).

   النتيجة اللي المستخدم شافها:
     - لازم يضغط مرتين عشان يحدد السيارة
     - لما يحدد أكتر من سيارة، غير الأخيرة ما بتتحددش
     - البحث بيمسح كل التحديدات

   الإصلاح: منطق واحد في دالة واحدة (applyPayCheck)، والـclick handler
   بيخرج فوراً لو الهدف هو الـcheckbox نفسه (المتصفح بيتولّى التحويل).

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
  /* ده اللي بيمنع التحديد المزدوج: المتصفح بيتولّى تحويل الـcheckbox،
     فلو الـhandler عمل toggle كمان — التحديد بينقلب مرتين. */
  const clickHandler = /tbody\.addEventListener\('click',[\s\S]*?\n  \}\);/.exec(SRC);
  assert.ok(clickHandler, 'الـclick handler مفقود');
  const body = clickHandler[0];
  assert.ok(/closest\('input\[data-pay-check\]'\)\)\s*return;/.test(body),
    'الـclick handler لازم يخرج فوراً لو الهدف هو الـcheckbox (سطر 672)');
});

test('الـchange handler بيحدّث التحديد من الحالة المرئية (checked)', () => {
  const changeHandler = /tbody\.addEventListener\('change', function \(e\) \{[\s\S]*?\n {4}\}\);/.exec(SRC);
  assert.ok(changeHandler, 'الـchange handler مفقود');
  const body = changeHandler[0];
  assert.ok(/applyPayCheck\(box, box\.dataset\.payTab/.test(body),
    'الـchange handler لازم ينادي applyPayCheck');
});

test('applyPayCheck بتضيف/تحذف حسب checked — مش toggle عشوائي', () => {
  const fn = /function applyPayCheck\(box, tab, id\)\s*\{[\s\S]*?\n  \}/.exec(SRC);
  assert.ok(fn, 'applyPayCheck مفقودة');
  const body = fn[0];
  assert.ok(/if \(box\.checked\) set\.add\(id\); else set\.delete\(id\);/.test(body),
    'لازم: checked → add، غير checked → delete');
  /* التحديدات المتعددة لازم تفضل — يعني add/delete مش toggle */
  assert.ok(!/set\.has\(id\)/.test(body),
    'لازم ما Uses set.has — التحديد المتعدد بيتكسر');
  /* والصف لازم يتلوّن */
  assert.ok(/classList\.toggle\('is-selected'/.test(body),
    'لازم الصف يتلوّن is-selected');
});

test('صف الـcheckbox بيتحدّث مع التحديد (مش بس الـcheckbox)', () => {
  const fn = /function applyPayCheck\(box, tab, id\)\s*\{[\s\S]*?\n  \}/.exec(SRC);
  assert.ok(fn, 'applyPayClick مفقودة');
  assert.ok(/is-selected/.test(fn[0]), 'الصف لازم يتلوّن');
});

test('الـhead checkbox بيحدد الكل وبيشيل الكل', () => {
  assert.ok(/PAY_SELECTIONS\[tab\] = head\.checked \? new Set\(all\) : new Set\(\);/.test(SRC),
    'الهيدر لازم يحدد الكل (أو يشيله)');
  assert.ok(/head\.indeterminate = items\.length > 0 && items\.length < allCount;/.test(SRC),
    'الهيدر لازم يبقى indeterminate لو جزء محدد');
});

test('التحديدات بتتبقى بعد البحث (الفلتر ما بيمسحش الـSet)', () => {
  /* draw() بتعيد بناء الصفوف — لازم ما تلمسش PAY_SELECTIONS */
  const draw = /function draw\(\)\s*\{[\s\S]*?\n  \}/.exec(SRC);
  assert.ok(draw, 'draw() مفقودة');
  assert.ok(!/PAY_SELECTIONS\[[^\]]+\]\s*=\s*new Set\(\)/.test(draw[0]),
    'draw() ما بتمسحش التحديدات — غير كده البحث بيمسح كل حاجة');
});
