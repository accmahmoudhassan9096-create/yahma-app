/* اختبارات المستحقات الشهرية — نفس نهج tests/readiness.test.js:
   بنحمّل الملف الحقيقي في sandbox عبر node:vm — مفيش نسخة ولا تعديل
   على كود الإنتاج. */
const test = require('node:test');
const assert = require('node:assert');
const { loadModule } = require('./harness');

/* loadModule بترجع YahmaDues نفسها — مفيش .YahmaDues تاني. */
const D = loadModule('modules/dues.js');

test('أيام الشهر بتعرف أيام الشهر صح', () => {
  assert.strictEqual(D.daysInMonth('2026-01'), 31);
  assert.strictEqual(D.daysInMonth('2026-04'), 30);
  assert.strictEqual(D.daysInMonth('2026-12'), 31);
  /* فبراير: عادي 28، وكبيسة 29 */
  assert.strictEqual(D.daysInMonth('2026-02'), 28);
  assert.strictEqual(D.daysInMonth('2024-02'), 29);
  assert.strictEqual(D.daysInMonth('2000-02'), 29);
  assert.strictEqual(D.daysInMonth('1900-02'), 28);
});

test('مدخلات غلط ما بتخليش الشهر يوم 30 عشوائي', () => {
  assert.strictEqual(D.daysInMonth(''), 30);
  assert.strictEqual(D.daysInMonth(null), 30);
  assert.strictEqual(D.daysInMonth('2026-13'), 30);
  assert.strictEqual(D.daysInMonth('2026-00'), 30);
  assert.strictEqual(D.daysInMonth('abc'), 30);
  /* شهر واحد من غير صفر لسو — لازم ينفع زي 03 */
  assert.strictEqual(D.daysInMonth('2026-3'), 31);
});

test('سعر اليوم بيتقرا من كل الأشكال، واللي مش رقم = بدون سعر', () => {
  assert.strictEqual(D.rateOf({ dailyRate: 150 }), 150);
  assert.strictEqual(D.rateOf({ dailyRate: '150' }), 150);
  assert.strictEqual(D.rateOf({ dailyRate: '150.50' }), 150.5);
  /* فاصلة الآلاف اللي بتيجي من Excel */
  assert.strictEqual(D.rateOf({ dailyRate: '1,100' }), 1100);
  assert.strictEqual(D.rateOf({ dailyRate: 0 }), 0);
  assert.strictEqual(D.rateOf({ dailyRate: '' }), 0);
  assert.strictEqual(D.rateOf({ dailyRate: null }), 0);
  assert.strictEqual(D.rateOf({}), 0);
  assert.strictEqual(D.rateOf(null), 0);
  assert.strictEqual(D.rateOf({ dailyRate: -5 }), 0);
  assert.strictEqual(D.rateOf({ dailyRate: 'مش موجود' }), 0);
});

test('المستحق الشهري = سعر اليوم × أيام الشهر', () => {
  assert.strictEqual(D.monthlyDues({ dailyRate: 150 }, '2026-01'), 150 * 31);
  assert.strictEqual(D.monthlyDues({ dailyRate: 150 }, '2026-04'), 150 * 30);
  assert.strictEqual(D.monthlyDues({ dailyRate: 150 }, '2026-02'), 150 * 28);
  assert.strictEqual(D.monthlyDues({ dailyRate: 150 }, '2024-02'), 150 * 29);
  /* سيارة بدون سعر مش بتحتسب صفر كأن ده مستحق — بتترمي بدون سعر */
  assert.strictEqual(D.monthlyDues({ dailyRate: 0 }, '2026-01'), 0);
});

test('اسم الشهر بيتقري بالعربي', () => {
  assert.strictEqual(D.monthLabel('2026-03'), 'مارس 2026');
  assert.strictEqual(D.monthLabel('2026-01'), 'يناير 2026');
  assert.strictEqual(D.monthLabel('2026-12'), 'ديسمبر 2026');
  assert.strictEqual(D.monthLabel('مش شهر'), 'مش شهر');
});

test('الملخص بيفرّق المسعّرة من غير سعر', () => {
  const rows = D.buildRows([
    { id: 1, plate: 'أ', dailyRate: 100, branch: 'فرع 1' },
    { id: 2, plate: 'ب', dailyRate: 200, branch: 'فرع 1' },
    { id: 3, plate: 'ج', dailyRate: 0, branch: 'فرع 2' },
    { id: 4, plate: 'د', branch: 'فرع 2' }
  ], '2026-01');            /* 31 يوم */
  const s = D.summarize(rows);
  assert.strictEqual(s.cars, 4);
  assert.strictEqual(s.priced, 2);
  assert.strictEqual(s.unpriced, 2);
  assert.strictEqual(s.total, 100 * 31 + 200 * 31);
  assert.strictEqual(s.avg, Math.round((100 * 31 + 200 * 31) / 2));
});

test('الملخص على قائمة فاضية ما بيقسّمش على صفر', () => {
  const s = D.summarize([]);
  assert.strictEqual(s.cars, 0);
  assert.strictEqual(s.priced, 0);
  assert.strictEqual(s.unpriced, 0);
  assert.strictEqual(s.total, 0);
  assert.strictEqual(s.avg, 0);
  assert.strictEqual(D.summarize(null).avg, 0);
});

test('السيارة بره الأسطول بتترمي في العدّ', () => {
  const rows = D.buildRows([
    { id: 1, plate: 'أ', dailyRate: 100, carStatus: 'متاحة للايجار' },
    { id: 2, plate: 'ب', dailyRate: 100, carStatus: 'مسروقة' },
    { id: 3, plate: 'ج', dailyRate: 100, carStatus: 'خارج الخدمة' }
  ], '2026-01');
  assert.strictEqual(D.summarize(rows).out, 2);
  /* والمستحق لسه بيتحسب — الترشيح بالجدول مش بالحالة */
  assert.strictEqual(rows[1].dues, 100 * 31);
});

test('الصف بيتحمّل من غير دالة جاهزية', () => {
  /* لو vehicleReadiness مش موجودة، لازم يشتغل عادي */
  const rows = D.buildRows([{ id: 1, plate: 'أ', dailyRate: 100 }], '2026-01');
  assert.strictEqual(rows.length, 1);
  assert.ok(rows[0].readyLabel);
});

test('ترتيب أعمدة الصف نفس ترتيب العناوين بالظبط', () => {
  const rows = D.buildRows([{ id: 1, plate: 'لوحة-1', dailyRate: 100, branch: 'فرع-1', city: 'مدينة-1', owner: 'مالك-1' }], '2026-01');
  const cells = D.rowCells(rows[0]);
  assert.strictEqual(cells.length, D.HEADERS.length);
  assert.strictEqual(cells[0], 'لوحة-1');      /* رقم اللوحة */
  assert.strictEqual(cells[1], 'فرع-1');       /* الفرع */
  assert.strictEqual(cells[4], '—');            /* حالة السيارة فاضية */
  assert.strictEqual(cells[5], '100');          /* سعر اليوم */
  assert.strictEqual(cells[6], '31');           /* أيام الشهر */
  assert.strictEqual(cells[7], '3,100');        /* المستحق الشهري */
  /* لازم مفيش عنوان فاضي — export.js بيقص عند أول عمود فاضي */
  D.HEADERS.forEach((h, i) => assert.ok(String(h).trim(), 'العنوان ' + i + ' فاضي'));
});

test('الأرقام بفواصل والأرقام لاتينية', () => {
  assert.strictEqual(D.money(3100), '3,100');
  assert.strictEqual(D.money(0), '0');
  assert.strictEqual(D.money(1234567), '1,234,567');
  assert.strictEqual(D.money('x'), '0');
  assert.strictEqual(D.money(-5), '-5');
  /* مفيش أرقام عربية-هندية — التواريخ في التطبيق بتستخدم لاتيني */
  assert.ok(!/[٠-٩]/.test(D.money(12345)));
});

test('فلتر الفرع بيشيل غيره فعلاً', () => {
  const rows = D.buildRows([
    { id: 1, plate: 'أ', dailyRate: 100, branch: 'فرع-أ' },
    { id: 2, plate: 'ب', dailyRate: 200, branch: 'فرع-ب' },
    { id: 3, plate: 'ج', dailyRate: 300, branch: 'فرع-أ' }
  ], '2026-01');
  const filtered = D.applyFilters(rows, { branch: 'فرع-أ', sort: 'dues' });
  assert.strictEqual(filtered.length, 2);
  assert.ok(filtered.every(function (r) { return r.branch === 'فرع-أ'; }));
  /* فرع مش موجود = مفيش صفوف، مش «الكل» */
  assert.strictEqual(D.applyFilters(rows, { branch: 'فرع-ز', sort: 'dues' }).length, 0);
  assert.strictEqual(D.applyFilters(rows, { branch: '', sort: 'dues' }).length, 3);
});

test('البحث بيشتغل على اللوحة والفرع والمالك', () => {
  const rows = D.buildRows([
    { id: 1, plate: 'ر ن س 1234', dailyRate: 100, branch: 'فرع-أ', owner: 'مينا' },
    { id: 2, plate: 'ص ب ك 9999', dailyRate: 200, branch: 'فرع-ب', owner: 'سامي' }
  ], '2026-01');
  assert.strictEqual(D.applyFilters(rows, { q: '1234' }).length, 1);
  assert.strictEqual(D.applyFilters(rows, { q: 'سامي' }).length, 1);
  assert.strictEqual(D.applyFilters(rows, { q: 'فرع-ب' }).length, 1);
  assert.strictEqual(D.applyFilters(rows, { q: 'مش موجود' }).length, 0);
  /* البحث مش بيغيّر حالة بالخطأ */
  assert.strictEqual(rows.length, 2);
});

test('الترتيب تنازلي/تصاعدي/باللوحة', () => {
  const rows = D.buildRows([
    { id: 1, plate: 'ب', dailyRate: 100, branch: 'فرع-أ' },
    { id: 2, plate: 'أ', dailyRate: 300, branch: 'فرع-أ' },
    { id: 3, plate: 'ج', dailyRate: 200, branch: 'فرع-ب' }
  ], '2026-01');
  /* نفس سبب ما فوق — deepEqual مش مضمون على مصفوفة من الـsandbox */
  assert.deepStrictEqual(Array.from(D.applyFilters(rows, { sort: 'dues' })).map(function (r) { return r.dues; }), [9300, 6200, 3100]);
  assert.deepStrictEqual(Array.from(D.applyFilters(rows, { sort: 'dues-asc' })).map(function (r) { return r.dues; }), [3100, 6200, 9300]);
  assert.deepStrictEqual(Array.from(D.applyFilters(rows, { sort: 'plate' })).map(function (r) { return r.plate; }), ['أ', 'ب', 'ج']);
  /* الكبيرة أولاً هي الافتراضية */
  assert.strictEqual(Array.from(D.applyFilters(rows, {}))[0].dues, 9300);
});

test('الفلاتر ماتكسرش لو الأسطول فاضي', () => {
  /* بنقارن الطول مش deepStrictEqual: المصفوفات اللي بتتعمل جوّه
     sandbox بتـnode:vm ليها prototype تاني، فـdeepStrictEqual بيفشل
     على «نفس البنية» لمجرد اختلاف الـrealm. */
  assert.strictEqual(D.applyFilters([], {}).length, 0);
  assert.strictEqual(D.applyFilters(null, {}).length, 0);
  assert.strictEqual(D.applyFilters(undefined, undefined).length, 0);
});