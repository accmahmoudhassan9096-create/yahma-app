/* ===== undo.js — التراجع عن الحذف الجماعي =====

   الحذف الجماعي كان في اتجاه واحد: تضغط «حذف المحددة» → تأكيد →
   اختفاء كل شي. أي اختيار غلط (192 سيارة بدل 19) كان معناه إن
   البيانات رايحة نهائيًا، والرجوع الوحيد كان استعادة نسخة احتياطية
   يدوية.

   هنا بنصوّر السجلات قبل الحذف ونخزّنها في الذاكرة، وبعدها زر
   «تراجع» بيرجّعها ويكتبها تاني في Supabase.

   ليه الذاكرة وليه localStorage:
     - الحذف بيمسح الصف من Supabase فورًا، فالرجوع لازم يكون أسرع من
       إعادة المزامنة.
     - بس ما نخزّنش الأسطول كله في الذاكرة (3,984 سيارة = بصمات
       تقيلة). بنخزّن آخر 5 عمليات حذف بس — أكتر من أي تسلسل واقعي.
     - localStorage مش مطلوب هنا: إعادة فتح الصفحةبتعمل إعادة جلب
       كاملة من السحابة، والنسخة القديمة ما بقت موجودة هناك أصلًا.

   نقطة التركيب: كل حذف سيارات في التطبيق — الفرع، المتابعة، الفحص،
   التجديدات، التحويلات، ومستورد المباع — يعدّي من
   removeSoldVehiclesByPlates(). recording there يغطي التلاتة والتمان
   نداءات كلها بسطر واحد، بدل ما نduplicate التصوير في كل موديل. */

(function (global) {
  'use strict';

  /* أقصى عدد عمليات نحتفظ بيها للتراجع.
     5 أكبر من أي تسلسل حذف واقعي، وسقف للذاكرة. */
  var MAX_ENTRIES = 5;

  /* بقاء الـ toast على الشاشة بعد الحذف.
     طويل كفاية إنك تشوفه، وقصير إنه ما يعطّلكش. */
  var TOAST_MS = 20000;

  var stack = [];
  var toastTimer = null;
  var placeTimer = null;
  var busy = false;

  function clone(obj) {
    try { return JSON.parse(JSON.stringify(obj)); } catch (_) { return null; }
  }

  function fleetList() {
    /* الحارس الأساسي: الحذف بيشتغل على المتغير العام `fleet`
       (let في branches-store.js)، وده lexical scope مشترك مع كل
       سكربت. لو المرجع اختفى نرجع للقائمة اللي السياق بيحتفظ بيها. */
    try {
      if (Array.isArray(typeof fleet !== 'undefined' ? fleet : null)) return fleet;
    } catch (_) {}
    try {
      var ctx = global.YahmaAppContext;
      if (ctx && typeof ctx.getFleet === 'function') {
        var list = ctx.getFleet();
        if (Array.isArray(list)) return list;
      }
    } catch (_) {}
    return [];
  }

  function setFleetList(list) {
    /* نمرّ عبر السياق لأنه هو اللي بيطبّق نطاق الفرع على أي
       قائمة جديدة (scopeFleetToUser). الكتابة المباشرة على `fleet`
       كانت هتتجاوز ده. */
    try {
      var ctx = global.YahmaAppContext;
      if (ctx && typeof ctx.setFleet === 'function') { ctx.setFleet(list); return; }
    } catch (_) {}
    fleet = list;
    global.fleet = list;
  }

  /* ===== تسجيل عملية حذف (قبل تنفيذها) =====
     cars: السجلات الكاملة كما هي دلوقتي
     meta: { source } لو حبيتنا نعرف جه الحذف منه */
  function record(cars, meta) {
    if (!Array.isArray(cars) || !cars.length) return 0;
    var snap = [];
    cars.forEach(function (car) {
      var copy = clone(car);
      /* السجل اللي فشل النسخ منه يُتجاهل — أحسن نرجّع أقل من نرجّع
         سجل ناقص الحقول وفيه تواريخ غلط. */
      if (copy && copy.id !== undefined && copy.id !== null) snap.push(copy);
    });
    if (!snap.length) return 0;
    stack.push({ cars: snap, at: Date.now(), source: (meta && meta.source) || '' });
    while (stack.length > MAX_ENTRIES) stack.shift();
    syncMenu();
    showToast(snap.length);
    return snap.length;
  }

  function has() { return stack.length > 0; }
  function peek() { return stack.length ? stack[stack.length - 1] : null; }
  function clear() { stack.length = 0; hideToast(); syncMenu(); }

  /* ===== التراجع الفعلي =====
     الترتيب مهم: نضيف للمجموعة أولًا، وبعدين نحفظ. لو الحفظ فشل
     السجلات تفضل في الذاكرة (المستخدم شايفها) وننبه إن السحابة
     مانست. العكس — نحفظ ونفشل — هيسيب السحابة والأرقام مختلفين. */
  async function undo() {
    if (busy) return false;
    var entry = peek();
    if (!entry) { try { global.alert('مفيش عملية حذف للتراجع عنها.'); } catch (_) {} return false; }

    var perms = global.YahmaPerms;
    if (perms && typeof perms.canManage === 'function' && !perms.canManage()) {
      try { global.alert(perms.denyMessage('التراجع عن الحذف')); } catch (_) {}
      return false;
    }

    busy = true;
    hideToast();
    try {
      var current = fleetList();
      var present = new Set(current.map(function (c) { return String(c.id); }));
      /* لو الحذف مانفّش كامل (فشل Supabase مثلًا) ممكن تكون بعض
         السجلات موجودة. نرجّع الناقص بس — التكرار أسوأ من النقص. */
      var toRestore = entry.cars.filter(function (c) { return !present.has(String(c.id)); });

      if (!toRestore.length) {
        stack.pop(); syncMenu();
        try { global.alert('السيارات دي موجودة بالفعل.'); } catch (_) {}
        return false;
      }

      setFleetList(current.concat(toRestore));
      var ids = toRestore.map(function (c) { return c.id; });
      var saved = false;
      try {
        if (typeof global.saveData === 'function') saved = await global.saveData(ids);
        else if (global.YahmaData && typeof global.YahmaData.saveData === 'function') {
          var ctx = global.YahmaAppContext;
          saved = await global.YahmaData.saveData(ids, ctx);
        }
      } catch (err) {
        console.error('YahmaUndo save failed', err);
        saved = false;
      }

      stack.pop();
      syncMenu();
      try { if (typeof global.render === 'function') global.render(); } catch (_) {}

      /* صيغة محايدة زي باقي رسائل التطبيق («تم الحفظ»، «سيتم حذف»).
     «رجّعنا» كانت بتخلّي التطبيق يتكلم بصيغة المتكلم خلافًا لباقي
     الواجهة، فأصبحت محايدة. */
      var msg = 'تم استرجاع ' + toRestore.length + ' سيارة ورجوعها للأسطول.';
      if (saved === false) {
        msg += '\nتحذير: الاسترجاع تم على الجهاز بس، السحابة مانستش — أعد المحاولة بعد الاتصال.';
        try { global.alert(msg); } catch (_) {}
      } else {
        try { global.alert(msg); } catch (_) {}
      }
      try {
        if (typeof global.log === 'function') global.log('تراجع', 'استرجاع ' + toRestore.length + ' سيارة');
      } catch (_) {}
      return true;
    } finally {
      busy = false;
    }
  }

  /* ===== واجهة المستخدم ===== */

  function plateList(cars, max) {
    var names = cars.slice(0, max).map(function (c) { return c.plate || '—'; });
    var line = names.join('، ');
    if (cars.length > max) line += ' … (+' + (cars.length - max) + ')';
    return line;
  }

  function showToast(count) {
    hideToast();
    if (!global.document || !global.document.body) return;
    var entry = peek();
    if (!entry) return;

    var box = global.document.createElement('div');
    box.id = 'yx-undo-toast';
    box.className = 'yx-undo-toast';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    /* مدة الشريط بتقرأ من نفس رقم المؤقّت في JS — رقم واحد لمصدرين
       بياخدوا وقت، عشان ما يحصلش اختلاف بين اللي يتحرك واللي يختفي. */
    box.style.setProperty('--yx-undo-ms', TOAST_MS + 'ms');

    var icon = global.document.createElement('span');
    icon.className = 'yx-undo-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '🗑';

    var text = global.document.createElement('span');
    text.className = 'yx-undo-text';
    text.textContent = 'تم حذف ' + count + ' سيارة — ' + plateList(entry.cars, 3);

    var btn = global.document.createElement('button');
    btn.type = 'button';
    btn.className = 'yx-undo-btn';
    btn.textContent = 'تراجع';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      btn.disabled = true;
      btn.textContent = 'جاري التراجع…';
      undo();
    });

    var close = global.document.createElement('button');
    close.type = 'button';
    close.className = 'yx-undo-x';
    close.setAttribute('aria-label', 'إغلاق');
    close.textContent = '×';
    close.addEventListener('click', function (e) { e.preventDefault(); hideToast(); });

    var bar = global.document.createElement('span');
    bar.className = 'yx-undo-bar';

    box.appendChild(icon);
    box.appendChild(text);
    box.appendChild(bar);
    box.appendChild(btn);
    box.appendChild(close);
    global.document.body.appendChild(box);

    /* أنيميشن التقدم بيبدأ بعد أول frame عشان التحويل يتطبّق. */
    try {
      global.requestAnimationFrame(function () {
        global.requestAnimationFrame(function () { bar.style.transform = 'scaleX(0)'; });
      });
    } catch (_) {
      bar.style.transition = 'none';
      bar.style.transform = 'scaleX(0)';
    }

    toastTimer = global.setTimeout(hideToast, TOAST_MS);
    place();
    /* شريط «تحديث قسري» ممكن يظهر بعدنا أو يتغيّر ارتفاعه،
       فنقيس ونزيح شريطنا فوقه لحد ما يختفي واحد فيهم. */
    placeTimer = global.setInterval(place, 400);
  }

  /* شريطان بيقعدوا في نفس الحارة أسفل الشاشة. لو شريط التحديث
     ظاهر، بنرفع شريط التراجع فوقه بمقدار ارتفاعه + فاصل — عشان ما
     يغطّي بعض ومستخدم مايشوفش زرار «تراجع». */
  function place() {
    var box = global.document && global.document.getElementById('yx-undo-toast');
    if (!box) return;
    var other = global.document.getElementById('yahma-update-toast');
    var lift = 0;
    if (other && other !== box) {
      var ocs = global.getComputedStyle(other);
      var visible = ocs.display !== 'none' && ocs.visibility !== 'hidden'
        && global.parseFloat(ocs.opacity || '1') > 0.05;
      if (visible) {
        var r = other.getBoundingClientRect();
        if (r.height > 0) lift = r.height + 10;
      }
    }
    box.style.bottom = (lift > 0
      ? 'calc(' + (18 + lift) + 'px + env(safe-area-inset-bottom,0px))'
      : '');
  }

  function hideToast() {
    if (toastTimer) { global.clearTimeout(toastTimer); toastTimer = null; }
    if (placeTimer) { global.clearInterval(placeTimer); placeTimer = null; }
    var box = global.document && global.document.getElementById('yx-undo-toast');
    if (box && box.parentNode) box.parentNode.removeChild(box);
  }

  /* زر قائمة المستخدم: «تراجع آخر حذف» — بيظهر بس لما يكون في
     حاجة للتراجع، عشان ما يبقى عنصر ميت في القائمة طول الوقت. */
  function syncMenu() {
    if (!global.document) return;
    var item = global.document.getElementById('umt-undo');
    if (!item) return;
    var entry = peek();
    if (!entry) { item.hidden = true; return; }
    item.hidden = false;
    var label = global.document.getElementById('umt-undo-label');
    if (label) label.textContent = 'تراجع آخر حذف (' + entry.cars.length + ')';
  }

  function bind() {
    if (global.__yahmaUndoBound) return;
    global.__yahmaUndoBound = true;

    var item = global.document.getElementById('umt-undo');
    if (item) {
      item.addEventListener('click', function (e) {
        e.preventDefault();
        if (typeof global.closeMenu === 'function') { try { global.closeMenu(); } catch (_) {} }
        undo();
      });
    }

    /* Ctrl+Z / ⌘Z: بيشتغل بس خارج حقول الكتابة، عشان ما نعطّلش
       تراجع المستخدم العادي جوّه نص أو Excel. */
    global.addEventListener('keydown', function (e) {
      if (!(e.ctrlKey || e.metaKey) || String(e.key).toLowerCase() !== 'z') return;
      if (e.shiftKey) return;
      var el = e.target;
      var tag = el && el.tagName ? String(el.tagName).toUpperCase() : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (el && el.isContentEditable)) return;
      if (!has()) return;
      e.preventDefault();
      undo();
    });

    /* فتح قائمة المستخدم لازم يحدّث عدّاد «تراجع» فورًا. */
    global.addEventListener('yahma:menu-open', syncMenu);
    setInterval(syncMenu, 5000);
  }

  global.YahmaUndo = {
    record: record,
    undo: undo,
    has: has,
    peek: peek,
    clear: clear,
    syncMenu: syncMenu,
    size: function () { return stack.length; },
    MAX_ENTRIES: MAX_ENTRIES,
    __busy: function () { return busy; }
  };

  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', bind);
    } else {
      bind();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);