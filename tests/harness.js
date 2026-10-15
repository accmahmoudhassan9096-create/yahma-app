/* ===== tests/harness.js — تحميل كود الإنتاج كما هو في Node =====

   الاختبارات دي بيشتغلوا على نفس الملفات اللي بيتحمّلها المتصفح،
   من غير ما نعمل نسخة ولا نغيّر سطر واحد في كود الشحن.

   الطريقة: node:vm بيوفّر سياق مستقل، بنحط فيه window وهمي، وبنحمّل
   utils.js → readiness.js → preparation-data.js بالترتيب نفسه اللي
   في index.html. utils.js مش بيلمس الـDOM إطلاقًا (تحققت: صفر مرجع
   لـdocument أو addEventListener)، فبيشتغل نضيف جوّه sandbox.

   لوLogic اتغيّر في أي ملف من التلاتة، الاختبارات هتشوف التغيير
   على طول — وده المقصود. */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

/* الترتيب مهم: readiness بيحتاج YahmaUtils وقت التنفيذ. نفس ترتيب
   index.html: utils (458) → readiness (460) → preparation-data (466). */
const FILES = [
  'modules/utils.js',
  'modules/readiness.js',
  'modules/preparation-data.js'
];

function loadApp() {
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    Date,
    Math,
    JSON,
    Intl,
    Promise
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;

  const context = vm.createContext(sandbox);
  for (const rel of FILES) {
    const file = path.join(ROOT, rel);
    const code = fs.readFileSync(file, 'utf8');
    vm.runInContext(code, context, { filename: file });
  }

  return {
    utils: sandbox.YahmaUtils,
    readiness: sandbox.YahmaReadiness,
    prep: sandbox.YahmaPreparationData,
    sandbox,
    /* الـcontext نفسه — loadModule بيشغّل جوّاه. لو عملنا
       createContext تاني على نفس الـsandbox الهوية بتتكسر
       والـglobals اللي كُتبت ما بتوصلش. */
    context
  };
}

const app = loadApp();

/* ===== تحميل وحدة إضافية في نفس الـsandbox =====

   الـsandbox فوق اتبنى بـutils + readiness + preparation-data بس.
   loadModule بيزود ملف فوقهم — عشان الوحدة تشوف نفس الـglobals
   اللي بتشوفها في المتصفح (مثلاً vehicleReadiness اللي readiness.js
   بيصدّرها في السطر 75). لو الوحدة محتاجة global مش موجودة،
   رمي ValueError بدل ما تفضل undefined وتiggs التست. */
function loadModule(rel, extraGlobals) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) throw new Error('الملف مش موجود: ' + rel);
  const sandbox = app.sandbox;
  if (extraGlobals) Object.assign(sandbox, extraGlobals);
  const code = fs.readFileSync(file, 'utf8');
  vm.runInContext(code, app.context, { filename: file });
  return sandbox.YahmaDues || sandbox.YahmaUtils || sandbox;
}

/* ===== مصانع بيانات للاختبار ===== */

function iso(daysFromNow) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + daysFromNow);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/* سيارة سليمة مددودة: كل حاجة خضراء. الاختبارات بتبني عليها وبتغيّر
   حقل واحد في كل مرة، عشان كل اختبار يبقى ليه سبب واضح. */
function readyCar(overrides) {
  return Object.assign({
    id: 'car-1',
    plate: 'س أ 1234',
    branch: 'فرع 1',
    cardExpiry: iso(400),
    cardStatus: 'نشط',
    licenseExpiry: iso(400),
    licenseStatus: 'نشط',
    insuranceStatus: 'ساري',
    inspectionStatus: 'تم الفحص',
    carStatus: 'متاحة للايجار'
  }, overrides || {});
}

module.exports = {
  app,
  utils: app.utils,
  /* readiness.js بيصدّر stats وreasons جوّه YahmaReadiness بس،
     مش كـglobals زي vehicleReadiness. بنوصّلهم من نفس المكان. */
  readiness: app.readiness,
  vehicleReadiness: app.readiness.vehicle,
  readinessStats: app.readiness.stats,
  readinessReasons: app.readiness.reasons,
  prep: app.prep,
  loadModule,
  iso,
  readyCar,
  ROOT
};