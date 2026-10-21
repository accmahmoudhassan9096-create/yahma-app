/* التحديد الجماعي في دورة الفحص/الدفع/التجديد.

   الطلب: في التلات تبويبات أقدر أعلّم على السيارات وآخد قرار
   جماعي — إرجاعها للتبويب اللي قبله أو نقلها للي بعده.

   أهم قرار معماري: الأزرار المفردة كان منطقها جوّه addEventListener
   جوّه كل دالة رسم. لو النسخة الجماعية اتكتبت من الأول، يبقى فيه
   مسارين للحقيقة وأي إصلاح في واحد مش هيوصل للتاني. الاختبارات
   هنا بتقفل ده. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const ROUTER_PARTS = ['core/router-payments.js','core/router-payments-item.js','core/router-payments-bulk.js',
  'core/router-payments-pending.js','core/router-payments-paid.js','core/router-payments-renewed.js'];
const readRouter = () => ROUTER_PARTS.map((rel) => read(rel)).join('\n');
/* بنشيل الكومنتات قبل أي عدّ — غير كده نداءات مذكورة في شرح
   بتتحسب كأنها نداءات حقيقية (ده اللي حصل مع rememberCarState). */
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');
/* ⚠️ كود دورة الفحص/الدفع/التجديد اتنقل من core/render-router.js
   لـcore/router-payments.js وقت تقسيم الملفات الكبيرة. الاختبارات
   دي كلها بتخصّ النطاق ده، فبتقرأ الملفين مع بعض — والـassertions
   بتضل زي ما هي. */
const ROUTER = () => noComments(readRouter())
                 + '\n' + noComments(read('core/render-router.js'));

const TABS = ['payments', 'paid', 'renewed'];
/* الملفات اللي ممكن يتسرّب فيها مسار تاني للمنطق.
   ⚠️ لازم تكون كاملة — ملف ناقص هنا = مسار تاني مالوش
   اختبار، وده عكس الغرض من الثابت أصلاً. */
const SCANNED = [...ROUTER_PARTS, 'core/render-router.js', 'modules/renewals-ui.js',
  'modules/fleet.js', 'modules/fleet-excel.js', 'modules/data.js', 'modules/payments-store.js',
  'modules/follow-up-ui.js'];

/* ⭐ مصدر واحد للمنطق — أهم حماية في الملف.

   كل دالة بتغيّر حالة الطلب (revert / mark) لازم ليها نداء
   واحد بس في كل المشروع. لو اتكررت في معالج الصف وفي النسخة
   الجماعية،بقى فيه مسارين للحقيقة والفرق بينهم هيفضل صامت —
   وده بالظبط اللي حصل قبل كده لما اتنسخ منطق يدوي. */
test('كل دالة بتغيّر حالة الطلب ليها نداء واحد بس في المشروع', () => {
  const ONE_CALLER = [
    'revertPendingToInspection', 'revertPaidToPending', 'revertRenewedToPaid',
    'markPaid', 'markLicenseRenewed'
  ];
  ONE_CALLER.forEach((fn) => {
    const hits = [];
    SCANNED.forEach((f) => {
      const code = noComments(read(f));
      if (!code.length) return;
      [...code.matchAll(new RegExp('\\b' + fn + '\\(', 'g'))].forEach((m) => {
        /* لازم نتفادى التعريف نفسه — ر revertRenewedToPaid معرّفة
           في payments-store.js، ومش نداء. */
        const before = code.slice(Math.max(0, m.index - 24), m.index);
        if (/function\s+$/.test(before)) return;
        hits.push(f + ':' + code.slice(0, m.index).split('\n').length);
      });
    });
    assert.strictEqual(hits.length, 1,
      fn + ' بيتنادى من ' + hits.length + ' مكان: ' + hits.join('، ') +
      ' — يعني فيه مسارين للمنطق هيفترقوا');
  });
});

/* rememberCarState استثناء مقصود: مرتين، وكل مرة بتحفظ حاجة
   مختلفة. لو بقوا نفس الحقل، الكود بينسى يرجّع حالة الفحص أو
   الرخصة — وده اللي «رجوع» بيعتمد عليه. */
test('حفظ الحالة السابقة مرتين بس — وكل مرة لحاجة مختلفة', () => {
  const calls = [...ROUTER().matchAll(/rememberCarState\(([\s\S]{0,160}?)\)\s*[;,]/g)];
  assert.strictEqual(calls.length, 2,
    'rememberCarState بيتنادى ' + calls.length + ' مرة — المفروض اتنين بس');
  assert.ok(calls.some((c) => c[1].includes('inspectionStatus')),
    'مفيش حفظ لحالة الفحص قبل الدفع — «رجوع لِتحت الدفع» هيخسرها');
  assert.ok(calls.some((c) => c[1].includes('licenseExpiry')),
    'مفيش حفظ لتاريخ الرخصة قبل التجديد — «رجوع لِتم الدفع» هيخسرها');
});

test('الأزرار المفردة بتنادي الدوال المستخرجة — مش منطق مكتوب تاني', () => {
  /* لازم ندور على السطر المربوط، مش على اللي في قالب الـHTML:
     أول ظهور للاسم هو في الـtemplate والتاني هو المعالج. */
  const code = ROUTER();
  [
    ['[data-payment-done]', 'paid'],
    ['[data-payment-cancel]', 'cancel'],
    ['[data-renew-license]', 'renew'],
    ['[data-stepback-payment]', 'back'],
    ['[data-stepback-renewed]', 'back2']
  ].forEach(([sel, action]) => {
    const at = code.indexOf("querySelectorAll('" + sel + "')");
    assert.ok(at > -1, 'مالقتش المعالج ' + sel);
    const region = code.slice(at, at + 700);
    assert.ok(region.includes('PAY_ITEM_ACTION.' + action),
      sel + ' مش بينادي PAY_ITEM_ACTION.' + action);
  });
});

test('تجديد الرخصة بتنادى من مكان واحد — المفرد والجماعي نفس الدالة', () => {
  const code = ROUTER();
  const def = code.indexOf('function renewLicenseFromPaid');
  const calls = [...code.matchAll(/\brenewLicenseFromPaid\s*\(/g)]
    .map((m) => m.index)
    .filter((i) => i < def || i > code.indexOf(')', def));
  assert.strictEqual(calls.length, 1,
    'renewLicenseFromPaid بتتنادى من ' + calls.length + ' مكان — المفروض من PAY_ITEM_ACTION.renew بس');
});

/* ====================================== */

test('التلات تبويبات فيهم عمود تحديد وشريط جماعي', () => {
  const code = ROUTER();
  TABS.forEach((tab) => {
    assert.ok(code.includes("bindPaySelection(content,'" + tab + "')"),
      tab + ' مش مربوط بالتحديد');
    assert.ok(code.includes("payCheckHeader('" + tab + "'"),
      tab + ' مافيش عمود تحديد في الترويسة');
    assert.ok(code.includes("payCheckCell('" + tab + "'"),
      tab + ' مافيش خلية تحديد في الصف');
    assert.ok(code.includes("PAY_ROW_INDEX." + tab + "="),
      tab + ' مش بيسجّل خريطة سطوره');
  });
  /* شريط «الفحص» الأصلي لازم يفضل شغال — إحنا Zengled غيره */
  assert.ok(read('modules/renewals-ui.js').includes('ren-bulk-bar'),
    'شريط «الفحص» الأصلي اتمسح — لازم يفضل شغال');
});

test('التحديد بيتشال بين كل رسم — مفيش تحديد معلّق على أسطر مش موجودة', () => {
  const code = ROUTER();
  assert.ok(/const PAY_SELECTIONS = Object\.create\(null\)/.test(code),
    'مفيش مخزن للتحديد');
  TABS.forEach((tab) => {
    const at = code.indexOf('PAY_ROW_INDEX.' + tab + '=');
    assert.ok(at > -1, tab + ' مافيش إعادة بناء للخريطة');
    assert.ok(/Object\.create\(null\)/.test(code.slice(at, at + 300)),
      tab + ' الخريطة بتتراكم بدل ما تتفض');
  });
});

test('كل تبويب ليه إجراء واحد على الأقل — التالي أو الرجوع', () => {
  const block = /const PAY_TAB_ACTIONS = \{([\s\S]*?)\n\};/.exec(ROUTER());
  assert.ok(block, 'مالقتش PAY_TAB_ACTIONS');
  TABS.forEach((tab) => {
    assert.ok(new RegExp('\\n  ' + tab + ':').test(block[1]), tab + ' مافيش إجراءات');
  });
  /* «تم التجديد» آخر الدورة — مفيش «التالي» */
  const renewed = /renewed:\s*\[([^\]]*)\]/.exec(block[1]);
  assert.ok(renewed, 'مالقتش إجراءات تم التجديد');
  assert.ok(!/dir:'next'/.test(renewed[1]),
    '«تم التجديد» آخر الدورة — مفيش تبويب بعده');
  /* والتبويبات التانية لازم يبقى ليهم next */
  ['payments', 'paid'].forEach((tab) => {
    const m = new RegExp(tab + ':\\s*\\[([^\\]]*)\\]').exec(block[1]);
    assert.ok(m && /dir:'next'/.test(m[1]), tab + ' مافيش إجراء نقل للي بعده');
  });
});

test('الترتيب بين prev وnext بيتبع ترتيب الدورة مش النص', () => {
  /* الرجوع لازم يوصّل للتبويب اللي قبله فعلاً. لو الترتيب
     اتغيّر والـlabels ثابتة، المستخدم يضغط «رجوع لِالفحص»
     ولetteroulli السيارة تروح مكان تاني خالص. */
  const code = ROUTER();
  const block = /const PAY_TAB_ACTIONS = \{([\s\S]*?)\n\};/.exec(code);
  const cycle = /const PAY_CYCLE = \[([^\]]*)\]/.exec(code);
  assert.ok(cycle, 'مالقتش PAY_CYCLE');
  const order = cycle[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  /* الأسماء في الـcycle إنجليزية، واللي في الأزرار عربي — المقارنة
     لازم تمر على خريطة التسميات مش على النص مباشرة. */
  const labels = /const PAY_TAB_LABELS = \{([\s\S]*?)\};/.exec(code);
  assert.ok(labels, 'مالقتش PAY_TAB_LABELS');
  const nameOf = (id) => {
    const m = new RegExp(id + ":'([^']*)'").exec(labels[1]);
    return m ? m[1] : null;
  };
  TABS.forEach((tab) => {
    const seg = new RegExp('\\n  ' + tab + ':\\s*\\[([\\s\\S]*?)\\]').exec(block[1]);
    assert.ok(seg, 'مالقتش إجراءات ' + tab);
    const prevs = [...seg[1].matchAll(/dir:'prev', act:'\w+'[^}]*label:'([^']*)'/g)].map((m) => m[1]);
    const prevIdx = order.indexOf(tab) - 1;
    if (prevIdx >= 0) {
      assert.strictEqual(prevs.length, 1, tab + ' لازم يبقى ليه رجوع واحد');
      const expected = nameOf(order[prevIdx]);
      assert.ok(expected && prevs[0].includes(expected),
        'رجوع «' + tab + '» مكتوب «' + prevs[0] + '» بس اللي قبله «' + expected + '»');
    } else {
      assert.strictEqual(prevs.length, 0, tab + ' أول الدورة — مفيش رجوع ليه');
    }
  });
  /* وده بيلتقط خريطة التسميات نفسها لو الترقيم اتزحلق */
  assert.strictEqual(nameOf('renewals'), 'الفحص', 'تسمية «الفحص» اتغيرت');
  assert.strictEqual(nameOf('paid'), 'تم الدفع', 'تسمية «تم الدفع» اتغيرت');
});

test('الإجراءات المقفولة بحد أعلى — الرجوع والإلغاء للمدير', () => {
  const code = ROUTER();
  const block = /const PAY_TAB_ACTIONS = \{([\s\S]*?)\n\};/.exec(code);
  /* اللي بيشيل بيانات أو بيرجّع حالة لازم يكون destructive */
  ['cancel', 'back', 'back2'].forEach((a) => {
    const m = new RegExp("act:'" + a + "'[^}]*kind:'(\\w+)'").exec(block[1]) ||
              new RegExp("kind:'(\\w+)'[^}]*act:'" + a + "'").exec(block[1]);
    assert.ok(m, 'مالقتش الإجراء ' + a);
    assert.strictEqual(m[1], 'destructive',
      a + ' بيمسح بيانات بس نوعه ' + m[1] + ' — لازم يكون مقفول بحد أعلى');
  });
  /* والبوتابة نفسها: canBulk للشريط، canDelete للإجراء المدمر */
  assert.ok(/kind !== 'destructive' \|\| canDeleteHere\(\)/.test(code),
    'الشريط مش بيفصل بين التقديم والإرجاع');
  assert.ok(/function canDeleteHere\(\)/.test(code) && /canDelete/.test(code),
    'مفيش بوابة canDelete للإجراءات المدمرة');
});

test('«مشاهدة» مالها شريط ولا مربعات تحديد', () => {
  const code = ROUTER();
  assert.ok(/YahmaPerms\.canBulk\(\)/.test(code), 'الشريط مش بيستخدم canBulk');
  assert.ok(/function canBulkHere\(\)/.test(code), 'مفيش بوابة canBulk');
  /* ⭐ checkbox بلا شريط = ضغطة على حاجة مبيحصلش حاجة.
     أسوأ من إن مفيش checkbox خالص — المستخدم بيحس إن في خطأ. */
  ['payCheckHeader', 'payCheckCell'].forEach((fn) => {
    const m = new RegExp('function ' + fn + '\\([^)]*\\) \\{([\\s\\S]{0,200}?)\\n  const |function ' + fn + '\\([^)]*\\) \\{([\\s\\S]{0,200}?)\\n  if').exec(code);
    assert.ok(m, 'مالقتش ' + fn);
    const body = m[1] || m[2] || '';
    assert.ok(/if \(!canBulkHere\(\)\) return ''/.test(body),
      fn + ' بترسم مربعات تحديد لـ«مشاهدة» بلا شريط — ضغط بلا نتيجة');
  });
});

/* ====================================== */

/* ⭐ التقرير بعد العملية الجماعية — لازم يعدّ اللي اتخطّى
   والفشل صراحة.

   أول نسخة في شريط «الفحص» كانت بتقول «تم» وسطر من الفشل بس،
   والمستخدم كان بيقرأ «تم» وفيه فشل. نفس المشكلة هنا بالظبط:
   20 سيارة، 18 اتنفذت و2 فشلوا — «تم» في الرسالة دي كذبة. */
test('التقرير الجماعي بيعدّ اتنفذ / اتخطّى / فشل — كلهم بالأرقام', () => {
  const m = /function payBulkReport\(sel, moved, skipped, failed\)\s*\{([\s\S]*?)\n\}/.exec(ROUTER());
  assert.ok(m, 'مالقتش payBulkReport');
  const body = m[1];
  ['moved', 'skipped', 'failed'].forEach((v) => {
    assert.ok(new RegExp('if \\(' + v + '(\\.length)?\\)').test(body),
      v + ' مش بيتعدّ في التقرير — المستخدم مش هيعرف');
  });
  /* الفشل لازم يظهر بلوحاته، مش رقم مجهول */
  assert.ok(body.includes("' فشلت: '"), 'الفشل مش بيظهر بلوحاته');
  /* والعدد المحدد من الأول في النص، عشان اتخطّى وفشل ما يبانوش ناقصين */
  assert.ok(/'من ' \+ sel/.test(body), 'العدد المحدد من الأول مش في التقرير');
  assert.ok(/join\(' · '\)/.test(body), 'الأجزاء بتتجمع بـ« · » عشان تتفرّق');
});

/* ⭐ الأرقام لازم تجمع للمحدد بالظبط. التقرير بيقول للمستخدم
   «من 20 محددة» — فلازم 17 اتنفذت + 1 اتخطّت + 2 فشلت = 20.
   أول نسخة كانت «فشل» بتدخل في «اتنفذت» وجمعها 22. */
test('العدّ بيتفرّق — «فشل» ما بتتحسبش «اتنفذت»', () => {
  const run = /async function runPayBulk\(([\s\S]*?)\n\}/.exec(ROUTER());
  assert.ok(run, 'مالقتش runPayBulk');
  const body = run[1];
  /* التلات حالات لازم تكون if/else if/else صريحين، مش
     «skipped بس واللي بعده اتنفذ». */
  assert.ok(/if \(res === 'done'\) moved\+\+;/.test(body),
    '«done» مش بيتفرّد عن الباقي');
  assert.ok(/else if \(res === 'failed'\) failed\.push/.test(body),
    '«failed» مش بيتفرّد — بيقع في «اتنفذت»');
  assert.ok(/else skipped\+\+;/.test(body), '«skipped» مش بيمسك الحالة الأخيرة');
  /* وممنوع الشكل القديم اللي كان السبب */
  assert.ok(!/if \(res === 'skipped'\) skipped\+\+; else moved\+\+;/.test(body),
    'رجع الشكل القديم: كل حاجة غير skipped بتتحسب اتنفذت');
  /* كل حالة ليها سطر في التقرير */
  const rep = /function payBulkReport\(([\s\S]*?)\n\}/.exec(ROUTER());
  ['moved', 'skipped', 'failed'].forEach((v) => {
    assert.ok(new RegExp('if \\(' + v + '(\\.length)?\\)').test(rep[1]),
      v + ' مش في التقرير');
  });
});

test('«تم» ما بتتقالش لو حاجة فشلت — النص بيفصل حسب النتيجة', () => {
  const m = /function payBulkReport\(sel, moved, skipped, failed\)\s*\{([\s\S]*?)\n\}/.exec(ROUTER());
  assert.ok(m, 'مالقتش payBulkReport');
  /* ممنوع جملة «تم» واحدة تغطي النجاح والفشل — دي الكذبة
     اللي المستخدم بياخد قرار غلط على أساسها. */
  assert.ok(!/'تم'/.test(m[1]),
    'التقرير فيه جملة «تم» واحدة بتغطي النجاح والفشل');
  assert.ok(!/مفيش حاجة اتغيّرت\.'?/.test(m[1].replace(/\s/g, '')) || m[1].includes('parts.length'),
    'لازم يكون فيه حالة «مفيش حاجة اتغيّرت» بدل تقرير فاضي');
});

test('«failed» بيتفرّق عن «skipped» — والاتنين مش نفس الحاجة', () => {
  /* اتخطّى = المستخدم رفض التأكيد. فشل = حفظ السحابة فشل
     والحالة رجعت للقديم. لازم المستخدم يشوف الاتنين، والعدد
     لازم ما يتحسبش مرتين. */
  const run = /async function runPayBulk\(([\s\S]*?)\n\}/.exec(ROUTER());
  assert.ok(run, 'مالقتش runPayBulk');
  assert.ok(/failed\.push\(plate\)/.test(run[1]), 'الفشل مش بيتسجل بلوحة السيارة');
  /* كل نداء failed.push لازم ياخد نفس المتغير — لو اتنين
     مختلفين، الاستثناء هيسجل لوحة من غير فشل. */
  const pushes = [...run[1].matchAll(/failed\.push\((\w+)\)/g)].map((m) => m[1]);
  assert.ok(pushes.length >= 2, 'في نداء failed واحد بس — الاستثناء بيمرّ من غير تسجيل');
  assert.ok(pushes.every((v) => v === pushes[0]),
    'failed.push بيتنادى بمتغيرين مختلفين: ' + pushes.join('، '));
});

test('العملية الجماعية بترجع قيمة كل دالة — عشان العدّ يبقى صح', () => {
  const block = /const PAY_ITEM_ACTION = \{([\s\S]*?)\n\};/.exec(ROUTER());
  assert.ok(block, 'مالقتش PAY_ITEM_ACTION');
  ['cancel', 'paid', 'back', 'back2'].forEach((a) => {
    const at = block[1].indexOf('async ' + a + '(');
    assert.ok(at > -1, 'مالقتش الإجراء ' + a);
    const region = block[1].slice(at, at + 2800);
    ['return \'done\'', 'return \'skipped\'', 'return \'failed\''].forEach((r) => {
      assert.ok(region.includes(r), a + ' مش بيرجع ' + r);
    });
  });
  /* التفرّق بين التلات حالات ليه اختبار مستقل («العدّ بيتفرّق»)
     فوق — هنا بنتأكد بس إن القارئ بيقرا القيم صح. */
  const run = /async function runPayBulk\(([\s\S]*?)\n\}/.exec(ROUTER());
  assert.ok(/res === 'done'/.test(run[1]) && /moved\+\+/.test(run[1]) && /skipped\+\+/.test(run[1]),
    'runPayBulk مش بيقرا القيمة الراجعة');
});

/* ====================================== */

test('الـprompt مش بيظهر في النسخة الجماعية — 20 نافذة مش عملية', () => {
  const code = ROUTER();
  /* تجديد الرخصة المفرد فيه prompt للتاريخ. لو النسخة الجماعية
     نادته بنفس الشكل، المستخدم هيقابل نافذة input لكل سيارة. */
  const renewFn = /async renew\(item, car, quiet\) \{([\s\S]*?)\n  \},/.exec(code);
  assert.ok(renewFn, 'مالقتش الإجراء renew');
  assert.ok(/silentDate/.test(renewFn[1]),
    'renew مش بيستخدم silentDate — هيفتح prompt لكل سيارة');
  /* والمنطق نفسه بيخلي الـprompt اختياري */
  assert.ok(/async function renewLicenseFromPaid\(item, car, content, opts\)/.test(code),
    'renewLicenseFromPaid مش بياخد opts');
  assert.ok(/if\s*\(opts\.silentDate\)/.test(code),
    'silentDate مش بيخلي الـprompt اختياري');
  /* والنسخة الجماعية بتبلّغ عن التاريخ المقترح — مستخبيُه
     معناه إننا بنكتب على 20 رخصة تاريخ ما طلبهوش. */
  const run = /async function runPayBulk\(([\s\S]*?)\n\}/.exec(code);
  assert.ok(/paySuggestedLicenseDate\(\)/.test(run[1]),
    'النسخة الجماعية مش بتبلّغ عن التاريخ المقترح');
  /* والتاريخ المقترح له مصدر واحد — المفرد والجماعي */
  assert.strictEqual(
    (code.match(/getFullYear\(\) \+ 3\)/g) || []).length, 1,
    'التاريخ المقترح بيتحسب في أكتر من مكان — ممكن يختلفوا عن بعض');
  assert.ok(/const suggested=paySuggestedLicenseDate\(\);/.test(code),
    'renewLicenseFromPaid مش بياخد التاريخ المقترح من المصدر الواحد');
});

test('النسخة الجماعية بترسم مرة واحدة — مش لكل سيارة', () => {
  const code = ROUTER();
  const run = /async function runPayBulk\(([\s\S]*?)\n\}/.exec(code);
  assert.ok(run, 'مالقتش runPayBulk');
  assert.ok(/PAY_ITEM_ACTION\[action\]\(row\.item,\s*row\.car,\s*true\)/.test(run[1]),
    'النسخة الجماعية مش بتمرر quiet=true');
  /* والرسم مرة واحدة بس، في الآخر بعد كل السيارات */
  assert.ok((run[1].match(/\brender\(\);/g) || []).length === 1,
    'في أكتر من render في النسخة الجماعية');
});

test('مفيش Promise.all على العمليات — ترتيب مقصود وفشل واحدة ما يوقفش الباقي', () => {
  const run = /async function runPayBulk\(([\s\S]*?)\n\}/.exec(ROUTER());
  assert.ok(run, 'مالقتش runPayBulk');
  assert.ok(!/Promise\.all/.test(run[1]),
    'Promise.all على عمليات بتكتب — لو واحدة فشلت الباقي هيتلخبط');
  assert.ok(/for\s*\(/.test(run[1]), 'الحلقة لازم تكون for عشان الترتيب');
  /* وكل عملية محاطة بـcatch عشان واحدة ما توقفش الباقي */
  assert.ok(/catch\s*\(e\)/.test(run[1]), 'مفيش catch جوّه الحلقة');
  assert.ok(/yahmaErr/.test(run[1]), 'الخطأ مش بيتبعت للحافلة المحلية');
});

/* ⭐ لازم التوقيع (tab, action) بس.

   أول نسخة كانت (tab, action, items) — والزراير بتتنادى
   بمعاملين، فـitems كان undefined والضربة بتعمل TypeError على
   items.length. النتيجة: الشريط الجماعي كله ميّتشتغلش، صامت،
   من غير رسالة للمستخدم، ومن غير أي اختبار بيقع.
   الاختبار ده بيمنع الرجوع للتوقيع الغلط. */
test('توقيع runPayBulk معاملين بس — وكل نداء بتبعه', () => {
  const code = ROUTER();
  assert.ok(/async function runPayBulk\(tab, action\) \{/.test(code),
    'runPayBulk ليها معامل تالت — الزراير مش بتعرف تبعتوه');
  /* والتحديد بيتقرا جواها، مش بيتبعت من برّه */
  const run = /async function runPayBulk\(tab, action\) \{([\s\S]*?)\n\}/.exec(code);
  assert.ok(run, 'مالقتش runPayBulk');
  assert.ok(/const items = selectedPayRows\(tab\);/.test(run[1]),
    'التحديد مش بيتقرا جوّه runPayBulk');
  /* وبيتقرا قبل أول استخدام — مش بعده */
  const readAt = run[1].indexOf('selectedPayRows(tab)');
  const useAt = run[1].indexOf('items.length');
  assert.ok(readAt > -1 && useAt > readAt,
    'items بيتUsed قبل ما يتقرا من الخريطة');
  /* وكل نداء في المشروع بيمرّر معاملين بالظبط */
  [...code.matchAll(/runPayBulk\(([^)]*)\)/g)].forEach((m) => {
    const args = m[1].split(',').filter((s) => s.trim().length);
    assert.strictEqual(args.length, 2,
      'نداء runPayBulk بـ' + args.length + ' معاملات: ' + m[1].trim());
  });
});

test('النسخة الجماعية بنافذة تأكيد واحدة — مش واحدة لكل سيارة', () => {
  /* نافذة الجماعية سألت «متابعة؟» وذكرت كل اللوحات، فسؤال
     تاني لكل سيارة = 40 نافذة على 20 سيارة. آخر تحقق حيّ
     أظهر 3 نوافذ على 2 سيارة. */
  const code = ROUTER();
  assert.ok(/function payConfirm\(quiet, message\)/.test(code), 'مفيش payConfirm');
  const helper = /function payConfirm\(quiet, message\) \{([\s\S]*?)\n\}/.exec(code);
  assert.ok(/if \(quiet\) return true;/.test(helper[1]),
    'payConfirm مش بتكتم في الوضع الجماعي');
  /* وكل الإجراءات بتستخدم payConfirm مش confirm مباشرة */
  const block = /const PAY_ITEM_ACTION = \{([\s\S]*?)\n\};/.exec(code);
  const confirms = [...block[1].matchAll(/(payConfirm|confirm)\(/g)].map((m) => m[1]);
  assert.ok(confirms.length > 0, 'مفيش تأكيدات في الإجراءات');
  assert.ok(!confirms.includes('confirm'),
    ' فيه confirm() مباشرة جوّه الإجراء — هيفتح نافذة لكل سيارة');
});

/* ⚠️ كتم نافذة كل سيارة معناه إن تفاصيل الرجوع لازم تطلع في
   نافذة الجماعية. لو التفاصيل ضاعت، المستخدم هيضغط عملية بتغيّر
   بيانات من غير ما يعرف إيه اللي راجع. */
test('تفاصيل الإجراء المدمر بتظهر في رسالة التأكيد الجماعية', () => {
  const code = ROUTER();
  const run = /async function runPayBulk\(tab, action\) \{([\s\S]*?)\n\}/.exec(code);
  assert.ok(run, 'مالقتش runPayBulk');
  const msg = /const meta = ([^;]*);/.exec(run[1]);
  assert.ok(msg, 'مفيش رسالة تفاصيل في التأكيد الجماعي');
  ['cancel', 'back', 'back2'].forEach((act) => {
    assert.ok(msg[1].includes("action === '" + act + "'"),
      'الإجراء «' + act + '» مالهوش تفاصيل في رسالة التأكيد الجماعية');
  });
  /* والتجديد بيقول التاريخ المقترح */
  assert.ok(msg[1].includes("action === 'renew'") && msg[1].includes('paySuggestedLicenseDate()'),
    'التجديد مش بيقول التاريخ المقترح');
  /* والرسالة بتذكر كل اللوحات — هي اللي بدلت نوافذ كل سيارة */
  assert.ok(/plates\.join\('، '\)/.test(run[1]), 'اللوحات مش مذكورة في التأكيد الجماعي');
});

test('التحديد بيتبني من خريطة الصفوف مش من الـDOM', () => {
  /* لو احنا بنقرأ الـcheckboxes من الـDOM، التحديد هينكسر مع
     أي رسم يعيد بناء tbody — والمستخدم هيشوف شريط فاضي بعد
     ما يحدّد. */
  const code = ROUTER();
  const sel = /function selectedPayRows\(tab\)\s*\{([\s\S]*?)\n\}/.exec(code);
  assert.ok(sel, 'مالقتش selectedPayRows');
  assert.ok(/currentPayRowFor/.test(sel[1]), 'التحديد مش بيقرأ من خريطة الصفوف');
  assert.ok(/PAY_ROW_INDEX/.test(code), 'مفيش خريطة صفوف');
  TABS.forEach((tab) => {
    assert.ok(code.includes('PAY_ROW_INDEX.' + tab + '='), tab + ' مش بيبني خريطته');
  });
});

test('سطر «لا توجد نتائج» بيتحسب من الترويسة — مفيش رقم ثابت', () => {
  /* رقم ثابت هيتكسر أول ما نضيف عمود، والحاجة بتطلع سطر قصير
     في نص الجدول. نفس الفكرة اللي اتعملت في «الفحص». */
  const code = ROUTER();
  TABS.forEach((tab) => {
    assert.ok(code.includes('bindPaySelection(content,\'' + tab + '\');\n  fixPaySpans(content);'),
      tab + ' مفيش fixPaySpans بعد الرسم');
  });
  assert.ok(/function fixPaySpans\(content\)/.test(code), 'مفيش fixPaySpans');
  assert.ok(/thead tr/.test(code) && /\.cells\.length/.test(code),
    'fixPaySpans مش بتعدّ أعمدة الترويسة');
  assert.ok(/empty-span/.test(code), 'سطر الفراغ مش متوسم');
  /* ومفيش colspan ثابت في التلات تبويبات */
  ['لا توجد طلبات تحت الدفع', 'لا توجد طلبات مدفوعة بعد', 'لم يتم تسجيل أي تجديد بعد']
    .forEach((txt) => {
      const at = code.indexOf(txt);
      assert.ok(at > -1, 'مالقتش السطر ' + txt);
      const line = code.slice(code.lastIndexOf('\n', at), at);
      assert.ok(!/colspan="\d+"/.test(line),
        'السطر «' + txt + '» فيه colspan ثابت — بيتكسر مع أي عمود جديد');
    });
});

test('التنسيق موجود — الشريط بياخد تركيب شريط «الفحص» بالظبط', () => {
  const code = ROUTER();
  /* bulk-bar معرّف في 04-dark-overrides.css، و bulk-bar-actions
     هي اللي بتلوّن الأزرار أبيض على التدرّج الغامق. لو الأزرار
     برّه الـwrapper: نص غامق على غامق — الشStrip يبان موجود
     والزراير مقروءة لأحد. */
  const css = read('css/04-dark-overrides.css') + read('css/02-components.css');
  ['.bulk-bar{', '.bulk-bar-actions{'].forEach((sel) => {
    assert.ok(css.includes(sel), sel + ' مش معرّف في CSS');
  });
  assert.ok(/class="bulk-bar"/.test(code), 'الشريط مش بيستخدم صنف bulk-bar');
  const bar = /function payBulkBarFor\(tab\) \{([\s\S]*?)\n\}/.exec(code);
  assert.ok(bar, 'مالقتش payBulkBarFor');
  assert.ok(bar[1].includes('bulk-bar-info') && bar[1].includes('bulk-bar-actions'),
    'الشريط ناقص الـwrappers — الأزرار هتبان غامقة على تدرّج غامق');
  /* والشريط مخفي لحد ما يبقى فيه تحديد */
  assert.ok(/id="pay-bulk-bar-' \+ tab \+ '" style="display:none"/.test(code),
    'الشريط ظاهر من أول رسم — المفروض يظهر مع أول تحديد');
  /* وعمود التحديد بينATUSم */
  assert.ok(css.includes('.th-check') && css.includes('.td-check'),
    'عمود التحديد غير معرّف في CSS');
});