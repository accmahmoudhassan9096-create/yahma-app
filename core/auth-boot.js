/* ===== الإقلاع وبوابة المصادقة والأدوار ===== */
/* استُخرج من app-core.js (السطور 1-414) ضمن تقسيم الملفات.
   يُحمَّل بنفس الترتيب السابق بالضبط ضمن كتلة core/* قبل الوحدات المُستخرجة من الذيل. */

/* Yahma app-core — logic extracted from monolith */

/* ===== inline ===== */
document.documentElement.classList.add('yahma-booting');

/* ===== inline ===== */

      if(location.protocol==='file:'){ var h=document.getElementById('auth-file-hint'); if(h) h.style.display='block'; }
    

/* ===== inline ===== */

(function(){
  // ===== Supabase Config =====
  const SUPABASE_URL = 'https://dzildqysxdlnfsmjttjg.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6aWxkcXlzeGRsbmZzbWp0dGpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNTU3NTMsImV4cCI6MjEwNTYzMTc1M30.UdcML-28I0ndel65IMBxfG7wMOZjRK9ZlrjTj_JFyVc';

  try {
    if (typeof supabase !== 'undefined' && supabase.createClient) {
      window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      window.supabaseReady = true;
      window.syncMessage = 'متصل بـ Supabase';
      console.info('[Yahma] Supabase client ready');
    } else {
      throw new Error('Supabase SDK not loaded');
    }
  } catch (e) {
    console.warn('Supabase unavailable; local mode enabled', e);
    window.supabaseReady = false;
    window.syncMessage = 'الوضع المحلي';
  }

})();


/* ===== inline ===== */

// ---- Authentication gate ----
window.currentRole = 'view'; // أضيق صلاحية افتراضيًا (fail-closed) لحد ما نتأكد من دور المستخدم
window.currentUser = null;
// بتبقى false لحد ما يتحسم مصير الدخول (جلسة/لا جلسة/وضع تجريبي/فشل SDK).
// شبكات الأمان الزمنية (forceLocalBoot / emergencyUnstick) ممنوعة تعمل أي حاجة قبلها،
// عشان ما تخفيش شاشة الدخول أو تحوّل المستخدم للوضع التجريبي من تلقاء نفسه.
window._authResolved = false;

function renderEmergencyFleet(content){
  const rows=Array.isArray(fleet)?fleet:[];
  content.innerHTML='<div class="panel"><h3>بيانات الأسطول</h3><div class="muted-small">تم فتح النسخة المحلية — عدد السيارات: '+rows.length+'</div><div class="table-scroll" style="margin-top:12px"><table><thead><tr><th>رقم اللوحة</th><th>الماركة</th><th>الفرع</th><th>الحالة</th></tr></thead><tbody>'+rows.slice(0,200).map(c=>'<tr><td>'+escapeHtml(c.plate||'—')+'</td><td>'+escapeHtml(c.brand||'—')+'</td><td>'+escapeHtml(c.branch||'—')+'</td><td>'+escapeHtml(c.carStatus||'—')+'</td></tr>').join('')+'</tbody></table></div></div>';
}

function showAuthScreen(msg){
  document.documentElement.classList.remove('yahma-booting');
  document.documentElement.classList.add('yahma-ready');
  document.getElementById('app-root').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
  const err = document.getElementById('auth-error');
  if(err) err.textContent = msg || '';
}
function showAppScreen(){
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
  setTimeout(function(){
    if(typeof forceLocalBoot==='function') forceLocalBoot();
  }, 2500);
}

window.yahmaSignOut = async function(){
  const authError = document.getElementById('auth-error');
  try{
    if(window._demoMode){
      window._demoMode=false;
      window._bootedUid=null;
      window.currentUser=null;
      window.currentUserPermissions=[];
      window.currentRole='view';
      showAuthScreen();
      return true;
    }
    if(!window.supabaseReady || !window.supabaseClient){
      throw new Error('خدمة تسجيل الدخول غير متاحة. حدّث الصفحة ثم حاول مرة أخرى.');
    }
    const {error}=await window.supabaseClient.auth.signOut({scope:'local'});
    if(error) throw error;
    window._bootedUid=null;
    window.currentUser=null;
    window.currentUserPermissions=[];
    window.currentRole='view';
    showAuthScreen();
    return true;
  }catch(error){
    console.error('تعذر تسجيل الخروج',error);
    if(authError) authError.textContent='تعذر تسجيل الخروج: '+(error.message||'تحقق من الاتصال ثم حاول مرة أخرى');
    else window.alert('تعذر تسجيل الخروج: '+(error.message||'تحقق من الاتصال ثم حاول مرة أخرى'));
    return false;
  }
};

function roleCacheKey(uid){ return 'fleet-role-cache:'+uid; }
function getCachedRole(uid){ try{ return localStorage.getItem(roleCacheKey(uid))||null; }catch(_){ return null; } }
function setCachedRole(uid, role){ try{ if(role) localStorage.setItem(roleCacheKey(uid), role); }catch(_){} }
function cachedRoleOrView(uid){ const role=getCachedRole(uid); return ['admin','ops','view'].includes(role)?role:'view'; }

let _sessionBootUid=null;
function activateAuthenticatedSession(user){
  if(!user||!user.id||_sessionBootUid===user.id) return;
  const uid=user.id;
  _sessionBootUid=uid;
  window._bootedUid=uid;
  window._demoMode=false;
  window.currentUser=user;
  window.currentUserPermissions=[];
  setTimeout(async function(){
    try{
      const role=await fetchUserRole(uid);
      if(!window.currentUser||window.currentUser.id!==uid) return;
      window.currentRole=role;
      if(typeof applyRole==='function') applyRole();
      showAppScreen();
      if(typeof loadData==='function') await loadData(false);
      if(typeof render==='function') render();
    }catch(error){
      console.error('تعذر تهيئة حساب المستخدم',error);
      if(window.currentUser&&window.currentUser.id===uid){
        window.currentRole=cachedRoleOrView(uid);
        showAppScreen();
        if(typeof loadData==='function') await loadData(false);
        if(typeof applyRole==='function') applyRole();
      }
    }
  },0);
}

/** قراءة الدور من جدول profiles في Supabase */
async function fetchUserRole(uid){
  try{
    window.currentUserPermissions=[];
    if(!window.supabaseReady || !window.supabaseClient) return cachedRoleOrView(uid);
    for(let attempt=0;attempt<3;attempt++){
      const { data, error } = await window.supabaseClient
        .from('profiles')
        .select('role, branch_name, full_name, allowed_tabs')
        .eq('id', uid)
        .single();
      if(error){
        if(error.code === 'PGRST116'){
          console.info('المستخدم ليس لديه سجل profiles بعد - سيتم إنشاؤه تلقائياً');
          return 'view';
        }
        console.warn('تعذر قراءة صلاحية المستخدم من Supabase', error);
        if(attempt<2) await new Promise(resolve=>setTimeout(resolve,400*(attempt+1)));
        continue;
      }
      if(data && ['admin','ops','view'].includes(data.role)){
        window.currentUserPermissions=Array.isArray(data.allowed_tabs)?data.allowed_tabs:[];
        if(data.branch_name) window.currentUserBranch = data.branch_name;
        if(data.full_name) window.currentUserName = data.full_name;
        if(data.full_name){
          const userNameEl=document.getElementById('topbar-user-name');
          if(userNameEl) userNameEl.textContent=data.full_name;
        }
        setCachedRole(uid,data.role);
        return data.role;
      }
      console.warn('ملف المستخدم لا يحتوي على دور صالح في profiles');
      return cachedRoleOrView(uid);
    }
    return cachedRoleOrView(uid);
  }catch(e){
    console.warn('تعذر قراءة صلاحية المستخدم', e);
    return cachedRoleOrView(uid);
  }
}

function initAuthUI(){
  const loginBtn = document.getElementById('auth-login-btn');
  const googleBtn = document.getElementById('auth-google-btn');
  const emailEl = document.getElementById('auth-email');
  const passEl = document.getElementById('auth-password');

  const doLogin = async ()=>{
    const email=(emailEl.value||'').trim(), pass=passEl.value||'';
    const errEl=document.getElementById('auth-error');
    if(!email||!pass){ errEl.textContent='من فضلك أدخل البريد وكلمة المرور'; return; }
    loginBtn.disabled=true; loginBtn.textContent='جارِ الدخول...';
    errEl.textContent='';
    try{
      if(!window.supabaseReady || !window.supabaseClient){
        throw new Error('خدمة Supabase غير متاحة. تأكد من الاتصال بالإنترنت أو استخدم الوضع المحلي.');
      }
      const { data, error } = await window.supabaseClient.auth.signInWithPassword({
        email: email,
        password: pass
      });
      if(error) throw error;
      if(data && data.user){
        activateAuthenticatedSession(data.user);
      }
    }catch(e){
      console.error('login error', e);
      const map={
        'Invalid login credentials':'البريد أو كلمة المرور غير صحيحة',
        'Email not confirmed':'البريد غير مؤكد — راجع بريدك أو اطلب من المدير تفعيل الحساب',
        'Too many requests':'محاولات كثيرة، انتظر قليلاً ثم حاول مرة أخرى',
        'User not found':'لا يوجد حساب بهذا البريد — اطلب من المدير إنشاء حساب لك'
      };
      let msg = map[e.message] || e.message || 'تعذر تسجيل الدخول';
      if(location.protocol==='file:'){
        msg+=' — جرّب الوضع المحلي أو افتح الصفحة عبر استضافة/خادم وليس كملف مباشر.';
      }
      errEl.textContent=msg;
    } finally {
      loginBtn.disabled=false; loginBtn.textContent='دخول';
    }
  };

  loginBtn.addEventListener('click', doLogin);

  // Google Login عبر Supabase
  if(googleBtn){
    googleBtn.addEventListener('click', async ()=>{
      const errEl=document.getElementById('auth-error');
      if(!window.supabaseReady || !window.supabaseClient){
        errEl.textContent='خدمة Supabase غير متاحة. افتح الصفحة عبر الإنترنت أو استخدم الوضع المحلي.';
        return;
      }
      googleBtn.disabled=true;
      googleBtn.innerHTML='<span>جارِ فتح Google...</span>';
      errEl.textContent='';
      try{
        const { data, error } = await window.supabaseClient.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: window.location.origin + window.location.pathname
          }
        });
        if(error) throw error;
        // الـ redirect هيحصل تلقائي
      }catch(e){
        console.error('Google login error',e);
        errEl.textContent=e.message || 'تعذر الدخول باستخدام Google';
        googleBtn.disabled=false;
        googleBtn.innerHTML='<span style="font-size:18px;line-height:1">G</span><span>الدخول باستخدام Google</span>';
      }
    });
  }

  passEl.addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin(); });
  emailEl.addEventListener('keydown', e=>{ if(e.key==='Enter') passEl.focus(); });

  // نسيت كلمة المرور
  const forgotLink = document.getElementById('auth-forgot-link');
  if(forgotLink){
    forgotLink.addEventListener('click', async (e)=>{
      e.preventDefault();
      const errEl=document.getElementById('auth-error');
      const email=(emailEl.value||'').trim();
      if(!email){
        errEl.style.color='';
        errEl.textContent='اكتب بريدك الإلكتروني في الحقل فوق، وبعدين اضغط "نسيت كلمة المرور؟"';
        emailEl.focus();
        return;
      }
      if(!window.supabaseReady || !window.supabaseClient){
        errEl.style.color='';
        errEl.textContent='خدمة Supabase غير متاحة الآن. حاول لاحقًا أو من اتصال إنترنت مختلف.';
        return;
      }
      const original=forgotLink.textContent;
      forgotLink.textContent='جارِ الإرسال...';
      errEl.textContent='';
      try{
        const { error } = await window.supabaseClient.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + window.location.pathname
        });
        if(error) throw error;
        errEl.style.color='var(--green,#1E9C6B)';
        errEl.textContent='تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك — افتحه من نفس الجهاز.';
      }catch(err){
        errEl.style.color='';
        errEl.textContent=err.message || 'تعذر إرسال رابط إعادة التعيين';
      }finally{
        forgotLink.textContent=original;
      }
    });
  }

  // الوضع المحلي (Demo)
  const demoBtn=document.getElementById('auth-demo-btn');
  if(demoBtn){
    demoBtn.addEventListener('click', async ()=>{
      demoBtn.disabled=true;
      demoBtn.textContent='جارِ التحميل...';
      try{
        window._demoMode=true;
        window._authResolved=true;
        window.currentRole='admin';
        window.currentUser={email:'demo@local',id:'demo-local',uid:'demo-local'};
        window.syncMessage='وضع محلي (تجريبي)';
        showAppScreen();
        if(typeof loadData==='function') await loadData(false);
        if(typeof applyRole==='function') applyRole();
        if(typeof render==='function') render();
      }catch(e){
        console.error(e);
        alert('تعذر بدء الوضع التجريبي: '+(e.message||e));
      }finally{
        demoBtn.disabled=false;
        demoBtn.textContent='تجربة بدون تسجيل (وضع محلي)';
      }
    });
  }
}

/** يظهر بعد الرجوع من رابط إعادة تعيين كلمة المرور (حدث PASSWORD_RECOVERY) */
function showResetPasswordModal(){
  const old=document.getElementById('reset-pw-overlay'); if(old) old.remove();
  const ov=document.createElement('div'); ov.id='reset-pw-overlay'; ov.className='overlay'; ov.style.display='flex';
  ov.innerHTML='<div class="modal" style="max-width:380px"><h2>تعيين كلمة مرور جديدة</h2>'
    +'<p class="sub">اكتب كلمة المرور الجديدة لحسابك، وهتقدر تستخدمها من أول مرة القادمة.</p>'
    +'<form id="reset-pw-form">'
    +'<div class="auth-field"><label for="reset-pw-new">كلمة المرور الجديدة</label><input type="password" id="reset-pw-new" minlength="8" required autocomplete="new-password"></div>'
    +'<div id="reset-pw-msg" style="min-height:18px;font-size:13px;margin:6px 0"></div>'
    +'<button class="btn btn-primary" type="submit" style="width:100%">حفظ كلمة المرور</button>'
    +'</form></div>';
  document.body.appendChild(ov);
  ov.querySelector('#reset-pw-form').onsubmit=async function(e){
    e.preventDefault();
    const msg=ov.querySelector('#reset-pw-msg');
    const pw=ov.querySelector('#reset-pw-new').value;
    if(!pw || pw.length<8){ msg.style.color=''; msg.textContent='كلمة المرور لازم تكون 8 أحرف على الأقل'; return; }
    msg.style.color=''; msg.textContent='جارِ الحفظ...';
    try{
      const { error } = await window.supabaseClient.auth.updateUser({ password: pw });
      if(error) throw error;
      msg.style.color='var(--green,#1E9C6B)';
      msg.textContent='تم تغيير كلمة المرور بنجاح.';
      setTimeout(()=>{ ov.remove(); }, 1200);
    }catch(err){
      msg.style.color='';
      msg.textContent=err.message || 'تعذر تغيير كلمة المرور';
    }
  };
}

function initAuthGate(){
  initAuthUI();

  if(!window.supabaseReady || !window.supabaseClient){
    // لا يوجد Supabase (فشل تحميل الـ SDK أو ملف مباشر): نشغّل التطبيق في وضع
    // محلي *بشكل صريح* — مش من خلال شبكة الأمان الزمنية — حتى تبقى الحالة معلومة.
    window._authResolved = true;
    window._demoMode = true;
    window.currentRole='admin';
    showAppScreen();
    if(typeof loadData==='function') loadData();
    return;
  }

  // الاستماع لتغيير حالة المصادقة في Supabase
  window.supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if(event === 'PASSWORD_RECOVERY'){
      showResetPasswordModal();
      return;
    }
    if(session && session.user){
      window._authResolved = true;
      // Supabase بيبعت SIGNED_IN تاني كل ما ترجع للتبويب + TOKEN_REFRESHED كل ساعة.
      // لو نفس المستخدم مفتوح بالفعل، لا تعيد تحميل البيانات (ده كان سبب الرمش المتكرر).
      if(window._bootedUid===session.user.id && !window._demoMode){ window.currentUser = session.user; return; }
      activateAuthenticatedSession(session.user);
    } else {
      // لا تطرد المستخدم لو دخل بالوضع التجريبي المحلي
      if(window._demoMode) return;
      window._authResolved = true;
      window._bootedUid = null;
      _sessionBootUid=null;
      window.currentUser = null;
      window.currentUserPermissions=[];
      window.currentRole='view';
      showAuthScreen();
    }
  });

  // تحقق من الجلسة الحالية عند التحميل
  window.supabaseClient.auth.getSession().then(({ data: { session } }) => {
    window._authResolved = true;
    if(session && session.user){
      activateAuthenticatedSession(session.user);
    } else if(!window._demoMode){
      showAuthScreen();
    }
  }).catch(e=>{
    console.warn('خطأ في فحص الجلسة:', e);
    window._authResolved = true;
    if(!window._demoMode) showAuthScreen();
  });
}
document.addEventListener('DOMContentLoaded', initAuthGate);
setTimeout(function(){
  if(document.documentElement.classList.contains('yahma-booting')){
    console.warn('Startup timeout: showing login screen safely');
    if(typeof showAuthScreen==='function') showAuthScreen('');
  }
}, 8000);

/* ===== inline ===== */
