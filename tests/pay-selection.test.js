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
/* دورة الدفع اتقسمت 6 ملفات — بنقرأهم كلهم */
const readRouter = () => ['core/router-payments.js','core/router-payments-item.js','core/router-payments-bulk.js',
 'core/router-payments-pending.js','core/router-payments-paid.js','core/router-payments-renewed.js']
  .map((rel) => read(rel)).join('\n');
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SRC = noComments(readRouter());

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

test('الـclick handler بيقرأ حالة الـcheckbox بعد ما المتصفح يقلبها', () => {
  /* ⭐ سبب «ضغطتين» بعد البحث:
     وقت الـclick handler، المتصفح (Chrome) لسه ما قلبش checkbox.checked.
     بيقلبها في "pre-click activation" بس الـproperty لسه قديمة وقت
     الـhandler. فالـhandler كان بيقرأ القيمة القديمة وبيعمل delete
     بدل add — فالضغط بيحتاج ضغطتين.

     خصوصاً بعد البحث: الجدول بيتعاد بناؤه، فالـcheckboxes الجديدة
     مالها checked attribute، فالحالة القديمة false دايماً.

     الحل: نأجّل قراءة الحالة لـsetTimeout(0) — بعد التحويل. */
  const clickHandler = /content\.addEventListener\('click'[\s\S]*?\n  \}\);/.exec(SRC);
  assert.ok(clickHandler, 'الـclick handler على content مفقود');
  const body = clickHandler[0];

  assert.ok(/closest\('input\[data-pay-check\]'\)/.test(body),
    'الـclick handler لازم يفحص لو الهدف checkbox');
  assert.ok(/applyPayCheckSoon\(box\)/.test(body),
    'الـclick handler لازم ينادي applyPayCheckSoon (المؤجلة) — مش applyPayCheck مباشرة');
  /* مسموح applyPayCheck(cb) في فرع "الضغط على مكان تاني في الصف" —
     لأننا نقلب cb.checked يدوياً قبل النداء. المهم إن مسار الـcheckbox
     نفسه ما يناديهاش مباشرةً. */
  const boxBranch = /if \(box\) \{[^}]*applyPayCheckSoon\(box\);[^}]*\}/.exec(body);
  assert.ok(boxBranch, 'فرع الـcheckbox (if (box) { ... }) مفقود');
  assert.ok(!/applyPayCheck\(box\)/.test(boxBranch[0]),
    'فرع الـcheckbox ما ينفعش ينادي applyPayCheck مباشرةً (بيقرأ حالة قديمة)');

  assert.ok(/function applyPayCheckSoon\(box\)\s*\{[\s\S]*?setTimeout\(/s.test(SRC),
    'applyPayCheckSoon لازم تؤجّل القراءة بـsetTimeout');
});

/* شبكة أمان: الـchange handler موجود وبيقرأ الحالة الصح */
test('فيه change handler كشبكة أمان بيقرأ الحالة بعد التحويل', () => {
  assert.ok(/content\.addEventListener\('change'/.test(SRC),
    'الـchange handler لازم يكون موجود — شبكة أمان لو الـclick اتخطّى');
  assert.ok(/applyPayCheck\(box\)/.test(
    /content\.addEventListener\('change'[\s\S]*?\n  \}\);/.exec(SRC)[0]
  ), 'الـchange handler لازم ينادي applyPayCheck');
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

/* ===== سبب «ضغطتين» الحقيقي: الضغط على الخلية مش على الـcheckbox =====

   المتصفح بيقلب الـchecked بس لما تضغط **على الـcheckbox نفسه**
   (pre-click activation). لو ضغطت على **الخلية** (الـtd) — وده
   اللي بيحصل على الموبايل لما الـcheckbox صغير — المتصفح **ما
   بيقلبش** خالص. فالـhandler لو قرا القيمة بعدين لقيها قديمة وبيعمل
   delete.

   الحل: نفرّق. ضغط على الـcheckbox → نقرأ بعد التحويل. ضغط على
   الخلية → نقلب بنفسنا. */
test('الضغط على الخلية يقلب التحديد — مش بس الضغط على الـcheckbox', () => {
  const src = readRouter();
  const clickHandler = /content\.addEventListener\('click'[\s\S]*?\n  \}\);/.exec(src);
  assert.ok(clickHandler, 'الـclick handler مفقود');
  const body = clickHandler[0];

  assert.ok(/if \(e\.target === box\)/.test(body),
    'لازم نفرّق: ضغط على الـcheckbox نفسه (e.target === box)');

  const boxBranch = /if \(e\.target === box\) \{[\s\S]*?\}\s*else \{[\s\S]*?\}\s*return;/.exec(body);
  assert.ok(boxBranch, 'التفرقة بين الـcheckbox والخلية مفقودة');

  assert.ok(/box\.checked\s*=\s*!box\.checked/.test(boxBranch[0]),
    'الضغط على الخلية لازم يقلب الـchecked بنفسنا — المتصفح ما بيقلبش');
  assert.ok(/applyPayCheck\(box\)/.test(boxBranch[0]),
    'بعد ما نقلب لازم نطبّق التحديد');
});

test('تبويب تحت الدفع يحتوي على فلتر الملاحظات (قائمة منسدلة + أزرار سريعة)', () => {
  const pendingCode = noComments(read('core/router-payments-pending.js'));
  assert.ok(pendingCode.includes('pay-note-payments'), 'قائمة الملاحظات pay-note-payments مفقودة');
  assert.ok(pendingCode.includes('pending-quick'), 'شريط الفلترة السريعة للملاحظات pending-quick مفقود');
  assert.ok(pendingCode.includes('__has_notes__'), 'خيار تصفية السيارات ذات الملاحظات مفقود');
  assert.ok(pendingCode.includes('__no_notes__'), 'خيار تصفية السيارات بدون ملاحظات مفقود');
  assert.ok(pendingCode.includes('getNotes'), 'دالة استخراج الملاحظات getNotes مفقودة');
});

