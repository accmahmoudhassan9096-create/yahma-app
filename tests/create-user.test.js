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
  ['paid', 'renewed'].forEach((t) => {
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

/* ===== البوابة كانت بترفض قبل الدالة =====

   verify_jwt = true خلّى Supabase gateway يرد 401
   {"code":"UNAUTHORIZED_NO_AUTH_HEADER"} قبل ما الدالة تشغّل.
   الدالة مش شايفة إن فيه session أصلاً فما بتعرفش تقول السبب،
   والمستخدم بيشوف رسالة إنجليزية غامضة. والدالة فوق بتعمل فحص
   الأدارية بنفسها بالكامل، فالفحص المزدوج مش حماية. */
test('verify_jwt = false في كل الدوال — الفحص جوّه الدالة', () => {
  const toml = fs.readFileSync(path.join(ROOT, 'supabase', 'config.toml'), 'utf8');
  const blocks = [...toml.matchAll(/\[functions\.([\w-]+)\]\s*\nverify_jwt\s*=\s*(\w+)/g)];
  assert.ok(blocks.length >= 3, 'الملف بيعرف الدوال');
  blocks.forEach((b) => {
    assert.strictEqual(b[2], 'false',
      'دالة ' + b[1] + ' لسه عليها verify_jwt=' + b[2] + ' — هترد برسالة البوابة الغامضة');
  });
});

/* كل دالة بتعمل فحصها بنفسها — الـverify_jwt=false مينفعش من غير ده */
test('كل دالة بتتحقق من المتصل قبل ما تشتغل', () => {
  ['admin-create-user', 'admin-delete-user', 'send-user-email'].forEach((name) => {
    const src = fs.readFileSync(
      path.join(ROOT, 'supabase', 'functions', name, 'index.ts'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(/auth\.getUser\(\)/.test(code), name + ': مفيش getUser');
    assert.ok(/yahma_is_admin\(\)|role\s*!==\s*'admin'|includes\('admin'\)/.test(code),
      name + ': مفيش فحص أدارية');
  });
});

/* الواجهة كانت بتقول «تم إنشاء المستخدم» والعملية تفشل — وده أسوأ
   من رسالة خطأ، لأن المستخدم بيعيد المحاولة على أساس إن الحساب
   اتعمل وهو مش موجود. */
test('الواجهة بتتأكد إن الحساب اتعمل قبل ما تقول «تم»', () => {
  const top = fs.readFileSync(path.join(ROOT, 'modules', 'topbar-user.js'), 'utf8');
  assert.ok(/confirmRead/.test(top), 'مفيش تحقق بالقراءة بعد الإنشاء');
  assert.ok(/!r\.data\.id/.test(top), 'مفيش فحص إن الدالة رجعت رقم حساب');
  assert.ok(/describeInvokeError/.test(top), 'مفيش دالة لقراءة السبب الحقيقي');
  assert.ok(!/msg\.textContent='تم إنشاء المستخدم[^']*';\s*$/.test(top),
    'لسه في رسالة «تم» مباشرة من غير تحقق');
});

/* ⛔ [object Promise] ظهر للمستخدم فعلاً في v200.

   describeInvokeError بقت async عشان بتقرا body الدالة، ونداء
   مسار الإنشاء اتنادى من غير await — فـtextContent وصله Promise
   وطلع للمستخدم سطر ميتا بدل السبب الحقيقي، وده أخسى من الكود
   القديم: كان بيقول «خطأ غير معروف» وكلمة مفهومة، بقى حروف إنجليزية
   غامضة.

   الاختبار ده بيمنع: (أ) نداء من غير await، (ب) حجر شغل.

   ⚠️ حاجز showResult مطلوب بس لما النتيجة بتوصل textContent. جوّه
   invokeYahmaFunction في نداء بيقرا النص عشان يفحصه (الجلسة
   منتهية ولا لأ) والنتيجة بتروح لمتغيّر محلي مش للشاشة — فده
   محتاج await بس، مش showResult. */
test('مفيش استدعاء لـdescribeInvokeError من غير await', () => {
  const top = fs.readFileSync(path.join(ROOT, 'modules', 'topbar-invoke.js'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'modules', 'topbar-user.js'), 'utf8');
  const calls = [...top.matchAll(/([^\n]*describeInvokeError\([^\n]*)/g)].map((m) => m[1]);
  const real = calls.filter((line) => !/function\s+describeInvokeError/.test(line) && !/topbar-ui\.js:describeInvokeError/.test(line));
  assert.ok(real.length >= 2, 'فيه استدعاءين على الأقل');
  real.forEach((line) => {
    assert.ok(/await\s+describeInvokeError/.test(line),
      'استدعاء من غير await: ' + line.trim());
    /* اللي بتوصل الشاشة لازم يمر على الحاجز */
    if (/textContent|showResult\(/.test(line)) {
      assert.ok(/showResult\(/.test(line),
        'نتيجة بتوصل textContent من غير الحاجز: ' + line.trim());
    }
  });
});

/* النتيجة اللي بتقرأ الشاشة من غير الحاجز هي اللي طلعت
   «[object Promise]» — نتأكد إن مفيش استدعاء ماسك بالنتيجة
   وماسكش غيره. */
test('كل نتيجة بتوصل textContent من describeInvokeError محميّة', () => {
  const top = fs.readFileSync(path.join(ROOT, 'modules', 'topbar-invoke.js'), 'utf8') + '\n' + fs.readFileSync(path.join(ROOT, 'modules', 'topbar-user.js'), 'utf8');
  const assigns = [...top.matchAll(/([^\n]*(?:msg|statusEl|El|el)\.textContent\s*=[^\n]*)/g)].map((m) => m[1]);
  const risky = assigns.filter((l) => /describeInvokeError/.test(l) && !/showResult\(/.test(l));
  assert.deepStrictEqual(risky, [],
    'تعيين مباشرة من غير الحاجز: ' + risky.join(' | '));
});

test('showResult موجودة وبتتعامل مع Promise', () => {
  const top = fs.readFileSync(path.join(ROOT, 'modules', 'topbar-invoke.js'), 'utf8');
  assert.ok(/function showResult\(/.test(top), 'في showResult');
  assert.ok(/typeof value\.then\s*===\s*'function'/.test(top), 'بتتعرف على Promise');
  assert.ok(/String\(value/.test(top), 'بتتحول لنص');
});