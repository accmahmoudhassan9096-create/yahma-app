/* ===== app-lock.js — قفل المنصة =====
   Supabase بيحفظ الجلسة (refresh token) في ذاكرة المتصفح، فال-application
   كان بيفتح على طول من غير ما يطلب كلمة المرور. ده مريح للمستخدم بس
   خطر على جهاز بيتشارك: أي حد يفتح التطبيق بيشوف كل الأسطول فورًا.

   الحل: نسيب Supabase يرجّع الجلسة (فبنعرف مين المستخدم)، بس قبل ما نعرض
   أي بيانات نطلب كلمة المرور ونتحقق منها من السيرفر.

   حالة الفتح محفوظة في sessionStorage مش localStorage — يعني:
     • تقفل التطبيق وتفتحه تاني  → مقفول من جديد
     • بتبدّل تبويب جوّه نفس الجلسة →يفضل مفتوح (مزعج وممل)

   ملاحظة أمنية: ده قفل واجهة (screen lock)، زي قفل الموبايل. الحماية
   الحقيقية بتفضل على RLS في Supabase — أي حد يفتح DevTools يقدر يتجاوزه. */
(function (global) {
  'use strict';

  var FLAG = 'yahma-unlocked-uid';   // sessionStorage: مين اتفتح له القفل
  var SETTING = 'yahma-lock-enabled'; // localStorage: القفل مفعّل ولا لأ
  var waiting = [];                   // دوال مستنية الفتح

  function isEnabled() {
    try {
      var v = global.localStorage.getItem(SETTING);
      return v !== 'off';   // مفعّل افتراضيًا
    } catch (_) { return true; }
  }

  function setEnabled(on) {
    try { global.localStorage.setItem(SETTING, on ? 'on' : 'off'); } catch(_){yahmaErr(_,'app-lock.js:30');}
    if (!on) { global.YahmaAppLock.unlock(); hide(); }
  }

  function currentUid() {
    try {
      var u = global.currentUser || (global.supabaseClient ? null : null);
      return u && u.id ? String(u.id) : '';
    } catch (_) { return ''; }
  }

  /* فُتح القفل لحساب معيّن في الجلسة الحالية بس */
  function isUnlocked() {
    if (!isEnabled()) return true;
    var uid = currentUid();
    if (!uid) return false;
    try { return global.sessionStorage.getItem(FLAG) === uid; } catch (_) { return false; }
  }

  function unlock() {
    var uid = currentUid();
    if (!uid) return;
    try { global.sessionStorage.setItem(FLAG, uid); } catch(_){yahmaErr(_,'app-lock.js:52');}
  }

  function relock() {
    try { global.sessionStorage.removeItem(FLAG); } catch(_){yahmaErr(_,'app-lock.js:56');}
  }

  /* المستخدم غيّر حسابه على نفس الجهاز → القفل يرجع */
  function watchIdentity() {
    var last = currentUid();
    try {
      global.addEventListener('yahma-identity', function () { });
    } catch(_){yahmaErr(_,'app-lock.js:64');}
    return function () {
      var uid = currentUid();
      if (uid && uid !== last) { relock(); last = uid; }
    };
  }

  function el(id) { return global.document.getElementById(id); }

  function show() {
    var screen = el('app-lock-screen');
    if (!screen) return;
    screen.hidden = false;
    screen.classList.remove('hidden');
    /* ما ن.Showش أي بيانات تحته */
    var auth = el('auth-screen');
    if (auth) auth.classList.add('hidden');
    var app = el('app-root');
    if (app) app.classList.add('hidden');
    var name = '';
    try { name = (global.currentUser && global.currentUser.email) || ''; } catch(_){yahmaErr(_,'app-lock.js:84');}
    var line = el('lock-user-line');
    if (line) {
      line.textContent = name
        ? 'مرحبًا ' + name + ' — اكتب كلمة المرور للمتابعة'
        : 'اكتب كلمة المرور للمتابعة';
    }
    setTimeout(function () {
      var p = el('lock-password');
      if (p) { try { p.value = ''; p.focus(); } catch(_){yahmaErr(_,'app-lock.js:93');} }
    }, 60);
  }

  function hide() {
    var screen = el('app-lock-screen');
    if (screen) { screen.hidden = true; screen.classList.add('hidden'); }
  }

  function setError(msg) {
    var e = el('lock-error');
    if (e) e.textContent = msg || '';
  }

  /* ⚠️ اللي بيعمل التحقق النهائي هو Supabase نفسه — مش مقارنة محلية.
     فكلمة مرور خاطئة = رفض من السيرفر. */
  async function verify(password) {
    if (!global.supabaseReady || !global.supabaseClient) {
      throw new Error('تعذر الاتصال بالإنترنت. القفل يحتاج اتصال عشان يتحقق.');
    }
    var email = '';
    try { email = (global.currentUser && global.currentUser.email) || ''; } catch(_){yahmaErr(_,'app-lock.js:114');}
    if (!email) throw new Error('مفيش جلسة مفتوحة. سجّل دخول من الأول.');
    var res = await global.supabaseClient.auth.signInWithPassword({
      email: email,
      password: password
    });
    if (res && res.error) {
      var m = res.error.message || '';
      if (/Invalid login credentials/i.test(m)) throw new Error('كلمة المرور غير صحيحة');
      if (/Email not confirmed/i.test(m)) throw new Error('البريد غير مؤكد — راجع Manager');
      throw new Error(m || 'تعذر التحقق من كلمة المرور');
    }
    return res && res.data && res.data.user;
  }

  /* نداء الدوال اللي كانت مستنية (بعد فتح القفل) */
  function flush() {
    var list = waiting.slice();
    waiting.length = 0;
    list.forEach(function (fn) { try { fn(); } catch (e) { console.warn('app-lock continuation', e); } });
  }

  /* لو مقفول: اعرض القفل وسجّل الدالة. لو مفتوح: نفّذها على طول. */
  function gate(fn) {
    if (isUnlocked()) { try { fn(); } catch (e) { console.warn(e); } return true; }
    show();
    waiting.push(fn);
    return false;
  }

  function bind() {
    var form = el('app-lock-form');
    if (!form || form.__bound) return;
    form.__bound = true;

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var input = el('lock-password');
      var btn = el('lock-submit');
      var pw = (input && input.value) || '';
      if (!pw) { setError('اكتب كلمة المرور'); return; }
      setError('');
      if (btn) { btn.disabled = true; btn.textContent = 'جارِ الفتح...'; }
      try {
        await verify(pw);
        unlock();
        hide();
        setError('');
        if (input) input.value = '';
        flush();
      } catch (err) {
        setError(err && err.message ? err.message : 'كلمة المرور غير صحيحة');
        if (input) { try { input.value = ''; input.focus(); } catch(_){yahmaErr(_,'app-lock.js:166');} }
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'فتح المنصة'; }
      }
    });

    el('lock-password') && el('lock-password').addEventListener('input', function () { setError(''); });

    var out = el('lock-logout');
    if (out) out.addEventListener('click', function () {
      relock();
      if (typeof global.yahmaSignOut === 'function') global.yahmaSignOut();
    });
  }

  function init() {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', init);
      return;
    }
    bind();
    /* هوية مختلفة على نفس الجهاز → اقفل تاني */
    var last = currentUid();
    try {
      global.supabaseClient && global.supabaseClient.auth &&
        global.supabaseClient.auth.onAuthStateChange(function (_evt, session) {
          var uid = session && session.user ? String(session.user.id) : '';
          if (uid && last && uid !== last) { relock(); }
          if (uid) last = uid;
        });
    } catch(_){yahmaErr(_,'app-lock.js:196');}
  }

  global.YahmaAppLock = {
    init: init,
    gate: gate,
    show: show,
    hide: hide,
    isUnlocked: isUnlocked,
    isEnabled: isEnabled,
    setEnabled: setEnabled,
    unlock: unlock,
    relock: relock,
    verify: verify
  };

  if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);