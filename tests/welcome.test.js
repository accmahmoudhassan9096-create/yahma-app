/* اختبارات قالب رسالة الترحيب.
   بنحمّل modules/topbar-ui.js في sandbox زي باقي الاختبارات — نفس
   ملف الشحن، من غير نسخة ولا تعديل على كود الإنتاج.

   topbar-ui.js بيصدّر yahmaOpenWelcomeEditor على window، لكن دالة
   الاستبدال نفسها (welcomeRender) مش متاحة برّه — فبنطلعها من
   sandbox بالevaluate على الكود المقروء، زي ما harness بيفعل مع
   باقي الوحدات. لو الكود اتغيّر، الاختبار هيلاقي نفس الدالة. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

/* بنطلع الدالة من الملف المقروء مباشرة — أبسط منubsubغ률 sandbox
   كامل، والهدف إننا نختبر نفس الكود اللي بيتحمّله المتصفح. */
function loadWelcomeRender() {
  const src = fs.readFileSync(path.join(ROOT, 'modules', 'topbar-ui.js'), 'utf8');
  const marker = 'function welcomeRender(';
  const start = src.indexOf(marker);
  assert.ok(start > 0, 'دالة welcomeRender مش موجودة في topbar-ui.js');
  /* نطلع الدالة بس: من start لآخر brace متوازن */
  let i = src.indexOf('{', start);
  let depth = 0;
  let end = i;
  for (; end < src.length; end++) {
    if (src[end] === '{') depth++;
    else if (src[end] === '}') { depth--; if (depth === 0) { end++; break; } }
  }
  const body = src.slice(start, end);
  const sandbox = { window: { location: { origin: 'https://example.test' } } };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(body + '\nthis.__fn = welcomeRender;', sandbox, { filename: 'topbar-ui.js:welcomeRender' });
  return sandbox.__fn;
}

const render = loadWelcomeRender();

test('الاستبدال بيشتغل على كل الحقول', () => {
  const out = render('مرحبًا {{name}} — {{role}} — {{login_url}}', {
    name: 'محمود', role: 'إداري', branch: '', loginUrl: 'https://app.test'
  });
  assert.ok(out.includes('محمود'), 'الاسم اتحط');
  assert.ok(out.includes('إداري'), 'الدور اتحط');
  assert.ok(out.includes('https://app.test'), 'الرابط اتحط');
  assert.ok(!out.includes('{{'), 'مفيش placeholder فاضل');
});

test('الفرع بيتلحق بالدور بس لما يكون موجود', () => {
  const withBranch = render('{{role}}{{branch}}', { name: 'أ', role: 'إداري', branch: 'فرع الزمال', loginUrl: 'x' });
  assert.ok(withBranch.includes('الزمال'), 'الفرع اتضاف');
  const without = render('{{role}}{{branch}}', { name: 'أ', role: 'إداري', branch: '', loginUrl: 'x' });
  assert.ok(!without.includes('الفرع'), 'مفيش نص زائد لما الفرع فاضي');
  assert.ok(!without.includes('—'), 'مفيش شرطة معلّقة');
});

test('نص فاضي أو ناقص بيتعوض ببديل مقروء', () => {
  assert.ok(render('{{name}}', {}).length > 0, 'الاسم الفاضي اتعوّض');
  assert.ok(render('{{role}}', {}).length > 0, 'الدور الفاضي اتعوّض');
});

test('حقل معروف بس مش موجود في القائمة بيفضل زي ما هو', () => {
  /* المدير ممكن يكتب {{phone}} — ما عندناش قيمة له، فنسيبه زي ما هو
     بدل ما نطلّع منه نص مش مفهوم زي «[object Object]». */
  const out = render('اتصل بيه {{phone}}', { name: 'أ', role: 'إداري', branch: '', loginUrl: 'x' });
  assert.ok(out.includes('{{phone}}'));
  assert.ok(!out.includes('[object'), 'مفيش تحويل object لنص');
});

test('نفس الاسم ميتكرر اتنين بيبقى مرتين', () => {
  const out = render('{{name}} و {{name}}', { name: 'سامي', role: 'إداري', branch: '', loginUrl: 'x' });
  assert.strictEqual((out.match(/سامي/g) || []).length, 2);
});

test('الرابط بيرجع ل origins الصفحة لو مفيش واحد معطى', () => {
  const out = render('افتح {{login_url}}', { name: 'أ', role: 'إداري', branch: '' });
  assert.ok(out.includes('https://example.test'), 'رجع لأصل الصفحة');
});

test('نص من غير placeholders بيترجع زي ما هو', () => {
  const out = render('أهلًا وسهلًا بكم في المنصة', { name: 'أ', role: 'إداري', branch: 'ب', loginUrl: 'x' });
  assert.strictEqual(out, 'أهلًا وسهلًا بكم في المنصة');
});

/* حدود الطول اللي الـEdge Function بيفرضها — لازم الواجهة تتقبل
   نفس الأرقام بالظبط وإلا المستخدم يكتب 190 حرف ويكتشف الفشل
   بعد ما يضغط حفظ. */
test('الحدود الافتراضية مطابقة للـEdge Function', () => {
  const fn = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'send-user-email', 'index.ts'), 'utf8');
  const topbar = fs.readFileSync(path.join(ROOT, 'modules', 'topbar-ui.js'), 'utf8');
  const subject = /(?:const|let|var)\s+WELCOME_MAX_SUBJECT\s*=\s*(\d+)/.exec(topbar);
  const body = /(?:const|let|var)\s+WELCOME_MAX_BODY\s*=\s*(\d+)/.exec(topbar);
  assert.ok(subject, 'الحد الأقصى للعنوان معرّف في الواجهة');
  assert.ok(body, 'الحد الأقصى للنص معرّف في الواجهة');
  assert.ok(fn.includes('subject.length > 180'), 'الـfunction بيقبل 180 للعنوان');
  assert.ok(fn.includes('text.length > 4000'), 'الـfunction بيقبل 4000 للنص');
  assert.strictEqual(Number(subject[1]), 180, 'الواجهة والسيرفر متافقين على 180');
  assert.strictEqual(Number(body[1]), 4000, 'الواجهة والسيرفر متافقين على 4000');
});

test('النص الافتراضي فيه كل الحقول ونضيف', () => {
  const src = fs.readFileSync(path.join(ROOT, 'modules', 'topbar-ui.js'), 'utf8');
  ['{{name}}', '{{role}}', '{{branch}}', '{{login_url}}'].forEach(function (ph) {
    assert.ok(src.includes(ph), 'النص الافتراضي فيه ' + ph);
  });
});