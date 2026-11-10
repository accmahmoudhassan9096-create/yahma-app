/* ===== tests/cascade.test.js — حارس الـCSS الكاسكاد =====

   المشكلة اللي بيحلّها:
   المشروع فيه 8 ملفات CSS بيتحمّلوا بالترتيب، وكل ملف فوقه
   بيلغي اللي قبله بـ!important. ده مريح من ناحية التصميم، بس
   بيخفي أخطاء: قاعدة في ملف متأخر بـspecificity أعلى بتلغي قصد
   الملف الأول من غير ما حد ياخد باله.

   المثال الحقيقي: `flex-wrap:nowrap!important` اتكتب في
   01-base و04-dark-overrides، بس 07-visual-redesign كان فيه
   `flex-wrap:wrap!important` بـselector أعلى — فالتصميم اللي
   اتظبط مكانش هو اللي اشتغل. وكمان `#btn-logout` كان مخفي
   بـCSS وid موجود في JS — يعني المستخدم مابيضغطش حاجة.

   الاختبارات دي بتحسب مين بيكسب فعلًا (ترتيب الملفات +
   specificity + !important + @media) وتتحقق من النتيجة المتوقعة. */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CSS_DIR = path.join(ROOT, 'css');

/* ترتيب التحميل الحقيقي — لازم يطابق index.html */
const CSS_FILES = [
  'fonts.css',
  '01-base.css',
  '02-components.css',
  '03-motion-layout.css',
  '04-dark-overrides.css',
  '05-offline-badge.css',
  '06-premium-design.css',
  '07-visual-redesign.css'
];

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

/* ---------- تحليل CSS ---------- */

function parseCss(file) {
  const src = fs.readFileSync(path.join(CSS_DIR, file), 'utf8');
  const rules = [];
  let order = 0;

  /* لازم نفهم الـ@media: قاعدة جوه @media(max-width:900px) مش
     مطبّقة على الديسكتوب. لو عدناها كأنها دايمًا، حساب الكاسكاد
     بيطلع غلط. */
  function scan(text, media) {
    let i = 0;
    while (i < text.length) {
      const brace = text.indexOf('{', i);
      if (brace < 0) break;
      /* الـprelude هو كل اللي بين آخر قاعدة والـ{ الحالية */
      const prelude = stripComments(text.slice(i, brace)).trim();

      if (prelude.startsWith('@media')) {
        const cond = prelude.slice(6).trim();
        let depth = 1;
        let j = brace + 1;
        while (j < text.length && depth > 0) {
          if (text[j] === '{') depth++;
          else if (text[j] === '}') depth--;
          j++;
        }
        scan(text.slice(brace + 1, j - 1), media ? media + ' and ' + cond : cond);
        i = j + 1;
        continue;
      }

      let depth = 0;
      let j = brace;
      for (; j < text.length; j++) {
        if (text[j] === '{') depth++;
        else if (text[j] === '}') { depth--; if (depth === 0) break; }
      }
      const body = text.slice(brace + 1, j);
      if (prelude) {
        const declRe = /([-a-zA-Z]+)\s*:\s*([^;]+)(;)?/g;
        let d;
        while ((d = declRe.exec(body))) {
          const prop = d[1].trim();
          const raw = d[2].trim();
          rules.push({
            selector: prelude,
            prop,
            value: raw.replace(/!important\s*$/i, '').trim(),
            important: /!important\s*$/i.test(raw),
            file,
            media,
            order: order++,
            spec: specificity(prelude)
          });
        }
      }
      i = j + 1;
    }
  }
  scan(src, null);
  return rules;
}

/* specificity: id*10000 + class*100 + type */
function specificity(sel) {
  const s = sel.trim();
  const ids = (s.match(/#[\w-]+/g) || []).length;
  const classes = (s.match(/\.[\w-]+/g) || []).length;
  const attrs = (s.match(/\[[^\]]+\]/g) || []).length;
  const pseudo = (s.match(/:(?!:)[\w-]+/g) || []).length;
  const types = (s.match(/(^|[\s>+~,(])[a-zA-Z][\w-]*/g) || []).length;
  return ids * 10000 + (classes + attrs + pseudo) * 100 + types;
}

/* ============ الكاسكاد ============ */

/* الفايزر لمحدّد (selector, prop).
   mediaFilter: null = بس القواعد اللي مفيش media عليها (ديسكتوب)
                أو string = القواعد جوّه media query معين */
function winner(all, selector, prop, mediaFilter) {
  /* الافتراضي: ديسكتوب — بس القواعد اللي برّه أي media query */
  if (mediaFilter === undefined) mediaFilter = null;
  let cands = all.filter((r) => r.selector === selector && r.prop === prop);
  if (mediaFilter === null) cands = cands.filter((r) => !r.media);
  else if (typeof mediaFilter === 'string') cands = cands.filter((r) => r.media && r.media.indexOf(mediaFilter) > -1);
  if (!cands.length) return null;
  const maxSpec = Math.max.apply(null, cands.map((r) => r.spec));
  const top = cands.filter((r) => r.spec === maxSpec);
  const anyImportant = top.some((r) => r.important);
  const pool = anyImportant ? top.filter((r) => r.important) : top;
  const maxFile = Math.max.apply(null, pool.map((r) => CSS_FILES.indexOf(r.file)));
  const inFile = pool.filter((r) => CSS_FILES.indexOf(r.file) === maxFile);
  return inFile[inFile.length - 1];
}

/* هل العنصر ده بيتخبّى بـCSS (مش بالـhidden attribute)؟ */
function hiddenByCss(all, id) {
  const out = [];
  for (const r of all) {
    if (r.prop !== 'display' && r.prop !== 'visibility') continue;
    if (!r.important) continue;
    if (!/^none$/i.test(r.value) && !/^hidden$/i.test(r.value)) continue;
    const sel = r.selector;
    if (sel.indexOf('#' + id) === -1) continue;
    const rest = sel.split('#' + id).join('');
    if (/[\w-]/.test(rest)) continue;   /* ده id تاني */
    out.push({ selector: sel, prop: r.prop, value: r.value, file: r.file });
  }
  return out;
}

/* ---------- البيانات ---------- */

const ALL = [];
for (const f of CSS_FILES) {
  for (const r of parseCss(f)) ALL.push(r);
}

const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const HTML_IDS = new Set([...HTML.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

const JS_IDS = new Set();
const jsFiles = [
  ...fs.readdirSync(path.join(ROOT, 'modules')).filter((f) => f.endsWith('.js')).map((f) => path.join('modules', f)),
  ...fs.readdirSync(path.join(ROOT, 'core')).filter((f) => f.endsWith('.js')).map((f) => path.join('core', f))
];
for (const rel of jsFiles) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const m of src.matchAll(/getElementById\(\s*'([^']+)'\s*\)/g)) JS_IDS.add(m[1]);
  for (const m of src.matchAll(/getElementById\(\s*"([^"]+)"\s*\)/g)) JS_IDS.add(m[1]);
  for (const m of src.matchAll(/querySelector\(\s*['"]#([\w-]+)['"]\s*\)/g)) JS_IDS.add(m[1]);
}

/* ================= الاختبارات ================= */

test('الـCSS بيتحمّل بالترتيب الصح (المهم لحساب الكاسكاد)', () => {
  const links = [...HTML.matchAll(/<link rel="stylesheet" href="css\/([^"]+)">/g)].map((m) => m[1]);
  const sources = links.map((n) => n.replace(/\.min\.css$/, '.css'));
  assert.deepStrictEqual(sources, CSS_FILES,
    'ترتيب CSS في index.html لازم يطابق CSS_FILES هنا');
});

test('الشريط العلوي: سطر واحد على الديسكتوب (مش بيتقسم)', () => {
  const w = winner(ALL, '.topbar.topbar-v43 .topbar-actions', 'flex-wrap');
  assert.ok(w, 'مفيش قاعدة flex-wrap على .topbar-actions');
  assert.strictEqual(w.value, 'nowrap',
    'الشريط العلوي لازم يفضل سطر واحد على الديسكتوب — غلطه: ' + w.value + ' (من ' + w.file + ')');
});

test('الشريط العلوي: على الموبايل يرجع سطرين (البحث ياخد سطر لوحده)', () => {
  const w = winner(ALL, '.topbar.topbar-v43 .topbar-actions', 'flex-wrap', 'max-width:900px');
  assert.ok(w, 'مفيش قاعدة flex-wrap جوّه media query');
  assert.strictEqual(w.value, 'wrap',
    'تحت 900px لازم يرجع wrap — غلطه: ' + w.value + ' (من ' + w.file + ')');
});

test('زرار الخروج ظاهر ومش مخفي بـCSS', () => {
  assert.deepStrictEqual(hiddenByCss(ALL, 'btn-profile-logout'), [],
    'زرار تسجيل الخروج لازم يفضل ظاهر');
});

test('مفيش عنصر مربوط بالـJS مخفي بـCSS بـ!important', () => {
  /* ⭐ ده اللي كان بيكسر فعلاً: عنصر الـJS بيقراه وبيحاول يتعامل
     معاه، بس CSS بيخفيه بـ!important — فالكود شغّال على عنصر
     مش موجود على الشاشة. */
  const offenders = [];
  for (const id of JS_IDS) {
    if (!HTML_IDS.has(id)) continue;
    const hidden = hiddenByCss(ALL, id);
    if (hidden.length) {
      offenders.push(id + ' -> ' + hidden.map((h) => h.file + ' {' + h.selector + '}').join(', '));
    }
  }
  assert.deepStrictEqual(offenders, [], 'عناصر مربوطة بالـJS بس مخفية بـCSS:');
});

test('العناصر اللي الـJS بيظهرها (hidden attribute) مش مخفية بـCSS', () => {
  /* عناصر زي #umt-undo و#umt-errors مخفية بـhidden في الـHTML،
     والـJS بيظهرها. لو كمان في CSS بيخفيها بـ!important هتفضل
     مخفية للأبد. */
  const shownByJs = new Set();
  for (const rel of jsFiles) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const m of src.matchAll(/getElementById\(\s*'([\w-]+)'\s*\)[\s\S]{0,240}?\.hidden\s*=\s*false/g)) shownByJs.add(m[1]);
    for (const m of src.matchAll(/getElementById\(\s*'([\w-]+)'\s*\)[\s\S]{0,240}?\.style\.display\s*=\s*''/g)) shownByJs.add(m[1]);
  }
  const offenders = [];
  for (const id of shownByJs) {
    if (!HTML_IDS.has(id)) continue;
    for (const h of hiddenByCss(ALL, id)) {
      offenders.push(id + ' -> ' + h.file + ' {' + h.selector + '}');
    }
  }
  assert.deepStrictEqual(offenders, [], 'عناصر الـJS بيظهرها بس CSS بيخفيها بـ!important:');
});

test('كل azرار الـHTML ليها CSS (مفيش زرار مش معرّف)', () => {
  /* زرار في الـHTML من غير أي تنسيق = شكله مكسور. مش خطأ قاتل،
     بس مؤشر على كود ناقص. بيكفي id أو class متعارف عليه. */
  const missing = [];
  for (const m of HTML.matchAll(/<button([^>]*)>/g)) {
    const attrs = m[1];
    const id = (attrs.match(/\sid="([^"]+)"/) || [])[1];
    const cls = ((attrs.match(/\sclass="([^"]+)"/) || [])[1] || '').split(/\s+/).filter(Boolean);
    const byId = id && ALL.some((r) => r.selector.indexOf('#' + id) > -1);
    const byClass = cls.length && cls.some((c) => ALL.some((r) => r.selector.indexOf('.' + c) > -1));
    if (!byId && !byClass) missing.push(id || cls.join('.') || '(بلا id ولا class)');
  }
  assert.deepStrictEqual(missing, [], 'أزرار في index.html من غير أي CSS:');
});

test('مفيش تعارض كاسكاد صامت (ملف متأخر بسpecificity أقل من اللي قبله)', () => {
  /* ⭐ الحالة الخطرة: نفس الـselector ونفس الخاصية في ملفين، والملف
     المتأخر ماعندوش specificity أعلى — يعني التعديل الجديد مش
     بيشتغل أصلاً (القديم بيكسب) والكاتب مش واخد باله.
     التكرار العادي (الملف المتأخر بـspecificity أعلى أو !important)
     هو النمط المقصود في المشروع. */
  const bySel = new Map();
  for (const r of ALL) {
    if (r.media) continue;
    if (!bySel.has(r.selector)) bySel.set(r.selector, []);
    bySel.get(r.selector).push(r);
  }
  const silent = [];
  bySel.forEach((rs, sel) => {
    const byProp = new Map();
    for (const r of rs) {
      if (!byProp.has(r.prop)) byProp.set(r.prop, []);
      byProp.get(r.prop).push(r);
    }
    byProp.forEach((list, prop) => {
      if (list.length < 2) return;
      const sorted = list.slice().sort((a, b) =>
        CSS_FILES.indexOf(a.file) - CSS_FILES.indexOf(b.file) || a.order - b.order);
      const last = sorted[sorted.length - 1];
      const winners = sorted.filter((r) => r.important === last.important);
      const maxSpec = Math.max.apply(null, winners.map((r) => r.spec));
      if (last.spec < maxSpec) {
        silent.push(sel + ' { ' + prop + ' } — ' + last.file + ' (spec ' + last.spec + ') بيخسر قدام spec ' + maxSpec);
      }
    });
  });
  assert.deepStrictEqual(silent, [], 'تعارض كاسكاد صامت:');
});
