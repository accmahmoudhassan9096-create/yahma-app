/* اختبارات حُرّاس الأعمدة.

   🚨 الرجوع ده كان حقيقي و mocيّلحصل مع كل حساب جديد:

   الحارس yahma_guard_profile_columns بيحمي الدور والفرع والأقسام
   من أي حد مش مدير:

       select yahma_is_admin() into v_admin;
       if v_admin then return new; end if;
       if new.role is distinct from old.role then
         raise exception 'الدور يعدّله مدير النظام فقط' using errcode = '42501';

   ودالة admin-create-user بتعدّل الأعمدة دي بالظبط — وهي
   بتشتغل بمفتاح service_role. مفتاح service_role مافيش JWT user
   معاه، فـ auth.uid() = NULL وyaهنا_is_admin() = false، والحارس
   بيعتبر الطلب ده من غير مدير وبيمنعه.

   النتيجة: «Database error saving new user» والدالة بتراجع أي
   حساب جديد وترجّع «تعذر حفظ بيانات المستخدم». أربع حسابات
   اشتغلت قبل ما الحارس ده يتعمل، وبعده الإضافة بقت ميتة.

   التحقق من الإصلاح متعمل على القاعدة نفسها في
   supabase/verify-trigger.sql — بيقلب الحارس لنسخة معطوبة
   ويتأكد إن service_role بيتمنع، ويرجّع النسخة المصلَحة
   ويتأكد إنه يعدّي. الاختبارات هنا بتقفل الشكل في الملفات
   عشان م preferentialibreجعش. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SQL_DIR = path.join(ROOT, 'supabase');

function read(rel) {
  return fs.readFileSync(path.join(SQL_DIR, rel), 'utf8');
}

/* جسم دالة معيّنة بس — بلا أي تعليق.

   ⚠️ لازم نختار الدالة بالاسم: الملف الواحد فيه كذا `$fn$`،
   وأول واحد في الملف مش بالضرورة اللي عايزينه. أول نسخة من
   الاختبار كانت بتاخد أول `$fn$` في user-edit-access.sql — وده
   yahma_manage_branch، مش الحارس — فالفحص كان بيمرّ على كود
   تاني خالص.

   التعليقات كمان لازم تُشال: كلمة «service_role» جوّه شرح بتعدّي
   على الفحص. وبعد التنضيف ده النسختين لازم يتطابقوا — أي فرق
   حقيقي بيفضل ظاهر. */
function body(src, fnName) {
  const head = src.search(
    new RegExp('create\\s+or\\s+replace\\s+function\\s+[\\w.]*' + fnName + '\\b', 'i')
  );
  assert.ok(head > -1, 'مالقتش تعريف ' + fnName);
  const tail = src.slice(head);
  const m = /as \$fn\$([\s\S]*?)\$fn\$/.exec(tail);
  assert.ok(m, fnName + ' مافيش جسم دالة بالدولار-فن');
  return m[1]
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* أي حارس بيرمي 42501 = بيحمي عمود وبيمنع غير المدير.

   ⚠️ الحارسين مش زي بعض:
   guard_profile_columns بيمنع أي حد مش مدير → محتاج استثناء
   service_role، لأن الدالة بتعدّل role وbranch_name وtabs.
   guard_car_columns بيعمل العكس: بيعدّي أي دور مش «مشاهدة»
   → service_role بيعدّي منه عادي بالـearly-out، من غير استثناء.
   فالقواعد دي لـ guard_profile_columns بس، وحارس السيارات ليه
   اختبار مستقل تحت. */
const GUARDS = {
  'yahma_guard_profile_columns': 'my-account.sql'
};

Object.keys(GUARDS).forEach((fn) => {
  const file = GUARDS[fn];
  test(fn + ' — بيستثني service_role', () => {
    const src = read(file);
    const b = body(src, fn);
    /* الاستثناء لازم يبقى بمقارنة صريحة، مش مجرد mention */
    assert.ok(
      /=\s*'service_role'\s*then/.test(b),
      fn + ' مافيش استثناء service_role في ' + file +
      ' — أي تعديل من دالة الحافة هيتمنع بـ42501'
    );
    /* ومكانه لازم يكون قبل أي raise، وإلا بيفوت لحد بعده */
    const exemptAt = b.search(/=\s*'service_role'\s*then/);
    const firstRaise = b.indexOf('raise exception');
    assert.ok(exemptAt > -1, 'مفيش استثناء أصلاً');
    assert.ok(firstRaise === -1 || exemptAt < firstRaise,
      fn + ' — الاستثناء بعد أول raise، فمش بيغطي الأعمدة اللي قبله');
  });

  test(fn + ' — لسه بيحمي من غير المدير', () => {
    const src = read(file);
    const b = body(src, fn);
    assert.ok(/raise exception/.test(b), fn + ' بقى بيرمي حاجة');
    assert.ok(/42501/.test(b), fn + ' بيدي خطأ 42501 (صلاحية مرفوضة)');
    /* الاستثناء لازم يكون بحساب الدور نفسه مشGuest */
    assert.ok(/auth\.role\(\)|current_user/.test(b),
      fn + ' — مافيش قراءة لدور الطلب (auth.role أو current_user)');
  });
});

/* ⚠️ ترتيب مهم: الاستثناء يبقى أول حاجة في الدالة.
   لو حد حطّه في النص، الأعمدة اللي فوقه بتفضل محمية حتى من
   service_role — وده عكس المقصود. */
test('الاستثناء أول حاجة في الحارس — مش في النص', () => {
  ['my-account.sql'].forEach((file) => {
    const b = body(read(file), 'yahma_guard_profile_columns');
    const code = b.replace(/begin/i, '').trim();
    const exemptAt = code.search(/=\s*'service_role'\s*then/);
    /* أول executable statement لازم يبقى قراءة الدور */
    assert.match(code.slice(0, exemptAt + 40), /v_role\s*:=\s*coalesce/,
      file + ' — فيه كود قبل قراءة الدور، فمش كل الأعمدة مستثناة');
  });
});

/* حارس السيارات له early-out معاكس — لازم يفضل كده.
   هو بيتخطّى أي دور مش «مشاهدة»، فservice_role بيعدّي منه
   عادي. لو حد قلبه لشرط زائد، هنخسر الحماية أو نكسبها بالغلط. */
test('yahma_guard_car_columns — الـearly-out بتاعه صحيح ومش اتغيّر', () => {
  const b = body(read('user-edit-access.sql'), 'yahma_guard_car_columns');
  assert.ok(/if\s+v_role\s+is\s+null\s+or\s+v_role\s*<>\s*'view'\s+then/.test(b),
    'حارس السيارات لازم يخطّي أي دور مش «مشاهدة» — وعنده service_role لأن auth.uid() بيرجع NULL');
  assert.ok(!/=\s*'service_role'\s*then/.test(b),
    'حارس السيارات مش محتاج استثناء — الـearly-out بيغطيه');
});

/* ملف الإصلاح لازم يكون idempotent — يتطبق على أي بيئة */
test('ملف الإصلاح قابل للتطبيق لوحده وم Segura مرتين', () => {
  const src = read('service-role-trigger-fix.sql');
  assert.ok(/create or replace function public\.yahma_guard_profile_columns/.test(src),
    'مش بيعمل create or replace');
  assert.ok(/drop trigger if exists yahma_guard_profile_columns/.test(src),
    'مش بيعمل drop trigger if exists');
  assert.ok(/create trigger yahma_guard_profile_columns/.test(src),
    'مش بيعيد إنشاء التريجر');
});

/* الملفين لازم يبقوا متطابقين — غير كده بيترجع حسب أي ملف
   اتطبق آخر، وده بالظبط اللي حصل. */
test('my-account.sql وservice-role-trigger-fix.sql متطابقين', () => {
  const name = 'yahma_guard_profile_columns';
  const a = body(read('my-account.sql'), name);
  const b = body(read('service-role-trigger-fix.sql'), name);
  const normalise = (s) => s;
  assert.strictEqual(normalise(a), normalise(b),
    'النسختين مختلفين — أي ملف اتطبق آخر بيكسب، والرجوع بيرجع');
});

/* الربط: الدالة بتعدّل أعمدة محمية، فالإلزام لازم يبقى موجود.
   لو الدالة بطّلت تعدّل role بعد يوم، الاختبار ده يفضل شغّال
   بس مفيش حد يسيب الإلزام. */
test('الدالة بتعدّل أعمدة محمية — فالإلزام مطلوب', () => {
  const fn = fs.readFileSync(
    path.join(SQL_DIR, 'functions', 'admin-create-user', 'index.ts'), 'utf8');
  const m = /\.from\('profiles'\)\s*\.upsert\(\{([\s\S]*?)\}\)/.exec(fn);
  assert.ok(m, 'مالقتش الـupsert في profiles');
  ['role', 'branch_name', 'allowed_tabs'].forEach((col) => {
    /* UPC والـupsert بيستخدم اختصار للخصائص (role, مش role:)،
       فنفحص Colon أو Comma — مش Colon بس. */
    assert.ok(new RegExp('\\b' + col + '\\s*[:,]').test(m[1]),
      'الدالة مبقتش بتعدّل ' + col + ' — غيّر قائمة الأعمدة المحمية في الاختبارات');
  });
});

/* التحقق على القاعدة نفسها — الملف موجود وبيعمل rollback */
test('ملف التحقق موجود وبيعمل rollback (مش بيسيب بيانات)', () => {
  const src = read('verify-trigger.sql');
  assert.ok(/raise exception/.test(src), 'لازم يرمي استثناء في الآخر عشان يعمل rollback');
  assert.ok(/service_role/.test(src) && /authenticated/.test(src),
    'لازم يختبر المسارين');
  /* ⚠️ لازم نشيل التعليقات قبل الفحص: أول نسخة من الاختبار ده
     matchت على كلمة «commit» اللي أنا كاتبها في شرح الملف
     نفسه («مافيش commit ولا delete»). الفحص على شرح مش على كود. */
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '');
  assert.ok(!/\bcommit\b/i.test(code), 'في commit — الملف ده يسبّب تغيير دائم');
  assert.ok(!/\bdelete\b/i.test(code), 'في delete');
});
