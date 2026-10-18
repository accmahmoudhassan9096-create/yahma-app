/* ===== modules/users-tab.js — تبويب إدارة المستخدمين (مستقل) =====
   استُخرج من openUserAdmin() في topbar-user.js وجُعل تبويبًا مستقلاً
   يظهر في الشريط الجانبي بعد «الرئيسية»، ويبدو لمدير النظام (admin) فقط.
   تعرض واجهة إضافة/تعديل/حذف المستخدمين داخل content كشاشة كاملة مع فلاتر وبحث شامل. */

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

    /* ===== أسماء الفروع ===== */
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

    var branchFilterOptions = sortedBranches.map(function (pair) {
      return '<option value="' + escapeHtml(pair[0]) + '">' + escapeHtml(pair[0]) + '</option>';
    }).join('') + '<option value="__none__">بدون فرع مخصص (كل الفروع)</option>';

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
      '      <p style="margin:0; color:var(--muted); font-size:13px;">أنشئ مستخدمين جدد، تحكّم في الفروع والأقسام المسموح بها، وابحث في حسابات النظام.</p>' +
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
      '    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:14px;">' +
      '      <h3 style="margin:0; font-size:16px; font-weight:600; color:var(--ink); display:flex; align-items:center; gap:8px;">' +
      '        <span>👥</span> المستخدمون المسجلون بالمنصة' +
      '      </h3>' +
      '      <span id="ua-users-count" style="font-size:12px; color:var(--muted); font-weight:500;"></span>' +
      '    </div>' +

      /* ===== شريط الفلاتر والبحث في المستخدمين ===== */
      '    <div class="user-filter-bar" style="display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-bottom:16px; padding:12px; background:var(--panel); border:1px solid var(--line); border-radius:9px;">' +
      '      <div style="flex:1 1 240px; position:relative;">' +
      '        <span style="position:absolute; right:11px; top:50%; transform:translateY(-50%); color:var(--muted); pointer-events:none; font-size:14px;">⌕</span>' +
      '        <input id="ua-filter-search" placeholder="ابحث بالاسم، الجوال، رقم الهوية أو الفرع..." style="width:100%; padding:8px 30px 8px 10px; border:1px solid var(--line); border-radius:7px; font:inherit; background:var(--paper); color:var(--ink);">' +
      '      </div>' +
      '      <div style="flex:0 0 150px;">' +
      '        <select id="ua-filter-role" style="width:100%; padding:8px 10px; border:1px solid var(--line); border-radius:7px; font:inherit; background:var(--paper); color:var(--ink);">' +
      '          <option value="">كل الأدوار</option>' +
      '          <option value="admin">مدير النظام</option>' +
      '          <option value="manager">إداري</option>' +
      '          <option value="ops">تشغيل</option>' +
      '          <option value="view">مشاهدة</option>' +
      '        </select>' +
      '      </div>' +
      '      <div style="flex:0 0 180px;">' +
      '        <select id="ua-filter-branch" style="width:100%; padding:8px 10px; border:1px solid var(--line); border-radius:7px; font:inherit; background:var(--paper); color:var(--ink);">' +
      '          <option value="">كل الفروع</option>' +
      '          ' + branchFilterOptions +
      '        </select>' +
      '      </div>' +
      '      <div style="flex:0 0 150px;">' +
      '        <select id="ua-filter-status" style="width:100%; padding:8px 10px; border:1px solid var(--line); border-radius:7px; font:inherit; background:var(--paper); color:var(--ink);">' +
      '          <option value="">كل الحالات</option>' +
      '          <option value="complete">🟢 بيانات مكتملة</option>' +
      '          <option value="incomplete">🟡 بيانات ناقصة</option>' +
      '        </select>' +
      '      </div>' +
      '      <div>' +
      '        <button type="button" class="btn btn-ghost btn-small" id="ua-filter-clear" style="white-space:nowrap;">↺ مسح الفلاتر</button>' +
      '      </div>' +
      '    </div>' +

      '    <div class="user-admin-list" id="user-admin-list" style="max-height:none; overflow:visible;">' +
      '      <div class="empty">جارٍ تحميل المستخدمين...</div>' +
      '    </div>' +
      '  </div>' +
      '</div>';

    var msg = content.querySelector('#user-admin-message'), list = content.querySelector('#user-admin-list');
    var countEl = content.querySelector('#ua-users-count');
    var searchInput = content.querySelector('#ua-filter-search');
    var roleFilter = content.querySelector('#ua-filter-role');
    var branchFilter = content.querySelector('#ua-filter-branch');
    var statusFilter = content.querySelector('#ua-filter-status');
    var clearBtn = content.querySelector('#ua-filter-clear');

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

    var cachedUsers = [];

    var applyFiltersAndRenderList = function () {
      var q = (searchInput && searchInput.value || '').trim().toLowerCase();
      var normQ = q.replace(/[يى]/g, 'ي').replace(/[أإآ]/g, 'ا');
      var selRole = roleFilter && roleFilter.value || '';
      var selBranch = branchFilter && branchFilter.value || '';
      var selStatus = statusFilter && statusFilter.value || '';

      var filtered = cachedUsers.filter(function (u) {
        if (selRole && u.role !== selRole) return false;
        if (selBranch) {
          var b = String(u.branch_name || '').trim();
          if (selBranch === '__none__') {
            if (b) return false;
          } else {
            if (b !== selBranch) return false;
          }
        }
        if (selStatus === 'complete') {
          if (!u.phone || !u.national_id) return false;
        } else if (selStatus === 'incomplete') {
          if (u.phone && u.national_id) return false;
        }
        if (normQ) {
          var hay = [
            u.full_name || '',
            u.phone || '',
            u.national_id || '',
            u.branch_name || '',
            (window.YahmaPerms && window.YahmaPerms.label ? window.YahmaPerms.label(u.role) : u.role) || ''
          ].join(' ').toLowerCase().replace(/[يى]/g, 'ي').replace(/[أإآ]/g, 'ا');
          if (!hay.includes(normQ)) return false;
        }
        return true;
      });

      if (countEl) {
        if (filtered.length === cachedUsers.length) {
          countEl.textContent = 'إجمالي الحسابات: ' + cachedUsers.length;
        } else {
          countEl.textContent = 'عرض ' + filtered.length + ' من أصل ' + cachedUsers.length + ' مستخدم';
        }
      }

      var myId = window.currentUser && window.currentUser.id;
      list.innerHTML = filtered.map(function (u) {
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
      }).join('') || '<div class="empty">لا توجد حسابات مطابقة لمعايير البحث الحالية.</div>';

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

    var renderUsersInner = async function () {
      if (!window.supabaseReady || !window.supabaseClient) { list.innerHTML = '<div class="empty">إدارة المستخدمين تحتاج اتصال Supabase.</div>'; return; }
      var result = await window.supabaseClient.from('profiles').select('id,full_name,role,branch_name,allowed_tabs,national_id,birth_date,phone').order('full_name', { ascending: true });
      if (result.error) { list.innerHTML = '<div class="empty">تعذر تحميل المستخدمين: ' + escapeHtml(result.error.message) + '</div>'; return; }
      cachedUsers = result.data || [];
      applyFiltersAndRenderList();
    };

    /* ربط أحداث الفلاتر */
    if (searchInput) {
      var st = null;
      searchInput.addEventListener('input', function () {
        clearTimeout(st);
        st = setTimeout(applyFiltersAndRenderList, 120);
      });
    }
    if (roleFilter) roleFilter.addEventListener('change', applyFiltersAndRenderList);
    if (branchFilter) branchFilter.addEventListener('change', applyFiltersAndRenderList);
    if (statusFilter) statusFilter.addEventListener('change', applyFiltersAndRenderList);
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        if (searchInput) searchInput.value = '';
        if (roleFilter) roleFilter.value = '';
        if (branchFilter) branchFilter.value = '';
        if (statusFilter) statusFilter.value = '';
        applyFiltersAndRenderList();
      });
    }

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
