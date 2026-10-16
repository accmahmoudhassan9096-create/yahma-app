/* ===== modules/my-account.js — بيانات المستخدم الشخصية =====

   زر «إعدادات الحساب» كان موجود في القائمة من زمان، بس كان بينادي
   openUserAdmin() — ودي بتقول «للمدير فقط» وتموت. يعني أي مستخدم
   غير المدير بيضغط مفيش حاجة getting. المشكلة كانت في الـpolicy
   مش في الزر.

   هنا الشاشة اللي مفيش مكان ليها:
   • الاسم، الرقم القومي، تاريخ الميلاد، رقم الجوال — يعدّلهم صاحب
     الحساب بنفسه.
   • تغيير كلمة المرور وهو logged in. اللي كان متاح قبل كده بس لو
     جاي من لينك استعادة في الإيميل.

   ⚠️ كلمة المرور: بنطلب الحالية الأول وبنتأكد منها بـsignInWithPassword
   قبل ما نغيّر. غير كده أي حد لقى جلسة مفتوحة على جهاز مشترك
   يقدر يغيّر كلمة مرور صاحبها.

   ⚠️ الرقم القومي والجوال والتاريخ: بيانات شخصية. مفيش شاشة تانية
   بتعرضهم — شاشة صاحب الحساب بس. */

(function (global) {
  'use strict';

  var MIN_PASSWORD = 8;

  /* صيغة سعودية:
       • الهوية (الإقامة) = 10 أرقام
       • الجوال = 10 أرقام تبدأ بـ05
     نفس قواعد القاعدة بالظبط. لو القواعد اتغيّرت هنا من غير ما
     تتحدّث هنا، المستخدم هيكتب قيمة تتقبل في الشاشة وترفض في
     القاعدة — وده بالظبط أسوأ إحساس ممكن. */
  var NATIONAL_ID_RE = /^[0-9]{10}$/;
  var PHONE_RE = /^05[0-9]{8}$/;

  function clean(v) { return String(v == null ? '' : v).trim(); }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1) +
      '-' + (d.getDate() < 10 ? '0' : '') + d.getDate();
  }

  /* يتحقق قبل ما نكلّم القاعدة، عشان المستخدم يشوف الخطأ في الشاشة
     مش بعد round-trip. الرمي هنا بياخد نفس رموز القاعدة. */
  function validate(values) {
    if (values.national_id && !NATIONAL_ID_RE.test(values.national_id)) {
      return 'رقم الهوية لازم يكون 10 أرقام.';
    }
    if (values.phone && !PHONE_RE.test(values.phone)) {
      return 'رقم الجوال لازم يكون 10 أرقام ويبدأ بـ 05.';
    }
    if (values.birth_date) {
      if (values.birth_date > todayStr()) return 'تاريخ الميلاد مش ممكن يكون في المستقبل.';
      if (values.birth_date <= '1900-01-01') return 'تاريخ الميلاد مش معقول.';
    }
    return '';
  }

  /* حقلين رقم فقط باللاتيني — بنشيل أي حاجة تانية أثناء الكتابة.

     لازم نحوّل الأرقام العربية-الهندية لنظيرتها اللاتينية.
     السبب: \D في JavaScript بيشيل كل حاجة غير [0-9] فقط،
     والأرقام العربية-الهندية مش منها — فكانت هتعدّي التنضيف
     زي ما هي وبعدين ترفضها القاعدة برسالة «لازم يكون 10 أرقام»
     والمستخدم فعلاً كتب 10 أرقام. وبما إن التطبيق عربي، الكتابة
     بلوحة عربية أو لصق من كليبورد عربي أمر طبيعي. */
  var ARABIC_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/g;
  var ARABIC_TO_LATIN = {
    '\u0660': '0', '\u0661': '1', '\u0662': '2', '\u0663': '3', '\u0664': '4',
    '\u0665': '5', '\u0666': '6', '\u0667': '7', '\u0668': '8', '\u0669': '9',
    '\u06F0': '0', '\u06F1': '1', '\u06F2': '2', '\u06F3': '3', '\u06F4': '4',
    '\u06F5': '5', '\u06F6': '6', '\u06F7': '7', '\u06F8': '8', '\u06F9': '9'
  };

  function toLatinDigits(text) {
    return String(text == null ? '' : text).replace(ARABIC_DIGITS, function (ch) {
      return ARABIC_TO_LATIN[ch] || ch;
    });
  }
  function digitsOnly(el) {
    if (!el) return;
    var pos = el.selectionStart;
    var cleaned = toLatinDigits(el.value).replace(/\D+/g, '');
    /* لو تجاوز الطول، نقص من الآخر عشان المؤشر ما يقفزش */
    if (cleaned.length > el.maxLength && el.maxLength > 0) {
      cleaned = cleaned.slice(0, el.maxLength);
    }
    if (cleaned === el.value) return;
    el.value = cleaned;
    try {
      el.setSelectionRange(Math.min(pos, cleaned.length), Math.min(pos, cleaned.length));
    } catch (_) { /* الحقل مش يدعم selection */ }
  }

  /* نفس التحقق على كلمة المرور — قبل النداء. */
  function validatePassword(current, next, confirm) {
    if (!current) return 'اكتب كلمة المرور الحالية للتأكيد.';
    if (!next || next.length < MIN_PASSWORD) return 'كلمة المرور الجديدة لازم تكون ' + MIN_PASSWORD + ' حروف على الأقل.';
    if (next === current) return 'كلمة المرور الجديدة هي نفسها الحالية.';
    if (confirm !== next) return 'تأكيد كلمة المرور مش مطابق.';
    return '';
  }

  function esc(v) {
    try {
      if (typeof global.escapeHtml === 'function') return global.escapeHtml(v);
    } catch (_) { /* fallback */ }
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function setStatus(el, text, isError) {
    el.textContent = text || '';
    el.style.color = isError ? 'var(--red,#CE4B3D)' : '';
  }

  function showOverlay(html) {
    var old = global.document.getElementById('my-account-overlay');
    if (old) old.remove();
    var ov = global.document.createElement('div');
    ov.id = 'my-account-overlay';
    ov.className = 'overlay';
    ov.style.display = 'flex';
    ov.innerHTML = html;
    global.document.body.appendChild(ov);
    return ov;
  }

  /* ===== تحميل البيانات ===== */
  function loadProfile() {
    var client = global.supabaseClient;
    var uid = global.currentUser && global.currentUser.id;
    if (!client || !uid) return Promise.resolve(null);
    return client.from('profiles')
      .select('id,email,full_name,national_id,birth_date,phone,role,branch_name')
      .eq('id', uid)
      .maybeSingle()
      .then(function (r) { return r && !r.error ? r.data : null; })
      .catch(function (e) {
        if (typeof yahmaErr === 'function') yahmaErr(e, 'my-account.js:loadProfile');
        return null;
      });
  }

  /* ===== الشاشة ===== */
  function open() {
    if (global._demoMode) {
      alert('أنت في الوضع التجريبي — مفيش حساب حقيقي على السيرفر.');
      return;
    }
    var doc = global.document;
    var ov = showOverlay(
      '<div class="modal my-account-modal" role="dialog" aria-modal="true" aria-labelledby="my-account-title">'
      + '<div class="user-admin-head"><div><h2 id="my-account-title">بياناتي</h2>'
      + '<p>بتعدّل بياناتك أنت بس. الدور والفرع والأقسام بيعدّلهم مدير النظام.</p></div>'
      + '<button type="button" class="btn btn-ghost btn-small" id="my-account-close">إغلاق</button></div>'
      + '<div class="my-account-body">'

      + '<div class="my-account-fixed">'
      + '<div><span>البريد الإلكتروني</span><b id="ma-email">—</b></div>'
      + '<div><span>الدور</span><b id="ma-role">—</b></div>'
      + '<div><span>الفرع</span><b id="ma-branch">—</b></div>'
      + '</div>'

      + '<div class="my-account-fields">'
      + '<label class="fld">الاسم الكامل<input id="ma-name" maxlength="120"></label>'
      + '<label class="fld">رقم الهوية<input id="ma-nid" dir="ltr" inputmode="numeric" maxlength="10" placeholder="10 أرقام"></label>'
      + '<label class="fld">تاريخ الميلاد<input id="ma-birth" type="date" max="' + todayStr() + '"></label>'
      + '<label class="fld">رقم الجوال<input id="ma-phone" dir="ltr" inputmode="numeric" maxlength="10" placeholder="05XXXXXXXX"></label>'
      + '</div>'
      + '<div id="ma-status" role="status" aria-live="polite" class="ua-user-admin-message"></div>'
      + '<div class="my-account-actions"><button type="button" class="btn btn-primary btn-small" id="ma-save">حفظ البيانات</button></div>'

      + '<div class="my-account-divider"></div>'
      + '<h3>كلمة المرور</h3>'
      + '<div class="my-account-fields">'
      + '<label class="fld">كلمة المرور الحالية<input id="ma-pw-current" type="password" dir="ltr" autocomplete="current-password"></label>'
      + '<label class="fld">كلمة المرور الجديدة<input id="ma-pw-new" type="password" dir="ltr" autocomplete="new-password" minlength="' + MIN_PASSWORD + '"></label>'
      + '<label class="fld">تأكيد كلمة المرور<input id="ma-pw-confirm" type="password" dir="ltr" autocomplete="new-password" minlength="' + MIN_PASSWORD + '"></label>'
      + '</div>'
      + '<div class="my-account-actions"><button type="button" class="btn btn-primary btn-small" id="ma-pw-save">تغيير كلمة المرور</button></div>'

      + '</div></div>');

    ov.onclick = function (e) { if (e.target === ov) close(ov); };
    doc.getElementById('my-account-close').onclick = function () { close(ov); };

    /* التنضيف أثناء الكتابة: الهوية والجوال أرقام سعودية بس،
       فأي حرف أو مسافة أو + بتتشال فور الكتابة أو اللصق. */
    ['ma-nid', 'ma-phone'].forEach(function (id) {
      var el = doc.getElementById(id);
      if (!el) return;
      el.addEventListener('input', function () { digitsOnly(el); });
      el.addEventListener('paste', function () { setTimeout(function () { digitsOnly(el); }, 0); });
    });

    var status = doc.getElementById('ma-status');
    var get = function (id) { return doc.getElementById(id); };

    /* الحقول تتعبّى من صف المستخدم الحقيقي */
    get('ma-email').textContent = (global.currentUser && global.currentUser.email) || '—';
    var roleLabel = '';
    try {
      if (global.YahmaPerms && typeof global.YahmaPerms.label === 'function') {
        roleLabel = global.YahmaPerms.label(global.currentRole);
      }
    } catch (_) { /* fallback */ }
    get('ma-role').textContent = roleLabel || global.currentRole || '—';
    setStatus(status, 'جارِ تحميل بياناتك...');

    loadProfile().then(function (profile) {
      if (!profile) {
        get('ma-branch').textContent = global.currentUserBranch || '—';
        setStatus(status, 'تعذر تحميل بياناتك — تقدر تكتب وتحفظ عادي.', true);
        return;
      }
      get('ma-branch').textContent = profile.branch_name || 'كل الفروع';
      get('ma-name').value = profile.full_name || '';
      get('ma-nid').value = profile.national_id || '';
      get('ma-birth').value = profile.birth_date || '';
      get('ma-phone').value = profile.phone || '';
      setStatus(status, '');
    });

    /* ===== حفظ البيانات الشخصية ===== */
    get('ma-save').onclick = async function () {
      var btn = this;
      var values = {
        full_name: clean(get('ma-name').value),
        national_id: clean(get('ma-nid').value),
        birth_date: clean(get('ma-birth').value),
        phone: clean(get('ma-phone').value)
      };
      var problem = validate(values);
      if (problem) { setStatus(status, problem, true); return; }

      btn.disabled = true;
      setStatus(status, 'جارِ الحفظ...');
      try {
        var r = await global.supabaseClient.from('profiles').update(values).eq('id', global.currentUser.id);
        if (r.error) throw new Error(r.error.message);
        setStatus(status, 'تم حفظ بياناتك.');
        /* الاسم بيظهر في الشريط العلوي — نحدّثه فورًا */
        if (typeof global.yahmaRefreshUserChip === 'function') {
          try { global.yahmaRefreshUserChip(values.full_name); } catch (_) { /* غير مهم */ }
        }
      } catch (e) {
        if (typeof yahmaErr === 'function') yahmaErr(e, 'my-account.js:ma-save');
        setStatus(status, 'تعذر الحفظ: ' + ((e && e.message) || e), true);
      }
      btn.disabled = false;
    };

    /* ===== تغيير كلمة المرور ===== */
    get('ma-pw-save').onclick = async function () {
      var btn = this;
      var current = get('ma-pw-current').value;
      var next = get('ma-pw-new').value;
      var confirmPw = get('ma-pw-confirm').value;
      var problem = validatePassword(current, next, confirmPw);
      if (problem) { setStatus(status, problem, true); return; }

      var auth = global.supabaseClient && global.supabaseClient.auth;
      var email = (global.currentUser && global.currentUser.email) || '';
      if (!auth || !email) { setStatus(status, 'تعذر تحميل بيانات الجلسة.', true); return; }

      btn.disabled = true;
      setStatus(status, 'جارِ التأكيد...');

      /* ❶ نتأكد من الحالية — بدونها أي جلسة مفتوحة على جهاز
         مشترك تقدر تغيّر كلمة مرور صاحبها. */
      var check = await auth.signInWithPassword({ email: email, password: current });
      if (check.error) {
        setStatus(status, 'كلمة المرور الحالية غلط.', true);
        btn.disabled = false;
        return;
      }

      setStatus(status, 'جارِ التغيير...');
      var done = await auth.updateUser({ password: next });
      if (done.error) {
        setStatus(status, 'تعذر تغيير كلمة المرور: ' + (done.error.message || done.error), true);
        btn.disabled = false;
        return;
      }
      get('ma-pw-current').value = '';
      get('ma-pw-new').value = '';
      get('ma-pw-confirm').value = '';
      setStatus(status, 'تم تغيير كلمة المرور بنجاح.');
      btn.disabled = false;
    };
  }

  function close(ov) { if (ov) ov.remove(); }

  global.yahmaOpenMyAccount = open;
  global.YahmaMyAccount = {
    open: open,
    validate: validate,
    validatePassword: validatePassword,
    NATIONAL_ID_RE: NATIONAL_ID_RE,
    PHONE_RE: PHONE_RE,
    digitsOnly: digitsOnly,
    toLatinDigits: toLatinDigits,
    MIN_PASSWORD: MIN_PASSWORD
  };
})(typeof window !== 'undefined' ? window : globalThis);