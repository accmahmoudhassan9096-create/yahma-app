/* البحث في الأسطول — «ليه بكتب 7615 وبتيجي سيارات تانية؟»

   المشكلة اللي المستخدم شافها: البحث كان بيجمع اللوحة + الرقم التسلسلي
   + رقم البطاقة في نص واحد ويعمل `includes`. فـ«7615» كانت بتطابق
   التسلسلي 376157020 لسيارة لوحتها 4806.

   القاعدة الجديدة (modules/utils.js → carMatchesSearch):
     • أرقام أقل من 6 = أرقام اللوحة بس.
     • أرقام 6+ = ممكن تسلسلي/بطاقة (مطابقة جزئية مسموحة).
     • حروف = اللوحة (بالترتيب أو معكوسة) أو حقل نصي. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function bootUtils() {
  const sandbox = { console, Date, Math, JSON, Intl, Promise, setTimeout, clearTimeout };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(read('modules/utils.js'), ctx, { filename: 'modules/utils.js' });
  return sandbox;
}

const U = bootUtils();

const car = (over) => Object.assign({
  plate: '', brand: '', type: '', model: '', city: '', owner: '', branch: '',
  carStatus: '', inspectionStatus: '', insuranceCompany: '',
  serial: '', cardNumber: ''
}, over);

/* نفس بيانات الحالة اللي في الشكوى */
const ROW_7615 = car({ plate: 'س س ي 7615', serial: '133652320', cardNumber: '14-133652320' });
const ROW_4806 = car({ plate: 'ر ك ع 4806', serial: '376157020', cardNumber: '14-1400655443' });
const ROW_5119 = car({ plate: 'ر ق 5119', serial: '761586020', cardNumber: '14-1400656048' });

test('«7615» بترجّع اللوحة اللي فيها 7615 بس — مش أي تسلسلي فيه 7615', () => {
  assert.strictEqual(U.carMatchesSearch(ROW_7615, '7615'), true, 'اللوحة الصح ما اتلقتش');
  assert.strictEqual(U.carMatchesSearch(ROW_4806, '7615'), false,
    'سيارة 4806 ظهرت — تسلسلها 376157020 فيه 7615 (الباج الأصلي)');
  assert.strictEqual(U.carMatchesSearch(ROW_5119, '7615'), false,
    'سيارة 5119 ظهرت — تسلسلها 761586020 فيه 7615');
});

test('الرقم التسلسلي الكامل لسه بيتلقط', () => {
  assert.strictEqual(U.carMatchesSearch(ROW_4806, '376157020'), true);
  assert.strictEqual(U.carMatchesSearch(ROW_4806, '376157'), true, '6 خانات = مطابقة جزئية مسموحة');
});

test('رقم البطاقة الكامل والطويل بيتلقط', () => {
  assert.strictEqual(U.carMatchesSearch(ROW_4806, '1400655443'), true);
  assert.strictEqual(U.carMatchesSearch(ROW_4806, '14-1400655443'), true);
});

test('اللوحة بالترتيب المعكوس — «4806 ر ك ع»', () => {
  assert.strictEqual(U.carMatchesSearch(ROW_4806, '4806 ر ك ع'), true);
  assert.strictEqual(U.carMatchesSearch(ROW_4806, 'ركع 4806'), true);
});

test('أرقام عربية-هندية (٧٦١٥) بتتعامل زي 7615', () => {
  assert.strictEqual(U.carMatchesSearch(ROW_7615, '٧٦١٥'), true);
  assert.strictEqual(U.carMatchesSearch(ROW_4806, '٧٦١٥'), false);
});

test('حروف اللوحة بتفلتر لوحدها', () => {
  assert.strictEqual(U.carMatchesSearch(ROW_5119, 'ر ق'), true);
  assert.strictEqual(U.carMatchesSearch(ROW_7615, 'ر ق'), false);
});

test('البحث النصي لسه شغّال: ماركة / مالك / فرع / حالة', () => {
  const c = car({ plate: 'ر ك ع 4806', brand: 'تويوتا', owner: 'شركة عبداللطيف جميل', branch: 'فرع الخبر (22)', inspectionStatus: 'تم الفحص' });
  assert.strictEqual(U.carMatchesSearch(c, 'تويوتا'), true);
  assert.strictEqual(U.carMatchesSearch(c, 'عبداللطيف'), true);
  assert.strictEqual(U.carMatchesSearch(c, 'الخبر'), true);
  assert.strictEqual(U.carMatchesSearch(c, 'تم الفحص'), true);
  assert.strictEqual(U.carMatchesSearch(c, 'نيسان'), false);
});

test('الأسطول و«الفحص» بيستخدموا نفس دالة البحث — مفيش نسخة تانية', () => {
  const fleetView = read('modules/fleet-view.js');
  const fleetCore = read('modules/fleet-core.js');
  const renewals = read('modules/renewals-ui.js');
  assert.ok(/carMatchesSearch\(c,q\)/.test(fleetView), 'تبويب الأسطول مش بيستخدم carMatchesSearch');
  assert.ok(/carMatchesSearch\(car, query\)/.test(fleetCore), 'محرك فلترة الأسطول مش بيستخدم carMatchesSearch');
  assert.ok(/carMatchesSearch\(c,q\)/.test(renewals), 'تبويب الفحص مش بيستخدم carMatchesSearch');
});
