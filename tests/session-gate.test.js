/* اختبارات بوابة الجلسة.

   المشكلة: الدالة ردّت «جلسة الدخول غير صالحة» والواجهة وقّفت عند
   الرسالة. المستخدم قاعد قدام زر ميت، والسبب معروف، بس مافيش طريق
   للخروج غير إنه يدور على زر تسجيل الدخول في الراس.

   البوابة اللي في core/auth-boot.js بتعمل اتنين:

   استباقي — بتجدد التوكن لو شارف على الانتهاء قبل ما نبعته.
              دي الحالة اللي كان ممكن تتحل من غير ما المستخدم
              يحس: التوكن كان هيتحدث في الخلفية بس نبعته اولاً.

   تفاعلي — لو الرد نفسه قال إن الجلسة مش صالحة، بتعرض زر
              «تسجيل دخول» جوّه نفس الرسالة.

   الاختبارات دي بتحمّل الملفين كما هما في node:vm، وبتحاكي عميل
   Supabase بــstub بيتحكم فيه — عشان نقدر نختبر التجديد والرفض
   والبطء وكلهم من غير شبكة. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

/* ===== عميل Supabase وهمي =====
   بيتحكم في: وجود جلسة، قرب انتهاء التوكن، نجاح/فشل التجديد،
   والرد اللي الدالة هترجّعه. */
function fakeSupabase(opts) {
  const o = opts || {};
  const calls = { getSession: 0, refresh: 0, invoke: 0 };
  const nowSec = Math.floor(Date.now() / 1000);
  const session = o.noSession ? null : {
    user: { id: 'u1' },
    access_token: 'tok',
    expires_at: o.expiresIn === undefined ? nowSec + 3600 : nowSec + o.expiresIn
  };
  return {
    calls,
    auth: {
      getSession: async () => {
        calls.getSession++;
        if (o.getSessionThrows) throw new Error(o.getSessionThrows);
        return { data: { session }, error: null };
      },
      refreshSession: async () => {
        calls.refresh++;
        if (o.refreshFails) {
          return { data: { session: null }, error: { message: 'refresh_token_not_found' } };
        }
        if (o.refreshThrows) throw new Error(o.refreshThrows);
        return {
          data: { session: { user: { id: 'u1' }, access_token: 'fresh', expires_at: nowSec + 3600 } },
          error: null
        };
      },
      signOut: async () => ({ error: null })
    },
    functions: {
      invoke: async (name, args) => {
        calls.invoke++;
        if (o.invokeThrows) throw new Error(o.invokeThrows);
        if (o.invokeResult) return o.invokeResult;
        return { data: { id: 'new-user-id' }, error: null };
      }
    }
  };
}

/* ===== تحميل الملفين في sandbox واحد =====
   order in index.html: auth-boot (504) ثم topbar-ui (521)،
   فبنحملهم بنفس الترتيب عشان يahmaEnsureFreshSession يبقى موجود
   وقت ما topbar-ui يشغّل. */
function boot(opts) {
  const o = opts || {};
  const client = fakeSupabase(o);
  const sandbox = {
    console,
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    location: { reload: () => { sandbox.__reloaded = true; } },
    Date,
    Math,
    JSON,
    Intl,
    Promise,
    Response,
    yahmaErr: function () {},
    YahmaData: { markSessionExpired: function (m) { sandbox.__marked = m; } }
  };
  /* auth-boot.js فيه IIFE بيعمل supabase.createClient وقت التحميل
     وبيحط window.supabaseClient / supabaseReady. فلازم نديه
     «SDK» وإلا غير إنه مش هيلاقي عميل، الـcatch بتاعه هيخلي
     supabaseReady=false ويبقى الاختبار بيختبر حاجة تانية خالص.

     createClient بيرجّع نفس الـclient عشان نقدر نعدّ عليه. */
  if (!o.noClient) {
    sandbox.supabase = { createClient: function () { return client; } };
  }
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;

  const noop = function () {};
  /* textContent لازم يمسح الأبناء زي المتصفح بالظبط. من غير ده
     الاختبار «نداءين متتاليين» هيشوف اتنين زرار حتى لو الكود
     سالب واحد — يعني الاختبار بيحكم على وهمية مش على الكود. */
  const el = () => {
    const node = {
      _text: '', hidden: false, disabled: false, className: '',
      style: {}, dataset: {}, children: [], parentNode: null,
      classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
      appendChild(c) { this.children.push(c); if (c && c.parentNode === null) c.parentNode = this; return c; },
      addEventListener: noop, removeEventListener: noop,
      querySelector: () => null, querySelectorAll: () => [],
      getAttribute: () => null, setAttribute: noop, remove: noop, focus: noop
    };
    Object.defineProperty(node, 'textContent', {
      get() { return this._text; },
      set(v) { this._text = String(v); this.children.length = 0; },
      enumerable: true, configurable: true
    });
    return node;
  };
  sandbox.document = {
    readyState: 'loading',
    documentElement: { classList: { add: noop, remove: noop, contains: () => false } },
    addEventListener: noop,
    getElementById: () => el(),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => el()
  };

  const context = vm.createContext(sandbox);
  for (const rel of ['core/auth-boot.js', 'modules/topbar-ui.js']) {
    const file = path.join(ROOT, rel);
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  }
  sandbox.__el = el();
  sandbox.__client = client;
  return sandbox;
}

function sessionReply(body, status) {
  return {
    error: {
      name: 'FunctionsHttpError',
      message: 'Edge Function returned a non-2xx status code',
      context: new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    },
    data: null
  };
}

/* ================= استباقي: تجديد التوكن ================= */

test('توكن صالح بعيد — مفيش تجديد، والنداء بيحصل', async () => {
  const s = boot({ expiresIn: 3600 });
  const gate = await s.yahmaEnsureFreshSession();
  assert.strictEqual(gate.ok, true, 'البوابة رفضت جلسة صالحة: ' + JSON.stringify(gate));
  assert.strictEqual(gate.refreshed, false);
  const out = await s.yahmaInvokeFunction('admin-create-user', {}, s.__el);
  assert.ok(out.result, 'النداء مابصلش');
  assert.strictEqual(s.supabaseClient.calls.refresh, 0, 'تجديد من غير داعي');
  assert.strictEqual(s.supabaseClient.calls.invoke, 1);
});

test('توكن شارف على الانتهاء — بنجدّده قبل ما نبعته', async () => {
  /* 20 ثانية: الدالة هترفضه فوراً. ده اللي كان بيحصل والمستخدم
     كان بيشوف «جلسة الدخول غير صالحة» من غير سبب يقدر يتصرف بيه. */
  const s = boot({ expiresIn: 20 });
  const gate = await s.yahmaEnsureFreshSession();
  assert.strictEqual(gate.ok, true, 'البوابة رفضت جلسة قابلة للتجديد');
  assert.strictEqual(gate.refreshed, true, 'التجديد متنفّذش');
  assert.strictEqual(s.supabaseClient.calls.refresh, 1);
});

test('التجديد بيفشل — رسالة واضحة ومفيش نداء للدالة', async () => {
  const s = boot({ expiresIn: 20, refreshFails: true });
  const gate = await s.yahmaEnsureFreshSession();
  assert.strictEqual(gate.ok, false, 'البوابة قبلت جلسة ميتة');
  assert.match(gate.message, /انتهت صلاحية الجلسة/);
  const out = await s.yahmaInvokeFunction('admin-create-user', {}, s.__el);
  assert.strictEqual(out.skipped, 'session', 'مابيلناش-sdkit تمسكه');
  assert.strictEqual(s.supabaseClient.calls.invoke, 0, 'نادينا الدالة بتوكن ميت');
});

test('مفيش جلسة — مفيش نداء للدالة', async () => {
  const s = boot({ noSession: true });
  const out = await s.yahmaInvokeFunction('admin-create-user', {}, s.__el);
  assert.strictEqual(out.skipped, 'session');
  assert.strictEqual(s.supabaseClient.calls.invoke, 0);
  assert.match(out.reason, /no-session/);
});

test('Supabase مش متاح — رسالة توجّه لتحديث التطبيق', async () => {
  const s = boot({ noClient: true });
  const out = await s.yahmaInvokeFunction('admin-create-user', {}, s.__el);
  assert.strictEqual(out.skipped, 'session');
  assert.strictEqual(s.__client.calls.invoke, 0, 'نادينا الدالة من غير عميل');
});

/* الشبكة تعطّلت مش دليل إن الجلسة ميتة — لازم نجرّب عادي.
   غير كده أي شبكة ضعيفة هتطلّع «سجّل دخول» والمستخدم موجود. */
test('فشل الشبكة مابينفعش يسجّل الجلسة منتهية', async () => {
  const s = boot({ getSessionThrows: 'Failed to fetch' });
  const gate = await s.yahmaEnsureFreshSession();
  assert.strictEqual(gate.ok, true, 'خطأ شبكة اتعامل معاه كأن الجلسة ميتة');
  assert.strictEqual(gate.unknown, true);
  const out = await s.yahmaInvokeFunction('admin-create-user', {}, s.__el);
  assert.ok(out.result, 'اتمنع النداء بسبب شبكة');
  assert.strictEqual(s.supabaseClient.calls.invoke, 1);
});

/* ================= تفاعلي: الرد نفسه بيقول ================= */

test('رد الدالة «جلسة غير صالحة» — بتعرض زر تسجيل دخول', async () => {
  const s = boot({
    expiresIn: 3600,
    invokeResult: sessionReply({ error: 'جلسة الدخول غير صالحة' }, 400)
  });
  const out = await s.yahmaInvokeFunction('admin-create-user', {}, s.__el);
  assert.strictEqual(out.skipped, 'session', 'الرد اتعامل معاه كأنه عادي');
  assert.strictEqual(out.reason, 'server-rejected');
  assert.match(s.__el.textContent, /انتهت جلسة الدخول/);
  assert.strictEqual(s.__marked, s.__el.textContent, 'الحالة المعلّمة مش اللي اتعرضت');
});

test('401 من الدالة — نفس المعالجة', async () => {
  const s = boot({ expiresIn: 3600, invokeResult: sessionReply({ error: 'مفيش توكن' }, 401) });
  const out = await s.yahmaInvokeFunction('admin-create-user', {}, s.__el);
  assert.strictEqual(out.skipped, 'session');
});

test('خطأ مش متعلق بالجلسة — ماينفعش يعرض زر تسجيل دخول', async () => {
  /* ده مهم: «البريد مسجّل بالفعل» خطأ المستخدم يقدر يتصرف بيه.
     لو البوابة بتاخده كجلسة منتهية، المستخدم بيعمل تسجيل دخول
     وبيحاول تاني والحاجة هتفشل تاني. */
  const s = boot({ expiresIn: 3600, invokeResult: sessionReply({ error: 'البريد مسجّل بالفعل' }, 409) });
  const out = await s.yahmaInvokeFunction('admin-create-user', {}, s.__el);
  assert.ok(!out.skipped, 'اتعامل مع خطأ المستخدم كأنه جلسة منتهية');
  assert.strictEqual(out.result.error.context.status, 409);
  assert.ok(!/انتهت جلسة/.test(s.__el.textContent), 'الرسالة اتغيّرت لحاجة مش مرتبطة: ' + s.__el.textContent);
});

test('كود 500 من الدالة — ماينفعش يعرض زر تسجيل دخول', async () => {
  const s = boot({ expiresIn: 3600, invokeResult: sessionReply({ error: 'خطأ داخلي' }, 500) });
  const out = await s.yahmaInvokeFunction('admin-create-user', {}, s.__el);
  assert.ok(!out.skipped);
});

/* ================= كاشف الأخطاء ================= */

/* التشكيل: نفس الجملة بشدّة ومن غيرها لازم تتتعرف زي بعض.
   ده مش تفصيل تجميلي — «سجّل» في كودنا كانت من غير U+0651
   والرسالة اللي بتوصل من الـSDK فيها، فالمطابقة كانت فاشلة
   على نص بنسلّمه بنسنا. */
test('التشكيل مابيفرقش — الجملة بتتعرف بكل صيغة', () => {
  const s = boot({});
  const f = s.yahmaIsSessionError;
  const pairs = [
    ['سجّل دخول تاني', 'سجل دخول تاني'],
    ['تسجيل الدخول أولًا', 'تسجيل الدخول اولا'],
    ['الجلسة مُنتهية', 'الجلسة منتهية']
  ];
  pairs.forEach((pair) => {
    /* نتحقق إن الكلمات فعلاً مختلفة — وإلا الاختبار وهمية */
    assert.notStrictEqual(pair[0], pair[1], 'الكلمتين واحدة: ' + pair[0]);
    assert.strictEqual(f(400, pair[0]), f(400, pair[1]),
      'التشكيل غيّر النتيجة: ' + pair[0] + ' → ' + f(400, pair[0])
      + ' / ' + pair[1] + ' → ' + f(400, pair[1]));
  });
  assert.strictEqual(f(400, 'سجّل دخول تاني'), true, 'الجملة دي لازم تتعرف');
  assert.strictEqual(f(400, 'تسجيل الدخول أولًا'), true, 'وبالتشكيل الكامل برضه');
});

test('yahmaIsSessionError بيعرف الحالات الصح', () => {
  const s = boot({});
  const f = s.yahmaIsSessionError;
  /* الأكواد */
  assert.strictEqual(f(401, ''), true, '401');
  assert.strictEqual(f(403, ''), true, '403');
  assert.strictEqual(f(400, ''), false, '400 مش جلسة');
  assert.strictEqual(f(500, ''), false, '500');
  /* النصوص العربية بتاعة دوالنا — كل واحدة لازم تتعرف.
     «انتهت جلسة…» و«…الجلسة» دول اللي الكاشف الأول كان
     بيفوّتهم، ودي بالظبط رسايل بوابتنا. */
  assert.strictEqual(f(400, 'جلسة الدخول غير صالحة'), true);
  assert.strictEqual(f(400, 'انتهت جلسة الدخول على هذا الجهاز'), true);
  assert.strictEqual(f(400, 'انتهت صلاحية الجلسة على هذا الجهاز. سجّل دخول تاني.'), true);
  assert.strictEqual(f(400, 'مفيش جلسة دخول على هذا الجهاز. سجّل دخول تاني.'), true);
  assert.strictEqual(f(400, 'جلسة منتهية'), true);
  assert.strictEqual(f(400, 'الجلسة غير صالحة'), true, 'بـالـ«ال»');
  /* «ال» اختيارية — العربي بيكتب «تسجيل الدخول» و«سجل دخول» */
  assert.strictEqual(f(400, 'سجل دخول تاني'), true, 'من غير «ال»');
  assert.strictEqual(f(400, 'سجّل تسجيل الدخول من جديد'), true, 'الشكل المطوّل');
  assert.strictEqual(f(400, 'الجلسة منتهية. سجّل خروج.'), true);
  assert.strictEqual(f(400, 'يجب تسجيل الدخول أولًا'), true);
  assert.strictEqual(f(400, 'سجّل خروج'), true);
  /* الإنجليزي من البوابة ومن الـSDK */
  assert.strictEqual(f(400, 'Missing authorization header'), false, 'مش من البوابة — وده 401 اللي بيردها');
  assert.strictEqual(f(401, 'Missing authorization header'), true);
  assert.strictEqual(f(400, '{"code":"UNAUTHORIZED_NO_AUTH_HEADER"}'), true);
  assert.strictEqual(f(400, 'JWT expired'), true);
  assert.strictEqual(f(400, 'invalid JWT'), true);
  assert.strictEqual(f(400, 'token has expired'), true);
  assert.strictEqual(f(400, 'JWT has expired'), true);
  assert.strictEqual(f(400, 'invalid JWT token'), true);
  assert.strictEqual(f(400, 'Auth session missing'), true);
  /* إنجليزي عادي مالهاش علاقة بجلسة */
  assert.strictEqual(f(400, 'Tokenization failed'), false, 'كلمة فيها token مش معناها جلسة');
  /* أخطاء المستخدم — لازم تعدّي */
  assert.strictEqual(f(400, 'البريد مسجّل بالفعل'), false);
  assert.strictEqual(f(400, 'تعذر حفظ بيانات المستخدم'), false);
  assert.strictEqual(f(400, 'صيغة البريد الإلكتروني غير صحيحة'), false);
  assert.strictEqual(f(400, ''), false);
  assert.strictEqual(f(0, ''), false);
  assert.strictEqual(f(null, null), false, 'مفيش status ونص — مفيش crash');
  assert.strictEqual(f(undefined, undefined), false);
});

/* ================= زر الخروج ================= */

test('yahmaSessionGate بتعمل نص + زر', () => {
  const s = boot({});
  const el = s.__el;
  s.yahmaSessionGate(el, 'انتهت جلسة الدخول');
  assert.strictEqual(el.textContent, 'انتهت جلسة الدخول');
  const bar = el.children[el.children.length - 1];
  assert.ok(bar, 'مفيش عنصر للزر');
  assert.strictEqual(bar.className, 'yahma-session-gate');
  const btn = bar.children[0];
  assert.ok(btn, 'مفيش زر');
  assert.strictEqual(btn.textContent, 'تسجيل دخول', 'الزر ماله نص مقروء');
  assert.strictEqual(s.__marked, 'انتهت جلسة الدخول', 'الحالة المعلّمة ضايعة');
});

test('الزر جوّه عنصر الرسالة — مش جوه أبوه', () => {
  /* لو climbedنا للأب كنا هنمسح عناصر تانية من الشاشة.
     الاختبار ده بيقفل السلوك ده. */
  const s = boot({});
  const sibling = { textContent: 'عنصر تاني', tagName: 'INPUT' };
  const parent = { children: [], appendChild(c) { this.children.push(c); return c; } };
  const el = { textContent: '', children: [], parentNode: parent, appendChild(c) { this.children.push(c); return c; } };
  parent.children.push(sibling);
  parent.children.push(el);
  s.yahmaSessionGate(el, 'انتهت جلسة');
  assert.ok(el.children.length > 0, 'الزر مااتضافش جوه عنصر الرسالة');
  assert.strictEqual(parent.children.length, 2, 'الأب اتمسح — عنصر تاني اتشال من الشاشة');
  assert.strictEqual(sibling.textContent, 'عنصر تاني', 'الأخ تغيّر');
});

test('نداءين متتاليين — زر واحد مش اتنين', () => {
  const s = boot({});
  const el = s.__el;
  s.yahmaSessionGate(el, 'انتهت جلسة');
  s.yahmaSessionGate(el, 'انتهت جلسة تاني');
  const bars = el.children.filter((c) => c.className === 'yahma-session-gate');
  assert.strictEqual(bars.length, 1, 'اتزرار: ' + bars.length);
  assert.strictEqual(el.textContent, 'انتهت جلسة تاني');
});

test('yahmaSessionGate بعنصر مالهوش appendChild — ماترسميش', () => {
  const s = boot({});
  const bare = { textContent: '', parentNode: null };
  assert.doesNotThrow(() => s.yahmaSessionGate(bare, 'انتهت جلسة'));
  assert.strictEqual(bare.textContent, 'انتهت جلسة', 'النص لسه اتكتب');
});

test('الزر بيخرج من الجهاز حتى لو الشبكة مقفولة', async () => {
  const s = boot({});
  let signedOut = false;
  s.yahmaSignOut = async () => { signedOut = true; };
  const el = s.__el;
  s.yahmaSessionGate(el, 'انتهت جلسة الدخول');
  const bar = el.children[el.children.length - 1];
  const btn = bar.children[0];
  btn.onclick();
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(signedOut, true, 'الزر معملش حاجة');
});

test('yahmaSessionGate بnil مايرميش', () => {
  const s = boot({});
  assert.doesNotThrow(() => s.yahmaSessionGate(null, 'انتهت جلسة'));
  assert.doesNotThrow(() => s.yahmaSessionGate(undefined, 'انتهت جلسة'));
});

/* الحالة المعلّامة لازم توصل للبنر التاني كمان، مش بس للرسالة.
   من غير كده المستخدم يدوس زر تسجيل دخول من غير سبب ظاهر. */
test(' YahmaData.markSessionExpired بتتنداء (للبنر التاني كمان)', () => {
  const s = boot({});
  let called = 0;
  s.YahmaData.markSessionExpired = function (m) { called++; s.__marked = m; };
  s.yahmaSessionGate(s.__el, 'انتهت جلسة');
  assert.strictEqual(called, 1, 'الحالة المعلّامة ماتبعتتش للبنر');
});

/* ================= الأسلاك ================= */

test('كل استدعاء دالة في اللوحة بيعدّي على البوابة', () => {
  const top = fs.readFileSync(path.join(ROOT, 'modules', 'topbar-ui.js'), 'utf8');
  const code = top.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  /* النداء المباشر مسموح في مكان واحد بس: جوّه invokeYahmaFunction.
     فلو زاد عن كده يبقى فيه مسار بيبعث توكن من غير تجديد. */
  const invokes = [...code.matchAll(/supabaseClient\.functions\.invoke\(/g)];
  assert.strictEqual(invokes.length, 1,
    'عدد النداءات المباشرة ' + invokes.length + ' — المفروض 1 (داخل البوابة بس)');

  /* والأهم: المواضع التلاتة كلها بتستعمل البوابة. */
  assert.ok(/invokeYahmaFunction\('admin-create-user'/.test(code), 'الإنشاء مش واصل بالبوابة');
  assert.ok(/invokeYahmaFunction\('admin-delete-user'/.test(code), 'الحذف مش واصل بالبوابة');
  assert.ok(/invokeYahmaFunction\('send-user-email'/.test(code), 'حفظ رسالة الترحيب مش واصل بالبوابة');
  assert.ok(/async function invokeYahmaFunction/.test(code), 'البوابة مش معرّفة');
});

test('البوابة معرّفة قبل ما topbar-ui يستخدمها', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const a = html.indexOf('core/auth-boot.js');
  const b = html.indexOf('modules/topbar-ui.js');
  assert.ok(a > -1 && b > -1, 'واحد من الملفين مش متحمّل');
  assert.ok(a < b, 'auth-boot لازم يتحمّل قبل topbar-ui');
});

test('التنسيق موجود في CSS (والزر يبان مش نص مخفي)', () => {
  const css = fs.readFileSync(path.join(ROOT, 'css', '04-dark-overrides.css'), 'utf8');
  assert.ok(/\.yahma-session-gate/.test(css), 'مفيش تنسيق للزر');
  assert.ok(/body\.dark-mode \.yahma-session-gate/.test(css), 'مفيش نسخة للوضع الليلي');
});
