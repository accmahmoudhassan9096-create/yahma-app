/* اختبارات قراءة سبب الخطأ من نداء دالة.

   ⛔ الخطأ اللي فات كان هنا بالظبط:

   describeInvokeError كانت بتنادي `body.json()` من غير await.
   Response.json() بترجع Promise، فـ parsed بقى Promise — وده
   truthy، فال-condition اتعدّى، و parsed.error رجع undefined لأن
   الـproperties بتاعة Promise مش بتتقرا بالشكل ده. النتيجة: الرسالة
   العربية الحقيقية («جلسة الدخول غير صالحة») ضاعت، والشاشة عرضت
   النص العام مع كود الحالة الصحيح — كأن السبب وصل وما وصلش.

   الاختبارات دي بتشغّل الملف المنشور جوّه node:vm وبتنادي الدالة
   على Response حقيقي (نفس الحاجة اللي supabase-js بتسلّمها)،
   فأي await ناقص في الكود بيقع الاختبار ده فورًا.

   الـResponse اللي بنحاكيه مش حقيقي عن قصد: بنعمل Response
   مشResponse بيشتغل، عشان نضمن إن الكود بيقرأ من الـbody بقراية
   واحدة وبوسيلة مضمونة. والاختبار ده بيكشف لو الكود رجع
   يطلب مرتين — المستحيل بعد أول قراءة. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

/* ===== تحميل الملف كما هو، من غير تعديل سطر واحد ===== */

function loadTopbar() {
  /* readyState = 'loading' بيخلي الملف يسجّل bindOnce على
     DOMContentLoaded بدل ما يناديها، فمفيش حاجة بتلمس DOM وقت
     التحميل والـsandbox بيفضل نضيف. setTimeout بيمرّر 0 يعني
     المؤقتات بتتقرم فوراً، وده اللي عايزينه: نتأكد إن مفيش
     timer بيحاول يشتغل. */
  const sandbox = {
    console,
    setTimeout: () => 0,
    clearTimeout: () => {},
    Date,
    Math,
    JSON,
    Intl,
    Promise,
    Response,
    /*	body هيتقرا جوّه sandbox، فأي قراءة لازم تتقارب مع
       Promise الحقيقية من المتصفح — لو الكود نسي الـawait هتبقى
       Promise وت-truthy والنتيجة إن السبب يضيّع. */
    yahmaErr: function () {},
    document: {
      readyState: 'loading',
      addEventListener: function () {},
      getElementById: function () { return null; },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      createElement: function () { return { style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {} }; }
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;

  const context = vm.createContext(sandbox);
  const file = path.join(ROOT, 'modules', 'topbar-invoke.js');
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });

  assert.strictEqual(typeof sandbox.yahmaDescribeInvokeError, 'function',
    'describeInvokeError مش متصدّرة على window — الاختبارات مش هتوصلها');
  return sandbox;
}

/* shape زي اللي supabase-js FunctionsHttpError بيرجّعه */
function httpError(body, status) {
  const response = new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
  return {
    error: { name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code', context: response },
    data: null
  };
}

/* ================== الـawait اللي ضاع ================== */

test('الرسالة العربية جوه body بتوصل للمستخدم', async () => {
  const s = loadTopbar();
  const out = await s.yahmaDescribeInvokeError(
    httpError({ error: 'جلسة الدخول غير صالحة' }, 400),
    'تعذر إنشاء المستخدم: ');
  assert.strictEqual(typeof out, 'string', 'المخرج نص مش Promise');
  assert.ok(!/\[object/.test(out), 'طلع نص ميتا للمستخدم: ' + out);
  assert.ok(out.includes('جلسة الدخول غير صالحة'),
    'السبب الحقيقي ضاع — الرسالة: ' + out);
  assert.ok(out.includes('تعذر إنشاء المستخدم: '), 'البراديف ضاع');
  assert.ok(out.includes('400'), 'كود الحالة ضاع: ' + out);
});

test('الرسالة بتيجي من message لو مفيش error', async () => {
  const s = loadTopbar();
  const out = await s.yahmaDescribeInvokeError(
    httpError({ message: 'الجدول مش موجود' }, 404),
    'خطأ: ');
  assert.ok(out.includes('الجدول مش موجود'), 'الرسالة: ' + out);
  assert.ok(out.includes('404'), 'كود الحالة: ' + out);
});

/* دي الحالة اللي لوiguero الـawait، الـmessage بيفضل فاضي وتسقط
   على نص err.message الإنجليزي — وده اللي وصل المستخدم. */
test('مفيش ارتياب في النص العام لو الـbody فيه سبب', async () => {
  const s = loadTopbar();
  const out = await s.yahmaDescribeInvokeError(
    httpError({ error: 'تعذر إنشاء المستخدم' }, 500),
    'خطأ: ');
  assert.ok(!out.includes('Edge Function returned'),
    'رجعنا للنص العام بدل سبب الدالة: ' + out);
});

/* قراءة الـbody بتستهلك الـstream، والـstream المأكول مابيلوش
   رجوع. فالكود لازم يقرا من الـclone ويسيب الأصل متاح — غير كده
   أي حاجة تقرا الرد بعد كده (تسجيل، إعادة محاولة) هتلاقي فاضي.

   ملاحظة: الرد مابيتقراش مسبقاً قبل الدالة تناديها
   (ctxBodyUsed = false في الفحص الحقيقي على الدالة المنشورة)،
   فالسلوك ده مش بيقع في التطبيق، لكن الحاجز بيخلّي الكود صح لو
   تغيّر سلوك supabase-js في المستقبل. */
test('الـbody الأصلي بيفضل متاح بعد ما الدالة تقرا السبب', async () => {
  const s = loadTopbar();
  const result = httpError({ error: 'البريد مسجّل بالفعل' }, 409);
  const out = await s.yahmaDescribeInvokeError(result, 'خطأ: ');
  assert.ok(out.includes('البريد مسجّل بالفعل'), 'الرسالة: ' + out);
  assert.strictEqual(result.error.context.bodyUsed, false,
    'الاستهلاك جوه الدالة — الرد خلص consume والـbody مش متاح لحد تاني');
  /* نأكد إن فيه قراءة فعلاً، مش إننا سيبنا كل حاجة مكانش فيها */
  assert.deepStrictEqual(await result.error.context.json(),
    { error: 'البريد مسجّل بالفعل' },
    'الرد بقى مش مقروء بعد الدالة');
});

test('body مش JSON — النص الخام بيوصل (Cloudflare بيرد بصفحة HTML)', async () => {
  const s = loadTopbar();
  const response = new Response('<html><body>502 Bad Gateway</body></html>', { status: 502 });
  const out = await s.yahmaDescribeInvokeError(
    { error: { message: 'Fetch error', context: response } }, 'خطأ: ');
  assert.ok(out.includes('502 Bad Gateway'),
    'نص Cloudflare ضاع — النسخة القديمة كانت بترميه خالص: ' + out);
  assert.ok(out.includes('502'), 'كود الحالة: ' + out);
  assert.ok(!out.includes('Edge Function returned'), 'رجعنا للنص العام: ' + out);
});

/* الـbody بيتقرا مرة واحدة بس. لو الكود رجع يطلب مرتين، أول
   قراءة بتستهلك الـstream والتانية بترمي — والسبب بيضيع تاني.
   الاختبار ده بيمنع الرجوع للسلوك القديم. */
test('الـbody بيتقرا مرة واحدة — مفيش قراءة تانية بتضيّع السبب', async () => {
  const s = loadTopbar();
  const response = new Response(JSON.stringify({ error: 'السبب' }), { status: 400 });
  let reads = 0;
  const realText = response.text.bind(response);
  const realClone = response.clone.bind(response);
  response.text = function () { reads++; return realText(); };
  response.clone = function () {
    const copy = realClone();
    const copyText = copy.text.bind(copy);
    copy.text = function () { reads++; return copyText(); };
    return copy;
  };
  const out = await s.yahmaDescribeInvokeError(
    { error: { message: 'x', context: response } }, 'خطأ: ');
  assert.ok(out.includes('السبب'), 'الرسالة: ' + out);
  assert.strictEqual(reads, 1, 'اتقرا ' + reads + ' مرات — المفروض مرة واحدة');
});

/* ================== الحالات البديلة ================== */

test('body مش موجود — نfalls back لرمز الحالة', async () => {
  const s = loadTopbar();
  const out = await s.yahmaDescribeInvokeError(
    { error: { message: 'boom', status: 500 } }, 'خطأ: ');
  assert.ok(out.includes('boom'), 'الرسالة: ' + out);
  assert.ok(out.includes('500'), 'كود الحالة: ' + out);
});

test('مفيش سبب خالص — الرسالة بتقول تعمل إيه', async () => {
  const s = loadTopbar();
  const out = await s.yahmaDescribeInvokeError(
    { error: { context: null, status: 404 } }, 'خطأ: ');
  assert.ok(out.includes('سجّل خروج'), 'الرسالة لازم ترشد المستخدم: ' + out);
  assert.ok(out.includes('404'), 'كود الحالة: ' + out);
});

test('مفيش خطأ أصلاً — براديف بس', async () => {
  const s = loadTopbar();
  assert.strictEqual(
    await s.yahmaDescribeInvokeError({}, 'خطأ: '), 'خطأ: خطأ غير معروف');
});

test('body مش JSON — النص الخام بيتقرا من غير ما يكسر', async () => {
  const s = loadTopbar();
  const response = new Response('<html>502 Bad Gateway</html>', { status: 502 });
  const out = await s.yahmaDescribeInvokeError(
    { error: { message: 'Fetch error', context: response } }, 'خطأ: ');
  assert.ok(typeof out === 'string' && out.length > 0, 'المخرج لازم يبقى نص');
  assert.ok(!/\[object/.test(out), 'طلع نص ميتا: ' + out);
  assert.ok(out.includes('502'), 'كود الحالة: ' + out);
});

/* الدالة لازم ترميش أبداً — throw هنا كان هيخلي
   «تعذر إنشاء المستخدم» يرجع تاني من غير سبب. */
test('القراءة لو وقعت جوّهها، ترجع نص مفهوم مش ترمي', async () => {
  const s = loadTopbar();
  const hostile = {
    get error() { throw new Error('getter سام'); }
  };
  let out;
  try {
    out = await s.yahmaDescribeInvokeError(hostile, 'خطأ: ');
  } catch (e) {
    assert.fail('الدالة رمت استثناء بدل ما ترجع نص: ' + e.message);
  }
  assert.ok(typeof out === 'string' && out.length > 0, 'المخرج: ' + out);
  assert.ok(!/\[object/.test(out), 'طلع نص ميتا: ' + out);
});

test('قيمة غريبة (مش object) مبتعملش crash', async () => {
  const s = loadTopbar();
  for (const weird of [null, undefined, 'نص', 42, []]) {
    const out = await s.yahmaDescribeInvokeError(weird, 'خطأ: ');
    assert.ok(typeof out === 'string', 'المخرج لـ' + JSON.stringify(weird) + ' مش نص');
    assert.ok(!/\[object/.test(out), 'طلع نص ميتا لـ' + JSON.stringify(weird) + ': ' + out);
  }
});

/* ================== حارس الـPromise ================== */

test('showResult بتتحوّل لـPromise لو نسيت الـawait', async () => {
  const s = loadTopbar();
  const el = { textContent: '' };
  /* ده اللي حصل فعلاً في v200: دالة async اتنادت من غير await،
     والنتيجة وصلت textContent كـPromise وطلع «[object Promise]». */
  s.yahmaShowResultInto(el, s.yahmaDescribeInvokeError(httpError({ error: 'سبب' }, 400), 'خطأ: '), 'fallback');
  assert.ok(typeof el.textContent === 'string', 'المخرج مش نص');
  assert.ok(!/\[object/.test(el.textContent), 'طلع نص ميتا: ' + el.textContent);

  await new Promise((r) => setTimeout(r, 10));
  assert.strictEqual(el.textContent, 'خطأ: سبب [كود 400]', 'الحارس مابتشتغلش: ' + el.textContent);
});
