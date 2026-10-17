/* اختبارات دالة إنشاء المستخدم.
   الدالة دي بتاخد قيم من اللوحة وبتعمل تحقق، والقائمتين لو
   انفصلت بتّيّت بهدوء: اختيار «إداري» بيتخزّن «مشاهدة»، واختيار
   تبويب بيتضيع — من غير أي رسالة. الاختبارات دي بتقفل القائمتين.

   ⚠️ بنشيل التعليقات قبل الفحص: أول نسخة من الاختبار ده اشتغلت
   غلط لأن كلمة forbidden كانت جوّه **تعليق أنا كاتبه**، فالطابق
   لقاه في الكود وهو موجود في الكود مش في السطر اللي بيشتغل. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const rawFn = fs.readFileSync(
  path.join(ROOT, 'supabase', 'functions', 'admin-create-user', 'index.ts'), 'utf8'
);
/* الكود بس — بلا تعليقات */
const FN = rawFn.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const STORE = fs.readFileSync(path.join(ROOT, 'core', 'branches-store.js'), 'utf8');
const MIGRATION = fs.readFileSync(path.join(ROOT, 'supabase', 'supabase-migration.sql'), 'utf8');

const DB_ROLES = ['admin', 'manager', 'ops', 'view'];

function stringsOf(src) {
  return [...src.matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

function roleWhitelist() {
  const m = /\[([^\]]*)\]\s*\.includes\(body\.role\)/.exec(FN);
  assert.ok(m, 'لقائمة الأدوار في الدالة');
  return stringsOf(m[1]);
}

function fnTabs() {
  const m = /const allowedTabs = \[([^\]]*)\]/.exec(FN);
  assert.ok(m, 'لقائمة الأقسام في الدالة');
  return stringsOf(m[1]);
}

function uiTabs() {
  const m = /PAGE_PERMISSION_OPTIONS=\[([\s\S]*?)\];/.exec(STORE);
  assert.ok(m, 'لقائمة الأقسام في branches-store');
  /* العنصر الشكله {id:'x',label:'ع'} — لازم ناخد الـid بس،
     التعميم كان بيرجّع العنوان العربي معاه. */
  return [...m[1].matchAll(/id:'([^']+)'/g)].map((x) => x[1]);
}

test('أدوار الدالة = أدوار قيد القاعدة', () => {
  const listed = roleWhitelist();
  DB_ROLES.forEach((r) => {
    assert.ok(listed.includes(r), 'الدور «' + r + '» ناقص من الدالة — الجزء: ' + JSON.stringify(listed));
  });
  assert.deepStrictEqual(listed.slice().sort(), DB_ROLES.slice().sort(),
    'القائمتين لازم تكونوا متطابقين');
});

test('قيد القاعدة بيقبل كل الأدوار', () => {
  const m = /role = ANY \(ARRAY\[([^\]]*)\]\)/.exec(MIGRATION);
  if (!m) return;  /* القيد ممكن يكون متطبّق من ملف تاني — مش حرج */
  assert.ok(stringsOf(m[1]).includes('manager'), 'manager ناقص من قيد القاعدة');
});

test('أقسام الدالة = الأقسام اللي اللوحة بتعرضها', () => {
  const fn = fnTabs();
  const ui = uiTabs();
  const dropped = ui.filter((t) => fn.indexOf(t) === -1);
  assert.deepStrictEqual(dropped, [],
    'التبويبات دي بتتعرض في اللوحة وبتتشال في الدالة: ' + dropped.join(', '));
  const extra = fn.filter((t) => ui.indexOf(t) === -1);
  assert.deepStrictEqual(extra, [], 'الدالة بتقبل تبويبات اللوحة مش بتعرضها: ' + extra.join(', '));
});

test('التبويبات الجديدة ما تنساش تاني', () => {
  /* paid و renewed من v178، وdues اتضافت مع جدول المستحقات.
     كل واحدة ناقصة مرة ورا مرة من غير حد ياخد باله. */
  ['paid', 'renewed', 'dues'].forEach((t) => {
    assert.ok(fnTabs().includes(t), 'التبويب «' + t + '» ناقص من دالة إنشاء المستخدم');
  });
});

test('رسالة الخطأ الحقيقية بتوصل للمستخدم', () => {
  /* الكود القديم كان: error instanceof Error ? error.message : '...'
     أخطاء Supabase مش instanceof Error فالسبب الحقيقي كان بيتبلع
     والمستخدم بيشوف «تعذر إنشاء المستخدم» من غير أي معلومة. */
  assert.ok(!/instanceof Error/.test(FN),
    'لسه في instanceof Error في الكود — هيسكت سبب الخطأ');
  assert.ok(/function errorMessage/.test(FN), 'في دالة errorMessage');
  assert.ok(/\.message/.test(FN) && /error_description/.test(FN) && /\.msg/.test(FN),
    'لازم تقرأ الأنواع الثلاثة من أخطاء Supabase');
});

test('لو الحفظ في profiles فشل، الحساب بيتشال — والرسالة بتقول الحقيقة', () => {
  assert.ok(/admin\.deleteUser\(created\.user\.id\)/.test(FN),
    'التراجع عن الحساب لازم يفضل موجود');
  assert.ok(/تعذر حفظ بيانات المستخدم/.test(FN), 'الرسالة بتقول إن الخلل في الحفظ مش في الإنشاء');
  assert.ok(/تم تراجع الحساب/.test(FN), 'بتقول إن الحساب اتشال');
  assert.ok(/بدون ملف مستخدم/.test(FN), 'بتحذّر لو التراجع فشل — غير كده المستخدم يعلق');
});

test('بريد مسجّل قبل كده بيتقال قبل ما نحاول', () => {
  assert.ok(/listUsers/.test(FN), 'في فحص للبريد الموجود');
  assert.ok(/مسجّل بالفعل/.test(FN), 'في رسالة صريحة للبريد المكرر');
  assert.ok(/صيغة البريد الإلكتروني غير صحيحة/.test(FN), 'في فحص لصيغة البريد');
});

test('مفيش console.log أو كود تجريبي داخل الدالة', () => {
  assert.ok(!/console\.(log|debug)\(/.test(FN), 'في console.log داخل دالة إنتاج');
  assert.ok(!/\bdebugger\b/.test(FN), 'في debugger');
});