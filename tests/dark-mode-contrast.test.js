/* ===== اختبار انحدار: تباين الألوان في الوضع الليلي =====

   المشكلة اللي بيحلّها:
   صفحات كتير (الرئيسية + التقارير) كانت بتكتب ألوانها ثابتة جوه
   inline styles أو جوه <style> بيتحقن مع الصفحة. الألوان دي مش
   بتتغيّر مع body.dark-mode، فكانت بتفضل فاتحة فوق الخلفية الغامقة
   وبتوصل لنسب تباين تحت 1.2:1 — يعني نص مش باين أصلاً.

   الحل اللي اتعمل:
     1) لوحة توكنات (--ds-* / --rp-*) بأسماء ثابتة، قيمتها بتتبدّل
        بين النور والليل. أي عنصر بيستعمل var(--ds-*) بيلّي ملوّن صح.
     2) overrides صريحة في 07-visual-redesign.css للشارات والأزرار
        والجداول والتقارير.

   الاختبار ده بيمنع رجوع المشكلة دي: لو حد رجّع hex ثابت جوه
   inline style في الصفحة الرئيسية أو التقارير، الاختبار بيفشل. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const DESIGN = read('css', '07-visual-redesign.css');
const DASH = read('modules', 'dashboard-view.js');
const REPORTS = read('modules', 'reports.js');

/* بلوك القاعدة اللي بيبدأ بـselector — مهما كان formatting. */
function ruleBlock(src, selector) {
  const i = src.indexOf(selector);
  if (i < 0) return '';
  const open = src.indexOf('{', i);
  if (open < 0) return '';
  const close = src.indexOf('}', open);
  return src.slice(open, close);
}

/* ---------- توكنات الوضعين ---------- */

test('لوحة توكنات الصفحة الرئيسية موجودة في الوضعين', () => {
  const light = /body\s*\{[^}]*--ds-ink:\s*#10243A/.test(DESIGN);
  const dark = /body\.dark-mode\s*\{[^}]*--ds-ink:\s*#E6EEF3/.test(DESIGN);
  assert.ok(light, 'لازم يكون فيه تعريف --ds-ink في الوضع الفاتح');
  assert.ok(dark, 'لازم يكون فيه تعريف --ds-ink في الوضع الليلي');
});

test('كل توكن مستخدم في الوضع الليلي بياخد قيمة مختلفة عن الفاتح', () => {
  /* الأسماء دي بتتبدّل بين الوضعين — لو واحدة منهم اتساوت، يبقى
     فيه عنصر بيفضل فاتح فوق الخلفية الغامقة. */
  const names = ['--ds-ink', '--ds-muted', '--ds-teal', '--ds-teal-2', '--ds-green',
    '--ds-red', '--ds-card', '--ds-soft', '--ds-line', '--ds-pill'];
  const block = (re) => {
    const m = DESIGN.match(re);
    return m ? m[0] : '';
  };
  const lightBlock = block(/body\s*\{[^}]*--ds-ink[^}]*\}/);
  const darkBlock = block(/body\.dark-mode\s*\{[^}]*--ds-ink:\s*#E6EEF3[^}]*\}/);
  assert.ok(lightBlock && darkBlock, 'ما لقيت بلوك التوكنات');
  const val = (src, name) => {
    const m = src.match(new RegExp(name.replace(/-/g, '\\-') + ':\\s*(#[0-9A-Fa-f]{3,8})'));
    return m ? m[1].toUpperCase() : null;
  };
  const bad = [];
  names.forEach((n) => {
    const l = val(lightBlock, n);
    const d = val(darkBlock, n);
    if (!l || !d || l === d) bad.push(n + ' (' + l + ' / ' + d + ')');
  });
  assert.deepStrictEqual(bad, [], 'توكنات لازم تختلف بين الوضعين:');
});

test('توكنات التقارير موجودة ومتغيّرة', () => {
  const names = ['--rp-ink', '--rp-muted', '--rp-green', '--rp-amber', '--rp-orange', '--rp-red'];
  const lightBlock = (DESIGN.match(/body\s*\{[^}]*--rp-ink[^}]*\}/) || [''])[0];
  const darkBlock = (DESIGN.match(/body.dark-mode\s*\{[^}]*--rp-ink[^}]*\}/) || [''])[0];
  const val = (src, name) => {
    const m = src.match(new RegExp(name.replace(/-/g, '\\-') + ':\\s*(#[0-9A-Fa-f]{3,8})'));
    return m ? m[1].toUpperCase() : null;
  };
  const bad = [];
  names.forEach((n) => {
    const l = val(lightBlock, n);
    const d = val(darkBlock, n);
    if (!l || !d || l === d) bad.push(n + ' (' + l + ' / ' + d + ')');
  });
  assert.deepStrictEqual(bad, [], 'توكنات التقارير لازم تختلف بين الوضعين:');
});

/* ---------- مفيش ألوان ثابتة فاتحة جوّه الـmarkup ---------- */

test('الصفحة الرئيسية: مفيش ألوان ثابتة جوه inline styles', () => {
  /* الألوان دي كانت مكتوبة inline، فكانت بتفضل فاتحة بالليل.
     لازم تتبدّل بـvar(--ds-*). */
  const forbidden = ['#10243A', '#6C7C8D', '#F8FAFB', '#E3EAF0', '#172B3D', '#C84C4C'];
  const bad = [];
  forbidden.forEach((hex) => {
    const re = new RegExp('color:' + hex + '\\b', 'gi');
    const m = DASH.match(re);
    if (m) bad.push(hex + ' x' + m.length);
  });
  assert.deepStrictEqual(bad, [],
    'ألوان ثابتة جوه inline styles في الصفحة الرئيسية — لازم var(--ds-*):');
});

test('الصفحة الرئيسية: كروت الـdark-* بتستخدم التوكنات', () => {
  ['.dark-sec{', '.dark-card{', '.dark-tile{', '.dark-summary{', '.dark-inner{', '.dark-cmp{'].forEach((sel) => {
    const i = DESIGN.indexOf(sel);
    const src = i >= 0 ? DESIGN : DASH;
    const j = src.indexOf(sel);
    assert.ok(j >= 0, 'القاعدة ' + sel + ' مفقودة');
    const rule = src.slice(j, src.indexOf('}', j));
    assert.ok(/var\(--ds-/.test(rule),
      sel + ' لازم يستخدم var(--ds-*) عشان يتبدّل مع الوضع الليلي: ' + rule);
  });
});

test('التقارير: الشارة والاتجاه بيستخدموا classes حسب الحالة', () => {
  assert.ok(/rp-tone-/.test(REPORTS), 'التقارير لازم تستخدم class لكل حالة (rp-tone-*)');
  assert.ok(!/style="background:' \+ tileBg/.test(REPORTS),
    'الشارة ما ينفعش تاخد لون ثابت جوه inline style');
  ['green', 'amber', 'orange', 'red', 'muted'].forEach((tone) => {
    assert.ok(REPORTS.indexOf("'" + tone + ": '" + tone + "'") >= 0 ||
      REPORTS.indexOf(tone + ": '" + tone + "'") >= 0,
      'الحالة ' + tone + ' لازم تكون في خريطة الـtone');
    assert.ok(DESIGN.indexOf('.rp2-pill.rp-tone-' + tone) >= 0,
      'لازم يكون فيه تنسيق للون .rp2-pill.rp-tone-' + tone);
    assert.ok(DESIGN.indexOf('.rp2-trend.rp-tone-' + tone) >= 0,
      'لازم يكون فيه تنسيق للون .rp2-trend.rp-tone-' + tone);
  });
});

/* ---------- الألوان اللي كانت بتضيع بالليل ---------- */

test('شارات الجداول ليها نسخة الوضع الليلي بـ!important', () => {
  /* 06-premium-design كان بيفرض ألوان فاتحة بـ!important، فقواعد
     04-dark-overrides (من غير !important) كانت بتتلغى. */
  ['green', 'amber', 'red', 'grey'].forEach((tone) => {
    assert.ok(ruleBlock(DESIGN, 'body.dark-mode .fleet-table .tag.' + tone).indexOf('!important') >= 0,
      'لازم يكون فيه قاعدة !important لـbody.dark-mode .fleet-table .tag.' + tone);
  });
});

test('الوضع الليلي بيستخدم نظام الألوان الداكن', () => {
  assert.ok(/color-scheme\s*:\s*dark/.test(DESIGN),
    'لازم يكون فيه color-scheme:dark — عناصر النموذج لازم تتلوّن بالليل');
});

test('مفيش لون احتياطي غامق زي var(--accent,#008080) تاني', () => {
  /* #008080 على خلفية غامقة = 3.3:1 — نص بيبان بالكاد. */
  const files = ['modules/fleet-view.js', 'modules/renewals-ui.js', 'core/router-payments-bulk.js'];
  const bad = [];
  files.forEach((f) => {
    const src = read(f);
    if (/var\(--accent/.test(src)) bad.push(f);
  });
  assert.deepStrictEqual(bad, [],
    'الألوان الاحتياطية --accent كانت بتدي نص غامق فوق خلفية غامقة — لازم var(--ds-teal):');
});

test('الأزرار الأساسية والمدمّرة ليها لون في الوضع الليلي', () => {
  /* 04-dark-overrides كان بيحوّل كل الأزرار لنفس الرمادي الشفاف،
     فالزر الأساسي(primary) والمدمّر(danger) فقدوا لونه بالليل. */
  assert.ok(/body\.dark-mode \.btn-primary\s*\{[^}]*background:[^}]*!important/.test(DESIGN),
    'الزر الأساسي لازم يبقى ملوّن في الوضع الليلي');
  assert.ok(/body\.dark-mode \.btn-danger\s*\{[^}]*background:[^}]*!important/.test(DESIGN),
    'الزر المدمّر لازم يبقى ملوّن في الوضع الليلي');
});

test('ملف الـminified مطابق للملف المصدر (عشان الكاش يجيب التعديل)', () => {
  const min = read('css', '07-visual-redesign.min.css');
  ['--ds-ink', '--ds-muted', '--rp-ink', 'color-scheme', 'rp-tone-green'].forEach((token) => {
    assert.ok(min.indexOf(token) >= 0,
      'الملف المضغوط لازم يحتوي "' + token + '" — شغّل node scripts/minify-css.js');
  });
});

/* ---------- زر المظهر: أيقونة بس، من غير نص ---------- */

test('زر المظهر: أيقونة فقط — مفيش كلمة "الوضع النهاري"', () => {
  const html = read('index.html');
  assert.ok(html.indexOf('theme-label') === -1,
    'تسمية "الوضع النهاري" اتشالت من زرار المظهر — لازم يبقى أيقونة بس');
  assert.ok(html.indexOf('theme-ico-sun') >= 0 && html.indexOf('theme-ico-moon') >= 0,
    'لازم يكون فيه أيقونتين: شمس (نهار) وقمر (ليل)');
  assert.ok(html.indexOf('id="btn-theme"') >= 0, 'زرار المطور اتغيّر مكانه');
});

test('تسمية زرار المظهر ما بتظهرش أبدًا (لا في النور ولا في الليل)', () => {
  /* كانت بتظهر بالليل (body.dark-mode .theme-label{display:inline-block})
     وبتتداخل مع زرار التحديث. */
  const src = read('css', '04-dark-overrides.css');
  const m = src.match(/body\.dark-mode \.theme-label\s*\{([^}]*)\}/);
  assert.ok(m, 'قاعدة .theme-label في الوضع الليلي مفقودة');
  assert.ok(/display\s*:\s*none/.test(m[1]),
    'تسمية زرار المظهر لازم تفضل مخفية في الوضع الليلي: ' + m[1]);
});

test('أيقونة زرار المظهر بتتبدّل حسب الوضع (شمس/قمر)', () => {
  const design = read('css', '07-visual-redesign.css');
  assert.ok(/body\.dark-mode [^{]*\.theme-ico-sun\s*\{[^}]*display\s*:\s*none/.test(design),
    'الشمس لازم تختفي في الوضع الليلي');
  assert.ok(/body\.dark-mode [^{]*\.theme-ico-moon\s*\{[^}]*display\s*:\s*block/.test(design),
    'القمر لازم يظهر في الوضع الليلي');
});

test('زرار المظهر مربّع بالأيقونة (مش نص بياخد مكان)', () => {
  const design = read('css', '07-visual-redesign.css');
  const m = design.match(/\.topbar\.topbar-v43 #btn-theme[\s\S]{0,320}?\{([^}]*)\}/);
  assert.ok(m, 'قاعدة زرار المظهر المربّع مفقودة');
  assert.ok(/width\s*:\s*42px\s*!important/.test(m[1]), 'الزر لازم يكون 42px عرض');
  assert.ok(/padding\s*:\s*0\s*!important/.test(m[1]), 'الزر لازم يكون من غير padding');
});
