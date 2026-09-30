/**
 * modules/auth.js — إدارة المصادقة والجلسات والصلاحيات
 */
(function (global) {
  'use strict';

  // ---- Authentication gate ----
  window.currentRole = 'view'; // أضيق صلاحية افتراضيًا (fail-closed) لحد ما نتأكد من دور المستخدم
  window.currentUser = null;
  window.currentUserPermissions = [];

  function roleCacheKey(uid) { return 'fleet-role-cache:' + uid; }
  function getCachedRole(uid) { try { return localStorage.getItem(roleCacheKey(uid)) || null; } catch (_) { return null; } }
  function setCachedRole(uid, role) { try { if (role) localStorage.setItem(roleCacheKey(uid), role); } catch (_) {} }

  /** قراءة الدور من جدول profiles في Supabase */
  async function fetchUserRole(uid) {
    try {
      window.currentUserPermissions = [];
      if (!window.supabaseReady || !window.supabaseClient) return 'view';
      const { data, error } = await window.supabaseClient
        .from('profiles')
        .select('role, branch_name, full_name, allowed_tabs')
        .eq('id', uid)
        .single();
      if (error) {
        console.warn('تعذر قراءة صلاحية المستخدم من Supabase', error);
        // معالجة خاصة لحالة عدم وجود السجل (مستخدم جديد بـ Google)
        if (error.code === 'PGRST116') {
          console.info('المستخدم ليس لديه سجل profiles بعد - سيتم إنشاؤه تلقائياً');
          return 'view';
        }
        return 'view';
      }
      if (data && data.role) {
        window.currentUserPermissions = Array.isArray(data.allowed_tabs) ? data.allowed_tabs : [];
        // حفظ اسم الفرع لو موجود
        if (data.branch_name) window.currentUserBranch = data.branch_name;
        if (data.full_name) window.currentUserName = data.full_name;
        if (data.full_name) {
          const userNameEl = document.getElementById('topbar-user-name');
          if (userNameEl) userNameEl.textContent = data.full_name;
        }
        return data.role;
      }
      return 'view';
    } catch (e) {
      console.warn('تعذر قراءة صلاحية المستخدم', e);
      return 'view';
    }
  }

  function showAuthScreen(msg) {
    document.documentElement.classList.remove('yahma-booting');
    document.documentElement.classList.add('yahma-ready');
    document.getElementById('app-root').classList.add('hidden');
    document.getElementById('auth-screen').classList.remove('hidden');
    const err = document.getElementById('auth-error');
    if (err) err.textContent = msg || '';
  }

  function showAppScreen() {
    document.documentElement.classList.remove('yahma-booting');
    document.documentElement.classList.add('yahma-ready');
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app-root').classList.remove('hidden');
    // ملاحظة: لا نعمل render هنا. الاستدعاء اللي بيحصل فورًا بعد showAppScreen()
    // هو loadData()، وهي المسؤولة عن أول render فعلي بالبيانات. عمل render مبدئي هنا
    // كان بيسبب بربشة (فليكر) لأن الداشبورد كان بيتبني مرتين-تلاتة بنفس البيانات تقريبًا
    // خلال أقل من ثانية (مرة هنا، ومرة تانية جوه loadData).
    // شبكة أمان فقط: لو لأي سبب loadData اتأخرت/تعلّقت وشاشة "جارِ التحميل" لسه ظاهرة،
    // فعّل الوضع المحلي بعد مهلة قصيرة.
    setTimeout(function () {
      if (typeof forceLocalBoot === 'function') forceLocalBoot();
    }, 2500);
  }

  function renderEmergencyFleet(content) {
    const rows = Array.isArray(global.fleet) ? global.fleet : [];
    content.innerHTML = '<div class="panel"><h3>بيانات الأسطول</h3><div class="muted-small">تم فتح النسخة المحلية — عدد السيارات: ' + rows.length + '</div><div class="table-scroll" style="margin-top:12px"><table><thead><tr><th>رقم اللوحة</th><th>الماركة</th><th>الفرع</th><th>الحالة</th></tr></thead><tbody>' + rows.slice(0, 200).map(c => '<tr><td>' + escapeHtml(c.plate || '—') + '</td><td>' + escapeHtml(c.brand || '—') + '</td><td>' + escapeHtml(c.branch || '—') + '</td><td>' + escapeHtml(c.carStatus || '—') + '</td></tr>').join('') + '</tbody></table></div></div>';
  }

  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }

  function initAuthUI() {
    const loginBtn = document.getElementById('auth-login-btn');
    const googleBtn = document.getElementById('auth-google-btn');
    const emailEl = document.getElementById('auth-email');
    const passEl = document.getElementById('auth-password');

    const doLogin = async () => {
      const email = (emailEl.value || '').trim(), pass = passEl.value || '';
      const errEl = document.getElementById('auth-error');
      if (!email || !pass) { errEl.textContent = 'من فضلك أدخل البريد وكلمة المرور'; return; }
      loginBtn.disabled = true; loginBtn.textContent = 'جارِ الدخول...';
      errEl.textContent = '';
      try {
        if (!window.supabaseReady || !window.supabaseClient) {
          throw new Error('خدمة Supabase غير متاحة. تأكد من الاتصال بالإنترنت أو استخدم الوضع المحلي.');
        }
        const { data, error } = await window.supabaseClient.auth.signInWithPassword({
          email: email,
          password: pass
        });
        if (error) throw error;
        if (data && data.user) {
          window._demoMode = false;
          window._bootedUid = data.user.id;
          window.currentUser = data.user;
          window.currentUserPermissions = [];
          showAppScreen();
          if (typeof loadData === 'function') loadData(false);
          fetchUserRole(data.user.id).then(role => {
            setCachedRole(data.user.id, role);
            window.currentRole = role;
            if (typeof applyRole === 'function') applyRole();
            if (typeof render === 'function') render();
          });
        }
      } catch (e) {
        console.error('login error', e);
        const map = {
          'Invalid login credentials': 'البريد أو كلمة المرور غير صحيحة',
          'Email not confirmed': 'البريد غير مؤكد — راجع بريدك أو اطلب من المدير تفعيل الحساب',
          'Too many requests': 'محاولات كثيرة، انتظر قليلاً ثم حاول مرة أخرى',
          'User not found': 'لا يوجد حساب بهذا البريد — اطلب من المدير إنشاء حساب لك'
        };
        let msg = map[e.message] || e.message || 'تعذر تسجيل الدخول';
        if (location.protocol === 'file:') {
          msg += ' — جرّب الوضع المحلي أو افتح الصفحة عبر استضافة/خادم وليس كملف مباشر.';
        }
        errEl.textContent = msg;
      } finally {
        loginBtn.disabled = false; loginBtn.textContent = 'دخول';
      }
    };

    loginBtn.addEventListener('click', doLogin);

    // Google Login عبر Supabase
    if (googleBtn) {
      googleBtn.addEventListener('click', async () => {
        const errEl = document.getElementById('auth-error');
        if (!window.supabaseReady || !window.supabaseClient) {
          errEl.textContent = 'خدمة Supabase غير متاحة. افتح الصفحة عبر الإنترنت أو استخدم الوضع المحلي.';
          return;
        }
        googleBtn.disabled = true;
        googleBtn.innerHTML = '<span>جارِ فتح Google...</span>';
        errEl.textContent = '';
        try {
          const { data, error } = await window.supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: window.location.origin + window.location.pathname
            }
          });
          if (error) throw error;
          // الـ redirect هيحصل تلقائي
        } catch (e) {
          console.error('Google login error', e);
          errEl.textContent = e.message || 'تعذر الدخول باستخدام Google';
          googleBtn.disabled = false;
          googleBtn.innerHTML = '<span style="font-size:18px;line-height:1">G</span><span>الدخول باستخدام Google</span>';
        }
      });
    }

    passEl.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    emailEl.addEventListener('keydown', e => { if (e.key === 'Enter') passEl.focus(); });

    // نسيت كلمة المرور
    const forgotLink = document.getElementById('auth-forgot-link');
    if (forgotLink) {
      forgotLink.addEventListener('click', async (e) => {
        e.preventDefault();
        const errEl = document.getElementById('auth-error');
        const email = (emailEl.value || '').trim();
        if (!email) {
          errEl.style.color = '';
          errEl.textContent = 'من فضلك أدخل بريدك الإلكتروني أولاً';
          return;
        }
        try {
          if (!window.supabaseReady || !window.supabaseClient) {
            throw new Error('خدمة Supabase غير متاحة');
          }
          const { error } = await window.supabaseClient.auth.resetPasswordForEmail(email);
          if (error) throw error;
          errEl.style.color = '#4ade80';
          errEl.textContent = 'تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك. راجع بريدك الإلكتروني.';
        } catch (e) {
          console.error(e);
          errEl.style.color = '';
          errEl.textContent = e.message || 'تعذر إرسال رابط إعادة التعيين';
        }
      });
    }

    // الوضع التجريبي المحلي
    const demoBtn = document.getElementById('auth-demo-btn');
    if (demoBtn) {
      demoBtn.addEventListener('click', () => {
        window._demoMode = true;
        window._bootedUid = null;
        window.currentUser = null;
        window.currentRole = 'admin';
        window.currentUserPermissions = [];
        showAppScreen();
        if (typeof loadData === 'function') loadData(false);
      });
    }
  }

  function initAuthGate() {
    if (!window.supabaseReady || !window.supabaseClient) {
      showAuthScreen();
      return;
    }
    window.supabaseClient.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        window._demoMode = false;
        window._bootedUid = session.user.id;
        window.currentUser = session.user;
        window.currentUserPermissions = [];
        showAppScreen();
        if (typeof loadData === 'function') loadData(false);
        const role = await fetchUserRole(session.user.id);
        setCachedRole(session.user.id, role);
        window.currentRole = role;
        if (typeof applyRole === 'function') applyRole();
        if (typeof render === 'function') render();
      } else if (event === 'SIGNED_OUT') {
        // لا تطرد المستخدم لو دخل بالوضع التجريبي المحلي
        if (window._demoMode) return;
        window._bootedUid = null;
        window.currentUser = null;
        window.currentUserPermissions = [];
        showAuthScreen();
      }
    });

    // تحقق من الجلسة الحالية عند التحميل
    window.supabaseClient.auth.getSession().then(({ data: { session } }) => {
      if (session && session.user) {
        // onAuthStateChange هيتعامل معاه
      } else if (!window._demoMode) {
        showAuthScreen();
      }
    }).catch(e => {
      console.warn('خطأ في فحص الجلسة:', e);
      if (!window._demoMode) showAuthScreen();
    });
  }

  // Public API
  global.YahmaAuth = {
    showAuthScreen: showAuthScreen,
    showAppScreen: showAppScreen,
    renderEmergencyFleet: renderEmergencyFleet,
    escapeHtml: escapeHtml,
    fetchUserRole: fetchUserRole,
    getCachedRole: getCachedRole,
    setCachedRole: setCachedRole,
    initAuthUI: initAuthUI,
    initAuthGate: initAuthGate
  };

  // Expose global functions for compatibility
  global.showAuthScreen = showAuthScreen;
  global.showAppScreen = showAppScreen;
  global.renderEmergencyFleet = renderEmergencyFleet;
  global.escapeHtml = escapeHtml;

  setTimeout(function () {
    if (document.documentElement.classList.contains('yahma-booting')) {
      console.warn('Startup timeout: showing login screen safely');
      if (typeof showAuthScreen === 'function') showAuthScreen('');
    }
  }, 8000);

})(typeof window !== 'undefined' ? window : this);
