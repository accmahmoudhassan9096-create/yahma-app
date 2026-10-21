/* ===== offline-queue.js — إعادة إرسال ما فشل وهو أوفلاين =====

   الحفظ العادي بيمشي في 3 خطوات: localStorage ← Dexie ← Supabase.
   لو التالتة فشلت، الداتا كانت بتفضل على الجهاز بس. وأول ما
   المستخدم يفتح التطبيق تاني، loadData بيجيب من السحابة ويمسح
   المحلي بمحتواها — فاللي اتعدّل وهو أوفلاين بيروح.

   ده مش تخيفي. الموبايل بقطع النت في نص تعبئة فحص، ورخلة
  Ark، وأول حاجة المستخدم بيعملها بعدين إنه يمسح التطبيق أو
  يفتحه تاني.

   ===== اللي بيعمله الملف ده =====

   • saveData بيمرّر الصفوف اللي فشلت هنا، ونخزّنها
   • لما الشبكة ترجع (أو الـtab يبقى ظاهر، أو كل دقيقة) بنبعتها تاني
   • اللي بعت بنمسحه، اللي فشل بيفضل مستني

   ===== قرار تصميمي: coalescing =====

   لو عدّلت نفس السيارة 10 مرات وهوفلاين، الطابور فيه **سطر واحد**
   فيه آخر حالة. مش 10 سطور. السبب إن الطابور ده بيبعت بعدين،
   والـupsert بيبقى على آخر حالة برضه — فإرسال 10 نسخالقديمة مفيش
   فايدة غير إبطاء الشبكة. (المفتاح carId بيعمل ده مجاناً.)

   ===== ليه بنقفل متكرّرة =====

   failed flush مايعيدش queue. لو عملنا كده كان عندنا حلقة: الفشل
   بيحط في الطابور ← التفريغ بيفشل ← يحط تاني ← للأبد. الطابور
   بياخد من المسار الفاشل بس (queue)، مش من مسار الإرسال نفسه. */

(function (global) {
  'use strict';

  var TABLE = 'vehicles';
  var CHUNK = 200;
  /* كل دقيقة: لو فيهمعلوق pending والشبكة متاحة، جرّب تاني.
     الدقيقة دي مقصودة — أرخص من ده يبقى constant polling،
     وأسرع من ده المستخدم يفضل مستني. */
  var FLUSH_EVERY_MS = 60000;
  /* بعد الفشل، استنى قبل المحاولة الجاية.
     من غير backoff، الشبكة المقطوعة بتخلي التطبيق يحاول كل
     ثانية ويفشل كل مرة — بطء مصرّح ياكل البطارية. */
  var BACKOFF_MS = [0, 5000, 15000, 45000, 120000];
  var MAX_BACKOFF = 120000;

  var flushing = false;
  var attempts = 0;
  var timer = null;
  var lastResult = { ok: false, sent: 0, failed: 0, at: 0, error: '' };
  var listeners = [];

  function DB() { return global.YahmaDB || null; }

  function online() {
    if (typeof navigator === 'undefined') return true;
    /* navigator.onLine=false مينفعش نثق بيه (بيبقى trueواس نت
       مقطوع فعلاً)، بس true مش دليل على حاجة. بنحاول ندفع
       برضه؛ لو فشل الـbackoff بياخد الباقي. */
    return navigator.onLine !== false;
  }

  function notify() {
    var payload = snapshot();
    listeners.forEach(function (fn) { try { fn(payload); } catch (_) {} });
  }

  function snapshot() {
    return {
      online: online(),
      flushing: flushing,
      attempts: attempts,
      last: lastResult,
      count: lastResult.count || 0
    };
  }

  /* ===== الحفظ في الطابور =====
     نقطة الدخول الوحيدة. بتاخد صفوف vehicles زي ما هي
     (نفس الشكل اللي الـupsert بياخده) فالإرسال بعدين مفيش
     حاجة تت تحويلات. */
  async function enqueue(rows, reason) {
    var db = DB();
    if (!db || typeof db.queuePending !== 'function') return 0;
    var n = await db.queuePending(rows, reason);
    if (n > 0) {
      /* نقرأ العدد الكلي من الداتابيز مش نزيد عدّاد في الذاكرة —
         عشان لو فيه صفوف قديمة من جلسة سابقة، العدّاد يبقى صحيح
         من أول مرة. */
      await refreshCount();
      notify();
      /* بنجرّب فورًا: يمكن الشبكة رجعت فعلاً والمحفوظ فشل بسبب
         سبب تاني، فمفيش داعي ننتظر الـtimer. */
      if (online()) scheduleFlush(0);
    }
    return n;
  }

  /* ===== الحفظ نجح للصفوف دي — شيل نسختها القديمة من الطابور =====
     السيناريو: عدّلت السيارة وهو أوفلاين (اتحطت في الطابور)، بعدين
     الشبكة رجعت والـupsert نجح. النسخة في الطابور بقت قديمة، ولو
     فضلت هتنرس بعدين وتكتب فوق الأحدث. */
  async function dropSettled(carIds) {
    var db = DB();
    if (!db || typeof db.dropPending !== 'function') return 0;
    var ids = (carIds || []).map(String);
    if (!ids.length) return 0;
    var n = await db.dropPending(ids);
    if (n > 0) {
      var left = await db.pendingCount();
      lastResult.count = left;
      notify();
    }
    return n;
  }

  /* ===== القراءة من الداتابيز، مش من كاش في الذاكرة =====

     كان snapshot() بيرجع lastResult.count، واللي بيتحدّث غير لمّا
     enqueue ينادي أو flush ينجح. ده غلط في أسوأ حالة: المستخدم فتح
     التطبيق وفيه طابور قديم من جلسة سابقة والشبكة مقطوعة —
     flush بيخرج بدري بـ«offline» والرقم يفضل صفر، والشارة ما
     بتظهرش. يعني بالظبط الحالة اللي الشارة موجودة عشانها.

     المصدر واحد: db.pendingCount(). */
  async function refreshCount() {
    var db = DB();
    if (!db || typeof db.pendingCount !== 'function') return lastResult.count || 0;
    var n = await db.pendingCount();
    lastResult.count = n;
    return n;
  }

  /* ===== الإرسال =====
     المقصود إن الطابور يكون صفر في الحالتين: نجح الإرسال،
     أو رجع خطأ حقيقي. البطاقات مش بتتنهد. */
  async function flush(reason) {
    var db = DB();
    if (flushing) return { ok: false, skipped: true };
    if (!db || typeof db.listPending !== 'function') return { ok: false, skipped: true };
    /* العدّاد يتحدّث الأول، قبل أي خروج بدري. عشان كده الشارة
       بتمثّل الحقيقة حتى لو الشبكة مش موجودة أصلاً. */
    await refreshCount();
    if (!online()) { notify(); return { ok: false, offline: true }; }
    var client = global.supabaseClient;
    if (!global.supabaseReady || !client) { notify(); return { ok: false, noSession: true }; }
    /* «مشاهدة» مينفعش يكتب. الطابور بيتملى من حفظ_normal،
       فلازم نبقى متأكدين إن اللي بيفرّغه مصرّح بيه. */
    if (global.currentRole === 'view') { notify(); return { ok: false, denied: true }; }

    flushing = true;
    notify();
    try {
      var list = await db.listPending();
      if (!list || !list.length) {
        attempts = 0;
        lastResult = { ok: true, sent: 0, failed: 0, at: Date.now(), count: 0, error: '' };
        return lastResult;
      }

      var rows = list.map(function (e) { return e.row; }).filter(Boolean);
      var sent = 0;
      var error = '';
      for (var i = 0; i < rows.length; i += CHUNK) {
        var slice = rows.slice(i, i + CHUNK);
        var res = await client.from(TABLE).upsert(slice, { onConflict: 'car_id' });
        if (res && res.error) { error = res.error.message || String(res.error); break; }
        /* مهم: بنمسح اللي بعته فعلاً بس. لو الـbatch الرابع فشل،
           الأول والتاني والثالث وصلوا فعلاً ومش هيتعاد send تاني. */
        var sentIds = list.slice(i, i + slice.length).map(function (e) { return e.carId; });
        await db.dropPending(sentIds);
        sent += sentIds.length;
      }

      /* ⚠️ الـcount لازم يتحسب من الداتابيز بعد كل حالة.
         لوreasnertناه بدون count، الـbadge بيختفي بالظبط لما الشبكة
         تكون مقطوعة — أسوأ وقت ممكن يظهر فيه. */
      if (error) {
        attempts++;
        lastResult = { ok: false, sent: sent, failed: 0, at: Date.now(), error: error,
                       count: await refreshCount(), reason: reason || 'flush' };
        var wait = Math.min(attempts < BACKOFF_MS.length ? BACKOFF_MS[attempts] : MAX_BACKOFF, MAX_BACKOFF);
        scheduleFlush(wait);
      } else {
        attempts = 0;
        lastResult = { ok: true, sent: sent, failed: 0, at: Date.now(), count: await refreshCount(), error: '' };
      }
      return lastResult;
    } catch (err) {
      attempts++;
      lastResult = { ok: false, sent: 0, failed: 0, at: Date.now(),
                     error: String((err && err.message) || err),
                     count: await refreshCount(), reason: reason || 'flush' };
      scheduleFlush(Math.min(attempts < BACKOFF_MS.length ? BACKOFF_MS[attempts] : MAX_BACKOFF, MAX_BACKOFF));
      return lastResult;
    } finally {
      flushing = false;
      notify();
    }
  }

  function scheduleFlush(delay) {
    if (timer) global.clearTimeout(timer);
    timer = global.setTimeout(function () {
      timer = null;
      flush('scheduled');
    }, Math.max(0, delay || 0));
  }

  /* ===== المؤشر في الشريط العلوي =====

     عنصر منفصل (#sync-pending) مش part من #sync-status.

     السبب: فيه 4 كاتبين بيستخدموا #sync-status (render-router و
     data وrealtime وqueue)، وكل واحد بيكتب textContent. لو
     استلمناها كان لازم نخمّن مين آخر واحد غيّرها ونرجّع النص
     بتاعه — سباق على عنصر واحد.

     وكمان: #sync-status كان جوّه #topbar-sub، و17 مكان بيكتبوا
     topbar-sub.textContent — أي واحد منهم كان بيمسح الشارة من
     الـDOM. دلوقتي كلهم siblings تحت .topbar-titles.

     الطابور الصامت هو أسوأ من مافيش طابور: المستخدم بيظن إن
     حفظه خلص. */
  function paintStatus() {
    var el = global.document && global.document.getElementById('sync-pending');
    if (!el) return;
    var s = snapshot();
    var text = '';
    var cls = 'sync-status is-pending';
    var title = '';
    var clickable = false;

    if (s.flushing) {
      text = '↻ جاري الإرسال…';
      title = s.count ? (s.count + ' حفظ في الطريق') : 'إرسال ما معلّق';
    } else if (s.count > 0) {
      text = '↻ ' + s.count + ' حفظ بانتظار الشبكة';
      title = (s.last.error ? ('آخر خطأ: ' + s.last.error + ' — ')
                             : '') + 'اضغط لإعادة الإرسال الآن';
      clickable = true;
    } else if (!s.online) {
      text = '⚠ لا يوجد اتصال';
      cls = 'sync-status is-offline';
      title = 'التعديلات بتتحفظ على الجهاز وبتتبعت أول ما الشبكة ترجع';
    }

    if (!text) {
      el.hidden = true;
      el.textContent = '';
      el.title = '';
      el.style.cursor = '';
      el.removeAttribute('role');
      el.removeAttribute('tabindex');
      return;
    }
    el.hidden = false;
    el.textContent = text;
    el.className = cls + (clickable ? ' is-clickable' : '');
    el.title = title;
    el.style.cursor = clickable ? 'pointer' : '';
    try {
      var dashBadge = global.document && global.document.getElementById('dash-cloud-badge');
      if (dashBadge) {
        if (!s.online) {
          dashBadge.classList.add('offline');
          var txt = dashBadge.querySelector('.dash-cloud-text');
          if (txt) txt.textContent = 'غير متصل بـ Supabase';
        } else {
          dashBadge.classList.remove('offline');
          var txt = dashBadge.querySelector('.dash-cloud-text');
          if (txt) txt.textContent = 'متصل بـ Supabase';
        }
      }
    } catch (_) {}
    if (clickable) {
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
    } else {
      el.removeAttribute('role');
      el.removeAttribute('tabindex');
    }
  }

  function onBadgeActivate(e) {
    if (e && e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    if (e) { e.preventDefault(); e.stopPropagation(); }
    var s = snapshot();
    if (s.flushing || s.count <= 0) return;
    attempts = 0;
    scheduleFlush(0);
  }

  function install() {
    if (global.__yahmaOfflineQueue) return;
    global.__yahmaOfflineQueue = true;

    global.addEventListener('online', function () { attempts = 0; scheduleFlush(0); });
    global.addEventListener('focus', function () { if (online()) scheduleFlush(0); });
    /* الموبايل: الرجوع للتطبيق أهم event عن الرجوع لصفحة تانية. */
    if (global.document) {
      global.document.addEventListener('visibilitychange', function () {
        if (global.document.visibilityState === 'visible' && online()) scheduleFlush(0);
      });

      /* الشارة قابلة للضغط: إعادة إرسال فورية بدل انتظار الـtimer */
      var badge = global.document.getElementById('sync-pending');
      if (badge && !badge._yahmaClickBound) {
        badge._yahmaClickBound = true;
        badge.addEventListener('click', onBadgeActivate);
        badge.addEventListener('keydown', onBadgeActivate);
      }
    }
    global.setInterval(function () {
      if (online()) flush('interval');
      else { refreshCount().then(function () { paintStatus(); }); }
    }, FLUSH_EVERY_MS);

    if (typeof YahmaErrors !== 'undefined' && YahmaErrors.on) {
      YahmaErrors.on(function () { paintStatus(); });
    }
    listeners.push(function () { paintStatus(); });

    /* أول تشغيل: فيه حاجة مستنية من جلسة فاتت؟ */
    global.setTimeout(function () { flush('boot'); paintStatus(); }, 2500);
    paintStatus();
  }

  global.YahmaOffline = {
    enqueue: enqueue,
    flush: flush,
    dropSettled: dropSettled,
    snapshot: snapshot,
    on: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
    install: install,
    FLUSH_EVERY_MS: FLUSH_EVERY_MS
  };

  /* التركيب بيحصل لوحده: مستمعات online/focus/visibility + مؤقّت
     + أول تفريغ. لو استنّى حد ينادي install() يدوي هينتسي
     وبقى الطابور silent — وده أسوأ من مافيش طابور. */
  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', install);
    } else {
      install();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
