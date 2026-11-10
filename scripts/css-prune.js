/* ===== scripts/css-prune.js — يشيل قواعد الـCSS الميتة بأمان =====

   usage: node scripts/css-prune.js          → تقرير فقط (مفيش تعديل)
          node scripts/css-prune.js --apply  → ينفّذ الحذف

   ⭐ «ميت» يعني: كل الكلاسز اللي في الـselector ده **مش بترسم
   خالص** في أي HTML ولا في أي JS. مثال: `.home-hero` كان معرّف في
   6 ملفات CSS ولسه محدش بيكتبه — الداشبورد اتحوّل لنسخة تانية
   بالكامل.

   الطريقة:
   1) نجمع أسماء الكلاسز اللي **بتترسم فعلاً**:
      class="a b" / className='a b' / classList.add('a') /
      querySelector('.a') — في HTML وفي كل ملفات JS.
      ⚠️ أي حاجة تانية (زي تعريفات CSS جوّه <style> في الجلسات) ما
      بتعدّش استخدام.
   2) لكل قاعدة، الـselector بيتبعت لـparts (لأن , فاصل بين
      بديلين). الجزء بيعيش لو **كل** كلاسزاته مستخدمة. غير كده
      الجزء ده ميت.
   3) نعمل ده لحد ما يثبت (نقطة ثابتة) — عشان القواعد المركّبة
      زي `.foo .bar` ماتخسرش لو `.foo` حي.
   4) القاعدة اللي كل أجزائها ميتة → تشال. لو بعضها ميت وبعضها
      حي → بنقصّر الـselector list.

   ⚠️ ملف واحد بس بيتقلم: ملف المصدر (css/NN-name.css). النسخة
   المضغوطة (css/NN-name.min.css) بتتولّد تاني من المصدر بـ
   scripts/minify-css.js.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CSS_DIR = path.join(ROOT, 'css');
const APPLY = process.argv.includes('--apply');

/* ---------- ملفات الاستخدام ---------- */
const usageSources = [];
function collect(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === '.wrangler' || e.name === 'node_modules') continue;
    /* ⚠️ مجلد tests بيتجاهَل: الاختبارات بذكر أسماء كلاسز من الـCSS
       في نصوص المقارنة، فلو حسبناها زي usage كل قاعدة هتبان «مستخدمة». */
    if (e.name === 'tests') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) collect(full);
    else if (/\.(js|html)$/i.test(full) && full.indexOf(path.sep + 'vendor' + path.sep) === -1) {
      usageSources.push(full);
    }
  }
}
collect(ROOT);

const cssFiles = fs.readdirSync(CSS_DIR).filter((n) => n.endsWith('.css') && !n.endsWith('.min.css'));

/* ---------- 1. الأحياء ---------- */
const aliveNames = new Set();
const addWords = (chunk) => {
  for (const w of String(chunk).split(/[\s<>"']+/)) {
    for (const t of (w.match(/[A-Za-z_][\w-]*/g) || [])) aliveNames.add(t);
  }
};
for (const f of usageSources) {
  const text = fs.readFileSync(f, 'utf8');
  let m;
  const reClass = /class\s*=\s*["'`]([^"'`]*)/g;
  while ((m = reClass.exec(text))) addWords(m[1]);
  const reClassName = /className\s*=\s*["'`]([^"'`]*)/g;
  while ((m = reClassName.exec(text))) addWords(m[1]);
  const reList = /classList\.(?:add|remove|toggle)\(\s*["'`]([^"'`]+)/g;
  while ((m = reList.exec(text))) addWords(m[1]);
  const reSel = /(?:querySelector|querySelectorAll|matches|closest)\(\s*["'`]([^"'`]+)/g;
  while ((m = reSel.exec(text))) {
    for (const cm of (m[1].match(/\.([A-Za-z_][\w-]*)/g) || [])) aliveNames.add(cm.slice(1));
  }
}

/* ---------- 2. تحليل CSS ---------- */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

function parseBlocks(src) {
  const lines = src.split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*\/\*/.test(line)) {
      let j = i;
      while (j < lines.length && !/\*\//.test(lines[j])) j++;
      blocks.push({ kind: 'comment', start: i, end: Math.min(j, lines.length - 1) });
      i = j + 1;
      continue;
    }
    if (!line.trim()) { i++; continue; }
    if (/^\s*@/.test(line) && line.includes('{')) {
      let depth = 0, j = i;
      for (; j < lines.length; j++) {
        for (const ch of lines[j]) {
          if (ch === '{') depth++;
          else if (ch === '}') depth--;
        }
        if (depth === 0 && j > i) break;
        if (depth === 0 && j === i && lines[j].includes('}')) break;
      }
      blocks.push({ kind: 'at', start: i, end: j });
      i = j + 1;
      continue;
    }
    let depth = 0, j = i, seen = false;
    for (; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === '{') { depth++; seen = true; }
        else if (ch === '}') depth--;
      }
      if (seen && depth === 0) break;
    }
    blocks.push({
      kind: 'rule',
      start: i,
      end: j,
      selPart: lines.slice(i, j + 1).join('\n').slice(0, lines.slice(i, j + 1).join('\n').indexOf('{'))
    });
    i = j + 1;
  }
  return { lines, blocks };
}

const classesOf = (sel) => [...new Set([...stripComments(sel).matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]))];

/* ---------- 3. نقطة ثابتة ---------- */
/* الجزء من الـselector بيعيش لو كل كلاسزاته في aliveNames.
   والكلاسزات من الأجزاء الحية بتتضاف لـaliveNames. */
const parsed = new Map();
for (const file of cssFiles) {
  const p = path.join(CSS_DIR, file);
  const src = fs.readFileSync(p, 'utf8');
  const { lines, blocks } = parseBlocks(src);
  parsed.set(file, { p, src, lines, blocks });
}

const partAlive = (part) => {
  const names = classesOf(part);
  if (!names.length) return true;          /* body/html — دايمًا حي */
  return names.every((n) => aliveNames.has(n));
};

let changed = true;
let rounds = 0;
while (changed && rounds < 30) {
  changed = false;
  rounds++;
  for (const { blocks } of parsed.values()) {
    for (const b of blocks) {
      if (b.kind !== 'rule') continue;
      const parts = b.selPart.split(',').map((s) => s.trim()).filter(Boolean);
      if (!parts.length) continue;
      const aliveParts = parts.filter(partAlive);
      if (!aliveParts.length) continue;
      for (const part of aliveParts) {
        for (const n of classesOf(part)) {
          if (!aliveNames.has(n)) { aliveNames.add(n); changed = true; }
        }
      }
    }
  }
}

/* ---------- 4. الحذف ---------- */
let totalRemoved = 0;
let totalShortened = 0;
const report = [];

for (const [file, { p, src, lines, blocks }] of parsed) {
  const dead = new Set();
  const shorten = [];

  for (const b of blocks) {
    if (b.kind !== 'rule') continue;
    const parts = b.selPart.split(',').map((s) => s.trim()).filter(Boolean);
    if (!parts.length) continue;
    const aliveParts = parts.filter(partAlive);
    if (aliveParts.length === parts.length) continue;
    if (!aliveParts.length) {
      /* القاعدة كلها ميتة → تشال */
      for (let k = b.start; k <= b.end; k++) dead.add(k);
    } else {
      /* بعض الأجزاء ميتة → نقصّر الـselector list */
      shorten.push({ block: b, keep: aliveParts });
    }
  }

  /* الكومنتات اللي جوّاها قواعد ميتة فقط */
  for (const b of blocks) {
    if (b.kind !== 'comment') continue;
    let allDead = true;
    for (let k = b.start; k <= b.end; k++) {
      if (lines[k].trim() && !dead.has(k)) { allDead = false; break; }
    }
    if (allDead) for (let k = b.start; k <= b.end; k++) dead.add(k);
  }

  if (!dead.size && !shorten.length) continue;

  /* نطبّق التقصير الأول على نسخة من السطور (عشان الأرقام تفضل
     صالحة)، وبعدين نشيل السطور الميتة.
     ⚠️ لازم نحافظ على الـ{ — الـselector ممكن يكون على أكتر من
     سطر والـ{ بيكون في آخر سطر منه. */
  const copy = lines.slice();
  for (const sh of shorten) {
    const b = sh.block;
    const selLines = b.selPart.split('\n');
    const firstIdx = b.start;
    const lastIdx = b.start + selLines.length - 1;
    const newSel = sh.keep.join(',');
    if (selLines.length === 1) {
      /* سطر واحد: نستبدل الجزء الخاص بالـselector بس وبنسيب الـ{ */
      copy[firstIdx] = copy[firstIdx].split(b.selPart).join(newSel);
    } else {
      /* selector على أكتر من سطر: نخليه سطر واحد، والـ{ بيفضل
         في آخر سطر */
      const braceAt = copy[lastIdx].indexOf('{');
      const rest = braceAt > -1 ? copy[lastIdx].slice(braceAt) : '{';
      copy[firstIdx] = newSel;
      copy[lastIdx] = rest;
      for (let k = firstIdx + 1; k < lastIdx; k++) dead.add(k);
    }
  }
  const out = copy.filter((_, idx) => !dead.has(idx));

  const kept = out.join('\n');
  const removedBytes = src.length - kept.length;
  totalRemoved += removedBytes;
  totalShortened += shorten.length;
  report.push({ file, removedLines: dead.size, shortened: shorten.length, removedBytes });

  if (APPLY) fs.writeFileSync(p, kept, 'utf8');
}

report.sort((a, b) => b.removedBytes - a.removedBytes);
console.log('=== قواعد CSS ميتة ===');
for (const r of report) {
  console.log('  ' + r.file.padEnd(28) + String(r.removedLines).padStart(5) + ' سطر   ' +
    (r.removedBytes / 1024).toFixed(1).padStart(7) + ' KB' +
    (r.shortened ? '   (+' + r.shortened + ' selector مقصوص)' : ''));
}
console.log('  الإجمالي: ' + (totalRemoved / 1024).toFixed(1) + ' KB' +
  (APPLY ? '  (اتطبّق)' : '  (تقرير — استخدم --apply للتنفيذ)'));
