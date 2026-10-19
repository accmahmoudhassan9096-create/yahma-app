/* اختبارات شاشة «بياناتي» — التحقق والقواعد.
   نفس نهج باقي الاختبارات: بنحمّل الملف الحقيقي في sandbox. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function loadModule() {
  const sandbox = { console, window: null, alert: function () {} };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.document = undefined;
  vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync(path.join(ROOT, 'modules', 'my-account.js'), 'utf8'),
    sandbox,
    { filename: 'my-account.js' }
  );
  return sandbox.YahmaMyAccount;
}

const M = loadModule();

/* ===== رقم الهوية (السعودية: 10 أرقام) ===== */
test('رقم الهوية: 10 أرقام', () => {
  assert.strictEqual(M.validate({ national_id: '' }), '', 'فاضي مقبول');
  assert.strictEqual(M.validate({}), '', 'غير موجود مقبول');
  assert.strictEqual(M.validate({ national_id: '1234567890' }), '', '10 أرقام صح');
  assert.ok(M.validate({ national_id: '123456789' }), '9 أرقام مرفوض');
  assert.ok(M.validate({ national_id: '12345678901' }), '11 رقم مرفوض');
  /* الرقم المصري 14 رقم كان مقبول قبل — لازم يترفض دلوقتي */
  assert.ok(M.validate({ national_id: '29801011234567' }), '14 رقم مرفوض');
  assert.ok(M.validate({ national_id: '١٢٣٤٥٦٧٨٩٠' }), 'أرقام عربية مرفوضة');
  assert.ok(M.validate({ national_id: '12345a7890' }), 'حرف مرفوض');
  assert.ok(M.validate({ national_id: '1234 567890' }), 'مسافات مرفوضة');
  assert.ok(M.validate({ national_id: '123-4567890' }), 'شرطة مرفوضة');
});

/* ===== الجوال (السعودية: 10 أرقام تبدأ بـ05) ===== */
test('الجوال: 10 أرقام تبدأ بـ05', () => {
  assert.strictEqual(M.validate({ phone: '' }), '');
  assert.strictEqual(M.validate({ phone: '0512345678' }), '', '05 + 8 أرقام');
  assert.strictEqual(M.validate({ phone: '0501234567' }), '', '050 مقبول');
  assert.strictEqual(M.validate({ phone: '0599999999' }), '', '0599 مقبول');
  assert.ok(M.validate({ phone: '0412345678' }), '04 مرفوض');
  assert.ok(M.validate({ phone: '0612345678' }), '06 مرفوض');
  assert.ok(M.validate({ phone: '5012345678' }), 'من غير 0 مرفوض');
  assert.ok(M.validate({ phone: '051234567' }), '9 أرقام مرفوض');
  assert.ok(M.validate({ phone: '05123456789' }), '11 رقم مرفوض');
  /* صيغ كانت مقبولة قبل ولازم ترفض */
  assert.ok(M.validate({ phone: '+966512345678' }), 'صيغة دولية مرفوضة');
  assert.ok(M.validate({ phone: '051 234 5678' }), 'مسافات مرفوضة');
  assert.ok(M.validate({ phone: 'abc' }), 'حروف مرفوضة');
});

/* ===== تاريخ الميلاد ===== */
test('تاريخ الميلاد: في الماضي ومعقول', () => {
  assert.strictEqual(M.validate({ birth_date: '' }), '');
  assert.strictEqual(M.validate({ birth_date: '1990-05-17' }), '');
  assert.ok(M.validate({ birth_date: '2999-01-01' }), 'المستقبل مرفوض');
  assert.ok(M.validate({ birth_date: '1899-12-31' }), 'قبل 1900 مرفوض');
  /* النهاردة مسموحة — مفيش حد بيتولد بالليل */
  const t = new Date();
  const s = t.getFullYear() + '-' + (t.getMonth() < 9 ? '0' : '') + (t.getMonth() + 1) +
    '-' + (t.getDate() < 10 ? '0' : '') + t.getDate();
  assert.strictEqual(M.validate({ birth_date: s }), '', 'النهاردة مسموحة');
});

/* ===== كلمة المرور ===== */
test('كلمة المرور: لازم الحالية والتأكيد مطابق', () => {
  assert.strictEqual(M.validatePassword('old1234', 'new12345', 'new12345'), '', 'المقبول');
  assert.ok(M.validatePassword('', 'new12345', 'new12345'), 'الحالية مطلوبة');
  assert.ok(M.validatePassword('old1234', 'short', 'short'), 'قصيرة مرفوضة');
  assert.ok(M.validatePassword('old1234', 'new12345', 'different'), 'التأكيد مش مطابق');
  assert.ok(M.validatePassword('old1234', 'old1234', 'old1234'), 'نفس القديمة مرفوضة');
  assert.strictEqual(M.validatePassword('old1234', '12345678', '12345678'), '',
    '8 حروف بالظبط مقبولة — الحد الأدنى مش أكبر');
});

/* ===== التوافق مع القاعدة =====

   ⚠️ المطابقة بالنص كانت هتضلّلنا: تعبير الجوال في JS مكتوب
   [0-9 -] وفي القاعدة [0-9 \-] — نفس المعنى بالظبط، مختلف
   التهريب. فالمقارنة النصية كانت هتفشل وتخلّينا نصلّح نص سليم.

   فبنقارن **السلوك**: نفس العينة من القيم، نفس الحكم.
   ده بيلقط أي اختلاف حقيقي في المعنى ويعدّي اختلاف التهريب. */
function sqlPatternOf(label) {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'my-account.sql'), 'utf8');
  const m = new RegExp(label + " ~ '([^']+)'").exec(sql);
  assert.ok(m, 'قيد ' + label + ' موجود في القاعدة');
  return new RegExp(m[1].replace(/\\\\/g, '\\'));
}

const SAMPLES = [
  '0512345678', '0501234567', '0412345678', '0612345678', '5012345678',
  '051234567', '05123456789', '+966512345678', '051 234 5678', '051-2345678',
  '0512a45678', '0599999999', '0000000000', '0021234567'
];

test('قاعدة الجوال في JS بتقبل نفس العينة اللي بتقبلها القاعدة', () => {
  const sqlRe = sqlPatternOf('phone');
  const jsRe = new RegExp(M.PHONE_RE.source);
  let compared = 0;
  SAMPLES.forEach((s) => {
    /* نفس القواعد: الفراغ مسموح ونعتبره «مش موجود» */
    if (s === '' || s.trim() === '') return;
    const probe = s.trim();
    assert.strictEqual(jsRe.test(probe), sqlRe.test(probe),
      'اختلاف على «' + probe + '» بين JS والقاعدة');
    compared++;
  });
  assert.ok(compared >= 10, 'قارنت ' + compared + ' قيمة');
});

const NID_SAMPLES = [
  '1234567890', '123456789', '12345678901', '29801011234567',
  '١٢٣٤٥٦٧٨٩٠', '12345a7890', '1234 567890', '0000000000', '1010101010'
];

test('قاعدة رقم الهوية في JS بتقبل نفس العينة', () => {
  const sqlRe = sqlPatternOf('national_id');
  const jsRe = new RegExp(M.NATIONAL_ID_RE.source);
  let compared = 0;
  NID_SAMPLES.forEach((s) => {
    assert.strictEqual(jsRe.test(s), sqlRe.test(s), 'اختلاف على «' + s + '»');
    compared++;
  });
  assert.ok(compared >= 8, 'قارنت ' + compared + ' قيمة');
});

test('القيود الثلاثة موجودة في القاعدة', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'my-account.sql'), 'utf8');
  assert.ok(/national_id ~ '/.test(sql), 'قيد الرقم القومي');
  assert.ok(/phone ~ '/.test(sql), 'قيد الجوال');
  assert.ok(sql.includes('birth_date <= current_date'), 'قيد تاريخ الميلاد');
  assert.ok(sql.includes("birth_date > date '1900-01-01'"), 'الحد الأدنى للميلاد');
});

test('حارس الأعمدة بيقفل الدور والفرع والأقسام والبريد', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'my-account.sql'), 'utf8');
  const flat = sql.replace(/\s+/g, ' ');
  ['role', 'branch_name', 'allowed_tabs', 'email', 'id'].forEach((col) => {
    assert.ok(flat.includes('new.' + col + ' is distinct from old.' + col),
      'العمود ' + col + ' مقفول على المستخدم العادي');
  });
  /* واللي مفتوح لازم يكون شخصي بس */
  ['national_id', 'birth_date', 'phone'].forEach((col) => {
    assert.ok(flat.indexOf('new.' + col + ' is distinct') === -1,
      col + ' مفتوح للمستخدم — ما يتقفلش');
  });
});

/* التنضيف أثناء الكتابة: الحقل بيقبل لصق نص فيه مسافات وشرطات
   والحروف، فيشيلها فورًا. الشاشة لو سابتها للمستخدم كان هيكتب
   «051-234 5678» والقاعدة هترفضه برسالة بعد ما يضغط حفظ. */
test('التنضيف بيشيل كل حاجة غير الأرقام', () => {
  const mk = (max) => {
    const el = { value: '', maxLength: max, selectionStart: 0,
                 setSelectionRange(a, b) { this.selectionStart = a; this._b = b; } };
    return el;
  };
  const nid = mk(10);
  nid.value = '101-010 1010'; M.digitsOnly(nid);
  assert.strictEqual(nid.value, '1010101010', 'شرطة ومسافات شِيلت');

  const phone = mk(10);
  phone.value = '+966512345678'; M.digitsOnly(phone);
  /* العلامة بتشال والباقي يفضل زي ما هو — القص الصامت اتشال،
     فـvalidate هو اللي بيرفض الرقم الطويل. */
  assert.strictEqual(phone.value, '966512345678', 'العلاقة اتشالت والباقي زي ما هو');
  assert.ok(M.validate({ phone: phone.value }), 'والتنضيف لوحده ما بيسمحش برقم أطول');

  const arabic = mk(10);
  arabic.value = '٠٥١٢٣٤٥٦٧٨'; M.digitsOnly(arabic);
  assert.strictEqual(arabic.value, '0512345678', 'الأرقام العربية اتحولت واتقبلت');
});

/* ⛔ الباج ده اتلقط بالاختبار على الإنتاج:
   الكود كان بيقص أي رقم أطول من maxLength. لصق جوال 11 خانة كان
   بينتهي بـ10 خانات ويتخزّن غلط — والشاشة بتقول «تم الحفظ».
   الرقم الغلط المتخزّن أسوأ بكتير من رفض اللصق. */
test('التنضيف ما بيقصّش الطول بصمت — التحقق هو اللي يمنع', () => {
  const el = { value: '', maxLength: 10, selectionStart: 0,
               setSelectionRange(a, b) { this.selectionStart = a; this._b = b; } };
  el.value = '05123456789';        /* 11 خانة */
  M.digitsOnly(el);
  assert.strictEqual(el.value.length, 11, 'الرقم الطويل اترك زي ما هو');
  /* فـvalidate لازم يرفضه — وده اللي بيمنع التخزين */
  assert.ok(M.validate({ phone: el.value }), 'التحقق يرفض 11 خانة جوال');
  assert.ok(M.validate({ national_id: '12345678901' }), 'التحقق يرفض 11 خانة هوية');
});

test('الحد الأدنى لكلمة المرور واحد في كل الشاشات', () => {
  const topbar = fs.readFileSync(path.join(ROOT, 'modules', 'topbar-user.js'), 'utf8');
  const auth = fs.readFileSync(path.join(ROOT, 'core', 'auth-boot.js'), 'utf8');
  const mine = fs.readFileSync(path.join(ROOT, 'modules', 'my-account.js'), 'utf8');
  assert.ok(M.MIN_PASSWORD >= 8, 'الحد الأدنى 8 على الأقل');
  assert.ok(topbar.includes('minlength="' + M.MIN_PASSWORD + '"'),
    'نموذج إنشاء المستخدم بيستخدم نفس الحد');
  assert.ok(auth.includes('minlength="' + M.MIN_PASSWORD + '"'),
    'شاشة استعادة كلمة المرور بنفس الحد');
  assert.ok(mine.includes("MIN_PASSWORD = " + M.MIN_PASSWORD), 'الشاشة الجديدة بنفس الحد');
});

/* لوحة المستخدمين بتقرأ صف profile واحد وتعرضه. لو الأعمدة
   الشخصية مش في الاستعلام مش هتظهر خالص مهما اتكتبت في القاعدة. */
test('لوحة المستخدمين بتجيب الأعمدة الشخصية وبتعرضها', () => {
  const topbar = fs.readFileSync(path.join(ROOT, 'modules', 'topbar-user.js'), 'utf8');
  const select = /from\('profiles'\)\.select\(([^)]*)\)/.exec(topbar);
  assert.ok(select, 'في استعلام profiles');
  ['national_id', 'birth_date', 'phone'].forEach((col) => {
    assert.ok(select[1].includes(col), col + ' مش في الاستعلام — مش هيظهر للمدير');
    assert.ok(topbar.includes('u.' + col), col + ' مش بيتقرأ من الصف');
  });
  /* والقيم الفاضية لازم تقول «مش مسجّل» مش تبقى فراغ صامت */
  assert.ok(topbar.includes('مش مسجّل'), 'فيه نص واضح للقيم الفاضية');
});

test('المدير يعدّل البيانات الشخصية بنفسه — القاعدة تسمح بيه', () => {
  /* trigger بيرجّع زي ما هو لو المدير، فمفيش مانع في القاعدة */
  const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'my-account.sql'), 'utf8');
  const flat = sql.replace(/\s+/g, ' ');
  assert.ok(/if v_admin then\s*return new;/.test(flat),
    'المدير يعدّي من غير قيود — وده اللي يسمحله يعدّل البيانات');
  /* والواجهة لازم تبعت الأعمدة مع زر الحفظ */
  const topbar = fs.readFileSync(path.join(ROOT, 'modules', 'topbar-user.js'), 'utf8');
  assert.ok(/payload\.phone\s*=/.test(topbar) && /payload\.national_id\s*=/.test(topbar)
    && /payload\.birth_date\s*=/.test(topbar), 'زر الحفظ بيبعت الأعمدة الثلاثة');
});