/* ===== شبكة أمان قبل تقسيم الملفات الكبيرة =====

   الهدف: نقدر نفكّ `modules/reports.js` (1657 سطر) و
   `core/render-router.js` (1503) من غير ما نكسر حاجة، وقاعدة
   البيانات تقوللنا لو كسرنا.

   الاختبار ده بيعمل ٣ حاجات:

   ❶ بيحمّل **كل** سكربتات التطبيق في رمل واحد (vm)، **بنفس ترتيب
      index.html بالظبط**. لو ملف اتنقل لمكان غلط في الترتيب، أو
      ملف فيه خطأ صياغة، أو ملف ناقص — الاختبار بيقع هنا.
      (ترتيب التحميل مش رفاهية: `core/permissions.js` لازم يتحمّل
      قبل `core/auth-boot.js`، و`modules/rentals-store.js` قبل
      `modules/rentals.js`، إلخ.)

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
  return [...html.matchAll(/<script\s+src="([^"]+)"/g)]
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
  ctx.fleet = [];
  const tabs = ctx.ALL_YAHMA_TABS || [];
  assert.ok(tabs.length >= 10, 'التبويبات مش محمّلة — ALL_YAHMA_TABS فاضي');

  const errors = [];
  tabs.forEach((tab) => {
    try {
      ctx.yahmaSetTab(tab);
      ctx.currentTab = tab;
      if (typeof ctx.render === 'function') ctx.render();
    } catch (e) {
      errors.push(tab + ' → ' + (e && e.message ? e.message : String(e)).slice(0, 120));
    }
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
test('الدوال اللي اتقسمت مازالت متاحة بنفس الأسماء', () => {
  const { ctx } = loadApp();
  const R = ctx.YahmaReports;
  assert.ok(R, 'YahmaReports مش موجود');
  /* الدوال اللي في الخط الأساس بتوع التقارير */
  ['periodBounds', 'periodLabel', 'periodDate', 'inPeriod', 'accountingIndicators',
    'aggregateReport', 'formatCurrency', 'reportFileName', 'reportTextSummary',
    'formalReportHtml', 'infographicFileName', 'infographicTextSummary',
    'infographicDonut', 'infographicDonutLegend', 'infographicHtml',
    'isoLocal', 'storageRead', 'persistState', 'getPresets',
    'go', 'exportExcel', 'preparePdf'
  ].forEach((fn) => {
    assert.strictEqual(typeof R[fn], 'function', 'YahmaReports.' + fn + ' مش موجودة');
  });
  assert.strictEqual(typeof R.render, 'function', 'YahmaReports.render مش موجودة');
});

/* ⭐ تقسيم واجهة اللوحة ما_addedش حاجة للواجهة العامة.

   واجهة التقReports اتقسمت لـ view و schedule. الدوال الجديدة دي
   داخلية (بتاخد ctx من renderReports) — المفروض ما تظهرش على
   window غير كـnamespace، وما تاخدش مفتاح جديد في YahmaReports. */
test('تقسيم الواجهة ما ضفش مفتاح جديد للـAPI العام', () => {
  const { ctx } = loadApp();
  const R = ctx.YahmaReports;
  assert.strictEqual(Object.keys(R).length, 26,
    'YahmaReports بقى ' + Object.keys(R).length + ' مفتاح بدل 26: ' + Object.keys(R).join(', '));

  /* الأسماء اللي اتنقلت لازم تكون موجودة في ملفاتها الجديدة */
  assert.deepStrictEqual(Object.keys(ctx.YahmaReportsView).sort(),
    ['bindOwnerRows', 'bindReportControls', 'bindReportRows', 'openDrill', 'reportsTemplate']);
  assert.deepStrictEqual(Object.keys(ctx.YahmaReportsSchedule).sort(),
    ['bindExcelExport', 'bindPdfButtons', 'bindScheduleUI']);

  /* وrenderReports لازم تفضل هي اللي بتتعرض — المنفذ الوحيد للتقارير.
     (دي مش نفس كائن window.renderReports: دي غلاف الـrouter، والمنفذ
      جوه الـIIFE. الاتنين موجودين قبل وبعد التقسيم.) */
  assert.strictEqual(typeof R.render, 'function', 'YahmaReports.render لازم تفضل دالة');
  assert.strictEqual(typeof ctx.renderReports, 'function', 'renderReports العالمية ناقصة');
});

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
test('الدوال المنقولة للعرض بتاخد ctx صريح', () => {
  const { ctx } = loadApp();
  [['YahmaReportsView', 'reportsTemplate'], ['YahmaReportsView', 'bindReportControls'],
    ['YahmaReportsView', 'bindReportRows'], ['YahmaReportsView', 'bindOwnerRows'],
    ['YahmaReportsSchedule', 'bindScheduleUI'], ['YahmaReportsSchedule', 'bindExcelExport'],
    ['YahmaReportsSchedule', 'bindPdfButtons']].forEach(([ns, fn]) => {
    const f = ctx[ns][fn];
    assert.strictEqual(typeof f, 'function', ns + '.' + fn + ' ناقصة');
    assert.strictEqual(f.length, 1, ns + '.' + fn + ' المفروض تاخد ctx واحد');
  });
  /* openDrill بتاخد ctx + عنوان + سيارات */
  assert.strictEqual(ctx.YahmaReportsView.openDrill.length, 4,
    'openDrill المفروض (ctx, title, cars, extraCol)');
});

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
    'renderReports', 'canRunPayments', 'formatArabicDate', 'goTabFromRouter',
    'downloadBranchStatusTemplate', 'handleBranchStatusImport', 'emailBranch', 'whatsappBranch',
    'openBranchModal', 'buildDonut', 'buildStackedBar', 'buildYearChart', 'buildOwnerChart',
    'getPrepTasks', 'savePrepTask', 'prepStatusForCar', 'prepChecklistForCar',
    'loadInspectionPayments', 'loadPaidInspections', 'loadRenewedInspections'
  ].forEach((fn) => {
    assert.strictEqual(typeof ctx[fn], 'function', fn + ' مش function بعد التقسيم');
  });
  /* واللي المفروض تستدعي الدوال دي من ملفات تانية لازم تفعلها */
  ctx.currentRole = 'admin'; ctx._demoMode = false; ctx.fleet = [];
  ['payments', 'paid', 'renewed', 'branches', 'audit', 'preparation'].forEach((tab) => {
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
    'core/router-payments.js', 'core/router-charts.js', 'core/router-branches.js'
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
  ['core/router-payments.js', 'core/router-charts.js', 'core/router-branches.js'].forEach((f) => {
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

/* ⭐ النسخة الاحتياطية للمكتبات موجودة فعلاً على القرص.

   من غيرها، فشل التحميل المحلي هيخلّي التصدير/الخريطة يفشلوا صامتين. */
test('النسخة الاحتياطية للمكتبات موجودة في vendor/fallback', () => {
  const NEEDED = [
    'supabase.min.js', 'dexie.min.js', 'xlsx.full.min.js',
    'html2canvas.min.js', 'jspdf.umd.min.js', 'leaflet.js', 'leaflet.css'
  ];
  const sw = read('sw.js');
  NEEDED.forEach((f) => {
    const p = path.join(ROOT, 'vendor', 'fallback', f);
    assert.ok(fs.existsSync(p), 'vendor/fallback/' + f + ' مش موجود');
    assert.ok(fs.statSync(p).size > 1000, 'vendor/fallback/' + f + ' فاضي أو ناقص');
    assert.ok(sw.indexOf("'./vendor/fallback/" + f + "'") > -1,
      'vendor/fallback/' + f + ' مش في precache الـSW');
  });
});

test('مفيش اسم عمومي معرّف في أكتر من ملف', () => {
  /* استثناءات مقصودة ومراجعة:
     - supabaseClient: cloud.js بيعمل `window.supabaseClient || createClient(...)`
       وبيرجّع نفس العميل تاني — نفس الـURL ونفس المفتاح (تحققت).
       فمش تعارض، وبيبقى آمن مهما كان الترتيب. */
  const ALLOWED = { supabaseClient: 'cloud.js بيعيد استخدام نفس العميل — نفس الرابط والمفتاح' };

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
  const files = ['modules/reports.js', 'core/render-router.js', 'modules/rentals.js',
    'modules/rentals-store.js', 'core/branches-store.js', 'modules/dashboard.js'];
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
      if (['node_modules', 'vendor', '.git', 'tests'].includes(e.name)) return;
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
