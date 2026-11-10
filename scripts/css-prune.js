/* ===== scripts/css-prune.js — يشيل قواعد الـCSS الميتة بأمان =====
 *
 *   usage: node scripts/css-prune.js          → تقرير فقط (مفيش تعديل)
 *          node scripts/css-prune.js --apply  → ينفّذ الحذف
 *
 * الطريقة: بنقسّم كل ملف CSS مصدر لقواعد، وبنطلّع أسماء الـclasses
 * من كل selector. بعدين بندور على كل اسم في:
 *   - index.html
 *   - كل ملفات .js (بما فيها الشيفرة المولّدة للـDOM)
 *   - كل ملفات CSS التانية
 * لو الاسم ملقيناش في أي حتة → القاعدة ميتة ومحدش بيستخدمها.
 *
 * ⭐ اللي بيتحذف بالظبط: قواعد ما فيها غير أسماء ميتة.
 * أي قاعدة فيها اسم حيّة بتفضل زي ما هي. والقواعد اللي مفيش فيها
 * classes أصلاً (زي body/html) بتفضل كمان.
 *
 * ⚠️ ملف واحد بس بيتقلم: ملف المصدر (css/NN-name.css). النسخة
 * المضغوطة (css/NN-name.min.css) بتتولّد تاني من المصدر بـ
 * scripts/minify-css.js.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CSS_DIR = path.join(ROOT, 'css');
const APPLY = process.argv.includes('--apply');

/* الملفات اللي بندور فيها على usage */
const usageSources = [];
function collect(dir, filter) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === '.wrangler' || e.name === 'node_modules') continue;
    const full = path.join(dir, e.name);
    /* ⚠️ مجلد tests بيتجاهَل: الاختبارات بذكر أسماء كلاسز من الـCSS
       في نصوص المقارنة، فلو حسبناها زي usage كل قاعدة هتبان «مستخدمة». */
    if (e.name === 'tests') continue;
    if (e.isDirectory()) collect(full, filter);
    else if (filter(full)) usageSources.push(full);
  }
}
collect(ROOT, (f) => /\.(js|html)$/i.test(f) && !f.includes(path.sep + 'vendor' + path.sep));

const cssFiles = fs.readdirSync(CSS_DIR).filter((n) => n.endsWith('.css') && !n.endsWith('.min.css'));

/* ---------- 1. اجمع كل الأسماء المستخدمة ---------- */
const usedText = usageSources.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
/* أسماء الـclasses المستخدمة في ملفات CSS التانية (كـ selectors) */
const otherCssText = cssFiles.map((n) => fs.readFileSync(path.join(CSS_DIR, n), 'utf8')).join('\n');

/* ---------- 2. حلّل ملفات CSS ---------- */

/* يحلل CSS لـ blocks: كل block = { start, end, text, selectors[] } */
function parseBlocks(src) {
  const lines = src.split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    /* كومنت لوحده */
    if (/^\s*\/\*/.test(line)) {
      let j = i;
      while (j < lines.length && !/\*\//.test(lines[j])) j++;
      blocks.push({ kind: 'comment', start: i, end: Math.min(j, lines.length - 1), text: lines.slice(i, j + 1).join('\n'), selectors: [] });
      i = j + 1;
      continue;
    }
    if (!line.trim()) { i++; continue; }
    /* @media / @supports ... { */
    if (/^\s*@/.test(line) && line.includes('{')) {
      /* نجمع لحد ما يتقفل الـ brace */
      let depth = 0, j = i;
      for (; j < lines.length; j++) {
        for (const ch of lines[j]) {
          if (ch === '{') depth++;
          else if (ch === '}') depth--;
        }
        if (depth === 0 && j > i) break;
        if (depth === 0 && j === i && lines[j].includes('}')) break;
      }
      blocks.push({ kind: 'at', start: i, end: j, text: lines.slice(i, j + 1).join('\n'), selectors: [] });
      i = j + 1;
      continue;
    }
    /* قاعدة عادية: من السطر الحالي لحد الـ { ... } */
    let depth = 0, j = i, seen = false;
    for (; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === '{') { depth++; seen = true; }
        else if (ch === '}') depth--;
      }
      if (seen && depth === 0) break;
    }
    const text = lines.slice(i, j + 1).join('\n');
    const selPart = text.slice(0, text.indexOf('{'));
    const selectors = selPart.split(',').map((s) => s.trim()).filter(Boolean);
    blocks.push({ kind: 'rule', start: i, end: j, text, selectors });
    i = j + 1;
  }
  return { lines, blocks };
}

/* أسماء الـclasses في selector */
function classesOf(sel) {
  const out = [];
  const re = /\.([A-Za-z_][\w-]*)/g;
  let m;
  while ((m = re.exec(sel))) out.push(m[1]);
  return out;
}

/* ---------- 3. حساب الأحياء (نقطة ثابتة) ---------- */
/*
   الاسم «حي» لو:
     - مستخدم في HTML أو JS، أو
     - بيظهر في قاعدة CSS تانية حيّة (زي .foo .bar لما .foo حي)
   الأحياء بيكبر لحد ما يثبت — وده اللي بيمسك القواعد المركّبة.

   ⚠️ المطابقة لازم بحدود الكلمة: في HTML وJS أسماء الكلاسز بتيجي
   كعادي (class="btn btn-small") مش بنقطة. لو استخدمنا نقطة، كانت
   هتتشال قواعد حيّة زي .btn-small و.field-grid.
*/
const aliveNames = new Set();
for (const f of usageSources) {
  const text = fs.readFileSync(f, 'utf8');
  const re = /\.[A-Za-z_][\w-]*/g;
  let m;
  while ((m = re.exec(text))) aliveNames.add(m[0].slice(1));
}
/* أسماء الكلاسز المذكورة كعادي (class="..." أو 'class foo') */
for (const f of usageSources) {
  const text = fs.readFileSync(f, 'utf8');
  const re = /class(?:Name)?\s*=\s*["'`]([^"'`]+)["'`]/g;
  let m;
  while ((m = re.exec(text))) {
    for (const w of m[1].split(/[\s<>"'`]+/)) {
      const n = w.trim();
      if (n && /^[A-Za-z_][\w-]*$/.test(n)) aliveNames.add(n);
    }
  }
  /* وقوالب JS زي 'btn btn-ghost btn-small' جوه string */
  const re2 = /["'`]\s*([a-z][\w-]*(?:\s+[a-z][\w-]*)+)\s*["'`]/g;
  while ((m = re2.exec(text))) {
    for (const w of m[1].split(/\s+/)) {
      if (/^[A-Za-z_][\w-]*$/.test(w)) aliveNames.add(w);
    }
  }
}

const parsed = new Map();
for (const file of cssFiles) {
  const p = path.join(CSS_DIR, file);
  const src = fs.readFileSync(p, 'utf8');
  const { lines, blocks } = parseBlocks(src);
  parsed.set(file, { p, src, lines, blocks });
}

let changed = true;
let rounds = 0;
while (changed && rounds < 20) {
  changed = false;
  rounds++;
  for (const { blocks } of parsed.values()) {
    for (const b of blocks) {
      if (b.kind !== 'rule') continue;
      const names = [...new Set(b.selectors.flatMap(classesOf))];
      if (!names.length) continue;
      if (names.some((n) => aliveNames.has(n))) {
        for (const n of names) {
          if (!aliveNames.has(n)) { aliveNames.add(n); changed = true; }
        }
      }
    }
  }
}

/* ---------- 4. حسب لكل ملف ---------- */
let totalRemoved = 0;
const report = [];

for (const [file, { p, src, lines, blocks }] of parsed) {
  const dead = new Set();
  const usedNames = new Map();

  for (const b of blocks) {
    if (b.kind !== 'rule') continue;
    const names = [...new Set(b.selectors.flatMap(classesOf))];
    if (!names.length) continue;
    const alive = names.filter((n) => aliveNames.has(n));
    if (alive.length) {
      alive.forEach((n) => {
        if (!usedNames.has(n)) usedNames.set(n, []);
        usedNames.get(n).push(b.start + 1);
      });
      continue;
    }
    for (let k = b.start; k <= b.end; k++) dead.add(k);
  }

  if (!dead.size) continue;

  /* نحذف كمان الكومنتات اللي جوّاها قواعد ميتة فقط */
  for (const b of blocks) {
    if (b.kind !== 'comment') continue;
    let allDead = true;
    for (let k = b.start; k <= b.end; k++) {
      if (lines[k].trim() && !dead.has(k)) { allDead = false; break; }
    }
    if (allDead) for (let k = b.start; k <= b.end; k++) dead.add(k);
  }

  const kept = lines.filter((_, idx) => !dead.has(idx));
  const removedBytes = src.length - kept.join('\n').length;
  totalRemoved += removedBytes;
  report.push({ file, removedLines: dead.size, removedBytes });

  if (APPLY) {
    fs.writeFileSync(p, kept.join('\n'), 'utf8');
  }
}

report.sort((a, b) => b.removedBytes - a.removedBytes);
console.log('=== قواعد CSS ميتة ===');
for (const r of report) {
  console.log('  ' + r.file.padEnd(28) + String(r.removedLines).padStart(5) + ' سطر   ' +
    (r.removedBytes / 1024).toFixed(1).padStart(7) + ' KB');
}
console.log('  الإجمالي: ' + (totalRemoved / 1024).toFixed(1) + ' KB' +
  (APPLY ? '  (اتطبّق)' : '  (تقرير — استخدم --apply للتنفيذ)'));
