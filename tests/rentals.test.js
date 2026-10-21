/* تبويب «الاستئجارات» + ربطه بالتقارير.

   لماذا جدول rentals بدل العمود renteddays:
   التقرير كان بيقول «0% استغلال» لأسطول 3,984 سيارة حالته كلها
   صفر — مش ناقص بيانات، بيانات مصقولة وغلط. الاختبارات هنا
   بتقفل إن التقارير مبقتش بتقرا العمود ده، وإن الأرقام بتطلع
   من سجل بتاريخاته.

   كل الاختبارات هنا بتستدعي الدالة الحقيقية (مش فحص نص) —
   التاريخ والحساب هوPrimitive كله، فالسلوك قابل للتشغيل. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ===== محمّل vm — بنحمّل الملف الحقيقي وننفّذ الدوال بتاعته ===== */
function loadStore() {
  const src = read('modules/rentals-store.js');
  const store = {};
  const warnings = [];
  const ctx = {
    window: null,
    document: {
      readyState: 'complete',
      addEventListener() {},
      getElementById() { return null; }
    },
    localStorage: {
      _v: {},
      getItem(k) { return Object.prototype.hasOwnProperty.call(this._v, k) ? this._v[k] : null; },
      setItem(k, v) { this._v[k] = String(v); },
      removeItem(k) { delete this._v[k]; }
    },
    yahmaErr(_e, where) { warnings.push(where); },
    setTimeout() {},
    console
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'rentals-store.js' });
  assert.ok(ctx.window.YahmaRentals, 'المتجر مابتعطّرش');
  return { S: ctx.window.YahmaRentals, ctx, warnings };
}

/* ⭐ مصنع، مش كائن ثابت.
   الاختبار «سعر اليوم بيتثبّت» بيعدّل السعر عمدًا — لو الكائن
   ده مشترك، التعديل ده بيتسرّب لكل الاختبارات اللي بعده. أول
   نسخة كانت كائن ثابت، فالتجميع طلع 65 يوم (26 + تعديل السعر
   المتسرّب) بدل 26. */
const car = (over) => Object.assign({
  id: 'c1', plate: 'ABC-123', branch: 'فرع الرياض',
  dailyRate: 200, carStatus: 'متاحة للايجار'
}, over || {});

/* ====================================== */
/* ===== التاريخ — قلب الحساب كله ===== */

test('التاريخ بيتطبّع من كل الأشكال — والا التقرير بيخرب', () => {
  const { S } = loadStore();
  assert.strictEqual(S.normDate('2026-10-17'), '2026-10-17');
  assert.strictEqual(S.normDate('2026-10-17T09:12:00.000Z'), '2026-10-17');
  assert.strictEqual(S.normDate('10/17/2026'), '2026-10-17');
  assert.strictEqual(S.normDate('1/5/2026'), '2026-01-05');
  assert.strictEqual(S.normDate(''), '');
  assert.strictEqual(S.normDate(null), '');
  assert.strictEqual(S.normDate('مش تاريخ'), '');
  /* ⭐ الترتيب لازم يبقى صحيح بعد التطبّع — ده اللي بتاع
     المقارنة في التقرير */
  const d = ['2026-01-05', '10/17/2026', '2026-10-17T00:00:00Z'];
  const sorted = d.map(v => S.normDate(v)).sort();
  assert.deepStrictEqual(sorted, ['2026-01-05', '2026-10-17', '2026-10-17']);
});

test('عدد الأيام شامل الطرفين — فاتورة من 1 إلى 3 = 3 أيام', () => {
  const { S } = loadStore();
  assert.strictEqual(S.daysBetween('2026-10-01', '2026-10-01'), 1);
  assert.strictEqual(S.daysBetween('2026-10-01', '2026-10-03'), 3);
  assert.strictEqual(S.daysBetween('2026-10-01', '2026-10-31'), 31);
  /* شهر كامل 31 يوم — والقسمة على 30 ثابتة كانت الاستغلال بيبقى غلط */
  assert.strictEqual(S.daysBetween('2026-01-01', '2026-01-31'), 31);
  assert.strictEqual(S.daysBetween('2026-02-01', '2026-02-28'), 28);
  /* ⭐ لو نقصنا يوم (end - start) هنخسر يوم من كل استئجار */
  assert.notStrictEqual(S.daysBetween('2026-10-01', '2026-10-03'), 2);
});

/* ⭐ التقاطع — وده اللي بيخلّي أي فترة في التقرير تطلع صح */
test('أيام الاستئجار بتتقاطع مع الفترة — مش المدة كلها', () => {
  const { S } = loadStore();
  const r = { startDate: '2026-01-01', endDate: '2026-01-31' };
  /* الشهر كامل = 31 */
  assert.strictEqual(S.overlapDays(r, '2026-01-01', '2026-01-31'), 31);
  /* نص الشهر: 16 → 31 = 16 يوم */
  assert.strictEqual(S.overlapDays(r, '2026-01-16', '2026-01-31'), 16);
  /* أول الشهر: 1 → 15 = 15 يوم */
  assert.strictEqual(S.overlapDays(r, '2026-01-01', '2026-01-15'), 15);
  /* ⭐ خارج الفترة = 0، مش المدة كلها */
  assert.strictEqual(S.overlapDays(r, '2026-02-01', '2026-02-28'), 0);
  assert.strictEqual(S.overlapDays(r, '2025-12-01', '2025-12-31'), 0);
  /*ighbors بيلمسوا */
  assert.strictEqual(S.overlapDays(r, '2025-12-31', '2026-01-01'), 1);
  assert.strictEqual(S.overlapDays(r, '2026-01-31', '2026-02-01'), 1);
});

/* ⭐ ده اللي كان بيضخّم الإيراد: استئجار مفتوح من سنة
   = 365 يوم إيراد كل شهر. */
test('الاستئجار المفتوح بيتحسب لحد النهاردة — مش لآخر العمر', () => {
  const { S } = loadStore();
  const today = S.todayStr();
  const r = { startDate: '2020-01-01', endDate: null };
  const d = S.overlapDays(r, '', '');
  /* ⭐ أقل من 3000 يوم — يعني مش 6 سنين مستقبلي */
  assert.ok(d < 3000, 'الاستئجار المفتوح بيتحسب لآخر العمر: ' + d + ' يوم');
  assert.ok(d > 1000, 'فجأة رجع يوم واحد؟ ' + d);
  /* ونفسه لازم يتحسب صحيح داخل شهر */
  const monthStart = today.slice(0, 8) + '01';
  const monthDays = S.overlapDays(r, monthStart, today);
  assert.ok(monthDays <= S.daysBetween(monthStart, today),
    'أيام الشهر أكبر من عدد أيام الشهر نفسه');
});

/* ====================================== */
/* ===== منع المدخلات الغلط ===== */

test('تاريخ النهاية قبل البداية يترفض — قبل الحفظ', () => {
  const { S } = loadStore();
  const r = S.startRental(car(), { startDate: '2026-10-10', endDate: '2026-10-01' });
  return r.then((res) => {
    assert.strictEqual(res.ok, false);
    assert.ok(res.error.indexOf('قبل') > -1, 'الرسالة مالهاش سبب واضح: ' + res.error);
    assert.strictEqual(S.localAll().length, 0, 'اتسجل رغم الرفض');
  });
});

test('مدة مفتعلة يترفض — بتسبب أرقام التقرير تبقى غلط', () => {
  const { S } = loadStore();
  const long = '2020-01-01', far = '2030-01-01';
  return S.startRental(car(), { startDate: long, endDate: far }).then((res) => {
    assert.strictEqual(res.ok, false);
    assert.ok(res.error.indexOf('أطول') > -1, 'الرسالة غلط: ' + res.error);
  });
});

test('مافيش استئجار تاني فوق واحد شغّال', () => {
  const { S } = loadStore();
  return S.startRental(car(), { startDate: '2026-10-01' }).then(() => {
    assert.strictEqual(S.localOpen().length, 1);
    return S.startRental(Object.assign({}, car(), { id: 'c1' }), { startDate: '2026-10-05' });
  }).then((res) => {
    assert.strictEqual(res.ok, false, 'قبل استئجار تاني فوق واحد مفتوح');
    assert.ok(res.error.indexOf('شغّال') > -1, 'الرسالة مافهاش سبب: ' + res.error);
    assert.strictEqual(S.localAll().length, 1, 'اتسجل اتنين');
  });
});

/* ====================================== */
/* ===== التاريخ بيتغيّر بالمnee ===== */

/* ⭐ لو سرنا نقرا السعر الحالي وقت التقرير، التقرير هيتعاد
   حسابه بالأسعار الجديدة — وده بالظبط اللي العمود القديم كان
   بيعمله. الاختبار ده بيقفل إن السعر بيتثبّت وقت التسجيل. */
test('سعر اليوم بيتثبّت وقت التسجيل — تغييره بعدين ما يمسّش التاريخ', async () => {
  const { S } = loadStore();
  await S.startRental(Object.assign({}, car(), { dailyRate: 200 }),
    { startDate: '2026-01-01', endDate: '2026-01-10' });
  const first = S.revenueBetween('2026-01-01', '2026-01-31');
  assert.strictEqual(first.revenue, 2000, '10 أيام × 200 = 2000');

  /* السعر اتغيّر لـ 500 */
  car().dailyRate = 500;
  const second = S.revenueBetween('2026-01-01', '2026-01-31');
  assert.strictEqual(second.revenue, 2000,
    'إيراد الشهر اللي فات اتغيّر لما السعر اتغيّر — وده غلط');
  assert.strictEqual(S.localAll()[0].dailyRate, 200, 'السعر في السجل اتغيّر');
});

/* ====================================== */
/* ===== التجميع للتقارير ===== */

test('التجميع بينفع مع فلاتر — الأرقام بتطابق اللي معروض', () => {
  const { S } = loadStore();
  return Promise.all([
    S.startRental(Object.assign({}, car(), { id: 'a', plate: 'A-1' }), { startDate: '2026-01-01', endDate: '2026-01-10' }),
    S.startRental(Object.assign({}, car(), { id: 'b', plate: 'B-1' }), { startDate: '2026-01-05', endDate: '2026-01-20' }),
    S.startRental(Object.assign({}, car(), { id: 'c', plate: 'C-1' }), { startDate: '2026-02-01', endDate: '2026-02-05' })
  ]).then(() => {
    /* ⭐ إجمالي الشهر الأول: 10 + 16 = 26 يوم، الإيراد 26×200 */
    const jan = S.revenueBetween('2026-01-01', '2026-01-31');
    assert.strictEqual(jan.days, 26, '10 (أ) + 16 (ب)');
    assert.strictEqual(jan.revenue, 5200);
    assert.strictEqual(jan.carsRented, 2, '3 سيارات مسجّلة بس 2 اتأجرت في يناير');

    /* فبراير: السيارة ج بس */
    const feb = S.revenueBetween('2026-02-01', '2026-02-28');
    assert.strictEqual(feb.days, 5);
    assert.strictEqual(feb.carsRented, 1);

    /* ⭐ لاakh car's count = 0 مش 3 — ده اللي كان بيخلّي
       التقرير يقول «3 سيارات مؤجّرة» وأحد ما فيهم اتأجر */
    const empty = S.revenueBetween('2026-06-01', '2026-06-30');
    assert.strictEqual(empty.days, 0);
    assert.strictEqual(empty.revenue, 0);
    assert.strictEqual(empty.carsRented, 0);

    /* والأعلى إيراداً مرتّبين */
    assert.strictEqual(jan.perCar.length, 2);
    assert.ok(jan.perCar[0].revenue >= jan.perCar[1].revenue, 'مش مرتّب');
  });
});

test('الاستCars اللي ما فيهاش استئجار مش بتتحسب', () => {
  const { S } = loadStore();
  return S.startRental(car(), { startDate: '2026-01-01', endDate: '2026-01-10' }).then(() => {
    const days = S.rentalDaysForCar('c1', '2026-01-01', '2026-01-31');
    assert.strictEqual(days, 10);
    assert.strictEqual(S.rentalDaysForCar('مش-موجودة', '2026-01-01', '2026-01-31'), 0);
  });
});

/* ====================================== */
/* ===== الصلاحيات ===== */

test('«مشاهدة» ماتكتبش ولا سطر', async () => {
  const { S, ctx } = loadStore();
  ctx.window.currentRole = 'view';
  ctx.window.YahmaPerms = { canEditNow: () => false };
  const res = await S.startRental(car(), { startDate: '2026-01-01' });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error, 'permission');
  assert.strictEqual(S.localAll().length, 0);
});

test('«تشغيل» و«إداري» يقدروا يسجّلوا', async () => {
  for (const role of ['ops', 'manager', 'admin']) {
    const { S, ctx } = loadStore();
    ctx.window.currentRole = role;
    ctx.window.YahmaPerms = { canEditNow: () => true };
    const res = await S.startRental(car(), { startDate: '2026-01-01', endDate: '2026-01-05' });
    assert.strictEqual(res.ok, true, role + ' ما قدرش يسجّل');
    assert.strictEqual(S.localAll().length, 1);
  }
});

/* ====================================== */
/* ===== المزامنة ما بتمسحش البيانات المحلية ===== */

/* ⚠️ ده Bug حصل قبل كده في المتجر الأول: المزامنة كانت بتمسح
   كل السجلات المحلية لما القراءة البعيدة ترجع فاضية (RLS
   مرفوض أو الشبكة مقفولة). السجلات المحلية كانت بتضيع. */
test('مزامنة فاشلة ما بتمسحش السجلات المحلية', async () => {
  const { S, ctx } = loadStore();
  await S.startRental(car(), { startDate: '2026-01-01', endDate: '2026-01-10' });
  assert.strictEqual(S.localAll().length, 1);
  /* العميل موجود بس الـselect بيرجع error — زي RLS مرفوض */
  ctx.window.supabaseReady = true;
  ctx.window.supabaseClient = {
    from() { return { select() { return { limit() { return Promise.resolve({ error: { message: 'RLS' }, data: null }); } }; } }; }
  };
  const after = await S.sync();
  assert.strictEqual(after.length, 1, 'المزامنة مسحت السجلات المحلية');
  assert.strictEqual(S.localAll().length, 1);
});

test('مزامنة بتفرز حسب تاريخ البدء — الأحدث فوق', async () => {
  const { S, ctx } = loadStore();
  await S.startRental(Object.assign({}, car(), { id: 'old', plate: 'OLD' }), { startDate: '2026-01-01', endDate: '2026-01-05' });
  await S.startRental(Object.assign({}, car(), { id: 'new', plate: 'NEW' }), { startDate: '2026-06-01', endDate: '2026-06-05' });
  const list = S.localAll();
  assert.strictEqual(list[0].plate, 'NEW', 'الأحدث لازم يكون فوق');
  assert.strictEqual(list[1].plate, 'OLD');
});

/* ====================================== */
/* ===== الربط: التبويب والقوائم والصلاحيات ===== */

/* ⭐ تاريخ بلا وقت.

   `formatArabicDate` بتلزق وقت دايمًا (مناسبة لدفعات الفحص
   لأنها لحظات فعلية). لتواريخ الاستئجار الوقت كلام غلط:
   «بدأ ١ أكتوبر — ٠٣:٠٠ ص» بتقول إن العملية بدأت ٣ الصبح. */
test('تواريخ الاستئجار بتعرض يوم بس — من غير وقت', () => {
  const src = read('modules/rentals.js');
  assert.ok(/function fmtDay\(v\)/.test(src), 'مفيش منسّق تاريخ-يوم');
  /* مينفعش يروح لـformatArabicDate — دي بتلزق وقت */
  assert.ok(!/global\.formatArabicDate/.test(src),
    'rentals.js لسه بيستعمل formatArabicDate — بتلزق وقت على تاريخ');
  assert.ok(!/toLocaleTimeString/.test(src), 'في وقت في عرض التاريخ');
  assert.ok(/toLocaleDateString\('ar-EG'/.test(src), 'مفيش تنسيق عربي للتاريخ');
  /* وخلاص تاريخ الاستلام/التسليم */
  const cell = /<td>' \+ esc\(fmtDate\(r\.startDate\)\)/.test(src);
  assert.ok(cell, 'عمود «من تاريخ» مش بيستعمل fmtDate');
});

test('التبويب مسجّل في كل القوائم — مش في واحدة بس', () => {
  const html = read('index.html');
  const store = read('core/branches-store.js');
  const router = read('core/render-router.js');
  const sw = read('sw.js');

  assert.ok(/data-tab="rentals"/.test(html), 'مفيش زر في القائمة الجانبية');
  assert.ok(/الاستئجارات/.test(html), 'مفيش تسمية عربية للقائمة');
  /* لازم في الاثنين — القائمة مرتبطة بالصلاحيات: لو في HTML
     ومفيش في JS، الزر بيبان ومحدش يقدر يفتحه. */
  assert.ok(/\{id:'rentals',label:'الاستئجارات'\}/.test(store), 'مفيش في قائمة الصلاحيات');
  assert.ok(/'rentals'/.test(store), 'مفيش في القائمة الاحتياطية');
  assert.ok(/currentTab === 'rentals'/.test(router), 'مفيش route');
  assert.ok(/count-rentals/.test(router), 'مفيش عداد');
  assert.ok(html.indexOf('id="count-rentals"') > -1, 'مفيش عنصر العداد في HTML');
  assert.ok(/modules\/rentals-store\.js/.test(html), 'المتجر مش محمّل');
  assert.ok(/modules\/rentals\.js/.test(html), 'الواجهة مش محمّلة');
  /* والـSW لازم يعرف الملفين، وإلا التOffline بيقفل */
  assert.ok(/'\.\/modules\/rentals-store\.js'/.test(sw), 'المتجر مش في precache');
  assert.ok(/'\.\/modules\/rentals\.js'/.test(sw), 'الواجهة مش في precache');
});

test('«الاستئجارات» مش داخل في نطاق الأسطول المفلتر', () => {
  /* fleetForTab بيرجّع «المحتاجة فحص» لكل تبويب مش معروف.
     لو «rentals» مش في قائمة الاستثناء، السجل هيتقفل على
     فلتر الفحص والهروب. */
  const router = noComments(read('core/render-router.js'));
  const m = /\[('dashboard'[^\]]*)\]\.indexOf\(currentTab\)<0/.exec(router);
  assert.ok(m, 'مالقتش قائمة نطاق الأسطول');
  assert.ok(m[1].indexOf("'rentals'") > -1,
    '«rentals» مش في قائمة الاستثناء — السجل هيتقفل على فلتر الفحص');
});

test('قائمة الصلاحيات في دالة الإنشاء مطابقة للواجهة', () => {
  /* فيه اختبار كده، بس ده بيسمّي السبب: لو القائمتين اتفصلوا،
     المستخدم الجديد بياخد تبويبات ناقصة من غير رسالة. */
  const fn = read('supabase/functions/admin-create-user/index.ts');
  const store = read('core/branches-store.js');
  const a = /const allowedTabs = \[([^\]]*)\]/.exec(fn);
  const b = /PAGE_PERMISSION_OPTIONS=\[([\s\S]*?)\];/.exec(store);
  assert.ok(a && b, 'مالقتش القائمتين');
  const ids = (s) => (s.match(/'([a-z-]+)'/g) || []).map((x) => x.replace(/'/g, ''));
  const A = ids(a[1]).sort(), B = ids(b[1].replace(/\s+/g, '')).sort();
  assert.deepStrictEqual(A, B, 'القائمتين اتفصلوا');
  assert.ok(A.indexOf('rentals') > -1, 'التبويب الجديد مش في دالة الإنشاء');
});

test('كل الأدوار تقدر تفتح التبويب، و«مشاهدة» ما بتeditش', () => {
  const glue = read('core/branches-store.js');
  const perms = read('core/permissions.js');
  /* «مشاهدة» مالها حق التعديل في أي تبويب غير الأسطول */
  assert.ok(/var VIEW_EDIT_TABS = \['fleet'\]/.test(perms),
    '«مشاهدة» بقت تقدر تعدّل في تبويب جديد — لازم مراجعة');
  assert.ok(!/OPS_EDIT_TABS = \[[^\]]*rentals/.test(perms),
    '«rentals» في أذونات التشغيل — مش متفق عليه');
  /* والأدوار بتاخد التبويب افتراضيًا */
  const m = /: \[('dashboard'[^\]]*)\];/.exec(glue);
  assert.ok(m && m[1].indexOf("'rentals'") > -1, 'التبويب مش في القائمة الافتراضية');
});

/* ====================================== */
/* ===== ⭐ التقارير بتقرأ السجل مش العمود القديم ===== */

/* ⚠️ كود التقارير اتقسم على 5 ملفات وقت تقسيم الملفات الكبيرة:
   core (الحساب) + templates (القوالب) + view (العرض) +
   schedule (الجدولة والتصدير) + reports (التنسيق).
   الاختبارات دي بتفحص النطاق كله، فبتقرأ الخمسة مع بعض. */
const REPORTS = () => [
  'modules/reports-core.js', 'modules/reports-templates.js',
  'modules/reports-view.js', 'modules/reports-schedule.js',
  'modules/reports.js'
].map((f) => noComments(read(f))).join('\n');

/* ده سبب الشغل كله. لازم يُقفل بإحكام: أي رجوع للعمود
   رجّع التقرير يقول 0% على أسطول فيه 200 استئجار. */
test('التقارير ما بتقراش rentedDaysMonth تاني', () => {
  const src = REPORTS();
  const hits = [...src.matchAll(/\brentedDaysMonth\b/g)];
  assert.strictEqual(hits.length, 0,
    'التقرير لسه بيقرا العمود القديم ' + hits.length + ' مرة — الأرقام هتكون غلط');
});

test('التقرير بيحسب الاستغلال بأيام الفترة — مش 30 ثابتة', () => {
  const src = REPORTS();
  assert.ok(/const periodDays=Math\.max\(1,/.test(src),
    'مفيش حساب أيام الفترة');
  assert.ok(/activeCars\.length\*periodDays/.test(src),
    'الاستغال لسه مقسوم على 30 ثابتة — غلط مع أي فترة مش شهر');
});

test('مفيش استئجارات ← الرسالة صريحة، مش 0%', () => {
  const src = REPORTS();
  /* ⭐ ده اللي كان بيخلّي صفر الـ3,984 يفضل شهور والحدش
     ياخد باله. 0% بتقول «مفيش تأجير»، والحقيقة «مفيش بيانات». */
  assert.ok(/function noRentalsNotice/.test(src), 'مفيش رسالة «لسه محدّدش»');
  assert.ok(/hasRentals/.test(src), 'مفيش علم نمega');
  assert.ok(/rpFiltered\.hasStore\s*\?/.test(src),
    'الكارت مش بيختار بين الصفر واللا-بيانات');
  assert.ok(/لسه محدّدش استئجارات/.test(src), 'نص الرسالة مفقود');
  assert.ok(/data-goto-rentals/.test(src), 'مفيش زرار يودّي للتبويب');
});

test('مصدر واحد للأيام في التقرير — مش محسوب في كذا مكان', () => {
  const src = REPORTS();
  /* كل حساب أيام لازم يمر على rentalsPeriod أو perCar بتاعها.
     أي `overlapDays` مباشرة جوه الصفحة = نسخة ثانية من
     المنطق وهتختلف عن الأولى. */
  const direct = [...src.matchAll(/overlapDays\(/g)];
  assert.strictEqual(direct.length, 1,
    'overlapDays بيتنادى ' + direct.length + ' مرة — المفروض مرة واحدة في rentalsPeriod');
  assert.ok(/function rentalsPeriod\(cars, bounds\)/.test(src), 'مفيش rentalsPeriod');
  /* والأيام بتتجمّع من الخريطة، مش من حد شارد */
  assert.ok(/rpFiltered\.perCar\.get\(String\(c\.id\)\)/.test(src),
    'الأيام مش بتتقرا من خريطة الفترة');
});

/* ====================================== */
/* ===== الجدول في القاعدة ===== */

test('جدول الاستئجارات في القاعدة — بالسياسات والاحتياطات', () => {
  const sql = read('supabase/rentals.sql');
  assert.ok(/create table if not exists public\.rentals/.test(sql), 'مفيش الجدول');
  ['car_id', 'start_date', 'end_date', 'daily_rate', 'prev_status']
    .forEach((c) => {
      assert.ok(new RegExp('\\b' + c + '\\b').test(sql), 'مفيش العمود ' + c);
    });
  assert.ok(/enable row level security/.test(sql), 'الجدول من غير RLS — أي حد يقرا الإيراد');
  /* ⭐ ترتيب التواريخ في القاعدة، مش في الواجهة بس. لو حقل
     تاريخ في المستقبل اتحفظ، التقرير بيتحسب سنين غلط. */
  assert.ok(/check \(end_date is null or end_date >= start_date\)/.test(sql),
    'مفيش قيد على ترتيب التواريخ');
  assert.ok(/daily_rate >= 0/.test(sql), 'سعر سالب مسموح');
  /* والحذف للمدير بس — حذف استئجار بيمسح من التاريخ */
  assert.ok(/rentals_delete_admin[\s\S]*?yahma_is_admin/.test(sql),
    'حذف الاستئجار مش مقفول على المدير');
  /* والقواعد بتتماشى مع جدول الأسطول */
  assert.ok(/yahma_can_access_branch\(branch\)/.test(sql), 'القراءة مش مربوطة بالفرع');
  assert.ok(/yahma_can_manage_branch\(branch\)/.test(sql), 'الكتابة مش مربوطة بالفرع');
});

test('التبويب الجديد بيوصل للحسابات الموجودة — مش الجديدة بس', () => {
  const sql = read('supabase/rentals.sql');
  /* ⚠️ التنبيه في supabase-migration.sql:119 بيحدّث where
     allowed_tabs is null بس. الحسابات الموجودة عندنا اتعملت من
     أول فماعندهاش NULL — التحديث القديم مش هيوصلها خالص. */
  assert.ok(/array_append\(allowed_tabs, 'rentals'\)/.test(sql),
    'مفيش تحديث لـallowed_tabs');
  assert.ok(/where not \('rentals' = any\(allowed_tabs\)\)/.test(sql),
    'التحديث مش محمي من التكرار');
});

/* ===== ملف التحقق على القاعدة ===== */

test('ملف التحقق آمن — بيعمل rollback (مش بيسيب بيانات)', () => {
  const sql = read('supabase/verify-rentals.sql');
  /* ⚠️ النتيجة بتطلع جوّه نص الاستثناء لأن الـnotices مش بتظهر
     مع خطأ، والـraise في الآخر هو اللي بيعمل rollback. */
  assert.ok(/raise exception 'RENTALS-VERIFY/.test(sql),
    'مفيش raise في الآخر — الـrollback مش هيحصل');
  assert.ok(/do \$\$/.test(sql) && /end \$\$;/.test(sql),
    'الملف لازم يكون بلوك do ... end');
  /* وكل صف بيستعمله لازم يتمسح */
  assert.ok(/delete from public\.rentals where car_id = 'zz-verify'/.test(sql),
    'صف الاختبار مش بيتمسح');
  /* ومفيش insert ثابت في profiles — الـFK مربوط بـauth.users */
  assert.ok(!/insert into public\.profiles \(id, role, full_name/.test(sql),
    'insert في profiles هيقع في FK error');
  /* ودور «مشاهدة» بيتبنى بتغيير دور حساب موجود، والرجوع لازم
     يبان في الكود */
  assert.ok(/set role = 'view' where id = v_probe/.test(sql),
    'مفيش تبديل دور مؤقت');
  assert.ok(/set role = v_probe_role where id = v_probe/.test(sql),
    'مفيش رجوع للدور الأصلي');
  /* ⚠️ ولازم يكون في الـclaims مش في set role بس — الحارس
     security definer فـcurrent_user جوه هو مالك الدالة */
  assert.ok(/'role', 'service_role'/.test(sql),
    'مفيش claim للـservice_role — الحارس هيرفض');
});

test('مفيش استعلام متبقٍ في التقرير على rentedDaysMonth — حتى في التصدير', () => {
  const src = REPORTS();
  /* التصدير كمان كان بيقرأ العمود القديم — لازم هو كمان */
  const exportBlock = /'أيام التأجير':(.*)/.exec(src);
  assert.ok(exportBlock, 'مفيش سطر أيام التأجير في التصدير');
  assert.ok(exportBlock[1].indexOf('rentedDaysMonth') < 0,
    'التصدير لسه بيقرأ العمود القديم');
});
/* ===== السجلات المرحَّلة ===== */

/* ترحيل 2026-10: 2,859 سيارة حالتها «مؤجرة» ماكانش عندها سجل تأجير،
   فبنينا لها سجل من الحالة + السعر + 30 يوم. السجل ده استنتاج مش
   تاريخ حقيقي — أول ما المستخدم يسجّل استئجار حقيقي لنفس السيارة،
   السجل التلقائي لازم يتشال، وإلا الأيام بتتحسب مرتين في التقارير. */
test('السجل المرحَّل بيتشال أول ما المستخدم يسجّل استئجار حقيقي لنفس السيارة', async () => {
  const { S, ctx } = loadStore();
  /* السجل المرحَّل: له end_date، فمش هيعمل clash — وده بالظبط
     اللي كان هيسمح بإضافة سجل حقيقي فوقه من غير ما نلاحظ. */
  const store = ctx.localStorage;
  const KEY = 'yahma-rentals-v1';
  const seeded = [{
    id: 'rent-migrated-1', carId: 'c1', plate: 'ABC-123', branch: 'فرع الرياض',
    startDate: '2026-09-01', endDate: '2026-09-30', dailyRate: 200,
    note: 'ترحيل تلقائي من حالة «مؤجرة» (30 يوم) — راجعه',
    prevStatus: 'مؤجرة', createdAt: '2026-09-01T00:00:00.000Z'
  }];
  store.setItem(KEY, JSON.stringify(seeded));
  assert.strictEqual(S.localAll().length, 1, 'التأسيس غلط');
  /* المستخدم يسجّل استئجاراً حقيقياً لنفس السيارة */
  const res = await S.startRental(car({ carStatus: 'متاحة للايجار' }), {
    startDate: '2026-10-01', endDate: '2026-10-05', dailyRate: 200
  });
  assert.ok(res.ok, 'التسجيل الحقيقي فشل: ' + (res.error || ''));
  const rows = S.localAll();
  assert.strictEqual(rows.length, 1,
    'لازم يبقى سجل واحد بس (التلقائي اتشال) — عدّادنا: ' + rows.length);
  assert.ok(!/ترحيل تلقائي/.test(rows[0].note || ''),
    'السجل المتبقي هو التلقائي — السجل الحقيقي ما اتسجّلش');
});

test('السجل المرحَّل لسه موجود لو مفيش استئجار حقيقي — يعني بيفضل للتقارير', () => {
  const { S, ctx } = loadStore();
  const store = ctx.localStorage;
  const KEY = 'yahma-rentals-v1';
  store.setItem(KEY, JSON.stringify([{
    id: 'rent-migrated-1', carId: 'c1', plate: 'ABC-123', branch: 'فرع الرياض',
    startDate: '2026-09-01', endDate: '2026-09-30', dailyRate: 200,
    note: 'ترحيل تلقائي من حالة «مؤجرة» (30 يوم) — راجعه',
    prevStatus: 'مؤجرة', createdAt: '2026-09-01T00:00:00.000Z'
  }]));
  assert.strictEqual(S.localAll().length, 1);
  assert.strictEqual(S.localAll()[0].note.indexOf('ترحيل تلقائي'), 0,
    'السجل المرحَّل لازم يفضل موجود — هو ده اللي بيغذّي التقارير');
});
