/* ===== scripts/check-shell.js — فحص صدق الكاش قبل النشر =====

   الـ precache في sw.js قايمة ملفات مكتوبة بإيد. لو ملف اتغيّر اسمه
   أو اتمسح من المشروع، `cache.add` بيفشل أثناء التثبيت.

   وده بالظبط اللي كان بيحصل في v171-v173: كل تحديث كان لازم
   bump يدوي، وأي خطأ في الاسم كان بيخلي التحديث كله يموت صامت
   والمستخدم يفضل على نسخته القديمة.

   الفحص ده بيمنع النوعين من الأخطاء:
     1. ملف في الـprecache مش موجود على القرص
     2. ملف في المشروع (js/css/html/woff2) مش في الـprecache

   الاستخدام: node scripts/check-shell.js */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SW = path.join(ROOT, 'sw.js');

function readRequiredList() {
  const src = fs.readFileSync(SW, 'utf8');
  const start = src.indexOf('LOCAL_APP_SHELL');
  if (start < 0) return null;
  const open = src.indexOf('[', start);
  const close = src.indexOf('];', open);
  if (open < 0 || close < 0) return null;
  const body = src.slice(open + 1, close);
  const items = [];
  const re = /'([^']+)'/g;
  let m;
  while ((m = re.exec(body))) {
    if (!m[1].startsWith('./')) continue;
    items.push(m[1].slice(2));
  }
  return items;
}

function walk(dir, out, depth) {
  if (depth > 4) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' ||
        entry.name === 'tests' || entry.name === 'scripts') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out, depth + 1);
    else if (/\.(js|css|html|woff2|png|webmanifest)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

const required = readRequiredList();
if (!required) {
  console.error('Could not read LOCAL_APP_SHELL from sw.js');
  process.exit(1);
}

let missing = 0;
for (const rel of required) {
  if (!fs.existsSync(path.join(ROOT, rel))) {
    console.error('MISSING in precache but not on disk: ' + rel);
    missing++;
  }
}

/* العكس: ملفات محتاجة الشبكة ولسه مش متعملها cache.
   الأصول الثابتة (js/css/html/woff2) لازم تكون في الكاش، وإلا
   التطبيق مش هيشتغل أوفلاين. الصور الكبار والشعارات اتستثنت
   من الـprecache عمداً فيبقت لهن استثناء. */
const EXEMPT = /(icon-|manifest|apple-touch|^sw\.js$)/i;
const shipped = walk(ROOT, []).map((p) => path.relative(ROOT, p).split(path.sep).join('/'));
let unlisted = 0;
for (const rel of shipped) {
  if (required.includes(rel)) continue;
  if (EXEMPT.test(rel)) continue;
  if (/^manifest\.json$/i.test(rel)) continue;
  console.error('NOT in precache: ' + rel);
  unlisted++;
}

console.log('precache entries: ' + required.length);
console.log('missing on disk  : ' + missing);
console.log('not in precache  : ' + unlisted);

if (missing || unlisted) {
  console.error('\nShell check FAILED. Fix before deploying:');
  console.error('  - sw.js LOCAL_APP_SHELL lists a file that is not on disk');
  console.error('  - a shipped asset is not cached, so it will not work offline');
  process.exit(1);
}
console.log('\nShell check passed.');