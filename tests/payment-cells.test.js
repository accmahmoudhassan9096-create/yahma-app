/* أعمدة بيانات السيارة عبر دورة الفحص والدفع:
   الرقم التسلسلي، رقم الحاسب الآلي، اسم الشركة، الملاحظات.

   📌 القرار النهائي من المستخدم:
   - الأعمدة **خلايا عرض** مش خلايا كتابة. مفيش كتابة يدوية.
   - القيم **ثابتة على السيارة** وبتيجي من **ملف Excel مرفوع**.
   - لما السيارة تنتقل بين التبويبات، القيم تنتقل معاها (عشان
     متخزّنة على السيارة مش على الطلب).

   كل اختبار بيعمل حاجة واحدة: بيمنع طبقة تنسى اللي بعدها.

   نفس الفخ اللي اتكرر مرتين في الشغل ده:
   ❶ الأعمدة متنسخة في ملفين («الفحص» و«تحت الدفع») — لو اتغير
      واحد واتغير التاني لأ، هيتلقوا في تاب مختلف.
   ❷ الـExcel بيفهم أسماء أعمدة من aliases — لو الحقل مش في
      FIELD_ALIASES، الملف بيتقرا والعمود يتجاهل بصمت. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');

/* ===== تحميل modules/fleet-excel.js كما هو =====

   الاختبارات السلوكية (findField وparseImportRows) لازم تنادي
   الكود المنشور، مش نسخة منه في الاختبار — النسخة دي هي اللي
   بتDicec في الأول. الملف IIFE بيصدّر على window وبيستخدم
   global.alert بس في التقارير، فالـsandbox بسيط. */
function loadFleetExcel() {
  const sandbox = {
    console, Date, Math, JSON, Intl, Promise, RegExp, Set, Map,
    setTimeout: () => 0, clearTimeout: () => {}, alert() {},
    XLSX: undefined
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.runInContext(read('modules/fleet-excel.js'), vm.createContext(sandbox),
    { filename: 'fleet-excel.js' });
  assert.ok(sandbox.YahmaFleetExcel, 'YahmaFleetExcel مش متصدّر');
  return sandbox.YahmaFleetExcel;
}

/* الحقول الأربعة: الاسم في كائن السيارة ← عمود القاعدة */
const FIELDS = [
  { field: 'serial', column: 'serial', label: 'الرقم التسلسلي', existed: true },
  { field: 'accountNo', column: 'accountno', label: 'رقم الحاسب الآلي', existed: false },
  { field: 'companyName', column: 'companyname', label: 'اسم الشركة', existed: false },
  { field: 'notes', column: 'notes', label: 'ملاحظات', existed: true }
];

/* الأعمدة الجديدة بس — دي اللي اتضافت دلوقتي */
const NEW_FIELDS = FIELDS.filter((f) => !f.existed);

/* ===== القاعدة وطبقة البيانات ===== */

test('الأعمدة الأربعة موجودة في جدول vehicles', () => {
  const flat = noComments(read('supabase/supabase-migration.sql')).replace(/\s+/g, ' ');
  FIELDS.forEach((f) => {
    assert.ok(flat.includes(f.column + ' text'),
      'عمود ' + f.column + ' مش في supabase-migration.sql');
  });
});

test('طبقة البيانات بتكتب وتقرأ الأعمدة (الاتجاهين)', () => {
  const data = read('modules/data.js');
  /* لو toVehicleRow كاتب والقراءة ناقصة (أو العكس) القيمة بتختفي
     أول reload — وده بالظبط اللي «ثابتة على السيارة» معناه. */
  NEW_FIELDS.forEach((f) => {
    assert.ok(new RegExp('\\b' + f.column + ':\\s*nullable').test(data),
      'toVehicleRow مش بيكتب ' + f.column);
    assert.ok(new RegExp('\\b' + f.field + ':\\s*row\\.' + f.column).test(data),
      'fromVehicleRow مش بيقرأ ' + f.column);
  });
});

test('نافذة تعديل السيارة فيها الحقلين ومقفولة على «مشاهدة»', () => {
  const html = read('index.html');
  const modal = read('modules/vehicle-modal.js');
  const form = read('modules/vehicle-form.js');
  const code = noComments(form);
  NEW_FIELDS.forEach((f) => {
    assert.ok(new RegExp("\\{ field: '" + f.field + "', form: \\[").test(code),
      f.field + ' مش في قائمة PROTECTED');
    const formId = 'f-' + f.column.replace('accountno', 'accountno').replace('companyname', 'companyname');
    assert.ok(html.includes('id="' + formId + '"'), 'الحقل ' + formId + ' مش في النموذج');
    assert.ok(modal.includes("'" + formId + "': value("),
      'النموذج مش بيملأ ' + formId);
    assert.ok(new RegExp(f.field + ":\\s*readField\\('" + f.field + "',\\s*'" + formId + "'\\)").test(code),
      'collect مش بيقرا ' + f.field);
  });
});

/* ===== ⭐ رفع Excel: دي طريقة التعبئة الوحيدة ===== */

test('الـExcel بيقرأ العمودين الجديدين من الأسماء الشائعة', () => {
  const code = noComments(read('modules/fleet-excel.js'));
  NEW_FIELDS.forEach((f) => {
    /* ⚠️ لو الحقل مش في FIELD_ALIASES، الملف بيتقرا والعمود
       يتجاهل بصمت — وده أسوأforms خطأ: المستخدم شايف الملف
       اتقبل وبيفتكر إن البيانات اتسجلت. */
    assert.ok(new RegExp(f.field + ':\\s*\\[').test(code),
      f.field + ' مش في FIELD_ALIASES');
    assert.ok(new RegExp(f.field + ":\\s*\\[[^\\]]*'" + f.label + "'").test(code),
      f.field + ' مافيش فيه ترويسة «' + f.label + '»');
  });
});

/* ⭐ الاختبار السلوكي: بينادي findField نفسه على كل alias.

   النسخة الأولى كان بيتحقق إن الاسم مكتوب في الكود، وعدّت.
   بس السلوك كان غلط: «الشركة» رحت لـ brand مش companyName —
   لأن brand بياخدها من زمان وبيتطابق الأول. الكود كان سليم
   والحقل كان بياكل عمود المستخدم كله.

   الفرق: الأول بيفحص النصوص، والتاني بيفحص النتيجة. */

/* تعارضات معروفة من قبل ما أعمل الاختبار ده، سيبتها زي ما هي
   عشان مش في النطاق ده — بس مسجّلة عشان ما تتصبّيش «جديد». */
const KNOWN_ALIAS_SHADOWS = {
  /* رقم الشاسيه في alias لـ serial و لـ chassisNo، و serial أول
     واحد في الكائن فبياخدها. وده صح: الشاسيه بيتخزّن في serial
     (العمود الوحيد الموجود فعلاً — مفيش chassisno في الجدول)،
     وchassisNo حقل مالوش عمود أصلاً فمش بيتخزّن. */
  'رقم الشاسيه': 'serial'
};

test('كل alias بيترجم لنفسه — مفيش تعارض جديد بين الحقول', () => {
  const X = loadFleetExcel();
  const ALIAS = /const FIELD_ALIASES = \{([\s\S]*?)\n  \};/.exec(
    noComments(read('modules/fleet-excel.js')));
  assert.ok(ALIAS, 'مالقتش FIELD_ALIASES');

  const known = [];
  const fresh = [];
  [...ALIAS[1].matchAll(/(\w+):\s*\[([^\]]*)\]/g)].forEach((m) => {
    const field = m[1];
    [...m[2].matchAll(/'([^']+)'/g)].forEach((alias) => {
      const name = alias[1];
      let got;
      try { got = X.findField(name); } catch (_) { got = 'THREW'; }
      if (got === field) return;
      const line = '«' + name + '» ← ' + got + ' (المتوقع ' + field + ')';
      /* ⚠️ لو alias واحد متكرر في أكتر من حقل، اللي بيتطابق
         الأول هو الفائز — فالتعارض مش بيظهر غير لما نجرّب. */
      if (KNOWN_ALIAS_SHADOWS[name] === got) known.push(line);
      else fresh.push(line);
    });
  });

  assert.deepStrictEqual(fresh, [],
    'aliases بتترجم لحقل تاني:\n  ' + fresh.join('\n  ') +
    '\n  (لو التعارض مقصود، ضيفه في KNOWN_ALIAS_SHADOWS فوق عشان يبقى موثّق)');
  /* التوثيق نفسه لازم يبقى صحيح — لو اختفى التعارض نتفسّر */
  Object.keys(KNOWN_ALIAS_SHADOWS).forEach((name) => {
    const still = known.some((k) => k.indexOf('«' + name + '»') === 0);
    assert.ok(still,
      'التعارض الموثّق «' + name + '» اتحل — شيله من KNOWN_ALIAS_SHADOWS');
  });
});

/* «الشركة» كلمة مش بتتطابق مع حاجة واحدة — brand بياخدها من
   زمان. لو رجعت لـ companyName نكسر الماركة. */
test('«الشركة» تفضل للماركة — ماينفعش تتحوّل لاسم الشركة', () => {
  const X = loadFleetExcel();
  assert.strictEqual(X.findField('الشركة'), 'brand', '«الشركة» راحت لحقل تاني');
  assert.strictEqual(X.findField('الماركة'), 'brand');
  /* والاسم الصريح شغّال */
  assert.strictEqual(X.findField('اسم الشركة'), 'companyName');
  assert.strictEqual(X.findField('شركة التأمين'), 'insuranceCompany');
});

test('العمودين الجديدين في IMPORT_FIELDS', () => {
  const code = noComments(read('modules/fleet-excel.js'));
  const m = /const IMPORT_FIELDS = \[([\s\S]*?)\n  \];/.exec(code);
  assert.ok(m, 'مالقتش IMPORT_FIELDS');
  NEW_FIELDS.forEach((f) => {
    assert.ok(m[1].includes("'" + f.field + "'"),
      f.field + ' مش في IMPORT_FIELDS — مش هيتقرا من الملف');
  });
});

test('«الشركة» بتتمايز عن «شركة التأمين»', () => {
  /* الاتنين موجودين في الملف. لو aliases اتلخبطوا، «شركة التأمين»
     هتتكتب في اسم الشركة أو العكس — وده بيبوّظ بيانات حقيقية. */
  const code = noComments(read('modules/fleet-excel.js'));
  const company = /companyName:\s*\[([^\]]*)\]/.exec(code);
  const insurer = /insuranceCompany:\s*\[([^\]]*)\]/.exec(code);
  assert.ok(company, 'مالقتش aliases لـ companyName');
  assert.ok(insurer, 'مالقتش aliases لـ insuranceCompany');
  assert.ok(!company[1].includes('شركة التأمين'),
    '«شركة التأمين» لازم تفضل مع insuranceCompany بس');
  assert.ok(!insurer[1].includes("'الشركة'"),
    '«الشركة» العامة لازم تفضل مع companyName بس');
});

test('ترويسة Excel والقالب والتصدير متوافقين على نفس الترتيب', () => {
  const code = noComments(read('modules/fleet-excel.js'));
  const head = /const EXCEL_HEADERS = \[([^\]]*)\]/.exec(code);
  assert.ok(head, 'مالقتش EXCEL_HEADERS');
  const headers = [...head[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  /* الترويسة بتبدأ بالتسلسلي وبعده الجديدين بالترتيب ده — وده
     نفس ترتيب العرض في التبويبين، فالوردة والجدول بيوافقوا. */
  const at = (label) => headers.indexOf(label);
  ['الرقم التسلسلي', 'رقم الحاسب الآلي', 'اسم الشركة'].forEach((label) => {
    assert.ok(at(label) > -1, 'الترويسة ناقصة «' + label + '»');
  });
  assert.ok(at('رقم الحاسب الآلي') > at('الرقم التسلسلي'), 'ترتيب غلط');
  assert.ok(at('اسم الشركة') > at('رقم الحاسب الآلي'), 'ترتيب غلط');

  /* صف المثال (القالب) لازم يبقى بنفس الطول — قصر واحد = إزاحة
     لكل الأعمدة بعده، والقالب بيبان شغّال بس كل القيم غلط. */
  const ex = /const example = \[([^\]]*)\]/.exec(code);
  assert.ok(ex, 'مالقتش صف المثال');
  const exCount = [...ex[1].matchAll(/'[^']*'/g)].length;
  assert.strictEqual(exCount, headers.length,
    'القالب فيه ' + exCount + ' قيمة والترويسة ' + headers.length +
    ' — كل القيم بعد الناقص هتتزحلق عمود');

  /* وexportFleet لازم يطلع نفس العدد */
  const exp = /context\.fleet\.map\(car => \[([\s\S]*?)\]\);/.exec(code);
  assert.ok(exp, 'مالقتش صفوف التصدير');
  const expCount = [...exp[1].matchAll(/car\.[A-Za-z]+/g)].length;
  assert.strictEqual(expCount, headers.length,
    'التصدير فيه ' + expCount + ' قيمة والترويسة ' + headers.length);
});

/* ===== ⭐ العرض مش الكتابة ===== */

test('الأعمدة خلايا عرض مش inputs — في التبويبين', () => {
  /* القرار النهائي: مفيش كتابة يدوية. أي input هنا معناه رجعنا
     لقرار ملغى، والاختبار ده بيرفض. */
  const ren = noComments(read('modules/renewals-ui.js'));
  const cells = /function renDataCells\(([^)]*)\)\s*\{([\s\S]*?)\n\}/.exec(ren);
  assert.ok(cells, 'مالقتش renDataCells');
  assert.ok(!/<input/.test(cells[2]),
    'خلايا الفحص فيها input تاني — القرار: عرض بس');
  /* ولا باراميتر editable يفضل مستخدم */
  assert.ok(!/editable/.test(cells[1] + cells[2]),
    ' لسه فيه باراميتر editable في خلايا الفحص');
  assert.ok(!/noteEditable/.test(cells[2]),
    'القفل بالصلاحية بقى بلا معنى مع خلايا عرض');

  const rr = noComments(read('core/render-router.js'));
  const pcells = /function payCellsHtml\(([^)]*)\)\s*\{([\s\S]*?)\n\}/.exec(rr);
  assert.ok(pcells, 'مالقتش payCellsHtml');
  assert.ok(!/<input/.test(pcells[2]),
    'خلايا «تحت الدفع» فيها input تاني — القرار: عرض بس');
});

test('مفيش أي input أو تفويض حفظ للأعمدة دي في التبويبين', () => {
  /* غير inputs: مفيش حاجة للحفظ. لو رجع listener فهيكم واجهة
     بتقرا من مكان ما بيحفظش. */
  const ren = noComments(read('modules/renewals-ui.js'));
  assert.ok(!/data-ren-field/.test(ren), 'لسه في data-ren-field');
  assert.ok(!/renDataCells\([^)]*,/.test(ren), 'renDataCells لسه بياخد باراميتر تاني');
  const rr = noComments(read('core/render-router.js'));
  assert.ok(!/data-car-field/.test(rr), 'لسه في data-car-field');
  assert.ok(!/bindPaymentsCellEdit/.test(rr), 'لسه في تفويض حفظ في «تحت الدفع»');
  assert.ok(!/payCellsEditable/.test(rr), 'لسه في فحص صلاحية الكتابة');
  assert.ok(!/<input class="pay-cell"/.test(rr), 'لسه فيه input pay-cell');
});

/* ملاحظات «الفحص» استثنائية — دي خلية أداة موجودة من قبل ونتركها
   قابلة للكتابة زي ما كانت. الاختبار بيمنع إننا نكسرها بالغلط. */
test('خانة الملاحظات في الفحص سليمة (ترجع زي ما كانت)', () => {
  const ren = noComments(read('modules/renewals-ui.js'));
  assert.ok(/data-note-id/.test(ren), 'خانة الملاحظات بقت على معرّف تاني');
  assert.ok(/input\[data-note-id\]/.test(ren), 'التفويض مش بيمسك خانة الملاحظات');
  assert.ok(/ren-note-input/.test(ren), 'خانة الملاحظات مش موجودة');
});

/* ===== الأعمدة بتتمشى مع السيارة ===== */

test('الأعمدة متطابقة في التبويبين — نفس الترتيب ونفس الحقول', () => {
  /* ⚠️ الفخ اللي اتكرر: الأعمدة متنسخة في ملفين. لو اتغير واحد
     واتغير التاني لأ، المستخدم يشوف التسلسلي بس في تاب والرقم
     التسلسلي والحاسب والشركة في التاني — ويظن إن واحد فيهم بيطير. */
  const pick = (src, name) => {
    const m = new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\n\\];').exec(noComments(src));
    assert.ok(m, 'مالقتش ' + name);
    return [...m[1].matchAll(/field:\s*'([^']+)'/g)].map((x) => x[1]);
  };
  const pay = pick(read('core/render-router.js'), 'PAY_CELL_FIELDS');
  const ren = pick(read('modules/renewals-ui.js'), 'REN_DATA_FIELDS');
  /* «الفحص» مفيهاش ملاحظات — دي خانة أداة منفصلة بتتعرض لوحدها.
     فلازم تطلع أول الأعمدة في نفس الترتيب بالظبط. */
  assert.deepStrictEqual(ren, pay.slice(0, ren.length),
    'ترتيب الأعمدة مختلف بين التابيين');
  assert.deepStrictEqual(ren, ['serial', 'accountNo', 'companyName'],
    'الأعمدة المشتركة مش الثلاثة المتوقعة');
});

test('الأعمدة بتتقرا من كائن السيارة لا من الطلب', () => {
  /* عشان تنتقل مع السيارة: القراءة لازم تكون car[...]. لو بقت
     item[...] من الطلب، بتنتهي مع الطلب وبتضيع. */
  [['core/render-router.js', 'PAY_CELL_FIELDS'], ['modules/renewals-ui.js', 'REN_DATA_FIELDS']]
    .forEach(([rel, name]) => {
      const src = noComments(read(rel));
      const start = src.indexOf('const ' + name);
      const body = src.slice(start, start + 2400);
      const reads = [...body.matchAll(/car\[def\.field\]/g)].length;
      assert.ok(reads > 0, rel + ' — القراءة مش من كائن السيارة');
      assert.ok(!/item\[def\.field\]/.test(body),
        rel + ' — بيقرا من الطلب مش من السيارة،.flو الحقول مش هتتمشى معاها');
    });
});

/* ===== التصدير في التبويبين ===== */

test('«تحت الدفع» بيصدّر الأعمدة الأربعة', () => {
  const router = read('core/render-router.js');
  const start = router.indexOf('function renderInspectionPayments');
  assert.ok(start > -1, 'مالقتش renderInspectionPayments');
  const body = router.slice(start, router.indexOf('\nfunction ', start + 10) > -1
    ? router.indexOf('\nfunction ', start + 10) : router.length);
  const m = /_yahmaCurrentPdfData=\(\)=>\(\{([\s\S]*?)\n  \}\);/.exec(body);
  assert.ok(m, 'مالقتش _yahmaCurrentPdfData في «تحت الدفع»');
  const flat = m[1].replace(/\n\s*/g, ' ');
  assert.ok(/headers:[\s\S]{0,80}?PAY_CELL_LABELS/.test(flat), 'الترويسة مش من المصدر الواحد');
  assert.ok(/rows:[\s\S]{0,200}?PAY_CELL_FIELDS\.map\(d=>car\[d\.field\]/.test(flat),
    'قيم الأعمدة مش من المصدر الواحد');
});

test('«الفحص» بيصدّر الأعمدة الثلاثة', () => {
  const code = noComments(read('modules/renewals-ui.js'));
  assert.ok(/headers:\[[\s\S]{0,120}?REN_DATA_LABELS/.test(code),
    'ترويسة تصدير الفحص ناقصة الأعمدة');
  assert.ok(/\.concat\(REN_DATA_FIELDS\.map\(d=>c\[d\.field\]/.test(code),
    'قيم الأعمدة ناقصة من تصدير الفحص');
  /* الرخص والتأمين ما اتغيّرش */
  assert.ok(/تجديد الرخص المفلترة/.test(code), 'تصدير الرخص اتمسح');
  assert.ok(/التأمين المفلتر/.test(code), 'تصدير التأمين اتمسح');
});

test('الـcolspan بيتحسب من الترويسات مش رقم ثابت', () => {
  const code = read('modules/renewals-ui.js');
  assert.ok(/#ren-table thead tr:first-child > th/.test(code), 'مفيش عدّ الترويسات');
  assert.ok(/const colCount=headCells\.length/.test(code), 'الـcolspan مش محسوب');
  assert.ok(!/baseCols\s*=\s*insuranceMode/.test(code), 'لسه في الرقم القديم');
  assert.ok(!/delCol/.test(code), 'لسه في delCol — مفيش عمدة حذف منفصلة');
  /* التلات تبويبات في render-router بتعدّ خلايا الترويسة نفسها.
     expressión زي (7+PAY_CELL_FIELDS.length) كانت مقبولة قبل
     كده، بس هي بتفشل أول ما يتضاف عمود جوّه CORE_PAY_HEADERS
     من غير ما حد يعدّ — والعدّ من الترويسة مش بيتكسر. */
  const rr = read('core/render-router.js');
  assert.ok(!/colspan="[^"]*PAY_CELL_FIELDS\.length/.test(rr),
    'colspan «تحت الدفع» لسه محسوب بتعبير — عرض الترويسة أدق');
  assert.ok(/function fixPaySpans\(content\)/.test(rr), 'مفيش fixPaySpans');
  ['payments', 'paid', 'renewed'].forEach((tab) => {
    assert.ok(rr.includes("bindPaySelection(content,'" + tab + "');\n  fixPaySpans(content);"),
      tab + ' مفيش fixPaySpans بعد الرسم');
  });
});

/* ===== التنسيق: خلية عرض مش input ===== */

test('خلايا العرض متنسّقة (خط، محاذاة، التفاف)', () => {
  const light = read('css/02-components.css');
  const dark = read('css/04-dark-overrides.css');
  assert.ok(/\.pay-cell\s*[,.]/.test(light), 'مفيش تنسيق لـ pay-cell');
  assert.ok(/\.ren-data-cell\{/.test(light), 'مفيش تنسيق لـ ren-data-cell');
  assert.ok(/body\.dark-mode \.pay-cell/.test(dark), 'مفيش نسخة ليلي');
  /* ⚠️ مينفعش يفضل تنسيق input — الخلية مبقتش input */
  assert.ok(!/\.pay-cell\[readonly\]/.test(light),
    'لسه في تنسيق readonly — الخلية مبقتش input');
  assert.ok(!/\.pay-cell:/.test(light), 'لسه في pseudo-class بتاع input');
  assert.ok(!/\.pay-cell\.saving/.test(light), 'لسه في حالة saving بتاع input');
});

/* ===== الحارس على القاعدة ===== */

test('الحارس بيقفل العمودين على «مشاهدة»', () => {
  const body = carGuardBody('supabase/user-edit-access.sql');
  NEW_FIELDS.forEach((f) => {
    assert.ok(body.includes('new.' + f.column + ' is distinct from old.' + f.column),
      'العمود ' + f.column + ' مش محمي');
  });
  /* لسه بيعدّي أي دور غير «مشاهدة» — ده اللي بيخلّي إنشاء
     المستخدمين شغال (service_role مافيش JWT) */
  assert.ok(/v_role is null or v_role <> 'view' then/.test(body),
    'الـearly-out تغيّر — الإضافة هتبوظ تاني');
  assert.ok(!/= 'service_role' then/.test(body),
    'حارس السيارات مش محتاج استثناء service_role');
});

/* الحارس معرّف في ملفين — نفس فخ الـprofiles */
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

test('ملف فيه الأعمدة دي بيتقرا فعلاً — نهاية المسار', () => {
  /* كل الاختبارات فوق بتشوف الكود. ده بيشغّل الكود: صفوف بتدخل
     زي ما بتدخل من ورقة حقيقية، والنتيجة بتتقرا. */
  const X = loadFleetExcel();
  const rows = [
    { 'رقم اللوحة':'ر ن س 6724', 'الرقم التسلسلي':'82433120',
      'رقم الحاسب الآلي':'ACC-1024', 'اسم الشركة':'شركة الأمثل', 'ملاحظات':'فحص 10/2026' },
    { 'رقم اللوحة':'ص ص 1111', 'الرقم التسلسلي':'99988877',
      'الحاسب':'ACC-7', 'شركة التأجير':'شركة النور' },
    { 'اللوحة':'ب ب 2222', 'حساب السيارة':'ACC-B', 'company name':'Company B' }
  ];
  const p = X.parseImportRows(rows, () => 'uid-1');
  assert.strictEqual(p.skipped, 0, 'صفوف اتخطت');
  assert.strictEqual(p.active.length, 3, 'مش كل الصفوف قريت');

  const expect = [
    ['ر ن س 6724', '82433120', 'ACC-1024', 'شركة الأمثل'],
    ['ص ص 1111', '99988877', 'ACC-7', 'شركة النور'],
    ['ب ب 2222', '', 'ACC-B', 'Company B']
  ];
  p.active.forEach((rec, i) => {
    const [plate, serial, acc, co] = expect[i];
    assert.strictEqual(rec.car.plate, plate, 'اللوحة غلط');
    assert.strictEqual(rec.car.serial, serial, 'التسلسلي غلط في ' + plate);
    assert.strictEqual(rec.car.accountNo, acc, 'رقم الحاسب غلط في ' + plate);
    assert.strictEqual(rec.car.companyName, co, 'اسم الشركة غلط في ' + plate);
  });
  /* والقيم لازم تكون معلنة كـ«مقدَّمة» عشان تتدمج مع السيارة
     الموجودة بدل ما تتسجل من أول */
  const first = p.active[0].provided;
  ['serial', 'accountNo', 'companyName', 'notes'].forEach((f) => {
    assert.ok(first.includes(f), f + ' مش معلَن كـprovided — مش هيتدمج');
  });
});

test('الدمج على سيارة موجودة بيكتب القيم الجديدة', () => {
  const X = loadFleetExcel();
  const rows = [{ 'رقم اللوحة':'د د 1', 'رقم الحاسب الآلي':'ACC-M', 'اسم الشركة':'شركة م' }];
  const p = X.parseImportRows(rows, () => 'uid-2');
  const existing = { id:'car-9', plate:'د د 1', serial:'OLD', accountNo:'', companyName:'', notes:'' };
  const m = X.mergeImportRecord(existing, p.active[0]);
  assert.strictEqual(m.changed, true, 'اتقال إنه ما اتغيّرش');
  assert.strictEqual(m.car.accountNo, 'ACC-M');
  assert.strictEqual(m.car.companyName, 'شركة م');
  assert.strictEqual(m.car.serial, 'OLD', 'التسلسلي القديم اتمسح — الملف مافيهوش');
});

test('ترويسة الملف الرسمي بتتعرف', () => {
  /* الورق اللي المستخدم بيعمله من «نموذج-بيانات-الأسطول» لازم
     يتقرا من غير ما يغيّر الترويسة. */
  const X = loadFleetExcel();
  ['الرقم التسلسلي', 'رقم الحاسب الآلي', 'اسم الشركة', 'ملاحظات']
    .forEach((h) => {
      assert.ok(X.EXCEL_HEADERS.includes(h), 'الترويسة ناقصة «' + h + '»');
    });
  ['serial', 'accountNo', 'companyName', 'notes'].forEach((f) => {
    assert.strictEqual(X.findField(f), f, 'الترويسة ' + f + ' مش بتترجم لنفسها');
  });
});

/* ⭐ رسالة التأكيد: كل حقل بيتمرّر لازم يطلع باسمه العربي.

   الحقل الناقص بيظهر للمستخدم باسمه الخام وسط أسماء عربية، فيحس
   إنه شيت تاني مش من الإعدادات دي. أول مرة صلّحت accountNo و
   companyName وبسيت notes — والاختبار الأول كان بيفحص إن
   التسميات عربية، مش إن كل حقل ليه تسمية، فعدّى والغلطة فلت.

   فالتشخيص: أي حقل في UPLOAD_FIELDS (الثلاث قوائم) لازم يكون
   في FIELD_LABELS. */
/* ⭐ زرار «رفع شيت الفحص» نفسه — مش بس الكود اللي وراه.

   الحقول كانت في UPLOAD_FIELDS من أول يوم، والزرار موجود. بس
   `#file-ren-upload` بيتعمل dynamic جوّه الـtemplate — فلو الـid
   اتغيّر في الـtemplate، الـlistener هيتربط على لا حاجة بـ
   optional chaining من غير ما حد ياخد باله، والزر يبقى ميّت بصمت.

   الاختبار بيقرا الـtemplate جوّه الدالة نفسها وبيتأكد إن الـid
   المستخدم في الربط هو نفسه اللي بيتعمل. */
test('زرار «رفع شيت الفحص» مربوط فعلاً — مفيش id غلط', () => {
  const code = noComments(read('modules/renewals-ui.js'));
  const m = /id="file-ren-upload"/.exec(code);
  assert.ok(m, 'مفيش input للملف في الـtemplate — الزرار هيبقى ميّت بصمت');
  /* والربط بيشاور على نفس الـid */
  assert.ok(/\$?\('file-ren-upload'\)\?\.addEventListener\('change'/.test(code),
    'الزرار مربوط بمعرّف مختلف');
  assert.ok(/\$?\('ren-upload-btn'\)\?\.addEventListener\('click'/.test(code),
    'الزرار مالهوش click handler');
  /* والـaccept لازم يسمح بملفات الإكسيل والـCSV زي الباقي */
  assert.ok(/id="file-ren-upload"[^>]*accept="\.xlsx,\.xls,\.csv"/.test(code),
    'input الملف مابيقبلش الإكسيل');
});

test('كل حقل بيتمرّر للرفع ليه تسمية عربية في رسالة التأكيد', () => {
  const imp = noComments(read('core/excel-import.js'));
  const labels = /const FIELD_LABELS = \{([\s\S]*?)\n  \};/.exec(imp);
  assert.ok(labels, 'مالقتش FIELD_LABELS');
  const names = [...labels[1].matchAll(/(\w+):\s*'([^']*)'/g)]
    .reduce((acc, kv) => { acc[kv[1]] = kv[2]; return acc; }, {});

  const ren = noComments(read('modules/renewals-ui.js'));
  const up = /const UPLOAD_FIELDS = \{([\s\S]*?)\n  \};/.exec(ren);
  assert.ok(up, 'مالقتش UPLOAD_FIELDS');

  const missing = [];
  [...up[1].matchAll(/\[([^\]]*)\]/g)].forEach((list) => {
    [...list[1].matchAll(/'([^']+)'/g)].forEach((f) => {
      if (!names[f[1]]) missing.push(f[1]);
    });
  });

  assert.deepStrictEqual(missing, [],
    'حقول بتطلع للمستخدم باسمها الخام في رسالة التأكيد:\n  ' + missing.join('\n  '));

  /* وكل تسمية عربية فعلاً — مش حقل فاضي ولا إنجليزي */
  Object.keys(names).forEach((k) => {
    assert.ok(/[\u0600-\u06FF]/.test(names[k]),
      'تسمية ' + k + ' هي «' + names[k] + '» مش عربي');
  });
});

test('الرسالة بتستخدم الخريطة نفسها — مفيش fallback ناقص', () => {
  /* لو الرسالة غيّرت لـFIELD_LABELS[f]||f فالتراجع بيفتح الباب
     تاني. لازم الخريطة هي المصدر الوحيد. */
  const imp = noComments(read('core/excel-import.js'));
  assert.ok(/fields\.map\(f=>'  • '\+\(FIELD_LABELS\[f\]\|\|f\)\)/.test(imp),
    'رسالة التأكيد مش بتستخدم FIELD_LABELS');
});

test('ملف التحقق على القاعدة آمن — بيعمل rollback', () => {
  const code = noComments(read('supabase/verify-payment-columns.sql'));
  assert.ok(/raise exception/.test(code), 'لازم يرمي استثناء في الآخر = rollback');
  assert.ok(!/\bcommit\b/i.test(code), 'في commit');
  assert.ok(!/\bdelete\b/i.test(code), 'في delete');
  assert.ok(/set role = 'view'/.test(code),
    'مافيش حساب مشاهدة مؤقت — مفيش أصلاً على المنصة، والاختبار بيفحص والا محدش');
});
