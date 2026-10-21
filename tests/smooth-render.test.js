/* ===== tests/smooth-render.test.js — حارس الرسم المعلّق =====

   ⚠️ العطل (من فحص مباشر على الإنتاج):
      المستخدم يضغط تبويب، الـcurrentTab بيتغيّر في البيانات،
      بس الشاشة بتفضل على التبويب القديم. مفيش أي خطأ بيطلع.

   السبب: modules/smooth.js كان فيه حارس `renderBusy` بيـيسقط أي
   رسم جاي في أول إطار بعد رسم تاني:
      if(renderBusy){ pendingRender = true; return; }
   وبعدين `release` كان بيمسح pendingRender من غير ما ينفّذه:
      pendingRender = false;
   فالرسم كان بيضيع للأبد.

   الإصلاح: نحفظ الـrender المعلّق (مع الـthis والـarguments) وننفّذه
   مرة واحدة لما يخلص الحالي، مع حد أقصى للإعادات (MAX_BURST) عشان
   مفيش حلقة لانية.

   الاختبار ده **تشغيلي**: بيحمّل modules/smooth.js في رمل، ويجيب
   window.render وهمي، وبعدين يتحقق إن الرسم المعلّق بيتنفّذ فعلاً. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

/* بنحمّل smooth.js في رمل لوحده مع stubs بسيطة.
   makeRender: اختياري — دالة الرسم الوهمية (بتتلف قبل تحميل smooth.js). */
function loadSmooth(makeRender) {
  const rafQueue = [];
  const timers = [];

  const sandbox = {
    console,
    Date,
    Math,
    JSON,
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    clearTimeout: () => {},
    requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length; }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;

  /* الـdocument اللي smooth.js بيحتاجه */
  sandbox.document = {
    readyState: 'complete',
    addEventListener: () => {},
    getElementById: () => null
  };

  let calls = 0;
  const base = makeRender || function () { calls++; return calls; };
  sandbox.window.render = base;

  const context = vm.createContext(sandbox);
  const file = path.join(ROOT, 'modules', 'smooth.js');
  const code = fs.readFileSync(file, 'utf8');
  vm.runInContext(code, context, { filename: file });

  return {
    sandbox,
    get calls() { return calls; },
    base,
    flushRaf() { while (rafQueue.length) rafQueue.shift()(); },
    flushTimers() { while (timers.length) timers.shift()(); }
  };
}

/* ===== 1) الحارس لسه موجود (مش هنلغي التحسين) ===== */
test('smooth.js: لسه بيمنع الرسم المتكرر (الحارس شغال)', () => {
  const s = loadSmooth();
  s.sandbox.window.render();
  const afterFirst = s.calls;
  assert.equal(afterFirst, 1, 'أول رسم لازم ينفّذ');
  /* التاني في نفس اللحظة — لازم يتسجّل بس ما ينفّذش فوراً */
  s.sandbox.window.render();
  assert.equal(s.calls, 1, 'الرسم الثاني لازم يتأجل (ما ينفّذش وهو busy)');
});

/* ===== 2) الرسم المعلّق لازم ينفّذ بعد مايخلص ===== */
test('smooth.js: الرسم المعلّق بيتنفّذ — مش بيتسقط', () => {
  const s = loadSmooth();
  s.sandbox.window.render();          // الأول — ينفّذ
  s.sandbox.window.render();          // التاني — يتأجل
  assert.equal(s.calls, 1, 'قبل الإفراج: لسه واحد');
  s.flushRaf();                       // الإطار الجاي → release
  assert.equal(s.calls, 2,
    'الرسم المعلّق لازم ينفّذ بعد الإفراج — قبل كنا بنمسحه وبنضيّعه');
});

/* ===== 3) مفيش حلقة رسم لانية ===== */
test('smooth.js: مفيش حلقة رسم لانية', () => {
  let calls = 0;
  const s = loadSmooth(function () {
    calls++;
    /* أسوأ حالة: الرسم يطلب رسم تاني من جوه نفسه */
    if (calls < 500) s.sandbox.window.render();
    return calls;
  });
  s.sandbox.window.render();
  for (let i = 0; i < 30; i++) { s.flushRaf(); s.flushTimers(); }
  assert.ok(calls < 100,
    'لازم يوقف عند حد (MAX_BURST) — عدد النداءات: ' + calls);
});

/* ===== 4) الـarguments بتوصل صح للـrender المؤجل ===== */
test('smooth.js: الرسم المؤجل بيستقبل نفس الـarguments', () => {
  const s = loadSmooth();
  const seen = [];
  const base = s.sandbox.window.render;
  s.sandbox.window.render = function () {
    seen.push(Array.prototype.slice.call(arguments));
    return base.apply(this, arguments);
  };
  s.sandbox.window.render('rentals', 42);     // ينفّذ فوراً
  s.sandbox.window.render('dashboard', 7);    // يتأجل (التبويب الجديد)
  s.flushRaf();                               // الإفراج → ينفّذ المؤجل
  assert.ok(seen.length >= 2, 'لازم ينفّذ الرسمين');
  assert.deepEqual(seen[seen.length - 1], ['dashboard', 7],
    'الرسم المؤجل لازم يوصل بنفس الـarguments — مش القديم');
});
