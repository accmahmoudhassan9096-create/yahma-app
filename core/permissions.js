/* ===== permissions.js — طبقة الصلاحيات المركزية =====
   قبل كده كانت شروط الأدوار متفرّقة في 30+ مكان بـ
   `currentRole!=='admin' && currentRole!=='ops'` — أي تعديل في
   نظام الأدوار كان معناه تعديل في كل مكان.

   هنا مصدر واحد للإجابة على سؤالين:
     canManage()  → المستخدم يقدر يعدّل البيانات؟
     inTab()      → التعديل مسموح داخل التبويب ده ولا لأ؟

   الأدوار (4):
     admin   → مدير النظام  — كل حاجة
     manager → إداري        — كل حاجة غير إعدادات النظام (المستخدمين/السجل)
     ops     → تشغيل        — يعدّل في تبويب الفحص فقط، والباقي مشاهدة
     view    → مشاهدة       — read only في كل حاجة

   ملاحظة: «ops» كان قبل كده يعدّل في كل التبويبات. ده كان متعارض
   مع طلب المستخدم، والآن التحديد ده متطبّق مركزيًا. */
(function (global) {
  'use strict';

  var ROLES = {
    admin: { key: 'admin', label: 'مدير النظام', rank: 4 },
    manager: { key: 'manager', label: 'إداري', rank: 3 },
    ops: { key: 'ops', label: 'تشغيل', rank: 2 },
    view: { key: 'view', label: 'مشاهدة', rank: 1 }
  };

  var ORDER = ['admin', 'manager', 'ops', 'view'];

  /* التبويبات اللي فيها «تشغيل» مسموح. */
  var OPS_EDIT_TABS = ['renewals'];

  function role() {
    var r = String(global.currentRole || 'view');
    return ROLES[r] ? r : 'view';
  }

  function rank(r) {
    return (ROLES[r] || ROLES.view).rank;
  }

  function currentTab() {
    try { return typeof global.yahmaGetTab === 'function' ? global.yahmaGetTab() : ''; }
    catch (_) { return ''; }
  }

  /* إعدادات النظام (إدارة المستخدمين / سجل النشاط) — مدير النظام فقط */
  function canAdminister() {
    if (global._demoMode) return true;
    return role() === 'admin';
  }

  /* يعدّل البيانات العادية (إستيراد / إضافة / تجديد / حذف) */
  function canManage() {
    if (global._demoMode) return true;
    var r = role();
    return r === 'admin' || r === 'manager' || r === 'ops';
  }

  /* يعدّل داخل تبويب معيّن */
  function inTab(tab) {
    if (global._demoMode) return true;
    var t = tab || currentTab();
    var r = role();
    if (r === 'admin' || r === 'manager') return true;
    if (r === 'ops') return OPS_EDIT_TABS.indexOf(t) >= 0;
    return false;
  }

  /* يعدّل دلوقتي (في التبويب الحالي) — دي اللي بتتحقق منها
     الواجهة قبل ما تعرض أو تفعّل أي زر تعديل. */
  function canEditNow() {
    return canManage() && inTab(currentTab());
  }

  function label(r) {
    return (ROLES[r] || ROLES.view).label;
  }

  function options() {
    return ORDER.map(function (k) { return { value: k, label: ROLES[k].label }; });
  }

  /* رسالة الرفض الموحّدة — بتوضح للمستخدم ليه، وايه المسموح */
  function denyMessage(action) {
    var r = role();
    if (r === 'ops') {
      return '«' + (action || 'هذا الإجراء') + '» متاح لحساب التشغيل في تبويب «الفحص» بس. '
        + 'باقي الأقسام عرض فقط لحسابك.';
    }
    if (r === 'view') return 'حسابك «مشاهدة» — لا يمكنه التعديل.';
    return 'ليس لديك صلاحية ' + (action || 'هذا الإجراء') + '.';
  }

  global.YahmaPerms = {
    ROLES: ROLES,
    ORDER: ORDER,
    OPS_EDIT_TABS: OPS_EDIT_TABS,
    role: role,
    rank: rank,
    label: label,
    options: options,
    canAdminister: canAdminister,
    canManage: canManage,
    inTab: inTab,
    canEditNow: canEditNow,
    denyMessage: denyMessage,
    isKnown: function (r) { return !!ROLES[r]; }
  };
})(typeof window !== 'undefined' ? window : globalThis);