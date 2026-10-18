/* ===== modules/users-tab.js — تبويب إدارة المستخدمين (مستقل) =====
   استُخرج من openUserAdmin() في topbar-user.js وجُعل تبويبًا مستقلاً
   يظهر في الشريط الجانبي بعد «الرئيسية»، ويبدو لمدير النظام (admin) فقط.
   تعرض نفس واجهة إضافة/تعديل/حذف المستخدمين داخل content بدلاً من نافذة منبثقة.
   सभी المتغيرات العامة (fleet, branches, PAGE_PERMISSION_OPTIONS, invokeYahmaFunction,
   escapeHtml, yahmaErr, fmtDate, showResult, describeInvokeError, openWelcomeEditor)
   متاحة لأنها تُحمَّل قبل هذا الملف في index.html. */

(function (global) {
  'use strict';

  async function renderUsers(content) {
    document.getElementById('topbar-title').textContent = 'إدارة المستخدمين';
    document.getElementById('topbar-sub').textContent = 'أضف المستخدم وحدد دوره والفرع والأقسام التي يستطيع رؤيتها.';

    if (window.currentRole !== 'admin') {
      content.innerHTML = '<div class="panel"><h3>غير مسموح</h3><p class="muted-small">إدارة المستخدمين متاحة لمدير النظام فقط.</p></div>';
      return;
    }

    /* ===== أسماء الفروع =====
       دليل الفروع محفوظ على الجهاز (IndexedDB) وممكن يكون ناقص أو مختلف
       عن الأسماء الحقيقية الموجودة في بيانات السيارات. ولأن الخادم بيطابق
       الاسم بالحرف (yahma_can_access_branch)، لازم القائمة تعرض الأسماء
       الحقيقية من الأسطول مع عدد سيارات كل فرع. */
    var branchCounts = new Map();
    var fleetList = (typeof fleet !== 'undefined' && Array.isArray(fleet)) ? fleet : [];
    fleetList.forEach(function (c) {
      var n = String((c && c.branch) || '').trim(); if (!n) return;
      branchCounts.set(n, (branchCounts.get(n) || 0) + 1);
    });
    (Array.isArray(branches) ? branches : []).forEach(function (b) {
      var n = b && b.name ? String(b.name).trim() : ''; if (!n) return;
      if (!branchCounts.has(n)) branchCounts.set(n, 0);
    });
    var sortedBranches = Array.from(branchCounts.entries()).sort(function (a, b) { return b[1] - a[1]; });
    var branchOptions = '<option value="">كل الفروع — يشوف الكل</option>'
      + sortedBranches.map(function (pair) {
        var label = pair[0] + ' — ' + pair[1] + ' سيارة';
        return '<option value="' + escapeHtml(pair[0]) + '">' + escapeHtml(label) + '</option>';
      }).join('');
    var allPageIds = PAGE_PERMISSION_OPTIONS.map(function (page) { return page.id; });
    var permissionGrid = function (className, selected, disabled) {
      return '<div class="ua-permission-grid ' + className + '">' + PAGE_PERMISSION_OPTIONS.map(function (page) {
        return '<label><input type="checkbox" value="' + page.id + '" ' + (selected.includes(page.id) ? 'checked ' : '') + (disabled ? 'disabled' : '') + '><span>' + page.label + '</span></label>';
      }).join('') + '</div>';
    };
    var selectedPermissions = function (scope) { return Array.from(scope.querySelectorAll('input[type="checkbox"]:checked')).map(function (input) { return input.value; }); };
    var syncPermissions = function (scope, role) {
      var inputs = scope.querySelectorAll('input[type="checkbox"]');
      inputs.forEach(function (input) { input.disabled = role === 'admin'; if (role === 'admin') input.checked = true; });
    };

    content.innerHTML =
      '<div class="modal user-admin-modal">' +
      '<div class="user-admin-head">' +
      '<div><h2>إدارة المستخدمين</h2><p>أضف المستخدم وحدد دوره والفرع والأقسام التي يستطيع رؤيتها.</p></div>' +
      '<div class="ua-head-actions">' +
      '<button type="button" class="btn btn-ghost btn-small" id="ua-welcome-template" title="عدّل نص رسالة الترحيب اللي بتتبعت لكل حساب جديد">✉️ رسالة الترحيب</button>' +
      '<button type="button" class="btn btn-ghost btn-small" id="user-admin-close">إغلاق</button>' +
      '</div></div>' +
      '<form id="user-admin-form" class="user-admin-form">' +
      '<input id="ua-name" placeholder="الاسم الكامل" required>' +
      '<input id="ua-email" type="email" dir="ltr" placeholder="البريد الإلكتروني" required>' +
      '<input id="ua-password" type="password" dir="ltr" placeholder="كلمة المرور المؤقتة" minlength="8" required>' +
      '<select id="ua-role"><option value="view">مشاهدة فقط</option><option value="ops">تشغيل (يفحص بس)</option><option value="manager">إداري</option><option value="admin">مدير النظام</option></select>' +
      '<select id="ua-branch">' + branchOptions + '</select>' +
      '<label id="ua-send-welcome"><input type="checkbox" id="ua-welcome-check" checked> إرسال رسالة ترحيب على بريده</label>' +
      '<small class="ua-branch-note">«كل الفروع» ⇐ يشوف كل الأسطول. لو اخترت فرع بعينه ⇐ يشوف ذلك الفرع فقط (الاسم لازم يطابق تمامًا).</small>' +
      '<div class="ua-permissions-block"><strong>الأقسام المسموح بها</strong><small>الرئيسية متاحة للجميع. المدير لديه وصول كامل.</small>' + permissionGrid('ua-new-permissions', allPageIds, false) + '</div>' +
      '<button class="btn btn-primary" type="submit">إضافة المستخدم</button>' +
      '</form>' +
      '<div id="user-admin-message" class="user-admin-message"></div>' +
      '<div class="user-admin-list" id="user-admin-list"><div class="empty">جارٍ تحميل المستخدمين...</div></div>' +
      '</div>';

    var msg = content.querySelector('#user-admin-message'), list = content.querySelector('#user-admin-list');
    var welcomeBtn = content.querySelector('#ua-welcome-template');
    if (welcomeBtn) welcomeBtn.onclick = function () { openWelcomeEditor(); };

    var renderUsersInner = async function () {
      if (!window.supabaseReady || !window.supabaseClient) { list.innerHTML = '<div class="empty">إدارة المستخدمين تحتاج اتصال Supabase.</div>'; return; }
      var result = await window.supabaseClient.from('profiles').select('id,full_name,role,branch_name,allowed_tabs,national_id,birth_date,phone').order('full_name', { ascending: true });
      if (result.error) { list.innerHTML = '<div class="empty">تعذر تحميل المستخدمين: ' + escapeHtml(result.error.message) + '</div>'; return; }
      var myId = window.currentUser && window.currentUser.id;
      list.innerHTML = (result.data || []).map(function (u) {
        var wanted = String(u.branch_name || '').trim();
        var options = branchOptions.split('<option ').map(function (chunk) {
          var isMatch = wanted && chunk.indexOf('value="' + escapeHtml(wanted) + '"') >= 0;
          return isMatch ? '<option selected ' + chunk : '<option ' + chunk;
        }).join('');
        var deleteBtn = (u.id === myId) ? '' : '<button type="button" class="btn btn-ghost btn-small ua-delete-user" style="color:var(--red,#CE4B3D)">حذف</button>';
        var allowed = Array.isArray(u.allowed_tabs) ? u.allowed_tabs : allPageIds;
        return '<div class="user-admin-row" data-user-id="' + escapeHtml(u.id) + '"><div class="ua-user-summary"><b>' + escapeHtml(u.full_name || 'بدون اسم') + '</b><small>' + escapeHtml((window.YahmaPerms && window.YahmaPerms.label ? window.YahmaPerms.label(u.role) : u.role) || 'view') + '</small>' +
          '<small class="ua-personal">' +
          '<span>📞 ' + (u.phone ? escapeHtml(u.phone) : '<i>الجوال مش مسجّل</i>') + '</span>' +
          '<span>🪪 ' + (u.national_id ? escapeHtml(u.national_id) : '<i>الهوية مش مسجّلة</i>') + '</span>' +
          '<span>🎂 ' + (u.birth_date ? escapeHtml(fmtDate(u.birth_date)) : '<i>الميلاد مش مسجّل</i>') + '</span>' +
          '</small></div>' +
          '<div class="ua-personal-edit">' +
          '<label>الجوال<input class="ua-p-phone" dir="ltr" inputmode="numeric" maxlength="10" value="' + escapeHtml(u.phone || '') + '" placeholder="05XXXXXXXX"></label>' +
          '<label>رقم الهوية<input class="ua-p-nid" dir="ltr" inputmode="numeric" maxlength="10" value="' + escapeHtml(u.national_id || '') + '" placeholder="10 أرقام"></label>' +
          '<label>تاريخ الميلاد<input class="ua-p-birth" type="date" value="' + escapeHtml(u.birth_date || '') + '"></label>' +
          '</div>' +
          '<div class="ua-user-fields"><select class="ua-existing-branch">' + options + '</select><select class="ua-existing-role"><option value="view" ' + (u.role === 'view' ? 'selected' : '') + '>مشاهدة</option><option value="ops" ' + (u.role === 'ops' ? 'selected' : '') + '>تشغيل</option><option value="manager" ' + (u.role === 'manager' ? 'selected' : '') + '>إداري</option><option value="admin" ' + (u.role === 'admin' ? 'selected' : '') + '>مدير النظام</option></select></div>' +
          '<div class="ua-user-permissions"><strong>الأقسام المسموح بها</strong>' + permissionGrid('ua-existing-permissions', allowed, u.role === 'admin') + '</div>' +
          '<div class="ua-user-actions"><button type="button" class="btn btn-ghost btn-small ua-save-role">حفظ</button>' + deleteBtn + '</div></div>';
      }).join('') || '<div class="empty">لا يوجد مستخدمون بعد.</div>';

      list.querySelectorAll('.ua-existing-role').forEach(function (select) { select.addEventListener('change', function () { syncPermissions(select.closest('.user-admin-row'), select.value); }); });
      list.querySelectorAll('.ua-save-role').forEach(function (btn) { btn.onclick = async function () {
        var row = btn.closest('.user-admin-row'),
          role = row.querySelector('.ua-existing-role').value,
          branch = row.querySelector('.ua-existing-branch').value.trim() || null,
          allowed = role === 'admin' ? allPageIds : selectedPermissions(row.querySelector('.ua-existing-permissions')),
          personal = {
            phone: row.querySelector('.ua-p-phone').value.trim(),
            national_id: row.querySelector('.ua-p-nid').value.trim(),
            birth_date: row.querySelector('.ua-p-birth').value.trim()
          };
        if (window.YahmaMyAccount && typeof window.YahmaMyAccount.validate === 'function') {
          var problem = window.YahmaMyAccount.validate(personal);
          if (problem) { msg.textContent = problem; return; }
        }
        btn.disabled = true;
        var payload = { role: role, branch_name: branch, allowed_tabs: allowed };
        payload.phone = personal.phone || null;
        payload.national_id = personal.national_id || null;
        payload.birth_date = personal.birth_date || null;
        var r = await window.supabaseClient.from('profiles').update(payload).eq('id', row.dataset.userId);
        msg.textContent = r.error ? 'تعذر حفظ بيانات المستخدم: ' + r.error.message : 'تم حفظ الصلاحيات والفرع والبيانات الشخصية';
        btn.disabled = false;
        if (!r.error) await renderUsersInner();
      }; });
      list.querySelectorAll('.ua-delete-user').forEach(function (btn) { btn.onclick = async function () {
        var row = btn.closest('.user-admin-row');
        var uname = row.querySelector('b') ? row.querySelector('b').textContent : 'هذا المستخدم';
        if (!confirm('متأكد إنك عايز تحذف "' + uname + '"؟ الإجراء ده لا يمكن التراجع عنه.')) return;
        btn.disabled = true; btn.textContent = 'جارِ الحذف...';
        try {
          var call = await invokeYahmaFunction('admin-delete-user', { id: row.dataset.userId }, msg);
          if (call.skipped) { btn.disabled = false; btn.textContent = 'حذف'; return; }
          var r = call.result;
          if (r.error) {
            showResult(msg, await describeInvokeError(r, 'تعذر حذف المستخدم: '), 'تعذر حذف المستخدم.');
            btn.disabled = false; btn.textContent = 'حذف';
            return;
          }
          msg.textContent = 'تم حذف المستخدم بنجاح';
          await renderUsersInner();
        } catch (err) {
          msg.textContent = 'تعذر حذف المستخدم: ' + (err.message || err);
          btn.disabled = false; btn.textContent = 'حذف';
        }
      }; });
    };

    content.querySelector('#ua-role').addEventListener('change', function () { syncPermissions(content.querySelector('.ua-new-permissions'), this.value); });
    content.querySelector('#user-admin-form').onsubmit = async function (e) {
      e.preventDefault(); msg.textContent = 'جارٍ إنشاء المستخدم...';
      if (!window.supabaseReady || !window.supabaseClient) { msg.textContent = 'اتصال Supabase غير متاح.'; return; }
      var role = content.querySelector('#ua-role').value;
      var payload = {
        name: content.querySelector('#ua-name').value.trim(),
        email: content.querySelector('#ua-email').value.trim(),
        password: content.querySelector('#ua-password').value,
        role: role,
        branch_name: content.querySelector('#ua-branch').value.trim(),
        allowed_tabs: role === 'admin' ? allPageIds : selectedPermissions(content.querySelector('.ua-new-permissions'))
      };
      var call = await invokeYahmaFunction('admin-create-user', payload, msg);
      if (call.skipped) return;
      var r = call.result;
      if (r.error) {
        showResult(msg, await describeInvokeError(r, 'تعذر إنشاء المستخدم: '), 'تعذر إنشاء المستخدم.');
        return;
      }
      msg.textContent = 'تم إنشاء المستخدم بنجاح';
      await renderUsersInner();
    };

    renderUsersInner();
  }

  global.YahmaUsers = { render: renderUsers };
})(typeof window !== 'undefined' ? window : this);
