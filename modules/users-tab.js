/* ===== modules/users-tab.js — تبويب إدارة المستخدمين (مستقل) =====
   استُخرج من openUserAdmin() في topbar-user.js وجُعل تبويبًا مستقلاً
   يظهر في الشريط الجانبي بعد «الرئيسية»، ويبدو لمدير النظام (admin) فقط.
   تعرض واجهة إضافة/تعديل/حذف المستخدمين داخل content كشاشة كاملة ومنسقة. */

(function (global) {
  'use strict';

  async function renderUsers(content) {
    if (!content) content = document.getElementById('content');
    if (!content) return;

    var tbTitle = document.getElementById('topbar-title');
    var tbSub = document.getElementById('topbar-sub');
    if (tbTitle) tbTitle.textContent = 'إدارة المستخدمين';
    if (tbSub) tbSub.textContent = 'أضف المستخدم وحدد دوره والفرع والأقسام التي يستطيع رؤيتها.';

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
    var fleetList = (typeof fleet !== 'undefined' && Array.isArray(fleet)) ? fleet : (window.yahmaGetFleet ? window.yahmaGetFleet() : []);
    fleetList.forEach(function (c) {
      var n = String((c && c.branch) || '').trim(); if (!n) return;
      branchCounts.set(n, (branchCounts.get(n) || 0) + 1);
    });
    var branchSource = (typeof branches !== 'undefined' && Array.isArray(branches)) ? branches : [];
    branchSource.forEach(function (b) {
      var n = b && b.name ? String(b.name).trim() : ''; if (!n) return;
      if (!branchCounts.has(n)) branchCounts.set(n, 0);
    });
    var sortedBranches = Array.from(branchCounts.entries()).sort(function (a, b) { return b[1] - a[1]; });
    var branchOptions = '<option value="">كل الفروع — يشوف الكل</option>'
      + sortedBranches.map(function (pair) {
        var label = pair[0] + ' — ' + pair[1] + ' سيارة';
        return '<option value="' + escapeHtml(pair[0]) + '">' + escapeHtml(label) + '</option>';
      }).join('');

    var permsList = (typeof PAGE_PERMISSION_OPTIONS !== 'undefined' && Array.isArray(PAGE_PERMISSION_OPTIONS))
      ? PAGE_PERMISSION_OPTIONS
      : (window.PAGE_PERMISSION_OPTIONS || []);
    var allPageIds = permsList.map(function (page) { return page.id; });
    var permissionGrid = function (className, selected, disabled) {
      return '<div class="ua-permission-grid ' + className + '">' + permsList.map(function (page) {
        return '<label><input type="checkbox" value="' + page.id + '" ' + (selected.includes(page.id) ? 'checked ' : '') + (disabled ? 'disabled' : '') + '><span>' + page.label + '</span></label>';
      }).join('') + '</div>';
    };
    var selectedPermissions = function (scope) { return Array.from(scope.querySelectorAll('input[type="checkbox"]:checked')).map(function (input) { return input.value; }); };
    var syncPermissions = function (scope, role) {
      var inputs = scope.querySelectorAll('input[type="checkbox"]');
      inputs.forEach(function (input) { input.disabled = role === 'admin'; if (role === 'admin') input.checked = true; });
    };

    content.innerHTML =
      '<div class="user-admin-tab-container" style="max-width:1150px; margin:0 auto; display:flex; flex-direction:column; gap:20px; padding:8px 0 32px;">' +
      '  <div class="user-admin-head" style="margin-bottom:0; display:flex; justify-content:space-between; align-items:flex-start; gap:16px;">' +
      '    <div>' +
      '      <h2 style="margin:0 0 4px; font-size:20px; font-weight:700; color:var(--ink);">إدارة المستخدمين والصلاحيات</h2>' +
      '      <p style="margin:0; color:var(--muted); font-size:13px;">أنشئ مستخدمين جدد، تحكّم في الفروع والأقسام المسموح بها، وعدّل بيانات الحسابات المسجلة.</p>' +
      '    </div>' +
      '    <div class="ua-head-actions">' +
      '      <button type="button" class="btn btn-ghost btn-small" id="ua-welcome-template" title="عدّل نص رسالة الترحيب التي تُرسل لكل حساب جديد">✉️ رسالة الترحيب</button>' +
      '    </div>' +
      '  </div>' +

      '  <div class="panel" style="background:var(--paper); border:1px solid var(--line); border-radius:12px; padding:18px;">' +
      '    <h3 style="margin:0 0 14px; font-size:16px; font-weight:600; color:var(--ink); display:flex; align-items:center; gap:8px;">' +
      '      <span>➕</span> إنشاء مستخدم جديد' +
      '    </h3>' +
      '    <form id="user-admin-form" class="user-admin-form" style="background:transparent; border:none; padding:0;">' +
      '      <input id="ua-name" placeholder="الاسم الكامل" required>' +
      '      <input id="ua-email" type="email" dir="ltr" placeholder="البريد الإلكتروني" required>' +
      '      <input id="ua-password" type="password" dir="ltr" placeholder="كلمة المرور المؤقتة (8 أحرف فأكثر)" minlength="8" required>' +
      '      <select id="ua-role"><option value="view">مشاهدة فقط</option><option value="ops">تشغيل (يفحص بس)</option><option value="manager">إداري</option><option value="admin">مدير النظام</option></select>' +
      '      <select id="ua-branch">' + branchOptions + '</select>' +
      '      <label id="ua-send-welcome" style="display:flex; align-items:center; gap:8px; font-size:13px; cursor:pointer;"><input type="checkbox" id="ua-welcome-check" checked> إرسال رسالة ترحيب على بريده</label>' +
      '      <small class="ua-branch-note" style="grid-column:1/-1; color:var(--muted); font-size:11px;">«كل الفروع» ⇐ يشوف كل الأسطول. لو اخترت فرع بعينه ⇐ يشوف ذلك الفرع فقط (الاسم لازم يطابق تمامًا).</small>' +
      '      <div class="ua-permissions-block"><strong>الأقسام المسموح بها</strong><small>الرئيسية متاحة للجميع. المدير لديه وصول كامل.</small>' + permissionGrid('ua-new-permissions', allPageIds, false) + '</div>' +
      '      <div style="grid-column:1/-1; margin-top:8px;">' +
      '        <button class="btn btn-primary" type="submit" style="padding:9px 24px; font-weight:600;">إضافة المستخدم</button>' +
      '      </div>' +
      '    </form>' +
      '    <div id="user-admin-message" class="user-admin-message" style="margin-top:10px; font-weight:500;"></div>' +
      '  </div>' +

      '  <div class="panel" style="background:var(--paper); border:1px solid var(--line); border-radius:12px; padding:18px;">' +
      '    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">' +
      '      <h3 style="margin:0; font-size:16px; font-weight:600; color:var(--ink); display:flex; align-items:center; gap:8px;">' +
      '        <span>👥</span> المستخدمون الحاليون' +
      '      </h3>' +
      '      <span id="ua-users-count" style="font-size:12px; color:var(--muted);"></span>' +
      '    </div>' +
      '    <div class="user-admin-list" id="user-admin-list" style="max-height:none; overflow:visible;">' +
      '      <div class="empty">جارٍ تحميل المستخدمين...</div>' +
      '    </div>' +
      '  </div>' +
      '</div>';

    var msg = content.querySelector('#user-admin-message'), list = content.querySelector('#user-admin-list');
    var countEl = content.querySelector('#ua-users-count');
    var welcomeBtn = content.querySelector('#ua-welcome-template');
    if (welcomeBtn) {
      welcomeBtn.onclick = function () {
        if (typeof window.yahmaOpenWelcomeEditor === 'function') {
          window.yahmaOpenWelcomeEditor();
        } else if (window.YahmaTopbarUser && typeof window.YahmaTopbarUser.openWelcomeEditor === 'function') {
          window.YahmaTopbarUser.openWelcomeEditor();
        } else if (typeof openWelcomeEditor === 'function') {
          openWelcomeEditor();
        }
      };
    }

    var renderUsersInner = async function () {
      if (!window.supabaseReady || !window.supabaseClient) { list.innerHTML = '<div class="empty">إدارة المستخدمين تحتاج اتصال Supabase.</div>'; return; }
      var result = await window.supabaseClient.from('profiles').select('id,full_name,role,branch_name,allowed_tabs,national_id,birth_date,phone').order('full_name', { ascending: true });
      if (result.error) { list.innerHTML = '<div class="empty">تعذر تحميل المستخدمين: ' + escapeHtml(result.error.message) + '</div>'; return; }
      var users = result.data || [];
      if (countEl) countEl.textContent = 'إجمالي الحسابات: ' + users.length;
      var myId = window.currentUser && window.currentUser.id;
      list.innerHTML = users.map(function (u) {
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

    var roleSelect = content.querySelector('#ua-role');
    if (roleSelect) {
      roleSelect.addEventListener('change', function () {
        syncPermissions(content.querySelector('.ua-new-permissions'), this.value);
      });
    }

    var form = content.querySelector('#user-admin-form');
    if (form) {
      form.onsubmit = async function (e) {
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
        form.reset();
        await renderUsersInner();
      };
    }

    renderUsersInner();
  }

  global.YahmaUsers = { render: renderUsers };
})(typeof window !== 'undefined' ? window : this);
