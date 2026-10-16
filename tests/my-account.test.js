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

/* ===== الرقم القومي ===== */
test('الرقم القومي: 14 رقم بس', () => {
  assert.strictEqual(M.validate({ national_id: '' }), '', 'فاضي مقبول');
  assert.strictEqual(M.validate({}), '', 'غير موجود مقبول');
  assert.strictEqual(M.validate({ national_id: '29801011234567' }), '', '14 رقم صح');
  assert.ok(M.validate({ national_id: '2980101123456' }), '13 رقم مرفوض');
  assert.ok(M.validate({ national_id: '298010112345678' }), '15 رقم مرفوض');
  assert.ok(M.validate({ national_id: '٢٩٨٠١٠١١٢٣٤٥٦٧' }), 'أرقام عربية مرفوضة');
  assert.ok(M.validate({ national_id: '2980101123456a' }), 'حرف مرفوض');
  assert.ok(M.validate({ national_id: '2980 1011 2345' }), 'مسافات مرفوضة');
});

/* ===== الجوال ===== */
test('الجوال: أرقام مع مسموح + أو مسافة أو شرطة في الأول', () => {
  assert.strictEqual(M.validate({ phone: '' }), '');
  assert.strictEqual(M.validate({ phone: '01012345678' }), '', '11 رقم');
  assert.strictEqual(M.validate({ phone: '+201012345678' }), '', 'بعلامة +');
  assert.strictEqual(M.validate({ phone: '010 123 456 78' }), '', 'بمسافات');
  assert.strictEqual(M.validate({ phone: '010-1234567' }), '', 'بشرطة');
  assert.ok(M.validate({ phone: 'abc' }), 'حروف مرفوضة');
  assert.ok(M.validate({ phone: '+' }), 'علامة + لوحدها مرفوضة');
  assert.ok(M.validate({ phone: '12345' }), 'قصير أوي مرفوض');
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
  '01012345678', '+201012345678', '010 123 456 78', '010-1234567',
  '1234567', '123456', '12345', '+', 'abc', '010abc45678', '',
  '  01012345678  ', '+20 10 12345678', '010-123-456-78'
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
  '29801011234567', '2980101123456', '298010112345678', '٢٩٨٠١٠١١٢٣٤٥٦٧',
  '2980101123456a', '2980 1011 2345', '12345678901234', '00000000000000'
];

test('قاعدة الرقم القومي في JS بتقبل نفس العينة', () => {
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

test('الحد الأدنى لكلمة المرور واحد في كل الشاشات', () => {
  const topbar = fs.readFileSync(path.join(ROOT, 'modules', 'topbar-ui.js'), 'utf8');
  const auth = fs.readFileSync(path.join(ROOT, 'core', 'auth-boot.js'), 'utf8');
  const mine = fs.readFileSync(path.join(ROOT, 'modules', 'my-account.js'), 'utf8');
  assert.ok(M.MIN_PASSWORD >= 8, 'الحد الأدنى 8 على الأقل');
  assert.ok(topbar.includes('minlength="' + M.MIN_PASSWORD + '"'),
    'نموذج إنشاء المستخدم بيستخدم نفس الحد');
  assert.ok(auth.includes('minlength="' + M.MIN_PASSWORD + '"'),
    'شاشة استعادة كلمة المرور بنفس الحد');
  assert.ok(mine.includes("MIN_PASSWORD = " + M.MIN_PASSWORD), 'الشاشة الجديدة بنفس الحد');
});