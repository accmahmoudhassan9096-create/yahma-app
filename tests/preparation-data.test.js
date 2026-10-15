/* اختبارات منطق التجهيز (preparation-data).

   الدوال دي بتولّد مهام التجهيز من فحوصات الجاهزية، وبتحدّد حالة
   السيارة في التجهيز، وبتتعامل مع الحفظ والاعتماد.

   saveInlineStatus و approveCar بياخدوا context من برّه — ده بالظبط
   التصميم الصح: منطق نقي ومنفصل عن أي حاجة بتلمس الشبكة أو الـDOM.
   الاختبارات بتنفّذهم بـcontext وهمي ونتحقق إنهم طلبوا الصح. */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { prep, vehicleReadiness, readyCar, iso } = require('./harness');

/* context وهمي: بنسجّل اللي اتنادى بدل ما نعمل عملية حقيقية. */
function fakeContext(fleet, options) {
  const opts = options || {};
  const calls = { saved: [], events: [], rendered: 0, notified: [] };
  return {
    calls,
    fleet,
    vehicleReadiness,
    recordEvent(car, kind, label, detail) {
      calls.events.push({ carId: car.id, kind, label, detail });
    },
    async saveData(ids) {
      calls.saved.push(ids);
      return opts.saveFails ? false : true;
    },
    render() { calls.rendered++; },
    supabaseReady: opts.supabaseReady !== false,
    notifyYahmaEvent: opts.notify
      ? async function (type, payload) { calls.notified.push({ type, payload }); return { ok: true }; }
      : undefined
  };
}

/* ===== checklistForCar ===== */

test('checklistForCar بينقل فحوصات الجاهزية زي ما هي', () => {
  const car = readyCar({ id: 'c1' });
  const list = prep.checklistForCar(car, vehicleReadiness);
  assert.strictEqual(list.checks.length, 6);
  assert.ok(list.checks.every((c) => c.source === 'auto'));
  assert.strictEqual(list.final, false);
});

test('checklistForCar بيحترم المراجعة النهائية المحفوظة', () => {
  const car = readyCar({ id: 'c1', prepChecklist: { finalReview: true, finalNote: 'تمام' } });
  const list = prep.checklistForCar(car, vehicleReadiness);
  assert.strictEqual(list.final, true);
  assert.strictEqual(list.finalNote, 'تمام');
});

/* ===== statusForCar ===== */

test('جاهزة + مراجعة نهائية = جاهزة للتأجير', () => {
  const car = readyCar({ id: 'c1', prepChecklist: { finalReview: true } });
  const s = prep.statusForCar(car, vehicleReadiness);
  assert.strictEqual(s.level, 'green');
  assert.strictEqual(s.label, 'جاهزة للتأجير');
});

test('في مهمة مفتوحة = تحت التجهيز', () => {
  /* statusForCar بيفحص «الأوراق سليمة + مراجعة نهائية» الأول، وبعدين
     المهام المفتوحة. فلو المراجعة اتسجّلت، المهمة المفتوحة مش بتوقف
     الجاهزية. وده مقصود: approveCar نفسه مش بيسجّل مراجعة نهائية إلا
     لو مفيش مهام مفتوحة — فالحالة دي عمليًا مستحيلة.
     الاختبار بيبني الحالة الواقعية: مهمة مفتوحة من غير مراجعة. */
  const car = readyCar({ id: 'c1', prepTasks: [{ id: 't1', status: 'open' }] });
  const s = prep.statusForCar(car, vehicleReadiness);
  assert.strictEqual(s.level, 'amber');
  assert.strictEqual(s.label, 'تحت التجهيز');
});

test('المراجعة النهائية بتتقدم على المهام المفتوحة', () => {
  /* توثيق للسلوك: الأولوية للمراجعة النهائية. */
  const car = readyCar({
    id: 'c1',
    prepChecklist: { finalReview: true },
    prepTasks: [{ id: 't1', status: 'open' }]
  });
  const s = prep.statusForCar(car, vehicleReadiness);
  assert.strictEqual(s.level, 'green');
  assert.strictEqual(s.label, 'جاهزة للتأجير');
});

test('الوثائق ناقصة بدون مهام = تحتاج إجراء', () => {
  const car = readyCar({ id: 'c1', insuranceStatus: 'منتهية' });
  const s = prep.statusForCar(car, vehicleReadiness);
  assert.strictEqual(s.level, 'red');
});

test('سليمة بس بدون مراجعة نهائية = مراجعة نهائية', () => {
  const s = prep.statusForCar(readyCar({ id: 'c1' }), vehicleReadiness);
  assert.strictEqual(s.level, 'blue');
  assert.strictEqual(s.label, 'مراجعة نهائية');
});

/* ===== getTasks ===== */

test('getTasks بتولّد مهمة لكل فحص فاشل', () => {
  const car = readyCar({ id: 'c1', plate: 'ص 1', insuranceStatus: 'منتهية' });
  const tasks = prep.getTasks([car], vehicleReadiness);
  const auto = tasks.filter((t) => t.auto);
  assert.strictEqual(auto.length, 1);
  assert.strictEqual(auto[0].type, 'insurance');
  assert.strictEqual(auto[0].status, 'open');
  assert.strictEqual(auto[0].plate, 'ص 1');
  assert.ok(auto[0].id.startsWith('auto-c1-'));
});

test('getTasks بتحافظ على حالة المهمة الموجودة بدل ما تكررها', () => {
  const car = readyCar({ id: 'c1', insuranceStatus: 'منتهية' });
  car.prepTasks = [{ sourceId: 'auto-c1-insurance', status: 'done', title: 'تأمين' }];
  const tasks = prep.getTasks([car], vehicleReadiness);
  const auto = tasks.filter((t) => t.auto);
  assert.strictEqual(auto.length, 1, 'مهمة واحدة بس، مش اتنين');
  assert.strictEqual(auto[0].status, 'done');
});

test('getTasks بتدمج المهام اليدوية', () => {
  const car = readyCar({ id: 'c1' });
  car.prepTasks = [{ id: 'manual-1', title: 'تنظيف داخلي', status: 'open' }];
  const tasks = prep.getTasks([car], vehicleReadiness);
  const manual = tasks.filter((t) => t.id === 'manual-1');
  assert.strictEqual(manual.length, 1);
  assert.strictEqual(manual[0].title, 'تنظيف داخلي');
});

test('getTasks على أسطول فاضي', () => {
  /* ملاحظة: deepStrictEqual مش هينفع هنا — المصفوفات المتكوّنة
     جوه الـvm ليها prototype مختلف، فـdeepStrictEqual بيفشل حتى لو
     المحتوى متطابق. بنقارن الطول. */
  assert.strictEqual(prep.getTasks([], vehicleReadiness).length, 0);
});

/* ===== saveTask ===== */

test('saveTask بتضيف مهمة جديدة', () => {
  const car = readyCar({ id: 'c1' });
  /* saveTask بتدوّر بـtask.carId — من غيره مش بتلاقي السيارة. */
  prep.saveTask([car], { id: 'm1', carId: 'c1', title: 'غسيل', status: 'open' });
  assert.strictEqual(car.prepTasks.length, 1);
  assert.strictEqual(car.prepTasks[0].title, 'غسيل');
});

test('saveTask بتحدّث مهمة موجودة بمفتاح sourceId', () => {
  const car = readyCar({ id: 'c1', prepTasks: [{ sourceId: 'auto-c1-insurance', status: 'open' }] });
  prep.saveTask([car], { id: 'x', carId: 'c1', sourceId: 'auto-c1-insurance', status: 'done' });
  assert.strictEqual(car.prepTasks.length, 1, 'لازم تتحدّث مش تتضاف');
  assert.strictEqual(car.prepTasks[0].status, 'done');
});

test('saveTask على سيارة مش موجودة: صامت', () => {
  const fleet = [readyCar({ id: 'c1' })];
  prep.saveTask(fleet, { id: 'm1', carId: 'nope' });
  assert.strictEqual(fleet[0].prepTasks, undefined);
});

/* ===== statusLabel / dueState ===== */

test('statusLabel', () => {
  assert.strictEqual(prep.statusLabel('done'), 'مكتملة');
  assert.strictEqual(prep.statusLabel('progress'), 'قيد التنفيذ');
  assert.strictEqual(prep.statusLabel('open'), 'مفتوحة');
  assert.strictEqual(prep.statusLabel('unknown'), 'مفتوحة');
});

test('dueState: متأخرة / اليوم / مستقبلية', () => {
  const today = '2026-10-15';
  assert.strictEqual(prep.dueState('2026-10-14', today), 'overdue');
  assert.strictEqual(prep.dueState('2026-10-15', today), 'today');
  assert.strictEqual(prep.dueState('2026-10-16', today), '');
  assert.strictEqual(prep.dueState('', today), '');
});

/* ===== saveInlineStatus ===== */

test('saveInlineStatus بتسجّل كتمال المهمة وتحفظ', async () => {
  const car = readyCar({ id: 'c1', plate: 'ص 1' });
  const ctx = fakeContext([car]);
  await prep.saveInlineStatus('c1', 't1', 'done', ctx);
  const task = car.prepTasks[0];
  assert.strictEqual(task.status, 'done');
  assert.ok(task.completedAt, 'لازم تتسجّل وقت الإكمال');
  assert.strictEqual(ctx.calls.saved.length, 1);
  assert.deepStrictEqual(Array.from(ctx.calls.saved[0]), ['c1']);
  assert.strictEqual(ctx.calls.rendered, 1);
  assert.strictEqual(ctx.calls.events.length, 1, 'لازم يتسجّل حدث واحد للإكمال');
});

test('saveInlineStatus بتعمل task لو مش موجودة', async () => {
  const car = readyCar({ id: 'c1' });
  const ctx = fakeContext([car]);
  await prep.saveInlineStatus('c1', 'brand-new', 'progress', ctx);
  assert.strictEqual(car.prepTasks.length, 1);
  assert.strictEqual(car.prepTasks[0].status, 'progress');
});

test('saveInlineStatus ما بتعملش كمال تاني لو كانت مكتملة خلاص', async () => {
  const car = readyCar({ id: 'c1', prepTasks: [{ id: 't1', status: 'done', completedAt: 'earlier' }] });
  const ctx = fakeContext([car]);
  await prep.saveInlineStatus('c1', 't1', 'done', ctx);
  assert.strictEqual(car.prepTasks[0].completedAt, 'earlier', 'وقت الإكمال الأصلي لازم يفضل زي ما هو');
  assert.strictEqual(ctx.calls.events.length, 0, 'مفيش حدث جديد');
});

test('saveInlineStatus على سيارة مش موجودة: صامت', async () => {
  const ctx = fakeContext([readyCar({ id: 'c1' })]);
  await prep.saveInlineStatus('nope', 't1', 'done', ctx);
  assert.deepStrictEqual(ctx.calls.saved, []);
  assert.strictEqual(ctx.calls.rendered, 0);
});

/* ===== approveCar — أهم واحدة ===== */

test('approveCar بترفض لو في مهمة مفتوحة', async () => {
  const car = readyCar({ id: 'c1', prepTasks: [{ id: 't1', status: 'open' }] });
  const ctx = fakeContext([car]);
  const res = await prep.approveCar(car, '', ctx);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'requirements');
  /* approveCar بيعمل prepChecklist = {} قبل ما يتحقق، المهم إنه
     ميسجّلش اعتماد. */
  assert.notStrictEqual(car.prepChecklist.finalReview, true, 'ممنوع يتسجّل اعتماد');
  assert.deepStrictEqual(ctx.calls.saved, [], 'مفيش حفظ');
  assert.strictEqual(ctx.calls.events.length, 0, 'مفيش حدث اعتماد');
});

test('approveCar بترفض لو الوثائق ناقصة', async () => {
  const car = readyCar({ id: 'c1', insuranceStatus: 'منتهية' });
  const ctx = fakeContext([car]);
  const res = await prep.approveCar(car, '', ctx);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'requirements');
  assert.notStrictEqual(car.prepChecklist.finalReview, true);
});

test('approveCar بتنجح لما كل حاجة سليمة', async () => {
  const car = readyCar({ id: 'c1', plate: 'ص 9' });
  const ctx = fakeContext([car], { notify: true });
  const res = await prep.approveCar(car, '  كل حاجة تمام  ', ctx);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(car.prepChecklist.finalReview, true);
  assert.strictEqual(car.prepChecklist.finalNote, 'كل حاجة تمام', 'الملاحظة لازم تتقص من الطرفين');
  assert.ok(car.prepChecklist.finalReviewAt);
  assert.strictEqual(ctx.calls.saved.length, 1);
  assert.deepStrictEqual(Array.from(ctx.calls.saved[0]), ['c1']);
  assert.strictEqual(ctx.calls.events.length, 1);
});

test('approveCar بترجع فشل الحفظ على Supabase', async () => {
  const car = readyCar({ id: 'c1' });
  const ctx = fakeContext([car], { saveFails: true, supabaseReady: true });
  const res = await prep.approveCar(car, '', ctx);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'save');
});

test('approveCar بتنجح محليًا لو الحفظ فشل من غير Supabase', async () => {
  /* من غير Supabase مفيش معنى نرفض — الحفظ المحلي تم. */
  const car = readyCar({ id: 'c1' });
  const ctx = fakeContext([car], { saveFails: true, supabaseReady: false });
  const res = await prep.approveCar(car, '', ctx);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(car.prepChecklist.finalReview, true);
});

test('approveCar بتبعت إشعار الاعتماد في الخلفية', async () => {
  const car = readyCar({ id: 'c1', plate: 'ص 7', branch: 'فرع 2' });
  const ctx = fakeContext([car], { notify: true });
  await prep.approveCar(car, '', ctx);
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(ctx.calls.notified.length, 1);
  assert.strictEqual(ctx.calls.notified[0].type, 'vehicle_approved');
  assert.strictEqual(ctx.calls.notified[0].payload.plate, 'ص 7');
  assert.strictEqual(ctx.calls.notified[0].payload.branch, 'فرع 2');
});

test('فشل الإشعار مش بيبوظ اعتماد السيارة', async () => {
  /* الإشعارثانوي lateral — لو فشل، الاعتماد اتنفذ خلاص. */
  const car = readyCar({ id: 'c1' });
  const ctx = fakeContext([car], {
    notify: async function () { return { ok: false, error: 'الإشعار واقع' }; }
  });
  const res = await prep.approveCar(car, '', ctx);
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(res.ok, true);
  assert.strictEqual(car.prepChecklist.finalReview, true);
});