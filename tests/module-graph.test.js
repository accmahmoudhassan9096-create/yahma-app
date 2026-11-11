/* ===== شبكة أمان قبل تقسيم الملفات الكبيرة =====

   الهدف: نقدر نفكّ `core/render-router.js`
   `core/render-router.js` (1503) من غير ما نكسر حاجة، وقاعدة
   البيانات تقوللنا لو كسرنا.

   الاختبار ده بيعمل ٣ حاجات:

   ❶ بيحمّل **كل** سكربتات التطبيق في رمل واحد (vm)، **بنفس ترتيب
      index.html بالظبط**. لو ملف اتنقل لمكان غلط في الترتيب، أو
      ملف فيه خطأ صياغة، أو ملف ناقص — الاختبار بيقع هنا.
      (ترتيب التحميل مش رفاهية: `core/permissions.js` لازم يتحمّل

   ❷ بيقارن الـAPI العام (٤١ namespace وكل مفتاح فيهم) بخط أساس
      محفوظ في `api-baseline.json`. لو أي دالة عامة ضاعت أو
      اتغيّر اسمها في أثناء التقسيم — بيقع. ده بالظبط أخطر
      حاجة في إعادة تنظيم: دالة كانت متاحة بقت مش متاحة.

   ❸ بيرسم **كل** تبويب وبيتأكد إن ما فيش استثناء. ده بيلقط
      دالة نُقلت لملف تاني وبقت مش معرّفة وقت النداء.

   ⚠️ الـstub بيحمّل السكربتات بس ما بيرسمش الصفحة الحقيقية.
   المراجعة البصرية تبقى في المتصفح — ده بيلقط الأخطاء وقت
   التشغيل (تعريف ناقص)، مش الأخطاء في الشكل. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/* ===== محمّل التطبيق ===== */

function stubEl(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(), nodeType: 1,
    style: { cssText: '', setProperty(){}, removeProperty(){}, getPropertyValue(){ return ''; } },
    dataset: {}, attributes: [], children: [], childNodes: [],
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    textContent: '', innerHTML: '', innerText: '', value: '', checked: false,
    disabled: false, hidden: false, href: '', src: '', type: '',
    setAttribute(){}, getAttribute(){ return null; }, removeAttribute(){},
    hasAttribute(){ return false; },
    appendChild(c){ this.children.push(c); this.childNodes.push(c); c.parentNode = this; return c; },
    removeChild(c){ return c; }, insertBefore(c){ this.children.push(c); c.parentNode = this; return c; },
    replaceChild(c){ return c; }, cloneNode(){ return stubEl(tag); },
    addEventListener(){}, removeEventListener(){}, dispatchEvent(){ return true; },
    querySelector(){ return null; }, querySelectorAll(){ return []; },
    closest(){ return null; }, contains(){ return false; },
    getBoundingClientRect(){ return { top:0,left:0,width:0,height:0,bottom:0,right:0 }; },
    focus(){}, blur(){}, click(){}, scrollIntoView(){}, remove(){},
    parentNode: null, ownerDocument: null, firstChild: null, lastChild: null
  };
  return el;
}

function buildSandbox() {
  const body = stubEl('body'), head = stubEl('head');
  const doc = {
    readyState: 'complete',
    documentElement: stubEl('html'), body: body, head: head,
    title: '', visibilityState: 'visible', hidden: false,
    addEventListener(){}, removeEventListener(){}, dispatchEvent(){ return true; },
    getElementsByTagName(){ return []; }, getElementsByClassName(){ return []; },
    querySelector(){ return stubEl(); }, querySelectorAll(){ return []; },
    createElement(t){ return stubEl(t); }, createTextNode(){ return {}; },
    createDocumentFragment(){ return stubEl(); }, execCommand(){ return true; }
  };
  /* topbar-ui.js بيعمل insertBefore على parentNode — فلازم
     الـstub يرجّع عنصر ليه parent و siblings. */
  const sharedParent = stubEl('div'), anchor = stubEl('span'), wrap = stubEl('div');
  sharedParent.appendChild(anchor); sharedParent.appendChild(wrap);
  const byId = {
    'topbar-user': stubEl('button'), 'user-dropdown': stubEl('div'),
    'topbar-user-wrap': wrap, 'notify-slot-anchor': anchor
  };
  doc.getElementById = function (id) { return byId[id] || stubEl(); };
  body.ownerDocument = doc; doc.documentElement.ownerDocument = doc;

  const store = {};
  const ctx = {
    window: null, self: null, document: doc,
    console: { log(){}, info(){}, warn(){}, error(){}, debug(){} },
    setTimeout(){}, clearTimeout(){}, setInterval(){}, clearInterval(){},
    requestAnimationFrame(){ return 1; }, cancelAnimationFrame(){},
    fetch(){ return Promise.resolve({ ok:true, json(){ return Promise.resolve({}); } }); },
    navigator: { userAgent: 'node', language: 'ar', onLine: true,
      serviceWorker: { register(){ return Promise.resolve({}); },
        getRegistrations(){ return Promise.resolve([]); },
        addEventListener(){}, removeEventListener(){} },
      clipboard: { writeText(){ return Promise.resolve(); } },
      vibrate(){}, permissions: { query(){ return Promise.resolve({ state:'granted' }); } } },
    location: { href: 'http://localhost/', origin: 'http://localhost', search: '', hash: '', pathname: '/' },
    localStorage: {
      getItem(k){ return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem(k, v){ store[k] = String(v); }, removeItem(k){ delete store[k]; },
      clear(){ for (const k of Object.keys(store)) delete store[k]; },
      key(i){ return Object.keys(store)[i] || null; },
      get length(){ return Object.keys(store).length; }
    },
    sessionStorage: { getItem(){ return null; }, setItem(){}, removeItem(){}, clear(){} },
    matchMedia(){ return { matches:false, addEventListener(){}, addListener(){} }; },
    getComputedStyle(){ return { getPropertyValue(){ return ''; } }; },
    requestIdleCallback(){ return 1; },
    CSS: { supports(){ return false; }, escape(v){ return String(v); } },
    supabase: { createClient(){ return { auth:{ getSession(){ return Promise.resolve({ data:{ session:null } }); } }, from(){ return {}; } }; } },
    Dexie: function () {
      const db = {
        open(){ return Promise.resolve(db); },
        table(){ return { toArray(){ return Promise.resolve([]); }, each(){}, orderBy(){ return this; }, limit(){ return this; }, filter(){ return this; }, reverse(){ return this; } }; },
        tables: []
      };
      db.version = function () { return { stores(){ return db; }, upgrade(){ return { stores(){ return {}; } }; } }; };
      return db;
    },
    indexedDB: null, IDBKeyRange: null,
    yahmaErr(){},
    addEventListener(){}, removeEventListener(){}, dispatchEvent(){ return true; },
    btoa(s){ return Buffer.from(String(s)).toString('base64'); },
    atob(s){ return Buffer.from(String(s), 'base64').toString('binary'); }
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  ctx.document.defaultView = ctx;
  vm.createContext(ctx);
  return ctx;
}

/* ترتيب التحميل = ترتيب <script> في index.html بالظبط.
   مفيش source تاني — الـindex.html هو مصدر الحقيقة. */
function appScripts() {
  const html = read('index.html');
  /* src ممكن يتسبق بخصائص (زي defer) — المهم الترتيب في index.html */
  return [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((s) => !/^https?:/.test(s) && !/^vendor\//.test(s));
}

function loadApp() {
  const ctx = buildSandbox();
  const failures = [];
  for (const src of appScripts()) {
    const p = path.join(ROOT, src.replace(/^\.\//, ''));
    if (!fs.existsSync(p)) { failures.push(src + ' — الملف مش موجود'); continue; }
    try { vm.runInContext(read(src.replace(/^\.\//, '')), ctx, { filename: src }); }
    catch (e) { failures.push(src + ' → ' + (e && e.message ? e.message : String(e)).slice(0, 110)); }
  }
  return { ctx, failures };
}

/* ====================================== */

test('كل سكربتات التطبيق بتتحمّل بنجاح — بنفس ترتيب index.html', () => {
  const { failures } = loadApp();
  assert.deepStrictEqual(failures, [],
    'سكربتات مشتغلتش:\n  ' + failures.join('\n  '));
});

test('كل سكربت في index.html موجود على القرص', () => {
  const missing = appScripts().filter((s) => !fs.existsSync(path.join(ROOT, s.replace(/^\.\//, ''))));
  assert.deepStrictEqual(missing, [], 'ملفات ناقصة: ' + missing.join(', '));
});

/* ⭐ خط الأساس: الـAPI العام بعد أي تعديل لازم يفضل زي ما هو.
   إعادة التنظيم **مش** المفروض تغيّر الواجهة العامة. */
test('الـAPI العام ماتغيّرش — نفس الـnamespaces ونفس المفاتيح', () => {
  const baseline = JSON.parse(read('tests/api-baseline.json'));
  const { ctx } = loadApp();
  const now = {};
  Object.keys(ctx).filter((k) => /^Yahma/.test(k)).sort().forEach((k) => {
    const v = ctx[k];
    now[k] = (v && typeof v === 'object') ? Object.keys(v).sort() : typeof v;
  });

  const lostNs = Object.keys(baseline).filter((k) => !(k in now));
  const newNs = Object.keys(now).filter((k) => !(k in baseline));
  assert.deepStrictEqual(lostNs, [], 'namespaces اتشالت: ' + lostNs.join(', '));
  assert.deepStrictEqual(newNs, [], 'namespaces جديدة من غير تحديث الخط الأساس: ' + newNs.join(', '));

  const lost = [];
  Object.keys(baseline).forEach((ns) => {
    if (!Array.isArray(baseline[ns]) || !Array.isArray(now[ns])) return;
    const gone = baseline[ns].filter((k) => now[ns].indexOf(k) < 0);
    const extra = now[ns].filter((k) => baseline[ns].indexOf(k) < 0);
    if (gone.length) lost.push(ns + ': ' + gone.join(', '));
    if (extra.length) lost.push(ns + ' (جديد): ' + extra.join(', '));
  });
  assert.deepStrictEqual(lost, [],
    'الـAPI العام اتغيّر. لو التغيير مقصود، حدّث tests/api-baseline.json عادي:\n  ' + lost.join('\n  '));
});

/* ⭐ كل تبويب لازم يرسم من غير استثناء.
   الدالة اللي اتنقلت لملف تاني وبقت مش معرّفة بتطلع هنا. */
test('كل التبويبات بترسم من غير استثناء', () => {
  const { ctx } = loadApp();
  ctx.currentRole = 'admin';
  ctx._demoMode = false;
  /* ⭐ أسطول صغير لكن حقيقي — الـrender لازم يمشي على الكود اللي
     بيDisclosure فعلاً (الفلترة والرسم والإجراءات الجماعية).
     بأسطول فاضي المسار ده مش بيتنفّذ خالص، فأي خطأ جوه بيعدّي. */
  ctx.fleet = [
    { id: 'c1', plate: 'ر ن و 5251', brand: 'هيونداي', type: 'sedan', model: 'أكسنت', year: 2022, branch: 'فرع 1', owner: 'عميل', ownerNumber: '0500000000', carStatus: 'متاحة للإيجار', odometer: 1000, nextService: '2027-01-01', dailyRate: 200, rentedDaysMonth: 20, maintenanceCost: 500, lastMaintenance: '2026-01-01', workshop: 'ورشة 1', notes: '', cardExpiry: '2028-01-01', cardNumber: '1', licenseExpiry: '2028-01-01', inspectionExpiry: '2027-06-01', insuranceStatus: 'ساري', cardStatus: 'ساري', licenseStatus: 'ساري', inspectionStatus: 'تم الفحص', companyName: 'شركة', minDailyRate: 150, minMonthlyRate: 3000, monthlyRate: 6000, serial: 'S1', chassisNo: 'C1', color: 'أبيض', city: 'الرياض', prepTasks: [], prepChecklist: { finalReview: false, finalNote: '' } },
    { id: 'c2', plate: 'ر ن ط 5546', brand: 'تويوتا', type: 'suv', model: 'RAV4', year: 2023, branch: 'فرع 2', owner: 'عميل 2', ownerNumber: '0500000001', carStatus: 'تحت الصيانة', odometer: 2000, nextService: '2026-11-01', dailyRate: 250, rentedDaysMonth: 15, maintenanceCost: 800, lastMaintenance: '2026-02-01', workshop: 'ورشة 2', notes: '', cardExpiry: '2027-05-01', cardNumber: '2', licenseExpiry: '2027-05-01', inspectionExpiry: '2026-12-01', insuranceStatus: 'لا يوجد', cardStatus: 'منتهية', licenseStatus: 'منتهية', inspectionStatus: 'لم يفحص', companyName: 'شركة', minDailyRate: 200, minMonthlyRate: 4000, monthlyRate: 7000, serial: 'S2', chassisNo: 'C2', color: 'أسود', city: 'جدة', prepTasks: [], prepChecklist: { finalReview: false, finalNote: '' } },
    { id: 'c3', plate: 'س ص ه 2488', brand: 'نيسان', type: 'pickup', model: 'باترول', year: 2021, branch: 'فرع 3', owner: 'عميل 3', ownerNumber: '0500000002', carStatus: 'مؤجرة', odometer: 3000, nextService: '2026-10-30', dailyRate: 300, rentedDaysMonth: 25, maintenanceCost: 0, lastMaintenance: '2026-03-01', workshop: 'غير محددة', notes: '', cardExpiry: '2026-12-01', cardNumber: '3', licenseExpiry: '2026-11-01', inspectionExpiry: '2026-10-25', insuranceStatus: 'ساري', cardStatus: 'ساري', licenseStatus: 'ساري', inspectionStatus: 'تم الفحص', companyName: 'شركة', minDailyRate: 250, minMonthlyRate: 5000, monthlyRate: 8000, serial: 'S3', chassisNo: 'C3', color: 'أخضر', city: 'الدمام', prepTasks: [], prepChecklist: { finalReview: true, finalNote: 'تم' } }
  ];
  const tabs = ctx.ALL_YAHMA_TABS || [];
  assert.ok(tabs.length >= 10, 'التبويبات مش محمّلة — ALL_YAHMA_TABS فاضي');

  const errors = [];
  tabs.forEach((tab) => {
    /* ⭐ لازم نمسح الخطأ القديم — render() بيخزّن الـstack في
       __lastError لما يبلع استثناء ويرجع للـemergency view، فلو
       ما مسحناهوش هنحسب خطأ التبويب اللي فات كأنه خطأ الجديد. */
    try { ctx.__lastError = null; } catch (_) {}
    try {
      ctx.yahmaSetTab(tab);
      ctx.currentTab = tab;
      if (typeof ctx.render === 'function') ctx.render();
    } catch (e) {
      errors.push(tab + ' → ' + (e && e.message ? e.message : String(e)).slice(0, 120));
    }
    /* ⭐ الاستثناء اللي render() ببلعه — لازم يبقى واضح */
    try {
      if (ctx.__lastError) {
        errors.push(tab + ' → (مبلع جوّه render) ' + String(ctx.__lastError).slice(0, 160));
      }
    } catch (_) {}
  });
  assert.deepStrictEqual(errors, [], 'تبويبات رمت استثناء:\n  ' + errors.join('\n  '));
});

test('التبويبات نفسها ما اتغيّرتش — نفس القائمة ونفس الترتيب', () => {
  const baseline = JSON.parse(read('tests/tab-smoke-baseline.json'));
  const { ctx } = loadApp();
  const tabs = Array.from(ctx.ALL_YAHMA_TABS || []);
  assert.deepStrictEqual(tabs, Object.keys(baseline),
    'قائمة التبويبات اتغيّرت — لو بتضيف تبويب جديد، حدّث tests/tab-smoke-baseline.json');
});

/* ⭐ دالة نُقلت لملف جديد لازم تفضل في نفس المكان العام.
   الاختبار ده بيمنع «حركة صامتة»: الدالة بتتحرك لاسم تاني
   فيتغيّر السلوك من غير ما حد ياخد باله. */
/* ⭐ تقسيم واجهة اللوحة ما_addedش حاجة للواجهة العامة.

   واجهة التقReports اتقسمت لـ view و schedule. الدوال الجديدة دي
   داخلية (بتاخد ctx من renderReports) — المفروض ما تظهرش على
   window غير كـnamespace، وما تاخدش مفتاح جديد في YahmaReports. */
/* ⭐ تقسيم لوحة التحكم ما_addedش حاجة للواجهة العامة.

   واجهة التحكم اتقسمت لـ core (الحساب) و view (العرض). الدوال الجديدة
   داخلية — المفروض ما تظهر على window غير كـnamespace، وما تاخدش
   مفتاح جديد في YahmaDashboard. */
test('تقسيم لوحة التحكم ما ضفش مفتاح جديد للـAPI العام', () => {
  const { ctx } = loadApp();
  const D = ctx.YahmaDashboard;
  assert.strictEqual(Object.keys(D).length, 1,
    'YahmaDashboard بقى ' + Object.keys(D).length + ' مفتاح بدل 1: ' + Object.keys(D).join(', '));

  /* الأسماء اللي اتنقلت لازم تكون موجودة في ملفاتها الجديدة */
  assert.deepStrictEqual(Object.keys(ctx.YahmaDashboardCore).sort(),
    ['computeDashboardState']);
  assert.deepStrictEqual(Object.keys(ctx.YahmaDashboardView).sort(),
    ['bindDashboardEvents', 'dashboardTemplate']);

  /* وrenderDashboard لازم تفضل هي اللي تتعرض */
  assert.strictEqual(typeof D.render, 'function', 'YahmaDashboard.render لازم تفضل دالة');
  assert.strictEqual(typeof ctx.renderDashboard, 'function', 'renderDashboard العالمية ناقصة');
});

/* ⭐ كل دالة منقولة للوحة التحكم لازم تاخد عدد وسائطها المتوقع —
   عشان ما تفتح نطاق جديد بالصدفة وتقرأ متغير عام بالغلط. */
test('الدوال المنقولة للوحة التحكم بتاخد وسائط صريحة', () => {
  const { ctx } = loadApp();
  assert.strictEqual(typeof ctx.YahmaDashboardCore.computeDashboardState, 'function');
  assert.strictEqual(ctx.YahmaDashboardCore.computeDashboardState.length, 1,
    'computeDashboardState المفروض تاخد fleet واحد');
  assert.strictEqual(typeof ctx.YahmaDashboardView.dashboardTemplate, 'function');
  assert.strictEqual(ctx.YahmaDashboardView.dashboardTemplate.length, 1,
    'dashboardTemplate المفروض تاخد state واحد');
  assert.strictEqual(typeof ctx.YahmaDashboardView.bindDashboardEvents, 'function');
  assert.strictEqual(ctx.YahmaDashboardView.bindDashboardEvents.length, 3,
    'bindDashboardEvents المفروض (content, context, state)');
});

/* ⭐ تقسيم العمليات الاستخبارية ما_addedش حاجة للواجهة العامة.

   funciones الحساب اتنقلت لـ ops-intel-core.js كمتغيرات عامة وبمساحة
   YahmaOpsCore. وYahmaOpsUX لسه يصدر نفس الستة دوال. */
test('تقسيم العمليات الاستخبارية ما ضفش مفتاح جديد للـAPI العام', () => {
  const { ctx } = loadApp();
  const UX = ctx.YahmaOpsUX;
  assert.strictEqual(Object.keys(UX).length, 6,
    'YahmaOpsUX بقى ' + Object.keys(UX).length + ' مفتاح بدل 6: ' + Object.keys(UX).join(', '));
  assert.deepStrictEqual(Object.keys(UX).sort(),
    ['branchMetrics', 'buildOpsNotifications', 'expiryAlerts', 'openNotifyCenter', 'searchAll', 'taskSLA']);

  assert.deepStrictEqual(Object.keys(ctx.YahmaOpsCore).sort(),
    ['addDays', 'branchMetrics', 'buildOpsNotifications', 'collectTasks', 'daysBetween',
     'expiryAlerts', 'fleetArr', 'parseDate', 'readinessFailures', 'slaTargetFor',
     'taskSLA', 'toastKbd', 'today']);

  /* toastKbd لسه متاح كمتغير عام (dashboard-view.js يناديه così) */
  assert.strictEqual(typeof ctx.toastKbd, 'function', 'toastKbd العام ناقص');
  assert.strictEqual(ctx.toastKbd.length, 1, 'toastKbd المفروض تاخد msg واحد');
});

/* ⭐ تقسيم تفاعلات الشريط العلوي ما_addedش حاجة للواجهة العامة.

   invokeYahmaFunction صدر كـ window.yahmaInvokeFunction (يستخدمه my-account.js).
   openWelcomeEditor صدر كـ window.yahmaOpenWelcomeEditor.
   الدوال 나머지 صدرت ضمن YahmaTopbarUser و YahmaTopbarMenu. */
test('تقسيم الشريط العلوي ما ضفش مفتاح جديد للـAPI العام', () => {
  const { ctx } = loadApp();
  assert.strictEqual(typeof ctx.yahmaInvokeFunction, 'function', 'yahmaInvokeFunction العام ناقص');
  assert.strictEqual(ctx.yahmaInvokeFunction.length, 3,
    'yahmaInvokeFunction المفروض (name, body, msgEl)');
  assert.strictEqual(typeof ctx.yahmaOpenWelcomeEditor, 'function', 'yahmaOpenWelcomeEditor العام ناقص');
  assert.strictEqual(ctx.yahmaOpenWelcomeEditor.length, 0,
    'yahmaOpenWelcomeEditor المفروض ماخدش وسائط');

  assert.deepStrictEqual(Object.keys(ctx.YahmaTopbarUser).sort(),
    ['closeMenu', 'openUserAdmin', 'openWelcomeEditor', 'syncProfileMenu', 'welcomeLoadTemplate', 'welcomeRender']);
  assert.deepStrictEqual(Object.keys(ctx.YahmaTopbarMenu).sort(),
    ['bindMobileTools', 'openMenu', 'positionMenu']);
});

/* ⭐ كل دالة منقولة للشريط العلوي لازم تاخد عدد وسائطها المتوقع. */
test('الدوال المنقولة للشريط العلوي بتاخد وسائط صريحة', () => {
  const { ctx } = loadApp();
  assert.strictEqual(typeof ctx.YahmaTopbarUser.openUserAdmin, 'function');
  assert.strictEqual(ctx.YahmaTopbarUser.openUserAdmin.length, 0,
    'openUserAdmin المفروض ماخدش وسائط');
  assert.strictEqual(typeof ctx.YahmaTopbarUser.syncProfileMenu, 'function');
  assert.strictEqual(ctx.YahmaTopbarUser.syncProfileMenu.length, 0,
    'syncProfileMenu المفروض ماخدش وسائط');
  assert.strictEqual(typeof ctx.YahmaTopbarMenu.positionMenu, 'function');
  assert.strictEqual(ctx.YahmaTopbarMenu.positionMenu.length, 2,
    'positionMenu المفروض (menu, trigger)');
  assert.strictEqual(typeof ctx.YahmaTopbarMenu.openMenu, 'function');
  assert.strictEqual(ctx.YahmaTopbarMenu.openMenu.length, 2,
    'openMenu المفروض (menu, trigger)');
  assert.strictEqual(typeof ctx.YahmaTopbarMenu.bindMobileTools, 'function');
  assert.strictEqual(ctx.YahmaTopbarMenu.bindMobileTools.length, 0,
    'bindMobileTools المفروض ماخدش وسائط');
});

/* ⭐ تبويب المستخدمين الجديد ما ضفش حاجة غريبة للواجهة العامة.
   YahmaUsers لسه يصدر دالة render بالظبط. */
test('تبويب المستخدمين — YahmaUsers يصدر render بالظبط', () => {
  const { ctx } = loadApp();
  assert.strictEqual(Object.keys(ctx.YahmaUsers).length, 1,
    'YahmaUsers بقى ' + Object.keys(ctx.YahmaUsers).length + ' مفتاح بدل 1: ' + Object.keys(ctx.YahmaUsers).join(', '));
  assert.deepStrictEqual(Object.keys(ctx.YahmaUsers).sort(), ['render']);
  assert.strictEqual(typeof ctx.YahmaUsers.render, 'function');
  assert.strictEqual(ctx.YahmaUsers.render.length, 1, 'render(users-tab) المفروض تاخد content واحد');
});

/* ⭐ تقسيم الأسطول ما_addedش حاجة للواجهة العامة.

   الدوال النافعة صدرت بـ YahmaFleetCore، والعرض بـ YahmaFleetView،
   والواجهة العامة YahmaFleet لسه تصدر نفس الدوال العشر. */
test('تقسيم الأسطول ما ضفش مفتاح جديد للـAPI العام', () => {
  const { ctx } = loadApp();
  const F = ctx.YahmaFleet;
  assert.strictEqual(Object.keys(F).length, 10,
    'YahmaFleet بقى ' + Object.keys(F).length + ' مفتاح بدل 10: ' + Object.keys(F).join(', '));
  assert.deepStrictEqual(Object.keys(F).sort(),
    ['count','createFilterEngine','exportExcel','getAll','go','optionList','persist','readinessStats','render','uniqueFieldValues']);

  assert.deepStrictEqual(Object.keys(ctx.YahmaFleetCore).sort(),
    ['createFilterEngine','getFleet','optionList','readinessStats','uniqueFieldValues']);
  assert.deepStrictEqual(Object.keys(ctx.YahmaFleetView).sort(), ['render']);

  /* YahmaFleet.render لسه دالة */
  assert.strictEqual(typeof F.render, 'function', 'YahmaFleet.render لازم تفضل دالة');
});

/* ⭐ كل دالة منقولة للأسطول لازم تاخد عدد وسائطها المتوقع. */
test('الدوال المنقولة للأسطول بتاخد وسائط صريحة', () => {
  const { ctx } = loadApp();
  assert.strictEqual(typeof ctx.YahmaFleetCore.getFleet, 'function');
  assert.strictEqual(ctx.YahmaFleetCore.getFleet.length, 0,
    'getFleet المفروض ماخدش وسائط');
  assert.strictEqual(typeof ctx.YahmaFleetCore.readinessStats, 'function');
  assert.strictEqual(ctx.YahmaFleetCore.readinessStats.length, 0,
    'readinessStats المفروض ماخدش وسائط');
  assert.strictEqual(typeof ctx.YahmaFleetView.render, 'function');
  assert.strictEqual(ctx.YahmaFleetView.render.length, 2,
    'render المفروض (content, cars)');
});

/* ⭐ كل دالة منقولة للعمليات الاستخبارية لازم تاخد عدد وسائطها المتوقع. */
test('الدوال المنقولة للعمليات الاستخبارية بتاخد وسائط صريحة', () => {
  const { ctx } = loadApp();
  assert.strictEqual(typeof ctx.YahmaOpsCore.expiryAlerts, 'function');
  assert.strictEqual(ctx.YahmaOpsCore.expiryAlerts.length, 1,
    'expiryAlerts المفروض تاخد withinDays واحد');
  assert.strictEqual(typeof ctx.YahmaOpsCore.taskSLA, 'function');
  assert.strictEqual(ctx.YahmaOpsCore.taskSLA.length, 0,
    'taskSLA المفروض ماخدش وسائط');
  assert.strictEqual(typeof ctx.YahmaOpsCore.branchMetrics, 'function');
  assert.strictEqual(ctx.YahmaOpsCore.branchMetrics.length, 0,
    'branchMetrics المفروض ماخدش وسائط');
  assert.strictEqual(typeof ctx.YahmaOpsCore.buildOpsNotifications, 'function');
  assert.strictEqual(ctx.YahmaOpsCore.buildOpsNotifications.length, 0,
    'buildOpsNotifications المفروض ماخدش وسائط');
  assert.strictEqual(typeof ctx.YahmaOpsCore.collectTasks, 'function');
  assert.strictEqual(ctx.YahmaOpsCore.collectTasks.length, 0,
    'collectTasks المفروض ماخدش وسائط');
});

/* ⭐ كل دالة منقولة لازم تاخد ctx — عشان ما تفتحش نطاق جديد
   بالصدفة وتقرأ متغير عام بالغلط. */
/* ⭐ مفيش اسم عمومي معرّف في ملفين.

   الطريقة: بيحمّل كل ملف لوحده في رمل فاضي وبيشوف إيه الأسماء
   العالمية اللي زوّدها. الطريقة الصح — لأن فحص النص statically
   كان بيلتقط دوال محلية جوه IIFE (زي renderReports جوّه reports.js
   وrender جوّه render-router.js) وهي **مش** تعارض أصلاً.

   التعارض الحقيقي يعني: الملف التاني بيكتب فوق الأول silently،
   وأي حد بينادي الاسم ده بياخد النسخة الغلط. */
/* ⭐ عقد الـrouter: كل اسم عام كان في render-router.js **قبل**
   التقسيم لازم يفضل موجود بعده.

   ليه ده مهم: `modules/payments-store.js` بينادي `canRunPayments`،
   و`modules/audit.js` بينادي `renderAuditPage`، و26 ملف بينادوا
   `render`. فلو دالة ضاعت في التقسيم، الكود مش بيقع وقت التحميل
   (بيبقى ReferenceError وقت النداء) — يعني التطبيق بيشتغل والقتل
   بيحصل بعدين.

   الـ`const`/`let` على المستوى الأعلى ما بيظهروش كـwindow
   properties، فلازم نتحقق منهم بـ`typeof` جوّه نفس الـcontext. */
test('كل أسماء الـrouter الأصلية موجودة — مفيش دالة ضاعت في التقسيم', () => {
  const contract = JSON.parse(read('tests/router-globals.json'));
  assert.ok(contract.length > 50, 'العقد فاضي — مش اتالتقط صح');
  const { ctx } = loadApp();
  const missing = contract.filter((name) => {
    try {
      return vm.runInContext('typeof ' + name, ctx) === 'undefined';
    } catch (e) { return true; }
  });
  assert.deepStrictEqual(missing, [],
    'أسماء ضاعت في التقسيم: ' + missing.join(', '));
});

/* ⭐ والأسماء دي لازم تفضل شغّالة — مش موجودة بس. */
test('دوال الـrouter الأساسية شغّالة فعلاً بعد التقسيم', () => {
  const { ctx } = loadApp();
  ['render', 'renderInspectionPayments', 'renderPaidInspections', 'renderRenewedInspections',
    'renderBranches', 'renderPreparation', 'renderAuditPage', 'renderDashboard', 'renderFleet',
    'canRunPayments', 'formatArabicDate', 'goTabFromRouter',
    'downloadBranchStatusTemplate', 'handleBranchStatusImport', 'emailBranch', 'whatsappBranch',
    'openBranchModal',
    'getPrepTasks', 'savePrepTask', 'prepStatusForCar', 'prepChecklistForCar',
    'loadInspectionPayments', 'loadPaidInspections', 'loadRenewedInspections'
  ].forEach((fn) => {
    assert.strictEqual(typeof ctx[fn], 'function', fn + ' مش function بعد التقسيم');
  });
  /* واللي المفروض تستدعي الدوال دي من ملفات تانية لازم تفعلها */
  ctx.currentRole = 'admin'; ctx._demoMode = false; ctx.fleet = [];
  ['payments', 'paid', 'renewed', 'branches', 'audit'].forEach((tab) => {
    try {
      ctx.yahmaSetTab(tab);
      ctx.currentTab = tab;
      ctx.render();
    } catch (e) {
      assert.fail('تبويب ' + tab + ' رمت استثناء بعد التقسيم: ' + (e && e.message));
    }
  });
});

/* ⭐ توثيق التقسيم: كل ملف متخصص لازم يكون في الـprecache
   وفي index.html، ومفيش ملف راجع نفس الكود مرتين.

   السبب: `scripts/check-shell.js` بيفشل لو ملف مش في الـprecache،
   والـSW install بيفشل → كل العملاء بيفضلوا على النسخة القديمة
   من غير أي رسالة. ده حصل فعلاً بين v168 وv174. */
test('الملفات المتخصصة مسجّلة في index.html والـprecache', () => {
  const html = read('index.html');
  const sw = read('sw.js');
  const SPECIAL = [
    'core/router-payments.js', 'core/router-payments-item.js', 'core/router-payments-bulk.js',
    'core/router-payments-pending.js', 'core/router-payments-paid.js', 'core/router-payments-renewed.js',
    'core/router-branches.js'
  ];
  SPECIAL.forEach((f) => {
    assert.ok(html.indexOf('"' + f + '"') > -1, f + ' مش محمّل في index.html');
    assert.ok(sw.indexOf("'./" + f + "'") > -1, f + ' مش في precache الـSW');
    assert.ok(fs.existsSync(path.join(ROOT, f)), f + ' مش موجود على القرص');
  });
  /* وترتيب التحميل: الملفات المتخصصة قبل الـrouter عشان لو
     حصل نداء وقت التحميل يبقى موجود. */
  SPECIAL.forEach((f) => {
    const i = html.indexOf('"' + f + '"');
    const r = html.indexOf('"core/render-router.js"');
    assert.ok(i > -1 && i < r, f + ' لازم يتحمّل قبل core/render-router.js');
  });
});

/* ⭐ مفيش كود مكرر بين الملفات المتخصصة والـrouter.
   التكرار معناه تعديل في مكان مش في التاني، وسلوك مختلف
   بين النسختين. */
test('مفيش كود مكرر بين الملفات المتخصصة والـrouter', () => {
  const router = read('core/render-router.js');
  const routerFns = new Set(
    [...router.matchAll(/^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]));
  ['core/router-payments.js', 'core/router-payments-item.js', 'core/router-payments-bulk.js',
    'core/router-payments-pending.js', 'core/router-payments-paid.js', 'core/router-payments-renewed.js',
    'core/router-branches.js'].forEach((f) => {
    const code = read(f);
    const fns = [...code.matchAll(/^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
    const dup = fns.filter((n) => routerFns.has(n));
    assert.deepStrictEqual(dup, [], f + ': فيه دوال مكررة مع الـrouter: ' + dup.join(', '));
  });
});

/* ⭐ مفيش اعتماد على CDN خارجي.

   الاعتماد على jsdelivr/unpkg/cdnjs كان بيعني إن المنصة ممكن تفشل
   في الإقلاع على أي شبكة بتقطعهم — وده عكسشرط إن كل المكتبات محلية.
   البديل: نسخة ثانية في vendor/fallback/ تُحمّل لو الأولى فشلت. */
test('مفيش CDN خارجي — كل المكتبات محلية', () => {
  const CDN_RE = /https?:\/\/(cdn\.|unpkg\.|cdnjs\.|jsdelivr\.|fonts\.googleapis)/;
  const files = [];
  const walk = (dir) => {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'vendor') return;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(js|html|css)$/.test(e.name)) files.push(full);
    });
  };
  walk(ROOT);
  const offenders = [];
  files.forEach((f) => {
    const hits = read(path.relative(ROOT, f)).split('\n');
    hits.forEach((line, i) => {
      if (CDN_RE.test(line)) offenders.push(path.relative(ROOT, f) + ':' + (i + 1) + '  ' + line.trim().slice(0, 70));
    });
  });
  assert.deepStrictEqual(offenders, [], 'في CDN خارجي:\n  ' + offenders.join('\n  '));
});

/* ===== مكتبات التصدير: النسخة المحلية في precache الـSW =====

   ⭐ كان في نسخة مزدوجة لكل مكتبة في vendor/fallback/ (1.76 MB)،
   والـfallback بيشتغل بس لو الملف الرئيسي تالف. النسخة الرئيسية
   نفسها متحطّطة في precache الـservice worker — يعني الـSW هو
   خط الأمان الحقيقي. النسخة المزدوجة كانت بتضاعف حجم التحميل
   على كل جهاز من غير فايدة. اتشالت. */
test('مكتبات التصدير: موجودة على القرص وبتتحمّل عند الطلب — مش في precache', () => {
  const sw = read('sw.js');
  /* ⭐ المكتبات الأساسية (supabase/dexie) لازم تكون في الـprecache:
     لو ماحملتش، التطبيق يفتح «وضع محلي» ويطلع 0 سيارة. */
  ['supabase.min.js', 'dexie.min.js'].forEach((f) => {
    assert.ok(sw.indexOf("'./vendor/" + f + "'") > -1,
      'vendor/' + f + ' لازم يكون في precache الـSW');
    const p = path.join(ROOT, 'vendor', f);
    assert.ok(fs.existsSync(p), 'vendor/' + f + ' مفقود');
    assert.ok(fs.statSync(p).size > 1000, 'vendor/' + f + ' ملف فاضي');
  });
  /* ⭐ مكتبات التصدير (1.4MB) مش في الـprecache عن قصد — بتتحمّل أول
     مرة المستخدم يضغط «تصدير». تحميلها مع كل install كان بيعمل
     1.4MB زيادة على كل موبايل. لازم تكون على القرص بس. */
  ['xlsx.full.min.js', 'html2canvas.min.js', 'jspdf.umd.min.js'].forEach((f) => {
    assert.ok(sw.indexOf("'./vendor/" + f + "'") === -1,
      'vendor/' + f + ' مش المفروض يكون في precache — بيزوّد حجم التحميل');
    const p = path.join(ROOT, 'vendor', f);
    assert.ok(fs.existsSync(p), 'vendor/' + f + ' مفقود');
    assert.ok(fs.statSync(p).size > 1000, 'vendor/' + f + ' ملف فاضي');
  });
  assert.ok(!fs.existsSync(path.join(ROOT, 'vendor', 'fallback')),
    'vendor/fallback/ لازم يكون اتشال — النسخة المزدوجة اتشالت');
  assert.ok(sw.indexOf('vendor/fallback/') === -1,
    'مفيش ملفات fallback في precache الـSW');
  /* ⭐ Leaflet (162KB) كمان lazy — بيتحقن لما خريطة الأقسام تظهر
     بس في modules/dashboard-view.js. تحميله مع كل install كان
     بيحمّل 162KB على كل موبايل عشان أكتر من نص المستخدمين مالهمش
     علاقة بالخريطة أصلاً. */
  ['leaflet.js', 'leaflet.css'].forEach((f) => {
    assert.ok(sw.indexOf("'./vendor/" + f + "'") === -1,
      'vendor/' + f + ' مش المفروض يكون في precache — بيزوّد حجم التحميل');
    assert.ok(fs.existsSync(path.join(ROOT, 'vendor', f)), 'vendor/' + f + ' مفقود');
  });
});

test('مفيش اسم عمومي معرّف في أكتر من ملف', () => {
  /* استثناءات مقصودة ومراجعة:
     - (مفيش استثناءات حاليًا) Supabase عميل واحد بس، بينشأ في
       core/auth-boot.js. */
  const ALLOWED = {};

  const owners = new Map();
  const dups = [];
  appScripts().forEach((src) => {
    const ctx = buildSandbox();
    const before = new Set(Object.keys(ctx));
    try { vm.runInContext(read(src.replace(/^\.\//, '')), ctx, { filename: src }); }
    catch (e) { return; }   /* ملف لوحده بيفشل — مش مسؤولنا هنا */
    Object.keys(ctx).filter((k) => !before.has(k)).forEach((k) => {
      if (['window', 'self', 'globalThis'].indexOf(k) > -1) return;
      if (owners.has(k)) {
        if (!ALLOWED[k]) dups.push(k + ' (' + owners.get(k) + ' و ' + src + ')');
      } else owners.set(k, src);
    });
  });
  assert.deepStrictEqual(dups, [], 'أسماء معرّفة في أكتر من ملف: ' + dups.join(', '));
});

/* ⭐ مفيش دالة معرّفة مرتين جوّه نفس الملف — دي بتخّي الاسم. */
test('مفيش دالة معرّفة مرتين جوّه نفس الملف', () => {
  const files = ['core/render-router.js',
    'core/branches-store.js', 'modules/dashboard.js'];
  files.forEach((f) => {
    const code = read(f);
    const defs = [...code.matchAll(/^\s*function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map((m) => m[1]);
    const dupes = [...new Set(defs.filter((d, i) => defs.indexOf(d) !== i))];
    assert.deepStrictEqual(dupes, [], f + ': دوال معرّفة مرتين: ' + dupes.join(', '));
  });
});

/* ===== _headers: الـJS ما يتخدمش immutable =====

   ⚠️ العطل: كل ملفات الـJS كانت max-age=31536000, immutable — فالمتصفح
   كان بيخزّن sw.js في كاش الـHTTP وما بيلفّش. النتيجة: المستخدم بيضل على
   نسخة قديمة من التطبيق لأسابيع، من غير أي رسالة. يعني إصلاح في الكود
   بيوصل بس لما يمر وقت طويل (أو hard refresh).

   الحل: max-age قصير (5 دقايق) مع must-revalidate — والـSW بيعمل الـprecache
   بنفسه، فمفيش ضرر على الأداء. */
test('_headers: الـJS و الـsw.js ما يتخدمش immutable', () => {
  const h = read('_headers');
  assert.ok(h.length > 0, '_headers مفقود');

  /* مفيش immutable على أي حاجة */
  assert.ok(!/immutable/.test(h),
    'في immutable في _headers — المتصفح مش هيلفّ sw.js أبداً');

  /* الـsw.js لازم no-store صراحة */
  const swRule = /\/sw\.js[\s\S]*?Cache-Control:\s*([^\n]+)/.exec(h);
  assert.ok(swRule, 'مفيش قاعدة لـ /sw.js');
  assert.ok(/no-cache|no-store/.test(swRule[1]),
    '/sw.js لازم no-cache/no-store — غيره مش هيتحدث');

  /* والـJS العام max-age قصير */
  const jsRule = /\/\*\.js[\s\S]*?Cache-Control:\s*([^\n]+)/.exec(h);
  assert.ok(jsRule, 'مفيش قاعدة لـ /*.js');
  const maxAge = /max-age=(\d+)/.exec(jsRule[1]);
  assert.ok(maxAge, 'قاعدة /*.js مفيش فيها max-age');
  assert.ok(Number(maxAge[1]) <= 900,
    'قاعدة /*.js max-age=' + maxAge[1] + ' — طويل أوي، التعديلات مش هتوصل');
});

/* ===== مفيش متغير مستخدم ومش معرّف =====

   ⚠️ العطل: كان مكتوب `const selectedIds=_persistentFleetSelectedIds` في
   modules/fleet-view.js — متغير مش معرّف في أي مكان بالمشروع. النتيجة:
   تبويب «الأسطول» كان بيرمي ReferenceError وقت الرسم، والـcatch كان
   بيرسم emergency fleet. المستخدم شاف السيارات بتتنقل بين التبويبات
   من غير سبب، والتبويب مش بيشتغل صح.

   الفحص ده: أي اسم بيتصرّف كـmodule-level state (بادئ بـ_) لازم يكون
   معرّف في مكان ما في المشروع — أو يكون parameter عادي. */
test('مفيش متغير module-level مستخدم ومش معرّف', () => {
  const files = [];
  const walk = (dir) => {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      /* ⭐ .wrangler فيها بقايا `wrangler dev` (bundles مولّدة آليًا).
         هي مش من المشروع، وفحصها كان بيعمل إخفاقات وهمية على أي
         جهاز development شغّل السيرفر المحلي مرة واحدة. */
      if (['node_modules', 'vendor', '.git', 'tests', '.wrangler', '.wrangler-dryrun'].includes(e.name)) return;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.js$/.test(e.name)) files.push(full);
    });
  };
  walk(ROOT);

  /* كل الأسماء المعرَّفة في المشروع */
  const all = files.map((f) => read(path.relative(ROOT, f))).join('\n');
  const defined = new Set();
  for (const m of all.matchAll(/\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) defined.add(m[1]);
  for (const m of all.matchAll(/\b(?:const|let|var)\s*\{([^}]*)\}/g)) {
    m[1].split(',').forEach((p) => {
      const t = p.split('=')[0].trim().replace(/^\.\.\./, '');
      const n = t.includes(':') ? t.split(':').pop().trim() : t;
      if (/^[A-Za-z_$][\w$]*$/.test(n)) defined.add(n);
    });
  }

  /* أسماء معروفة إنها params أو HTML attributes — مش module state */
  const KNOWN = new Set(['_blank', '_self', '_parent', '_top', '_q', '_to_', '_evt', '_e', '_i', '_k', '_v', '_id', '_el', '_x', '_y', '_a', '_b', '_c', '_d', '_f', '_g', '_h', '_j', '_l', '_m', '_n', '_o', '_p', '_r', '_s', '_t', '_u', '_w']);

  const bad = [];
  files.forEach((f) => {
    const code = read(path.relative(ROOT, f))
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    for (const m of code.matchAll(/(^|[^\w$.])(_[A-Za-z][\w]*)/g)) {
      const name = m[2];
      if (defined.has(name)) continue;
      if (KNOWN.has(name)) continue;
      /* parameter عادي أو destructuring — مش module state */
      if (new RegExp('[(,]\\s*' + name + '\\s*[),=]').test(code)) continue;
      if (new RegExp('[{,]\\s*' + name + '\\s*[:,}]').test(code)) continue;
      /* اسم مستخدم في string — خلّينا نتجاهله */
      bad.push(path.relative(ROOT, f) + ':' + code.slice(0, m.index).split('\n').length + '  ' + name);
    }
  });
  assert.deepStrictEqual(bad, [], 'متغيرات module-level مستخدمة ومش معرّفة:\n  ' + bad.join('\n  '));
});

/* ===== applyRole لازم تكون متاحة خارجياً =====

   ⚠️ العطل: applyRole هي اللي بتحدد أي تبويبات تظهر حسب الدور، وكانت
   محبوسة جوه الـIIFE في audit-theme.js. auth-boot.js كان بيناديها بعد
   ما الدور يتحدّث — والنداء كان بيسقط بصمت، فالتبويبات (المستخدمين /
   سجل النشاط) فاضلت مخفية حتى للمدير.

   الاختبار ده بيقفل العقد: applyRole متاحة على window، وauth-boot
   بيناديها بعد ما الدور يتحدّث. */
test('applyRole متاحة خارجياً وبتتحمل على الدور', () => {
  const at = read('modules/audit-theme.js');
  assert.ok(/window\.yahmaApplyRole\s*=\s*applyRole/.test(at),
    'applyRole مش متاحة على window — التبويبات مش هتظهر حسب الدور');

  const ab = read('core/auth-boot.js');
  const roleAt = ab.indexOf('window.currentRole=role;');
  assert.ok(roleAt > -1, 'مش لاقي سطر تحديد الدور في auth-boot.js');
  const after = ab.slice(roleAt, roleAt + 400);
  assert.ok(/yahmaApplyRole/.test(after),
    'auth-boot.js مش بيطبّق الصلاحيات بعد ما الدور يتحدّث');
});

/* ===== «تقرير سريع عن الأخطاء» متاح لكل الأدوار =====

   «سجل الأخطاء» الكامل مخفي لغير المدير (فيه أسماء ملفات وسطور).
   بس لما حاجة غلط، المستخدم لازم يعرف من غير صلاحيات إدارية.
   فبنضيف زر «تقرير سريع» ظاهر دايماً، بيعرض آخر 10 أخطاء. */
test('تقرير سريع عن الأخطاء — متاح لكل الأدوار', () => {
  const html = read('index.html');
  assert.ok(/id="umt-quick-errors"/.test(html),
    'زر «تقرير سريع» مش موجود في القائمة');

  /* ما ينفعش يكون hidden — زي «سجل الأخطاء» */
  const btn = /<button[^>]*id="umt-quick-errors"[^>]*>/.exec(html);
  assert.ok(btn, 'زر «تقرير سريع» مفقود');
  assert.ok(!/\shidden/.test(btn[0]),
    '«تقرير سريع» لازم يظهر لكل الأدوار — ما ينفعش يكون hidden');

  const ep = read('modules/error-panel.js');
  assert.ok(/function quickReport\s*\(/.test(ep), 'quickReport مفقودة في error-panel.js');
  assert.ok(/quickReport/.test(read('modules/topbar-menu.js')),
    'الزر مش مربوط في topbar-menu.js');
});

/* ===== مقارنة الإصدارات وشارة النسخة الشغالة =====

   ⚠️ العطل: compareVersions كانت بتعمل
      String(a).replace(/\D+/g, '') — ودي بتحذف كل الأرقام غير
      الصفرى، فـ 'yahma-shell-v269' بتتحوّل لـ '' → 0. يعني كل
      الإصدارات بتصير 0 والمقارنة دايمًا false، فلافتة «فيه تحديث
      جديد» عمرها ما ظهرت.

      وكمان الشارة كانت بتعرض نسخة السيرفر (دايماً الأحدث) بدل
      النسخة اللي شغالة على الجهاز — فالمستخدم مش شايف إنه على
      نسخة قديمة. */
test('مقارنة الإصدارات شغالة — والشارة بتعرض النسخة الشغالة', () => {
  const av = read('modules/app-version.js');

  /* لازم ناخد الرقم بعد الـv — مش نحذف كل الأرقام */
  assert.ok(/match\(\/v\(\\d\+\)\/\)/.test(av),
    'استخراج رقم الإصدار لازم يكون match(/v(\\d+)/) — الـreplace كان بيمسح كل الأرقام');
  /* الـreplace القديم كان شيل الأرقام — لازم يتأكد إنه مش في كود */
  const codeOnly = av.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/replace\(\/\\D\+\/g, ''\)/.test(codeOnly),
    'الـreplace اللي بيمسح كل الأرقام لسه موجود في الكود — المقارنة هتفضل دايماً false');

  /* الشارة بتعرض النسخة الشغالة */
  assert.ok(/function runningVersion\s*\(/.test(av), 'runningVersion مفقودة');
  assert.ok(/caches\.open/.test(av) && /match\('sw\.js'\)/.test(av),
    'runningVersion لازم تقرا sw.js من Cache Storage — دي النسخة اللي شغالة');
  assert.ok(/const running = await runningVersion\(\)/.test(av),
    'init() لازم تقرا النسخة الشغالة');
  assert.ok(/compareVersions\(running, latest\)/.test(av),
    'init() لازم تقارن النسخة الشغالة باللي على السيرفر');
  assert.ok(/showUpdateBanner\(\)/.test(av), 'لافتة التحديث لازم تظهر');
});

/* ===== Leaflet: الخريطة ممكن تتشال قبل ما تتحجّ =====

   ⚠️ العطل (من تقرير المستخدم): 75 مرة
      TypeError: Cannot read properties of undefined (reading '_leaflet_pos')

   السبب: بعد 200ms بنعمل invalidateSize() — بس الـdashboard بيترسم
   تاني أحياناً، فـcontainer بيتشال والـmap بيبقى ميت. */
test('Leaflet: invalidateSize بيتحقق إن الخريطة لسه حيّة', () => {
  const dv = read('modules/dashboard-view.js');
  const start = dv.indexOf('setTimeout(()=>{');
  assert.ok(start > -1, 'الـsetTimeout بتاع الخريطة مفقود');
  const body = dv.slice(start, start + 700);
  assert.ok(/invalidateSize/.test(body), 'invalidateSize مفقودة من البلوك');
  assert.ok(/isConnected/.test(body),
    'لازم نتحقق إن الـcontainer لسه في الـDOM قبل invalidateSize');
  assert.ok(/_regionMap\s*!==\s*map/.test(body),
    'لازم نتحقق إن الـmap لسه هو الحالي (مش خريطة قديمة اتشالت)');
});

/* ===== زر الأخطاء العائم =====

   «سجل الأخطاء» جوه قائمة المستخدم، والقائمة على الديسكتوب بتتخصرق
   (أدوات البيانات بتنتقل لمكان تاني) وعلى الموبايل مفيش «سجل الأخطاء»
   أصلاً — فالمستخدم اللي شايف مشكلة مبيعرفش يدور عليها.

   الحل: زر ثابت في الزاوية، بيظهر بس لو فيه أخطاء. */
test('زر الأخطاء العائم موجود ويشتغل', () => {
  const ep = read('modules/error-panel.js');
  assert.ok(/function floatingButton\s*\(/.test(ep), 'floatingButton مفقودة');
  assert.ok(/function syncFab\s*\(/.test(ep), 'syncFab مفقودة');
  assert.ok(/yh-err-fab/.test(ep), 'معرف الزر yh-err-fab مفقود');

  /* الـCSS لازم يكون موجود */
  const cssFiles = fs.readdirSync(path.join(ROOT, 'css')).filter((f) => f.endsWith('.css'));
  const allCss = cssFiles.map((f) => read(path.join('css', f))).join('\n');
  assert.ok(/\.yh-err-fab\{/.test(allCss), 'الـCSS بتاع الزر العائم مفقود');

  /* وبيربط بالنافذة */
  assert.ok(/quickReport\(\)/.test(
    /btn\.addEventListener\('click'[\s\S]{0,200}?\}\);/.exec(ep)[0]
  ), 'الزر العائم مش مربوط بالنافذة');

  /* ⚠️ لازم 'flex' مش '' — الـCSS بيقول display:none، فالـinline
     الفاضي بيسيب الزر مخفي. ده كان يخفي الزر العائم بالكامل. */
  assert.ok(/btn\.style\.display\s*=\s*'flex'/.test(ep),
    'syncFab لازم تحط display=flex — الـinline الفاضي بيسيبه مخفي');
});

/* ===== حارس: تبويب «الاستئجارات» و«المستحقات» لازم يفضلوا موجودين =====

   تبويب «الاستئجارات» و«المستحقات» اتشالوا بالكامل بناءً على طلب
   المستخدم: التبويبات والملفات والجدول في قاعدة البيانات. */
test('تبويب «الاستئجارات» و«المستحقات» اتشالوا بالكامل (مفيش بقايا)', () => {
  const html = read('index.html');
  assert.ok(!/data-tab="rentals"/.test(html), 'زر «الاستئجارات» لسه موجود');
  assert.ok(!/data-tab="dues"/.test(html), 'زر «المستحقات» لسه موجود');
  assert.ok(!/modules\/rentals-store\.js/.test(html), 'متجر الاستئجارات لسه محمَّل');
  assert.ok(!/modules\/rentals\.js/.test(html), 'واجهة الاستئجارات لسه محمَّلة');
  assert.ok(!/modules\/dues\.js/.test(html), 'واجهة المستحقات لسه محمَّلة');

  const rr = read('core/render-router.js');
  assert.ok(!/currentTab === 'rentals'/.test(rr), 'لسه في عرض لتبويب الاستئجارات');
  assert.ok(!/currentTab === 'dues'/.test(rr), 'لسه في عرض لتبويب المستحقات');

  const bs = read('core/branches-store.js');
  assert.ok(!/id:'rentals'/.test(bs), 'الاستئجارات لسه في صلاحيات الأقسام');
  assert.ok(!/id:'dues'/.test(bs), 'المستحقات لسه في صلاحيات الأقسام');

  /* ⭐ «التقارير» رجعت في v295 بملف واحد جديد (modules/reports.js).
     الملفات القديمة الثمانية لازم تفضل مش موجودة — عشان ما نرجعش
     لكود متشعّب تاني. */
  const rc = read('core/render-router.js');
  assert.ok(/currentTab === 'reports'/.test(rc), 'تبويب التقارير مش موصول بالراوتر');
  assert.ok(fs.existsSync(path.join(ROOT, 'modules/reports.js')), 'ملف التقارير الجديد مش موجود');

  ['modules/rentals-store.js', 'modules/rentals.js', 'modules/dues.js',
   'tests/rentals.test.js', 'tests/dues.test.js', 'supabase/rentals.sql',
   'modules/reports-core.js', 'modules/reports-view.js',
   'modules/reports-schedule.js', 'modules/reports-templates.js',
   'core/report-glue.js', 'modules/email-schedule.js']
    .forEach((f) => {
      assert.ok(!fs.existsSync(path.join(ROOT, f)), 'الملف «' + f + '» لسه موجود');
    });
});


/* ===== حارس: الرسم لازم يوصل للـrender الحقيقي =====

   ⚠️ العطل: المستخدم يضغط تبويب، الـcurrentTab بيتغيّر في
      البيانات، بس الشاشة بتفضل على التبويب القديم. مفيش خطأ.

   السبب: window.render مش دالة واحدة — ده سلسلة أغلفة:
     perf-vtable → ops-intel → notifications → audit-theme → [smooth]
   وأي غلاف في الوسط ابتلع النداء بيخلي الرسم يضيع.

   ⚠️ ودرس مهم: لازم نمسك الـfunction object وقت التحميل.
   لو غلّفناه بـfunction(){ return render.apply(...) } فـ`render`
   هيتقرا وقت النداء → هيلاقي نفسه اتبدّل بالأغلفة → حلقة
   لا نهائية (v275). الاختبار ده بيمنع التكرار. */
test('الرسم بيوصل للـrender الحقيقي — مرجع مباشر yahmaRenderNow', () => {
  const rr = read('core/render-router.js');
  /* (1) لازم يبقى فيه مرجع مباشر */
  assert.ok(/window\.yahmaRenderNow\s*=\s*render\s*;/.test(rr),
    'المرجع المباشر لازم يكون: window.yahmaRenderNow = render;');

  /* (2) ممنوع يكون غلاف — الغلاف بيعمل حلقة لا نهائية */
  assert.ok(!/window\.yahmaRenderNow\s*=\s*function/.test(rr),
    'yahmaRenderNow لازم يكون الـfunction object نفسه — مش غلاف دالة');
  assert.ok(!/yahmaRenderNow[^\n]*render\.apply/.test(rr),
    'ممنوع نقرا render.apply جوه yahmaRenderNow — بيعمل حلقة لا نهائية');

  /* (3) الطبقة الخارجية في السلسلة لازم تفضّل المرجع المباشر */
  const pv = read('modules/perf-vtable.js');
  assert.ok(/yahmaRenderNow/.test(pv),
    'perf-vtable لازم يستخدم yahmaRenderNow (الطبقة الخارجية)');
  assert.ok(/realRender\.apply\(this, lastArgs/.test(pv),
    'perf-vtable لازم ينادي realRender في run() و _perfImmediate()');

  /* (4) التنقل بين التبويبات لازم يرسم بالمرجع المباشر */
  const ng = read('modules/nav-guard.js');
  assert.ok(/yahmaRenderNow/.test(ng),
    'nav-guard لازم يستخدم yahmaRenderNow في drawNow()');

  /* (5) smooth.js ما ينفعش يعتمد على requestAnimationFrame — رAF
     ما بتشتغلش لما الصفحة في الخلفية (الموبايل). */
  const sm = read('modules/smooth.js');
  assert.ok(!/requestAnimationFrame\(release\)/.test(sm),
    'smooth.js ما ينفعش يعتمد على rAF لتحرير الرسم المعلّق');
  assert.ok(/pendingThis/.test(sm) && /MAX_BURST/.test(sm),
    'smooth.js لازم ينفّذ الرسم المعلّق (مش بس يسجّله)');
});

/* ===== عمود vehicles.data (JSON) اتمسح =====

   كان عمود jsonb فيه نسخة كاملة من كل حقول السيارة — 4.9 MB
   على 3,960 صف (وخلّى الجدول كله 15 MB). الـ20 مفتاح اللي جواه
   كلهم موجودين أصلاً كأعمدة حقيقية، والدمج في fromVehicleRow
   كان بيخلي العمود هو المرجع (Object.assign({}, extra, base))
   يعني الـJSON ما كانش بيساهم في أي قيمة.

   ⭐ الترتيب ده لازم يفضل زي ما هو: العمود آخر واحد في الـmerge
   عشان هو اللي يفوز. لو اتقلب، الـJSON (القديم) هيغلب تاني. */
test('التطبيق مش بيعتمد على عمود vehicles.data (JSON)', () => {
  const d = read('modules/data.js');

  assert.ok(!/data\s*:\s*full/.test(d),
    'لازم نوقف كتابة النسخة الكاملة في عمود data');
  assert.ok(/data\s*:\s*null/.test(d),
    'عمود data لازم يتفضّى (null) عند الحفظ');
  assert.ok(!/JSON\.parse\(JSON\.stringify\(car\)\)/.test(d),
    'مفيش داعي نبني نسخة JSON من السيارة كلها');

  /* ترتيب الدمج: العمود لازم يفوز */
  assert.ok(/Object\.assign\(\{\}, extra, base\)/.test(d),
    'ترتيب الدمج لازم يفضل: العمود (base) هو المرجع');
});

/* ===== النسخة المضغوطة من الـCSS لازم تكون متSynchronize مع المصدر =====

   ⭐ المشحون هو css/*.min.css (المضغوط)، والمصدر المقروء موجود
   في نفس المجلد للصيانة. الاختبار ده بيولّد المضغوط من المصدر
   ويقارنه — فلو عدّلنا المصدر من غير ما نعيد التوليد، بيقع هنا
   بدل ما المستخدم يشوف صفحة من غير تنسيق. */
test('النسخ المضغوطة من الـCSS متSynchronize مع المصدر', () => {
  const { execFileSync } = require('child_process');
  const cssDir = path.join(ROOT, 'css');
  const sources = fs.readdirSync(cssDir).filter(n => n.endsWith('.css') && !n.endsWith('.min.css'));
  assert.ok(sources.length >= 5, 'ملفات CSS المصدر مفقودة');

  /* نولّد في مجلد مؤقت ونقارن */
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'yahma-css-'))
  const script = path.join(ROOT, 'scripts', 'minify-css.js');
  assert.ok(fs.existsSync(script), 'scripts/minify-css.js مفقود');
  execFileSync(process.execPath, [script, tmp], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 20e6
  });

  /* نقارن كل ملف */
  /* ⭐ بنوحّد الـline endings قبل المقارنة: على Windows الـgit بيفتح
     الملفات بـCRLF، فالمقارنة الحرفية كانت هتفشل على جهاز التطوير
     وتعدّي على CI (Linux/LF) — وده أخطر من الاختبار نفسه. */
  const normEol = (s) => s.replace(/\r\n/g, '\n');
  sources.forEach((name) => {
    const minName = name.replace(/\.css$/, '.min.css');
    const onDisk = fs.readFileSync(path.join(cssDir, minName), 'utf8');
    const fresh = fs.readFileSync(path.join(tmp, minName), 'utf8');
    assert.equal(normEol(onDisk), normEol(fresh),
      'نسخة ' + minName + ' مش متSynchronize مع المصدر — أعد توليدها بـ node scripts/minify-css.js');
  });

  /* index.html لازم يحمّل المضغوط مش المصدر */
  const html = read('index.html');
  sources.forEach((name) => {
    const minName = name.replace(/\.css$/, '.min.css');
    assert.ok(html.indexOf('css/' + minName) > -1, 'index.html لازم يحمّل ' + minName);
    assert.ok(html.indexOf('href="css/' + name + '"') === -1,
      'index.html لسه بيحمّل المصدر ' + name + ' بدل المضغوط');
  });

  /* الـSW لازم يخزّن المضغوط */
  const sw = read('sw.js');
  sources.forEach((name) => {
    const minName = name.replace(/\.css$/, '.min.css');
    assert.ok(sw.indexOf("'./css/" + minName + "'") > -1,
      'الـSW لازم يخزّن ' + minName);
  });

  fs.rmSync(tmp, { recursive: true, force: true });
});

/* ===== توازن وسوم HTML في index.html =====

   ⭐ لازم كل <div> يقابله </div>. لما وسمة قفلت ناقصة، الـHTML
   بيتكسّر: الشريط بيبلع الصفحة كلها (13,552px ارتفاع) والـcontent
   بيتزنق (24px عرض) والأزرار بتتطاير. والاختبارات مش بتمسك ده
   لأن الرسم بيحصل في DOM وهمي.

   ⭐ وكمان: كل script و link مربوط لازم يكون موجود على القرص. */
test('index.html: توازن وسوم HTML + كل الملفات المربوطة موجودة', () => {
  const html = read('index.html');
  /* ⭐ void elements الحقيقية بس. كان فيها 'option' — وده مش void
     في HTML5 (('<option value="x">' من غير </option> بيقفل تلقائيًا
     في المتصفح، بس الفحص مش بيكشف لو اتنقص واحد).第一批 option
     في index.html كانت فعلاً ناقصة قوس الإغلاق والاختبار عدّى. */
  const VOID_TAGS = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'];
  const tags = html.match(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g) || [];
  const stack = [];
  const problems = [];
  tags.forEach((raw) => {
    const m = /^<\/?([a-zA-Z][a-zA-Z0-9]*)/.exec(raw);
    if (!m) return;
    const name = m[1].toLowerCase();
    if (VOID_TAGS.indexOf(name) > -1) return;
    if (raw.charAt(1) === '/') {
      const open = stack.pop();
      if (open !== name) problems.push('closing ' + name + ' does not match ' + (open || 'nothing'));
    } else if (!/\/>$/.test(raw)) {
      stack.push(name);
    }
  });
  if (stack.length) problems.push('open without close: ' + stack.join(', ') + ' (' + stack.length + ')');
  assert.deepStrictEqual(problems, [],
    'HTML tags are not balanced - the page will break:\n  ' + problems.join('\n  '));

  /* every linked file exists */
  const missing = [];
  for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
    if (/^https?:/.test(m[1])) continue;
    if (!fs.existsSync(path.join(ROOT, m[1].replace(/^\.\//, '')))) missing.push(m[1]);
  }
  for (const m of html.matchAll(/<link[^>]+href="([^"]+)"/g)) {
    if (/^https?:|^data:/.test(m[1])) continue;
    if (!fs.existsSync(path.join(ROOT, m[1].replace(/^\.\//, '')))) missing.push(m[1]);
  }
  assert.deepStrictEqual(missing, [],
    'files linked in index.html but missing on disk:\n  ' + missing.join('\n  '));
});



/* ===== الـCSS المضغوط: نفس المعنى مش بس نفس النص =====

   ⭐ المقارنة النصية مكانش كفاية: الـminifier كان بيحذف المسافة
   بين جزأين من الـselector، فـ`.a .b` كانت بتتحوّل لـ`.a.b` —
   معنى مختلف تماماً. الشكل اتكسر والاختبار عدّى.
   ⇒ دلوقتي بنقارن قائمة الـselectors نفسها، واحد واحد. */
test('الـCSS المضغوط: نفس الـselectors (دلالي مش نصّي)', () => {
  const cssDir = path.join(ROOT, 'css');
  const sources = fs.readdirSync(cssDir).filter(n => n.endsWith('.css') && !n.endsWith('.min.css'));
  assert.ok(sources.length >= 5, 'ملفات CSS المصدر مفقودة');

  /* نستخرج الـselectors من نص CSS (نقرا الوسوم والقواعد) */
  const selectorsOf = (cssIn) => {
    /* التعليقات بتتشال — الـminifier بيشيلها كمان */
    const css = cssIn.replace(/\/\*[\s\S]*?\*\//g, ' ');
    const out = [];
    let i = 0;
    while (i < css.length) {
      const brace = css.indexOf('{', i);
      if (brace < 0) break;
      const prelude = css.slice(i, brace);
      let depth = 1, j = brace + 1;
      while (j < css.length && depth > 0) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
      const trimmed = prelude.trim();
      if (!trimmed.startsWith('@')) {
        trimmed.split(',').forEach((sel) => {
          /* نوحّد الشكل: المسافة حوالين > + ~ مش مهمة دلالياً،
             بس المسافة بين جزأين من الـselector (descendant) مهمة
             جدًا — دي اللي كانت بتضيع. */
          const t = sel.trim().replace(/\s+/g, ' ').replace(/\s*([>+~])\s*/g, ' $1 ');
          if (t) out.push(t);
        });
      }
      i = j;
    }
    return out;
  };

  sources.forEach((name) => {
    const minName = name.replace(/\.css$/, '.min.css');
    const src = fs.readFileSync(path.join(cssDir, name), 'utf8');
    const min = fs.readFileSync(path.join(cssDir, minName), 'utf8');
    const a = selectorsOf(src);
    const b = selectorsOf(min);
    assert.strictEqual(b.length, a.length,
      minName + ': عدد الـselectors مختلف (' + b.length + ' vs ' + a.length + ') — الـminifier بياكل قواعد');
    /* نفس الـselectors بالترتيب (المهم: المسافة بين الأجزاء) */
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        assert.fail(minName + ': الـselector اتغير\n  المصدر:   ' + a[i] + '\n  المضغوط: ' + b[i]);
      }
    }
  });
});
