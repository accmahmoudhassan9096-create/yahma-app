/* ============================================================
   tests/reports-movement.test.js
   تقرير «حركة الأسطول والراكدة» — مصدر مدة الركود
   ------------------------------------------------------------
   ⚠️ الفخ اللي كان موجود: الاختبار القديم (reports.test.js) كان
   بيستخدم fixtures فيها daysSinceMovement / lastMovementDate /
   rentedDaysMonth — وهي حقول ما بتوصلش من Supabase أصلاً (مفيش
   أعمدة لها في جدول vehicles). فالاختبار كان بيمر والتقرير في
   الإنتاج بيطلع أصفار.

   الاختبار ده بيبني أسطول بنفس شكل الإنتاج بالظبط:
   فيه idle_since بس، ومفيش أي من الحقول الميتة.
   ============================================================ */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/* نفس صيغة todayIso في modules/daily-snapshots.js */
function isoLocal(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoLocal(d);
}

/* أسطول على شكل الإنتاج: idle_since فقط، بلا الحقول الميتة */
function productionShapeFleet() {
  return [
    // واقفة 40 يوم — راكدة (+15) و(+30)
    { id: 'c1', plate: '1111 أ ب ج', branch: 'فرع 1', carStatus: 'متاحة للإيجار', idleSince: daysAgo(40), dailyRate: 150 },
    // واقفة 70 يوم — حرجة (+60)
    { id: 'c2', plate: '2222 د هـ و', branch: 'فرع 1', carStatus: 'متاحة للإيجار', idleSince: daysAgo(70), dailyRate: 150 },
    // بلا تاريخ بداية — مينفعش تتحسب راكدة
    { id: 'c3', plate: '3333 س ص ع', branch: 'فرع 1', carStatus: 'متاحة للإيجار', idleSince: '', dailyRate: 150 },
    // مؤجرة — مش راكدة خالص
    { id: 'c4', plate: '4444 ت ث ي', branch: 'فرع 2', carStatus: 'مؤجرة', idleSince: '', dailyRate: 200 }
  ];
}

function loadReports(fleet) {
  const sandbox = {
    console, Date, Math, JSON, Intl, Promise, RegExp, Set, Map, Array, Object, String, Number, Boolean,
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    escapeHtml: (s) => String(s == null ? '' : s),
    formatArabicDate: (v) => String(v || '—'),
    fleet,
    yahmaGetFleet: () => fleet,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    YahmaUtils: {
      carStatusOut: () => false,
      daysFromNow: () => 10,
      inspectionDisplayStatus: (st) => ({ label: st, level: 'green' }),
      textTag: (st) => ({ label: st, level: 'green' }),
      regionOfBranch: () => 'central',
      REGION_DEFS: [{ id: 'central', label: 'المنطقة الوسطى' }]
    },
    YahmaReadiness: { vehicle: (c) => ({ ready: false, label: '', level: 'green', failed: [] }) },
    YahmaPayments: { localByStatus: () => [], pendingList: () => [], renewedList: () => [], isRenewed: () => false },
    document: { getElementById: () => null, addEventListener: () => {} }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.global = sandbox;

  const ctx = vm.createContext(sandbox);
  /* لقطات يومية أولاً: منها بنجيب idleDaysFor / idleSinceFor */
  vm.runInContext(read('modules/daily-snapshots.js'), ctx, { filename: 'daily-snapshots.js' });
  vm.runInContext(read('modules/reports.js'), ctx, { filename: 'reports.js' });
  return sandbox;
}

/* يرسم التقرير المطلوب ويحطّ الـHTML في html */
function renderReport(sandbox, reportId) {
  let html = '';
  const handlers = {};
  const container = {
    set innerHTML(v) { html = v; },
    get innerHTML() { return html; },
    querySelector: () => null,
    querySelectorAll: (sel) => {
      if (sel !== '[data-rp-report]') return [];
      const ids = [...html.matchAll(/data-rp-report="([^"]+)"/g)].map((m) => m[1]);
      return ids.map((id) => ({
        getAttribute: (name) => (name === 'data-rp-report' ? id : null),
        addEventListener: (evt, fn) => { if (evt === 'click') handlers[id] = fn; }
      }));
    }
  };
  sandbox.document.getElementById = (id) => (id === 'content' ? container : null);
  sandbox.YahmaReports.render(container);
  if (reportId && handlers[reportId]) handlers[reportId]();
  return html;
}

/* قيمة الـKPI بالاسم */
function kpiValue(html, label) {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('rp2-label">' + esc(label) + '</p>\\s*<p class="rp2-num">([^<]*)</p>');
  const m = html.match(re);
  return m ? m[1].trim() : null;
}

/* صفوف الجدول كـarrays */
function tableRows(html) {
  return [...html.matchAll(/<tr>(.*?)<\/tr>/g)]
    .map((m) => [...m[1].matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((c) => c[1].replace(/<[^>]+>/g, '').trim()));
}

test('تقرير حركة الأسطول: مدة الركود بتقرأ idle_since من القاعدة', () => {
  const fleet = productionShapeFleet();
  const sandbox = loadReports(fleet);
  const html = renderReport(sandbox, 'movement');

  assert.ok(html.includes('تحليل التشغيل والركود حسب الفرع'), 'جدول تحليل التشغيل مش موجود');

  /* المؤجرة شغالة زي ما هي */
  assert.strictEqual(kpiValue(html, 'مؤجرة الآن (نشطة)'), '1', 'عدد المؤجرات غلط');

  /* راكدة 15 يوم: c1 (40 يوم) + c2 (70 يوم) — c3 مالهوش تاريخ */
  assert.strictEqual(kpiValue(html, 'راكدة (+15 يوم)'), '2', 'عدد الراكدات (+15) غلط');
  assert.strictEqual(kpiValue(html, 'راكدة بشدة (+30 يوم)'), '2', 'عدد الراكدات (+30) غلط');
  assert.strictEqual(kpiValue(html, 'حرجة (+60 يوم)'), '1', 'عدد الراكدات (+60) غلط');

  /* متوسط أيام الركود = (40 + 70) / 2 = 55 */
  assert.strictEqual(kpiValue(html, 'متوسط أيام الركود'), '55 يوم', 'متوسط أيام الركود غلط');
  assert.strictEqual(kpiValue(html, 'أعلى فترة ركود'), '70 يوم', 'أعلى فترة ركود غلط');
});

test('تقرير حركة الأسطول: صف الفرع فيه أرقام الراكدة ومتوسط الركود', () => {
  const fleet = productionShapeFleet();
  const sandbox = loadReports(fleet);
  const html = renderReport(sandbox, 'movement');

  const rows = tableRows(html);
  const branch1 = rows.find((r) => r[0] === 'فرع 1');
  assert.ok(branch1, 'صف فرع 1 مش موجود');
  assert.strictEqual(branch1[1], '3', 'عدد سيارات فرع 1 غلط');
  assert.strictEqual(branch1[2], '0', 'المؤجرات في فرع 1 غلط');
  assert.strictEqual(branch1[3], '2', 'الراكدات (+15) في فرع 1 غلط');
  assert.strictEqual(branch1[4], '2', 'الراكدات (+30) في فرع 1 غلط');
  assert.strictEqual(branch1[5], '55', 'متوسط أيام الركود في فرع 1 غلط');
});

test('تقرير حركة الأسطول: عمود «متوسط أيام التأجير» الميت اتشال', () => {
  const fleet = productionShapeFleet();
  const sandbox = loadReports(fleet);
  const html = renderReport(sandbox, 'movement');

  /* «أيام التأجير» بقى ملغى من النموذج — ما ينفعش يفضل عمود دايماً صفر */
  assert.ok(!html.includes('متوسط أيام التأجير'), 'لسه في عمود «متوسط أيام التأجير»');
  assert.ok(html.includes('متوسط أيام الركود'), 'عمود «متوسط أيام الركود» مش موجود');
});

test('تقرير حركة الأسطول: السيارات المؤجرة ما بتتحسبش راكدة', () => {
  const fleet = [
    { id: 'r1', plate: '9999', branch: 'فرع 3', carStatus: 'مؤجرة', idleSince: daysAgo(90), dailyRate: 100 }
  ];
  const sandbox = loadReports(fleet);
  const html = renderReport(sandbox, 'movement');

  assert.strictEqual(kpiValue(html, 'مؤجرة الآن (نشطة)'), '1');
  assert.strictEqual(kpiValue(html, 'راكدة (+15 يوم)'), '0', 'المؤجرة اتحسبت راكدة');
  assert.strictEqual(kpiValue(html, 'أعلى فترة ركود'), '—', 'المؤجرة اتحسبت ليها ركود');
});
