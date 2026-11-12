/* ===== اختبار انحدار: بناة Map/Set على دالة =====

   الخطأ اللي حصل في التشغيل كان في modules/renewals-ui.js:
     const mapBy = new Map(list => { ... });
   «new Map» بياخد iterable، والدالة مش iterable، فكان بيرمي:
     TypeError: function is not iterable (cannot read property Symbol(Symbol.iterator))

   الاختبار ده بيمسح كل ملفات التطبيق (من غير vendor) وبيمنع
   أي `new Map(fn)` أو `new Set(fn)` يرجع تاني. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['vendor', 'node_modules', '.git', '.wrangler', 'tests', 'scripts']);

function collect(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.github') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collect(full, out);
    } else if (entry.name.endsWith('.js')) {
      if (entry.name.endsWith('.min.js')) continue;
      out.push(full);
    }
  }
  return out;
}

/* نشيل التعليقات قبل الفحص — التعليق اللي بيشرح الخطأ نفسه
   لازم ما يتحسبش كخطأ. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

test('مفيش new Map/Set على دالة (خطأ «function is not iterable»)', () => {
  const files = collect(ROOT, []);
  const bad = [];
  /* `new Map(fn)` / `new Map(function(){})` / `new Map(name => ...)` */
  const re = /new\s+(Map|Set)\s*\(\s*(function\b|[A-Za-z_$][\w$]*\s*=>)/;
  for (const file of files) {
    const raw = fs.readFileSync(file, 'utf8');
    const lines = raw.split(/\r?\n/);
    /* التعليقات متعددة السطور — بننظف السطر قبل الفحص */
    const cleaned = stripComments(raw).split(/\r?\n/);
    lines.forEach((line, i) => {
      const c = (cleaned[i] || '').trim();
      if (!c) return;
      if (re.test(c)) bad.push(path.relative(ROOT, file) + ':' + (i + 1) + '  ' + c.slice(0, 120));
    });
  }
  assert.deepStrictEqual(bad, [],
    '«new Map/Set» على دالة بيرمي TypeError: function is not iterable:\n  ' + bad.join('\n  '));
});

test('ملف تجديد الفحص فيه mapBy كدالة مش Map', () => {
  const src = stripComments(fs.readFileSync(path.join(ROOT, 'modules', 'renewals-ui.js'), 'utf8'));
  assert.ok(!/new\s+Map\s*\(\s*list\s*=>/.test(src),
    'mapBy لازم يبقى دالة: const mapBy = list => {...} — مش new Map(list => {...})');
  assert.ok(/const\s+mapBy\s*=\s*list\s*=>/.test(src),
    'mapBy مفقود أو شكله اتغير');
});
