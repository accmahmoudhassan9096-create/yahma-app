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

/* specificity: id*10000 + class*100 + type
   ⭐ لازم تتحسب لكل جزء من قائمة الـselectors لوحده وناخد
   الأعلى. '.a, .b.c' عندنا الـb.c أقوى — ولو حسبنا السلسلة كلها
   كانت الـspecificity بتاعة '.a' هتكون غلط. */
function specificity(sel) {
  let best = 0;
  for (const part of sel.split(',')) {
    const s = part.trim();
    if (!s) continue;
    const ids = (s.match(/#[\w-]+/g) || []).length;
    const classes = (s.match(/\.[\w-]+/g) || []).length;
    const attrs = (s.match(/\[[^\]]+\]/g) || []).length;
    const pseudo = (s.match(/:(?!:)[\w-]+/g) || []).length;
    const types = (s.match(/(^|[\s>+~,(])[a-zA-Z][\w-]*/g) || []).length;
    const v = ids * 10000 + (classes + attrs + pseudo) * 100 + types;
    if (v > best) best = v;
  }
  return best;
}

/* ⭐ ترتيب الكاسكاد الحقيقي في CSS:
   1) !important بيكسب على أي قاعدة عادية — حتى لو الـspecificity
      بتاعها أقل. ده اللي كنت فاكره غلط أول مرة.
   2) جوّه نفس الفئة (important مع important، أو عادي مع عادي):
      الـspecificity الأعلى بيكسب.
   3) لو الـspecificity متساوي: الملف المتأخر بيكسب. */
function pickWinner(cands, specOf) {
  if (!cands.length) return null;
  const important = cands.filter((r) => r.important);
  const pool = important.length ? important : cands;
  const maxSpec = Math.max.apply(null, pool.map(specOf));
  const top = pool.filter((r) => specOf(r) === maxSpec);
  const maxFile = Math.max.apply(null, top.map((r) => CSS_FILES.indexOf(r.file)));
  const inFile = top.filter((r) => CSS_FILES.indexOf(r.file) === maxFile);
  return inFile[inFile.length - 1];
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
  return pickWinner(cands, (r) => r.spec);
}

/* ---------- حل الكاسكاد على عنصر حقيقي ---------- */

/* ⭐ ده الحل الصح: نشوف مين بيكسب على **عنصر** معيّن، مش على
   selector نصّي. لما نجمّع بالـselector النصّي، كل القواعد في
   المجموعة ليها نفس الـspecificity بالضرورة — فمفيش طريقة
   تكتشف تعارض صامت. لازم نجمّع حسب العنصر. */

const lastCompound = (sel) => {
  const parts = sel.split(/[\s>+~]+/).filter(Boolean);
  return parts[parts.length - 1] || '';
};
const classesOfSel = (sel) => [...sel.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
/* اسم الوسم في آخر جزء (th / button / span…) */
const typeOf = (compound) => {
  const m = compound.match(/(^|[\s>+~(])([a-zA-Z][\w-]*)/);
  return m ? m[2] : null;
};
const idsOfSel = (sel) => [...sel.matchAll(/#([\w-]+)/g)].map((m) => m[1]);

/* هل القاعدة بتنطبق على العنصر ده؟ */
function appliesTo(ruleSel, probePath) {
  /* ⭐ قاعدة فيها '>' أو '+' أو '~' بتستهدف عنصر ابن/أخ، مش العنصر
     نفسه. المجموع بيوصف عنصر واحد — فالقاعدة دي مش بتنطبق عليه.
     (من غير ده، '.a > *' كانت بتتطبق على أي عنصر في الصفحة.) */
  if (/[>+~]/.test(ruleSel)) return false;
  const r = lastCompound(ruleSel);
  const p = lastCompound(probePath);
  /* ⭐ pseudo-element (::before/::after) مش العنصر نفسه */
  if (/::/.test(r)) return false;
  /* ⭐ قاعدة على وسم (th / button) مش بتنطبق على عنصر من وسم تاني */
  const rt = typeOf(r);
  if (rt && typeOf(p) !== rt) return false;
  const rIds = idsOfSel(r);
  const rCls = classesOfSel(r);
  if (rIds.length && rIds.some((i) => idsOfSel(p).indexOf(i) === -1)) return false;
  if (rCls.length && rCls.some((c) => classesOfSel(p).indexOf(c) === -1)) return false;
  /* قاعدة على body/html بتطبق على كل حاجة */
  const rTypes = r.match(/(^|[\s>+~])([a-zA-Z][\w-]*)/g) || [];
  if (rTypes.length) {
    const types = rTypes.map((t) => t.replace(/[\s>+~]/g, ''));
    const pTypes = (p.match(/(^|[\s>+~])([a-zA-Z][\w-]*)/g) || []).map((t) => t.replace(/[\s>+~]/g, ''));
    if (!types.some((t) => pTypes.indexOf(t) > -1)) return false;
  }
  return true;
}

/* solve: مين بيكسب على العنصر ده للخاصية دي؟
   opts: { media: null|string, mode: 'light'|'dark'|'any' } */
function solve(all, probePath, prop, opts) {
  opts = opts || {};
  const media = opts.media === undefined ? null : opts.media;
  const mode = opts.mode || 'any';

  let cands = all.filter((r) => r.prop === prop && appliesTo(r.selector, probePath));
  /* ⭐ media query مابيلغيش القواعد اللي برّه أي media — دي بتتطبق
     دايمًا. فلو الشاشة موبايل، القواعد العامة + قواعد الـmax-width
     بتتطبق مع بعض. (كنت بستبعد القواعد العامة وده كان بيوصل
     لنتايج غلط.) */
  if (media === null) cands = cands.filter((r) => !r.media);
  else if (typeof media === 'string') {
    cands = cands.filter((r) => !r.media || (r.media && r.media.indexOf(media) > -1));
  }

  if (mode === 'light') cands = cands.filter((r) => r.selector.indexOf('.dark-mode') === -1);

  if (!cands.length) return null;

  /* الـspecificity الفعلية: body.dark-mode بيزوّد class واحد */
  const specOf = (r) => r.spec + (mode === 'dark' && r.selector.indexOf('.dark-mode') > -1 ? 100 : 0);
  return pickWinner(cands, specOf);
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

test('الهيدر يثبت فوق على الموبايل (sticky)', () => {
  /* ⭐ كسر حقيقي كان موجود: 07-visual-redesign كان فيه
     `position:relative` في القاعدة العامة، فكان بيلغي
     `position:sticky` اللي في 04-dark-overrides جوه
     @media(max-width:700px). وmedia query مابيزوّدش specificity،
     والملف المتأخر بيكسب. النتيجة: الهيدر ماكانش بيثبت. */
  const w = solve(ALL, 'body .topbar.topbar-v43', 'position', { media: 'max-width:700px', mode: 'light' });
  assert.ok(w, 'مفيش قاعدة position للهيدر');
  assert.strictEqual(w.value, 'sticky',
    'الهيدر لازم يثبت فوق على الموبايل — غلطه: ' + w.value + ' (من ' + w.file + ')');
});

test('المحتوى بيحترم منطقة الأمان السفلية في آيفون', () => {
  /* ⭐ كسر تاني: 07 كان بيلغي env(safe-area-inset-bottom) من
     padding الـcontent على الموبايل، فآخر صف في المحتوى بيختفي
     تحت مؤشر البيت في آيفون. */
  const w = solve(ALL, 'body .content', 'padding', { media: 'max-width:700px', mode: 'light' });
  assert.ok(w, 'مفيش قاعدة padding للـcontent');
  assert.ok(/env\(safe-area-inset-bottom\)/.test(w.value),
    'padding تحت 700px لازم يحترم env(safe-area-inset-bottom) — غلطه: ' + w.value);
});

test('سطر الشريط العلوي: واحد على الديسكتوب، اثنين على الموبايل', () => {
  const desk = solve(ALL, 'body .topbar.topbar-v43 .topbar-actions', 'flex-wrap', { mode: 'light' });
  assert.ok(desk, 'مفيش قاعدة flex-wrap');
  assert.strictEqual(desk.value, 'nowrap', 'على الديسكتوب: ' + desk.value + ' (' + desk.file + ')');

  const mob = solve(ALL, 'body .topbar.topbar-v43 .topbar-actions', 'flex-wrap', { media: 'max-width:900px', mode: 'light' });
  assert.ok(mob, 'مفيش قاعدة flex-wrap على الموبايل');
  assert.strictEqual(mob.value, 'wrap', 'على الموبايل: ' + mob.value + ' (' + mob.file + ')');
});

test('أزرار الشريط العلوي شفافة في الوضع الليلي (مش رمادية فاتحة)', () => {
  /* الـdark override بتاع 04 كان بيتلغى بـ!important في 07 —
     النتيجة إن أزرار الهيدر بتبقى فاتحة حتى في الوضع الليلي. */
  const w = solve(ALL, 'body .topbar.topbar-v43 .btn', 'background', { mode: 'dark' });
  assert.ok(w, 'مفيش قاعدة background لزراير الشريط');
  assert.ok(!/255\s*,\s*255\s*,\s*255/.test(w.value),
    'زرار الهيدر في الوضع الليلي لازم يكون غامق — غلطه: ' + w.value + ' (' + w.file + ')');
});

test('التبويب اللي عليه الصلاحية بيبقى مفعّل للعامل', () => {
  /* canAccessYahmaTab لازم تسمح بتبويب مفيش له استثناء. */
  const src = fs.readFileSync(path.join(ROOT, 'core', 'branches-store.js'), 'utf8');
  const m = /PAGE_PERMISSION_OPTIONS=\[([\s\S]*?)\];/.exec(src);
  assert.ok(m, 'لقائمة الأقسام');
  const tabs = [...m[1].matchAll(/id:'([^']+)'/g)].map((x) => x[1]);
  const router = fs.readFileSync(path.join(ROOT, 'core', 'render-router.js'), 'utf8');
  /* كل تبويب بيتعرض في الراوتر لازم يكون في قائمة الصلاحيات */
  const routed = [...router.matchAll(/currentTab\s*===\s*'([^']+)'/g)].map((x) => x[1]);
  const missing = routed.filter((t) => tabs.indexOf(t) === -1 && t !== 'dashboard');
  assert.deepStrictEqual(missing, [],
    'تبويبات بتتعرض في الراوتر بس مش في قائمة الصلاحيات — هتتقفل لغير المدير:');
});

test('مفيش قاعدة بتلغي قاعدة أهم من غير ما تكون واضحة', () => {
  /* ⭐ القاعدة العامة: لو ملف متأخر بيلغي خاصية لعنصر معروف،
     لازم يكون إما بـ!important أو بـspecificity أعلى — وإلا فالنية
     كانت إن الملف الأقدم يكسب واللي في المتأخر مالوش لازمة.
     بنطلّع الحالات اللي فيها تعارض فعلي بين ملفين. */
  const probes = [
    { path: 'body .topbar.topbar-v43', props: ['background', 'position', 'padding'] },
    { path: 'body .topbar.topbar-v43 .btn', props: ['background', 'color', 'border'] },
    { path: 'body .content', props: ['padding'] },
    { path: 'body .sidebar', props: ['width', 'background'] },
    { path: 'body .panel', props: ['background', 'border'] }
  ];
  const silent = [];
  probes.forEach((pr) => {
    pr.props.forEach((prop) => {
      const byFile = new Map();
      for (const r of ALL) {
        if (r.media) continue;
        if (r.prop !== prop) continue;
        if (!appliesTo(r.selector, pr.path)) continue;
        if (!byFile.has(r.file)) byFile.set(r.file, []);
        byFile.get(r.file).push(r);
      }
      if (byFile.size < 2) return;
      const all = [];
      byFile.forEach((list) => list.forEach((r) => all.push(r)));
      /* الملف اللي بيكسب فعليًا — في النور بس. في الوضع الليلي
         الملف الليلي هو المفروض يكسب (أعلى specificity) وده مقصود
         في بنية المشروع، فحسابه مع fairer كان بيدي تعارضات وهمية. */
      ['light'].forEach((mode) => {
        const cands = all.filter((r) => mode !== 'light' || r.selector.indexOf('.dark-mode') === -1);
        const win = pickWinner(cands, (r) => r.spec + (mode === 'dark' && r.selector.indexOf('.dark-mode') > -1 ? 100 : 0));
        if (!win) return;
        const winFile = win.file;
        /* لو فيه ملف تاني فيه نفس الخاصية بس الملف الأقدم بيكسب →
           التعديل في المتأخر مالوش لازمة (ساكت) */
        const later = cands.filter((r) => CSS_FILES.indexOf(r.file) > CSS_FILES.indexOf(winFile));

        if (later.length) {
          silent.push(pr.path + ' { ' + prop + ' } [' + mode + '] — ' + winFile +
            ' بيكسب، وفيه قاعدة في ' + later.map((r) => r.file).join(', '));
        }
      });
    });
  });
  assert.deepStrictEqual(silent, [], 'قواعد بتتكسر بصمت:');
});
