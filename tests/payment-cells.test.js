/* أعمدة «تحت الدفع» الأربعة: الرقم التسلسلي، رقم الحاسب الآلي،
   اسم الشركة، الملاحظات.

   🇪🇬 القصة: اتنين منهم كانوا موجودين (serial و notes) والاتنين
   تانيين جداد. أخطر حاجة هنا مش العرض — هي إن الأعمدة دي
   بتتخزّن على **السيارة** مش على الطلب، فأي حد يضيف عمود في
   الجدول وي)nنسى يعمله في toVehicleRow بيشوفه فاضي على طول،
   ويعدّله بيفقده أول reload.

   وكل اختبار جوا الملف ده بيعمل حاجة واحدة: بيمنع طبقة
   تنسى اللي بعدها.

   نفس الفخ اللي حصل مع حارس الـprofiles اتكرر هنا: الحارس
   معرّف في ملفين، prediscretely أي ملف اتطبق آخر هو اللي
   بيحسم. ففيه اختبار صريح إن-bodied الاتنين واحد. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');

/* الحقول الأربعة: الاسم في كائن السيارة ← عمود القاعدة */
const FIELDS = [
  { field: 'serial', column: 'serial', label: 'الرقم التسلسلي', existed: true },
  { field: 'accountNo', column: 'accountno', label: 'رقم الحاسب الآلي', existed: false },
  { field: 'companyName', column: 'companyname', label: 'اسم الشركة', existed: false },
  { field: 'notes', column: 'notes', label: 'ملاحظات', existed: true }
];

test('الأعمدة الأربعة موجودة في جدول vehicles', () => {
  const flat = noComments(read('supabase/supabase-migration.sql')).replace(/\s+/g, ' ');
  FIELDS.forEach((f) => {
    assert.ok(flat.includes(f.column + ' text'),
      'عمود ' + f.column + ' مش في supabase-migration.sql — بيئة جديدة هتكون ناقصة');
  });
});

test('ملف payment-columns.sql بيعمل الأعمدة بـadd column if not exists', () => {
  const flat = noComments(read('supabase/payment-columns.sql')).replace(/\s+/g, ' ');
  ['accountno', 'companyname'].forEach((col) => {
    assert.ok(
      flat.includes('add column if not exists ' + col + ' text'),
      'العمود ' + col + ' مش في payment-columns.sql'
    );
  });
});

test('طبقة البيانات بتكتب وتقرأ العمودين الجديدين', () => {
  const data = read('modules/data.js');
  /* ⚠️ الاتجاهين لازم يتشيكوا: لو toVehicleRow كاتب والقراءة ناقصة
     (أو العكس) القيمة بتختفي أول reload من القاعدة. */
  FIELDS.filter((f) => !f.existed).forEach((f) => {
    assert.ok(new RegExp('\\b' + f.column + ':\\s*nullable').test(data),
      'toVehicleRow مش بيكتب ' + f.column);
    assert.ok(new RegExp('\\b' + f.field + ':\\s*row\\.' + f.column).test(data),
      'fromVehicleRow مش بيقرأ ' + f.column + ' لـ' + f.field);
  });
});

test('نافذة تعديل السيارة فيها الحقلين ومقفولة على «مشاهدة»', () => {
  const html = read('index.html');
  const modal = read('modules/vehicle-modal.js');
  const form = read('modules/vehicle-form.js');
  const code = noComments(form);
  ['accountNo', 'companyName'].forEach((field) => {
    assert.ok(new RegExp("\\{ field: '" + field + "', form: \\[").test(code),
      field + ' مش في قائمة PROTECTED — «مشاهدة» هتعدّله');
  });
  ['f-accountno', 'f-companyname'].forEach((id) => {
    assert.ok(html.includes('id="' + id + '"'), 'الحقل ' + id + ' مش في النموذج');
    assert.ok(modal.includes("'" + id + "': value("),
      'النموذج مش بيملأ ' + id + ' لما بنفتح سيارة للتعديل');
  });
  /* collect لازم يقراهما */
  assert.ok(/accountNo:\s*readField\('accountNo',\s*'f-accountno'\)/.test(code), 'collect مش بيقرا accountNo');
  assert.ok(/companyName:\s*readField\('companyName',\s*'f-companyname'\)/.test(code), 'collect مش بيقرا companyName');
});

test('الحارس في القاعدة بيقفل الحقلين على «مشاهدة»', () => {
  const sql = noComments(read('supabase/user-edit-access.sql')).replace(/\s+/g, ' ');
  ['accountno', 'companyname'].forEach((col) => {
    assert.ok(sql.includes('new.' + col + ' is distinct from old.' + col),
      'العمود ' + col + ' مش محمي في user-edit-access.sql');
  });
});

/* ⚠️ الأهم: الحارس معرّف في ملفين (user-edit-access.sql و
   payment-columns.sql). أي واحد اتطبق آخر هو اللي بيحسم، فلو
   اتغيروا فاضلًا بيرجع سلوك قديم من غير حد ياخد باله. نفس
   المصيبة اللي حصلت مع profiles وservice_role.

   ولازم نختار الدالة بالاسم: الملف الواحد فيه كذا $fn$، وأول
   واحد مش بالضرورة الحارس — أول نسخة من الاختبار ده كانت بتاخد
   yahma_manage_branch وتقارنها بالحارس. */
function carGuardBody(rel) {
  const src = noComments(read(rel));
  const head = src.search(/create\s+or\s+replace\s+function\s+[\w.]*yahma_guard_car_columns\b/i);
  assert.ok(head > -1, rel + ' مافيش تعريف yahma_guard_car_columns');
  const m = /as \$fn\$([\s\S]*?)\$fn\$/.exec(src.slice(head));
  assert.ok(m, rel + ' مافيش جسم الدالة');
  return m[1].replace(/\s+/g, ' ').trim();
}

test('الحارس متطابق في الملفين — مش منسوخ ومرقّع', () => {
  assert.strictEqual(
    carGuardBody('supabase/user-edit-access.sql'),
    carGuardBody('supabase/payment-columns.sql'),
    'الحارس في الملفين مختلف — أي ملف اتطبق آخر بيكسب');
});

test('حارس السيارات لسه بيعدّي أي دور غير «مشاهدة»', () => {
  const flat = carGuardBody('supabase/user-edit-access.sql');
  assert.ok(/v_role is null or v_role <> 'view' then/.test(flat),
    'الـearly-out بايعدّي service_role — وده المطلوب لإضافة المستخدمين');
  assert.ok(!/= 'service_role' then/.test(flat),
    'حارس السيارات مش محتاج استثناء service_role — الـearly-out بيغطيه');
});

test('الحارس بيقفل العمودين الجديدين فعلاً', () => {
  const flat = carGuardBody('supabase/user-edit-access.sql');
  ['accountno', 'companyname'].forEach((col) => {
    assert.ok(flat.includes('new.' + col + ' is distinct from old.' + col),
      'العمود ' + col + ' مش في قائمة الأعمدة المحمية');
  });
});

/* ===== التبويب ===== */

test('«تحت الدفع» بيعرض الأعمدة الأربعة وكلها قابلة للكتابة', () => {
  const router = read('core/render-router.js');
  FIELDS.forEach((f) => {
    assert.ok(router.includes("field: '" + f.field + "', label: '" + f.label + "'"),
      'العمود ' + f.label + ' مش في قائمة خلايا «تحت الدفع»');
    assert.ok(router.includes("data-car-field"), 'مفيش ربط الخلية بصف السيارة');
  });
  /* readonly لازم يبقى حسب الصلاحية، مش دايماً */
  assert.ok(/payCellsEditable/.test(router), 'مفيش فحص صلاحية');
  assert.ok(/canEditNow\(\)|currentRole === 'view'/.test(router),
    'مفيش مقارنة بالدور «مشاهدة»');
});

test('«مشاهدة» لو تقدر تعدّل الأعمدة دي = ثغرة', () => {
  const router = read('core/render-router.js');
  /* القفل لازم يكون على الـinput نفسه (readonly)، مش بس alert بعد ما
     المستخدم يكتب — عشان الحقل يبقى مقروء ومكتوب ومقفول فعلياً. */
  assert.ok(/\(editable \? '' : ' readonly'\)/.test(router),
    'الـreadonly مش مربوط بالصلاحية — الخلية هتفضل قابلة للكتابة');
  /* وكمان لازم فيه رفض في الحفظ نفسه مش بس في العرض */
  assert.ok(/if \(!payCellsEditable\(\)\) \{/.test(router),
    'مفيش رفض في مسار الحفظ');
});

/* ⚠️ مخرج الوضع التجريبي: أول نسخة من payCellsEditable كانت
   `if (window._demoMode) return true` وبتسيب «مشاهدة» تكتب في
   خلايا هوية. لقيتها لما جربت الدور watch في المتصفح —
   testimonialeviewLocks رجع UNLOCKED. follow-up-ui وrenewals-ui
   مفيهاش المخرج ده. */
test('مفيش مخرج للوضع التجريبي في فحص صلاحية الخلايا', () => {
  const router = read('core/render-router.js');
  const m = /function payCellsEditable\(\)\s*\{[\s\S]*?\n\}/.exec(router);
  assert.ok(m, 'مالقتش payCellsEditable');
  const body = m[0].replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/_demoMode/.test(body),
    'فيه مخرج للوضع التجريبي — «مشاهدة» هتقدر تكتب في خلايا الهوية');
  /* ونفس فحص الصلاحية اللي renewals-ui بتستخدمه */
  assert.ok(/canEditNow/.test(body),
    'مش بيستخدم canEditNow — ناقص شرط التبويب الحالي');
});

/* مفيش مخرج تجريبي في أي حاجة بتعدّل بيانات — القاعدة العامة */
test('مفيش مخرج تجريبي في خلايا قابلة للكتابة في أي تبويب', () => {
  ['modules/follow-up-ui.js', 'modules/renewals-ui.js', 'core/render-router.js']
    .forEach((rel) => {
      const src = read(rel);
      /* كل سطر فيه editable لازم يكون خالي من مخرج تجريبي */
      src.split('\n').forEach((line, i) => {
        if (!/Editable\s*=|_demoMode/.test(line)) return;
        if (!/Editable\s*=/.test(line)) return;
        assert.ok(!/_demoMode/.test(line),
          rel + ':' + (i + 1) + ' — خلية قابلة للكتابة فيها مخرج تجريبي');
      });
    });
});

test('حفظ الخلية بيحفظ على السيارة مش على الطلب', () => {
  const router = read('core/render-router.js');
  assert.ok(/car\[def\.field\] = value/.test(router), 'مش كاتبة القيمة على كائن السيارة');
  assert.ok(/saveData\(\[car\.id\]\)/.test(router), 'مش بتنداء saveData — التعديل يضيع');
  /* الحفظ لازم يتعمل مرة واحدة بالتفويض، مش listener لكل صف */
  assert.ok(/_payCellDelegate/.test(router), 'التفويض مش مثبّت — هيتكرر مع كل render');
});

/* ===== التصدير: Excel + PDF ===== */

/* ⚠️ لازم نحدّد تبويب «تحت الدفع» صريح: الملف فيه
   _yahmaCurrentPdfData لكل تبويب، وأول واحد في الملف مش بتاعنا.
   أول نسخة من الاختبار ده كانت بتفحص جدول تاني وتقول «التصدير
   ناقص». */
function paymentsPdfBlock() {
  const router = read('core/render-router.js');
  const start = router.indexOf('function renderInspectionPayments');
  assert.ok(start > -1, 'مالقتش renderInspectionPayments');
  const body = router.slice(start, router.indexOf('\nfunction ', start + 10) > -1
    ? router.indexOf('\nfunction ', start + 10)
    : router.length);
  const m = /_yahmaCurrentPdfData=\(\)=>\(\{([\s\S]*?)\n  \}\);/.exec(body);
  assert.ok(m, 'مالقتش _yahmaCurrentPdfData جوّه «تحت الدفع»');
  return m[1].replace(/\n\s*/g, ' ');
}

test('«تحت الدفع» بيصدّر الأعمدة الأربعة في Excel و PDF', () => {
  const block = paymentsPdfBlock();
  /* الترويسة والقيم لازم يتولّدوا من نفس المصدر عشان مفيش عمود
     ينزل من الجدول ويبقى في التصدير أو العكس.

     ⚠️ التحقق بالـregex على السطر كله مش بالـchar class: أول نسخة
     استخدمت [^\]]* وبتوقف عند أول ] — وهو قوس المصفوفة الثابتة،
     فكانت بتتوقف قبل PAY_CELL_LABELS وتقول «التصدير ناقص» والكود
     كان تمام. */
  assert.ok(/headers:[\s\S]{0,80}?PAY_CELL_LABELS/.test(block),
    'الترويسة مش من المصدر الواحد');
  assert.ok(/rows:[\s\S]{0,200}?PAY_CELL_FIELDS\.map\(d=>car\[d\.field\]/.test(block),
    'قيم الأعمدة مش من المصدر الواحد');
});

test('عدد أعمدة الجدول = عدد ترويسات التصدير', () => {
  /* زناد كل واحد: لو حد زاد عمود جوّه PAY_CELL_FIELDS بسه
     الـcolspan هيفضل على القديم والصف هيتلخبط. */
  const router = read('core/render-router.js');
  const list = /const PAY_CELL_FIELDS = \[([\s\S]*?)\n\];/.exec(router);
  assert.ok(list, 'مالقتش PAY_CELL_FIELDS');
  const n = [...list[1].matchAll(/field:\s*'/g)].length;
  assert.strictEqual(n, FIELDS.length,
    'الجدول فيه ' + n + ' أعمدة والاختبار متوقع ' + FIELDS.length);
  /* الـcolspan لازم يتحسب من نفس العدد — لا رقم مكتوب بإيد.
     لاحظ إن الـ+ جوّه الأقواسمش برّهها، فالفحص لازم يكون
     جوه الـcolspan نفسه. */
  assert.ok(/colspan="[^"]*PAY_CELL_FIELDS\.length/.test(router),
    'الـcolspan ثابت ومكتوب بإيد — لازم يتحسب من عدد الأعمدة');
  /* والترويسة والقيم من نفس المصفوفة كمان */
  assert.ok(/const PAY_CELL_HEADERS = PAY_CELL_FIELDS\.map/.test(router),
    'ترويسة الجدول مش من المصدر الواحد');
});

test('التنسيق موجود في CSS (الخلية تبان في الوضعين)', () => {
  const light = read('css/02-components.css');
  const dark = read('css/04-dark-overrides.css');
  assert.ok(/\.pay-cell\{/.test(light), 'مفيش تنسيق للخلية');
  assert.ok(/\.pay-cell\[readonly\]/.test(light), 'مفيش تنسيق للحالة المقفولة');
  assert.ok(/body\.dark-mode \.pay-cell\{/.test(dark), 'مفيش نسخة للوضع الليلي');
  assert.ok(/body\.dark-mode \.pay-cell\[readonly\]/.test(dark), 'مفيش نسخة ليلي للحالة المقفولة');
});

/* ===== نفس الأعمدة في تبويب الفحص =====

   الطلب: الأعمدة بتتسجّل في الفحص وتتمشى مع السيارة لـ«تحت الدفع».
   («تشغيل» شغال في الفحص وفيه بس — OPS_EDIT_TABS = ['renewals'] —
   فده المكان الطبيعي إنه يملاها.) */

const REN_NEW = [
  { field: 'serial', label: 'الرقم التسلسلي' },
  { field: 'accountNo', label: 'رقم الحاسب الآلي' },
  { field: 'companyName', label: 'اسم الشركة' }
];

test('تبويب الفحص بيعرض الأعمدة الثلاثة كخلايا قابلة للكتابة', () => {
  const code = noComments(read('modules/renewals-ui.js'));
  REN_NEW.forEach((f) => {
    assert.ok(code.includes("field:'" + f.field + "', label:'" + f.label + "'"),
      'الحقل ' + f.field + ' مش في قائمة أعمدة الفحص');
  });
  /* الترويسة من نفس المصدر — مش مكتوبة يدوي */
  assert.ok(/const REN_DATA_HEADERS = REN_DATA_FIELDS\.map/.test(code),
    'ترويسة الفحص مش من المصدر الواحد');
  /* والخلايا بتتقفل حسب الصلاحية */
  assert.ok(/\(editable \? '' : ' readonly'\)/.test(code),
    'خلايا الفحص مش مربوطة بالصلاحية');
});

test('«مشاهدة» مقفولة على خلايا الفحص كمان', () => {
  const src = noComments(read('modules/renewals-ui.js'));
  assert.ok(/renDataCells\(c,\s*noteEditable\)/.test(src),
    'خلايا الفحص مش مربوطة بـnoteEditable');
  const ne = /const noteEditable=([^;]+);/.exec(src);
  assert.ok(ne, 'مالقتش noteEditable');
  assert.ok(!/_demoMode/.test(ne[1]),
    'noteEditable فيه مخرج للوضع التجريبي — «مشاهدة» هتكتب');
  assert.ok(/currentRole==='view'/.test(src), 'مفيش رفض في مسار الحفظ');
});

test('خانات الفحص بتاخد نفس معرّف الحقل (مش تكران)', () => {
  const code = noComments(read('modules/renewals-ui.js'));
  /* كل الحقول بتستخدم data-car-id، والتفويض بيقرا منه.
     أول نسخة كانت خانة الملاحظات على data-note-id والخلايا
     التانية على data-car-id — فالتنسيق بيبص على الأول
     والـcarId ميبقاش موجود. */
  assert.ok(!/data-note-id/.test(code), 'لسه في data-note-id — التفويض مش هيقرا الـcarId');
  /* التحديد بمعرّف واحد؛ الحقل بيتعرف من data-ren-field */
  assert.ok(/e\.target\.closest\('input\[data-car-id\]'\)/.test(code),
    'التفويض مش بيستخدم المعرّد الموحّد');
  assert.ok(/hasAttribute\('data-ren-field'\)/.test(code),
    'مفيش تمييز بين خلية البيانات وخانة الملاحظات');
  assert.ok(/inp\.dataset\.carId/.test(code), 'التفويض مش بيقرا data-car-id');
  assert.ok(/_renNoteDelegate/.test(code), 'التفويض مش مثبّت — هيتكرر مع كل رسم');
});

test('تصدير الفحص بيطلع الأعمدة الثلاثة', () => {
  const code = noComments(read('modules/renewals-ui.js'));
  assert.ok(/headers:\[[\s\S]{0,120}?REN_DATA_LABELS/.test(code),
    'ترويسة تصدير الفحص ناقصة الأعمدة');
  assert.ok(/\.concat\(REN_DATA_FIELDS\.map\(d=>c\[d\.field\]/.test(code),
    'قيم الأعمدة ناقصة من تصدير الفحص');
  /* الرخص والتأمين ما اتغيّرش — ليهم تصدير مستقل */
  assert.ok(/تجديد الرخص المفلترة/.test(code), 'تصدير الرخص اتمسح بالغلط');
  assert.ok(/التأمين المفلتر/.test(code), 'تصدير التأمين اتمسح بالغلط');
});

test('الـcolspan بيتحسب من الترويسات مش رقم ثابت', () => {
  const code = read('modules/renewals-ui.js');
  assert.ok(/#ren-table thead tr:first-child > th/.test(code), 'مفيش عدّ الترويسات');
  assert.ok(/const colCount=headCells\.length/.test(code),
    'الـcolspan مش محسوب من الترويسات');
  /* الرقم القديم كان 9 في وضع الفحص وأقل من الفعلي بخمس أعمدة */
  assert.ok(!/baseCols\s*=\s*insuranceMode/.test(code),
    'لسه في الرقم القديم — هيتكسر مع أول عمدة جديدة');
  assert.ok(!/delCol/.test(code), 'لسه في delCol — مفيش عمدة حذف منفصلة أصلاً');
});

/* ملف التحقق على القاعدة — لازم يفضل آمن يتطبق أي عدد مرات */
test('ملف التحقق على القاعدة آمن — بيعمل rollback', () => {
  const src = read('supabase/verify-payment-columns.sql');
  assert.ok(/raise exception/.test(src),
    'لازم يرمي استثناء في الآخر عشان يعمل rollback');
  /* ⚠️ الفحص على الكود مش على الشرح: أول نسخة من الاختبار ده
     matchت على كلمة «commit» اللي في التعليق نفسه. */
  const code = noComments(src);
  assert.ok(!/\bcommit\b/i.test(code), 'في commit — الملف ده هيسبّب تغيير دائم');
  assert.ok(!/\bdelete\b/i.test(code), 'في delete');
  assert.ok(/view/.test(code) && /ops/.test(code), 'مش بيفحص الدورين');
  /* مافيش حساب «مشاهدة» على المنصة، فالاختبار لازم يعمل واحد
     جوّه الـtransaction — من غير كده بيفحص والا محدش وبيعدّي */
  assert.ok(/set role = 'view'/.test(code),
    'مش بيعمل حساب مشاهدة مؤقت — الاختبار بيفحص والا محدش');
  assert.ok(/disable trigger yahma_guard_profile_columns/.test(code),
    'حارس الـprofiles هيمنع تجهيز الحساب');
});
