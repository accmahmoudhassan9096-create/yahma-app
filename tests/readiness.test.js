/* اختبارات منطق الجاهزية (readiness) — الكود اللي بيحدد السيارة
   جاهزة للتأجير ولا لأ، وليه.

   ده قلب التطبيق: كل حاجة في الواجهة (الشارة، العدّاد، الإحصائيات،
  .tasks) معتمدة عليه. لو اتغيرت القواعد بالغلط، الشاشة هتأكد للتأجير
   عربية ناقصة أو ناقصة سليمة، ومحدش هياخد باله.

   الاختبارات مكتوبة من القواعد نفسها في readiness.js وutils.js — مش
   من تخمين. لو القواعد اتغيرت والقاعدة الجديدة مخالفة للاختبار،
   الاختبار لازم يفشل. ده المطلوب بالظبط. */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { vehicleReadiness, readinessStats, readinessReasons, utils, readyCar, iso } = require('./harness');

test('السيارة السليمة كاملة ترجع جاهزة', () => {
  const r = vehicleReadiness(readyCar());
  assert.strictEqual(r.ready, true);
  assert.strictEqual(r.level, 'green');
  assert.strictEqual(r.failed.length, 0);
  assert.strictEqual(r.checks.length, 6, 'من المفروض 6 فحوصات: كارت، رخصة، تأمين، فحص، صيانة، حالة');
});

test('السيارة من غير id مش مسجّلة', () => {
  const car = readyCar();
  delete car.id;
  const r = vehicleReadiness(car);
  assert.strictEqual(r.ready, false);
  assert.strictEqual(r.level, 'grey');
});

test('input غريب ما bearings عليه', () => {
  for (const input of [null, undefined, 0, '', 'nonsense', [], NaN]) {
    const r = vehicleReadiness(input);
    assert.ok(r && Array.isArray(r.checks), 'لازم يرجع object صالح لـ: ' + JSON.stringify(input));
    assert.strictEqual(r.ready, false);
  }
});

/* ===== القاعدة المحورية: الجاهزية = الأوراق بس =====

   دي مواصفة مش تفسير. في readiness.js مكتوب حرفياً:
   «المعيار: الجاهزية = صلاحية الأوراق الأربعة فقط (كارت/رخصة/تأمين/فحص)»

   يعني سيارة مؤجرة أو تحت الصيانة بأوراق سليمة بترجع «جاهزة» green.
   ده مش باگ: ده اللي اتاتفق عليه من الأصل — الجاهزية بتقيس
   صلاحية الأوراق، مش توفّر السيارة للإيجار.

   الاختبارات دي بتثبّت القاعدة دي عن قصد. لو حد غيّرها بعدين
   (مثلاً عايز الحالة تدخل في المعيار) الاختبارات هتفشل، والتغيير
   هيبقى قرار واعي مش عرضي. */

test('سيارة مسروقة بأوراق سليمة = غير جاهزة', () => {
  /* القاعدة: الجاهزية = الأوراق، لكن السيارة اللي هي مش عندنا
     وقفة قبل المعيار. فلتر «خارج» في تبويب الأسطول بيعتبرها
     خارج من زمان، والجاهزية بقت بتتّفق معاه. */
  const stolen = vehicleReadiness(readyCar({ carStatus: 'مسروقة' }));
  assert.strictEqual(stolen.ready, false);
  assert.strictEqual(stolen.level, 'red');
  assert.strictEqual(stolen.label, 'مسروقة');
});

test('كل حالات «مش عندنا» بتوقّف الجاهزية حتى بأوراق سليمة', () => {
  /* نفس تصنيف فلتر الأسطول: carStatusOut في utils.js. */
  const cases = [
    ['مسروقة', 'مسروقة'],
    ['مفقودة', 'مفقودة'],
    ['محولة', 'محولة غير مستلمة'],
    ['خارج الخدمة', 'خارج الخدمة']
  ];
  for (const [status, label] of cases) {
    const r = vehicleReadiness(readyCar({ carStatus: status }));
    assert.strictEqual(r.ready, false, status + ' بأوراق سليمة');
    assert.strictEqual(r.level, 'red');
    assert.strictEqual(r.label, label, 'وسم ' + status);
  }
});

test('عدّاد «خارج» بيشمل الحالات الأربعة زي الفلتر', () => {
  /* كان بيعدّ «خارج الخدمة» بس، فالمسروقة كانت بتتحسب «غير جاهزة»
     وكمان تدخل في فلتر «خارج» — رقمين مختلفين لنفس السيارة. */
  const fleet = [
    readyCar({ id: 'a' }),
    readyCar({ id: 'b', carStatus: 'مسروقة' }),
    readyCar({ id: 'c', carStatus: 'مفقودة' }),
    readyCar({ id: 'd', carStatus: 'محولة' }),
    readyCar({ id: 'e', carStatus: 'خارج الخدمة' }),
    readyCar({ id: 'f', insuranceStatus: 'منتهية' })
  ];
  const stats = readinessStats(fleet);
  assert.strictEqual(stats.out, 4, 'الأربع حالات بره');
  assert.strictEqual(stats.ready, 1, 'السليمة بس');
  assert.strictEqual(stats.other, 1, 'النقص الورقي العادي');
  assert.strictEqual(stats.total - stats.ready - stats.out, 1, 'اللي محتاج انتباه');
});

test('سيارة مؤجرة بأوراق سليمة بتفضل جاهزة', () => {
  /* «مؤجرة» مش من تصنيف «مش عندنا» — السيارة موجودة عندنا، بس
     مؤجرة دلوقتي. أوراقها سليمة فالجاهزية خضرا. */
  const r = vehicleReadiness(readyCar({ carStatus: 'مؤجرة' }));
  assert.strictEqual(r.ready, true);
  assert.strictEqual(r.level, 'green');
  /* الحالة لسه فاشلة في الفحوصات وبتتعرض للمستخدم */
  const status = r.checks.find((c) => c.key === 'status');
  assert.strictEqual(status.ok, false, 'حالة «مؤجرة» لازم تفضل فاشلة في الفحوصات');
});

test('أي نقص في الأوراق بيمنع الجاهزية مهما كانت الحالة', () => {
  /* ناقص ورقي + حالة مؤجرة → لسه مش جاهزة. الأوراق هي الأساس. */
  const r = vehicleReadiness(readyCar({ insuranceStatus: 'منتهية', carStatus: 'مؤجرة' }));
  assert.strictEqual(r.ready, false);
});

/* ===== الكارت ===== */

test('كارت منتهي بيمنع الجاهزية', () => {
  const r = vehicleReadiness(readyCar({ cardExpiry: iso(-1) }));
  assert.strictEqual(r.ready, false);
  const card = r.checks.find((c) => c.key === 'card');
  assert.strictEqual(card.ok, false);
});

test('كارت ملغى أو موقوف بيمرّ لو التاريخ ساري', () => {
  /* التاريخ ساري بس الحالة ملغاة — لازم يرفض. */
  for (const status of ['ملغى', 'موقوف']) {
    const r = vehicleReadiness(readyCar({ cardStatus: status }));
    assert.strictEqual(r.ready, false, 'الحالة ' + status + ' لازم تمنع الجاهزية');
  }
});

test('كارت داخل 30 يوم بيوقف الجاهزية — الـamber مش ساري', () => {
  /* dateStatus بترجع amber للـ30 يوم الجاية، والجاهزية بتبطل
     غير على level === 'green'. يعني لازم يفضل في الكارت أكتر من
     شهر عشان السيارة تتعتبر جاهزة. ده مقصود: الجاهزية سلام،
     والتأمين proximately. */
  const soon = vehicleReadiness(readyCar({ cardExpiry: iso(10) }));
  assert.strictEqual(soon.ready, false, 'كارت قارب على الانتهاء = مش جاهزة');
  assert.strictEqual(soon.checks.find((c) => c.key === 'card').ok, false);

  const justOver = vehicleReadiness(readyCar({ cardExpiry: iso(31) }));
  assert.strictEqual(justOver.ready, true, '31 يوم = لسه أخضر');
});

test('كل وثيقة ناقصة بتمنع الجاهزية لوحدها', () => {
  const cases = [
    ['license', { licenseExpiry: iso(-5) }],
    ['license', { licenseStatus: 'ملغى' }],
    ['insurance', { insuranceStatus: 'منتهية' }],
    ['inspection', { inspectionStatus: 'لم يفحص' }]
  ];
  for (const [key, patch] of cases) {
    const r = vehicleReadiness(readyCar(patch));
    assert.strictEqual(r.ready, false, 'من المفروض ' + key + ' الناقص يوقف الجاهزية');
    const failedKeys = r.failed.map((f) => f.key);
    assert.ok(failedKeys.includes(key), 'الفشل لازم يكون على ' + key);
  }
});

test('نقص الفحص بيدي الوسم «تحتاج فحص»', () => {
  const r = vehicleReadiness(readyCar({ inspectionStatus: 'لم يفحص' }));
  assert.strictEqual(r.level, 'amber');
  assert.strictEqual(r.label, 'تحتاج فحص');
});

test('نقص الصيانة مع نقص ورقي بيدي «تحتاج صيانة» الأول', () => {
  /* الصيانة جاية قبل الفحص في ترتيب الأولويات — مثبّت أدناه. */
  const r = vehicleReadiness(readyCar({ carStatus: 'تحت الصيانة', insuranceStatus: 'منتهية' }));
  assert.strictEqual(r.level, 'amber');
  assert.strictEqual(r.label, 'تحتاج صيانة');
});

test('نقص ورقي عادي = «غير جاهزة» حمرا', () => {
  const r = vehicleReadiness(readyCar({ insuranceStatus: 'منتهية' }));
  assert.strictEqual(r.level, 'red');
  assert.strictEqual(r.label, 'غير جاهزة');
});

/* ===== أولوية التصنيف =====
   لو فيه أكتر من مشكلة، الترتيب لازم يبقى ثابت. ده اللي بيخلي
   العدّادات في الداشبورد متسقة.

   الترتيب الفعلي:
     1. الأوراق كلها سليمة      → أخضر «جاهزة للتأجير»
     2. حالة تالفة               → أحمر (وسم الحالة نفسها)
     3. نقص صيانة                → كهرماني «تحتاج صيانة»
     4. نقص فحص                  → كهرماني «تحتاج فحص»
     5. أي نقص تاني             → أحمر «غير جاهزة» */

test('ترتيب التصنيف: الحالة التالفة تسبق الصيانة والفحص', () => {
  const r = vehicleReadiness(readyCar({
    carStatus: 'مسروقة',
    inspectionStatus: 'لم يفحص',
    insuranceStatus: 'منتهية'
  }));
  assert.strictEqual(r.level, 'red');
  assert.strictEqual(r.label, 'مسروقة');
});

test('ترتيب التصنيف: الصيانة تسبق الفحص', () => {
  const r = vehicleReadiness(readyCar({
    carStatus: 'تحت الصيانة',
    inspectionStatus: 'لم يفحص',
    insuranceStatus: 'منتهية'
  }));
  assert.strictEqual(r.label, 'تحتاج صيانة');
});

/* ===== الإحصائيات ===== */

test('الإحصائيات بتعدّ صح', () => {
  const fleet = [
    readyCar({ id: 'a' }),                                          // جاهزة
    readyCar({ id: 'b', insuranceStatus: 'منتهية' }),                 // نقص ورقي
    readyCar({ id: 'c', carStatus: 'مسروقة' }),                       // خارج الأسطول
    readyCar({ id: 'd', insuranceStatus: 'منتهية', carStatus: 'تحت الصيانة' }), // صيانة
    readyCar({ id: 'e', insuranceStatus: 'منتهية', inspectionStatus: 'لم يفحص' }) // فحص
  ];
  const stats = readinessStats(fleet);
  assert.strictEqual(stats.total, 5);
  assert.strictEqual(stats.ready, 1, 'السليمة بس');
  assert.strictEqual(stats.out, 1, 'المسروقة بره');
  assert.strictEqual(stats.maintenance, 1, 'صيانة مع نقص ورقي');
  assert.strictEqual(stats.inspection, 1, 'فحص مع نقص ورقي');
  assert.strictEqual(stats.other, 1, 'النقص الورقي بلا تصنيف');
  assert.strictEqual(stats.pct, 20, '1 من 5 = 20%');
  assert.ok(Object.keys(stats.reasons).length > 0, 'لازم تسجّل أسباب الجاهزية الناقصة');
});

test('عدّاد الصيانة بيشتغل بس مع نقص ورقي — وده بالتصميم', () => {
  /* سيارة تحت الصيانة بأوراق سليمة تُعتبر جاهزة، فالعدّاد
     مش هيلاقيها. مش باگ — الجاهزية بتقيس الأوراق. لو حد عايز
     عدّاد صيانة حقيقي، ده تغيير في المواصفة مش في الاختبار. */
  const fleet = [readyCar({ id: 'x', carStatus: 'تحت الصيانة' })];
  const stats = readinessStats(fleet);
  assert.strictEqual(stats.ready, 1);
  assert.strictEqual(stats.maintenance, 0);
});

test('الإحصائيات على أسطول فاضي ما بتقعش', () => {
  for (const input of [[], null, undefined, 'nope']) {
    const s = readinessStats(input);
    assert.strictEqual(s.total, 0);
    assert.strictEqual(s.ready, 0);
    assert.strictEqual(s.pct, 0);
  }
});

test('كل سيارة غير جاهزة ليها سبب مسجّل', () => {
  const fleet = [readyCar({ id: 'a', insuranceStatus: 'منتهية' }), readyCar({ id: 'b' })];
  const stats = readinessStats(fleet);
  const reasons = readinessReasons(stats);
  assert.ok(reasons.length > 0);
  /* reasons لازم تنزل مرتبة تنازليًا */
  for (let i = 1; i < reasons.length; i++) {
    assert.ok(reasons[i - 1].count >= reasons[i].count, 'لازم الترتيب تنازلي بالعدد');
  }
});

/* ===== ثوابت utils اللي الجاهزية بتعتمد عليها ===== */

test('dateStatus: حدود قرب الانتهاء والانتهاء', () => {
  assert.strictEqual(utils.dateStatus(iso(400)).level, 'green');
  assert.strictEqual(utils.dateStatus(iso(10)).level, 'amber');
  assert.strictEqual(utils.dateStatus(iso(0)).level, 'amber');
  assert.strictEqual(utils.dateStatus(iso(-1)).level, 'red');
  assert.strictEqual(utils.dateStatus('').level, 'grey');
});

test('textTag: القيم المتوقعة خضرا', () => {
  for (const v of ['نشط', 'سليم', 'ساري', 'موجودة', 'مؤجرة', 'متاحة للايجار']) {
    assert.strictEqual(utils.textTag(v).level, 'green', v + ' لازم يكون أخضر');
  }
  assert.strictEqual(utils.textTag('منتهية').level, 'red');
  assert.strictEqual(utils.textTag('').level, 'grey');
});

test('inspectionDisplayStatus', () => {
  assert.strictEqual(utils.inspectionDisplayStatus('تم الفحص').level, 'green');
  assert.strictEqual(utils.inspectionDisplayStatus('لم يفحص').level, 'red');
  assert.strictEqual(utils.inspectionDisplayStatus('').level, 'grey');
});

test('carStatusReady', () => {
  assert.strictEqual(utils.carStatusReady('نشط'), true);
  assert.strictEqual(utils.carStatusReady('متاحة للايجار'), true);
  assert.strictEqual(utils.carStatusReady('مؤجرة'), false);
  assert.strictEqual(utils.carStatusReady(''), false);
});