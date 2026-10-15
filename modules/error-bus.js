/* ===== error-bus.js — موزّع الأخطاء المركزي =====

   قبل كده كان المشروع فيه 386 كتلة catch، الـ204 منهم فاضية خالص:
   `catch(_){}`. يعني لو فشل حفظ، أو فشل تصدير، أو فشل تحميل مكتبة،
   أو رجع Supabase بخطأ — الخطأ بيضيع completely ومحدش يعرف.

   ده مش رفاهية: في v171 Supabase مرجّعش وحصل «صفر عربيات» عند
   أمين، والسبب إن كل طبقة كانت ببلع الاستثناء وتكمّل وكأن كل
   حاجة تمام. لو كان في موزّع أخطاء كانicornaime خالص.

   ===== ليه موزّع محلي ومش Sentry =====

   Sentry (أو أي خدمة جاهزة) = CDN تالت-party وقت التشغيل. ده
   بالظبط الدرس اللي اتعلمناه مرتين:
     · v170 الـPDF العربي ببوظ من اعتماد على مكتبة بعيدة
     · v171 Supabase CDN → أمين شاف صفر عربيات على آيفون

   فالمشكلة مش في الإطار نفسه، المشكلة في الاعتماد على طرف تالت
   وقت التشغيل. الموزّع ده:
     · صفر تبعيات — ملف واحد محلي
     · بيشتغل أوفلاين خالص
     · مفيش أي بيانات بتخرج من الجهاز
     · بيشتغل من غير شبكة وبيرفع لما الشبكة ترجع (اختياري)

   ===== Aggregation مش logging =====

   204 موقع هما نفس 5-6 أخطاء متكررة. لو سجّلنا كل واحدة هنغرق
   في ضوضا. فبنجمّع: نفس (الموقع + الرسالة) = سطر واحد بعدّاد.
   التكرار = ضوضاموعروف. واحدة مرة واحدة = إشارة.

   مثال: «catch فاضي × 47 في نفس الدالة» = مش عطل، دهNoise.
   «catch فاضي × 1 في مزامنة» = حداّ호.

   =====	label =====

   التسمية آليّة: اسم الملف + رقم السطر وقت الاستبدال. مستحيل
   يبقى غلط، ومباشر: تفتح الملف على السطر ده. الكود بيتجمّع في
   نافذة سياق 3 سطور مع أول ظهور لكل خطأ، عشان متضطرش تفتح 200
   ملف. */

(function (global) {
  'use strict';

  /* ===== الحدود =====
     السقف مش عشان نوفّر ميموري (السجل صغير)، عشان محدش يعطّل
     التطبيق ب milepost loop يرمي استثناء. */
  var MAX_SIGNATURES = 200;
  var MAX_STACKS_PER_SIGNATURE = 2;
  var SAVE_KEY = 'yahma-error-log-v1';
  var SAVE_MAX = 60;
  /* فوق العدد ده بنوقف تسجيل الـstack بس: الخطأ لسه بيتحسب،
     لكن مش بنخزّن 200 نسخة من نفس الـstack. */
  var STACK_FREEZE_AFTER = 400;
  var PERSIST_WINDOW_MS = 24 * 60 * 60 * 1000;

  var sigs = new Map();
  var listeners = [];
  var enabled = true;
  var totalCaptured = 0;
  var lastFlush = 0;

  /* yahmaErr هي الاسم القصير اللي الـ204 catch بيستخدموه.
     نعمله stub في index.html قبل أي سكريبت تاني، فحتى لو ملف
     ده اتحمّل بعد سكربت بيبلع استثناء، الاستدعاء يبقى no-op
     بدل ما يطلع ReferenceError جديد من جوه catch. */
  function capture(err, label, meta) {
    if (!enabled) return;
    try { record(err, label, meta); }
    catch (_) { /* نسيب الموزّع نفسه يمسح أخطاءه — مفيش recourse */ }
  }

  function messageOf(err) {
    if (err === null || err === undefined) return 'unknown';
    if (typeof err === 'string') return err;
    if (err instanceof Error) return err.name + ': ' + (err.message || '(no message)');
    try {
      if (typeof err === 'object' && err.message) return String(err.message);
      return String(err);
    } catch (_) { return 'unserialisable'; }
  }

  /* نطبّع الرسالة عشان الأرقام اللي بتتغير (timestamps, ids)
     ما تعملش مليون سطر مختلف. الأرقام الطويلة بتتقص. */
  function normalise(msg) {
    var s = String(msg || '').slice(0, 200);
    s = s.replace(/\b\d{6,}\b/g, '#');
    s = s.replace(/0x[0-9a-f]+/gi, '#');
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  }

  function stackOf(err) {
    if (err && typeof err === 'object' && err.stack) {
      return String(err.stack).split('\n').slice(0, 4).join('\n');
    }
    /* مفيش stack = Promise rejection أو قيمة مرمية عادية.
       new Error هنا عشان نعرف من أي سطر اتنادى الـcapture. */
    try {
      var e = new Error('capture site');
      return String(e.stack || '').split('\n').slice(1, 4).join('\n');
    } catch (_) { return ''; }
  }

  function record(err, label, meta) {
    var msg = normalise(messageOf(err));
    var where = String(label || 'unknown');
    var sig = where + ' || ' + msg;
    var now = Date.now();

    var entry = sigs.get(sig);
    if (entry) {
      entry.count++;
      entry.last = now;
      if (meta !== undefined) entry.lastMeta = meta;
      /* بنوقف تخزين الـstack بعد حد، بس العداد بيكمّل —
         الأهم في السلوك المتكرر هو العددمش الـstack. */
      if (entry.stacks.length < MAX_STACKS_PER_SIGNATURE && entry.count < STACK_FREEZE_AFTER) {
        var st = stackOf(err);
        if (st) entry.stacks.push({ at: now, text: st });
      }
    } else {
      if (sigs.size >= MAX_SIGNATURES) {
        /* السقف اتملى: نمسح أقدم واحد عشان الجديد يدخل. */
        var oldestKey = null, oldestAt = Infinity;
        sigs.forEach(function (v, k) { if (v.last < oldestAt) { oldestAt = v.last; oldestKey = k; } });
        if (oldestKey) sigs.delete(oldestKey);
      }
      entry = { sig: sig, label: where, message: msg, count: 1, first: now, last: now,
                stacks: [], lastMeta: meta };
      var s0 = stackOf(err);
      if (s0) entry.stacks.push({ at: now, text: s0 });
      sigs.set(sig, entry);
    }

    totalCaptured++;
    emit(entry);
    schedulePersist();
  }

  function emit(entry) {
    if (!listeners.length) return;
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](entry); } catch (_) {}
    }
  }

  /* ===== الاستمرارية =====
     إعادة تحميل الصفحة تمسح الذاكرة. بنحفظ أفضل 60 سطر في
     localStorage عشان المستخدم يلاقي الأمس كمان. الكتابة
     مؤجلة (debounce) عشان 200 catch في حلقة رسم ما تكتبش
     localStorage 200 مرة. */
  var flushTimer = null;
  function schedulePersist() {
    if (flushTimer) return;
    flushTimer = global.setTimeout(function () { flushTimer = null; persist(); }, 1500);
  }
  function persist() {
    var now = Date.now();
    var list = all().filter(function (e) { return now - e.last < PERSIST_WINDOW_MS; });
    if (list.length > SAVE_MAX) list = list.slice(0, SAVE_MAX);
    try { global.localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, at: now, list: list })); }
    catch (_) {}
  }
  function restore() {
    try {
      var raw = global.localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (!data || !Array.isArray(data.list)) return;
      var now = Date.now();
      data.list.forEach(function (e) {
        if (!e || typeof e.sig !== 'string') return;
        if (now - (e.last || 0) > PERSIST_WINDOW_MS) return;
        if (sigs.has(e.sig)) return;
        sigs.set(e.sig, { sig: e.sig, label: e.label, message: e.message,
          count: e.count || 1, first: e.first || now, last: e.last || now,
          stacks: Array.isArray(e.stacks) ? e.stacks.slice(0, MAX_STACKS_PER_SIGNATURE) : [],
          restored: true });
      });
    } catch (_) {}
  }

  /* ===== الاستعلام ===== */
  function all() {
    var out = [];
    sigs.forEach(function (v) { out.push(v); });
    return out.sort(function (a, b) {
      if (b.count !== a.count) return b.count - a.count;
      return b.last - a.last;
    });
  }
  function recent(limit) {
    var l = limit || 50;
    return all().slice(0, l);
  }
  function summary() {
    var now = Date.now();
    var list = all();
    var lastHour = list.filter(function (e) { return now - e.last < 3600000; });
    var sum = list.reduce(function (n, e) { return n + e.count; }, 0);
    return { signatures: list.length, total: sum,
             lastHourSignatures: lastHour.length,
             lastHourTotal: lastHour.reduce(function (n, e) { return n + e.count; }, 0),
             since: now };
  }

  function clear() {
    sigs.clear();
    totalCaptured = 0;
    try { global.localStorage.removeItem(SAVE_KEY); } catch (_) {}
    emit(null);
  }

  function on(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    return function off() {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

/* غلاف جاهزل callbacks بتقفل Syntax. نادر، بس بيوفّر سطرين. */
  function guard(fn, label) {
    return function () {
      try { return fn.apply(this, arguments); }
      catch (err) { capture(err, label || (fn.name || 'guard')); }
    };
  }

  /* ===== الالتقاط العام =====
     الأخطاء اللي بترمي نفسها في promise مش متحmittش بتاعة
     catch — دي بتضيع بالكامل من غير ده. */
  function installGlobalHandlers() {
    if (global.__yahmaErrorBusInstalled) return;
    global.__yahmaErrorBusInstalled = true;
    global.addEventListener('error', function (ev) {
      /* أخطاء تحميل الصور/السكريبتات بتيجي بـmessage=
     ودون stack — بنمسجلها برضو، دي بالظبط نفسه «محمولات محرومة» التي بتضع.
         «الصور 404» اللي بتضيع. */
      capture(ev.error || ev.message, 'global:error');
    });
    global.addEventListener('unhandledrejection', function (ev) {
      var r = ev.reason;
      capture(r, 'global:unhandledrejection', { hint: 'وعد مرفوض بدون catch' });
    });
  }

  global.YahmaErrors = {
    capture: capture,
    guard: guard,
    on: on,
    all: all,
    recent: recent,
    summary: summary,
    clear: clear,
    persist: persist,
    installGlobalHandlers: installGlobalHandlers,
    SAVE_KEY: SAVE_KEY,
    MAX_SIGNATURES: MAX_SIGNATURES
  };

  /* الاسم القصير اللي بتستخدموه الـcatch المدمجة.
     لو ملف ده اتحمّل متأخر، الـstub اللي في index.html بيمنع
     أي ReferenceError. */
  global.yahmaErr = capture;

  installGlobalHandlers();
  restore();
})(typeof window !== 'undefined' ? window : globalThis);