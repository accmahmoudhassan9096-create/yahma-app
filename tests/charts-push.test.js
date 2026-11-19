/* ============================================================
   tests/charts-push.test.js
   حماية من خطأ `pts.push is not a function` في رسوم التقارير.
   svgLineChart / svgAreaChart كانوا بيعرّفوا pts كنص '' وبينادوا
   pts.push() → Uncaught TypeError وقت رسم تقارير «حركة الأسطول».
   ============================================================ */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'modules/reports.js'), 'utf8');

function extractFn(name) {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'الدالة ' + name + ' مش موجودة');
  // بابحث عن نهاية الدالة بعد أول '}' على نفس المستوى التقريبي (الدوال بسيطة)
  let depth = 0, end = -1, started = false;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === '{') { depth++; started = true; }
    else if (c === '}') { depth--; if (started && depth === 0) { end = i + 1; break; } }
  }
  assert.ok(end > start, 'مفيش نهاية للدالة ' + name);
  return src.slice(start, end);
}

function makeSandbox() {
  const sb = {
    console, Math, String, Number, Array, Object, Date,
    num: (v) => String(v),
    esc: (v) => String(v == null ? '' : v)
  };
  vm.createContext(sb);
  vm.runInContext(extractFn('svgLineChart') + '\n' + extractFn('svgAreaChart'), sb);
  return sb;
}

test('svgLineChart: يرسم من غير pts.push error', () => {
  const sb = makeSandbox();
  const html = sb.svgLineChart(['فرع 1', 'فرع 2', 'فرع 3'], [10, 20, 15], 'اختبار');
  assert.ok(html.includes('<svg'), 'مفيش SVG');
  assert.ok(html.includes('<polyline'), 'مفيش خط');
  assert.ok(!html.includes('undefined'), 'في قيم undefined');
});

test('svgAreaChart: يرسم من غير pts.push error', () => {
  const sb = makeSandbox();
  const html = sb.svgAreaChart(['فرع 1', 'فرع 2'], [5, 8], 'اختبار');
  assert.ok(html.includes('<svg'), 'مفيش SVG');
  assert.ok(html.includes('<path'), 'مفيش مسار');
});

test('المصدر: pts معرّف كمصفوفة في الدالتين', () => {
  assert.ok(/var pts = \[\], line/.test(src), 'svgLineChart pts لسه مش مصفوفة');
  assert.ok(/var pts = \[\], area/.test(src), 'svgAreaChart pts لسه مش مصفوفة');
});
