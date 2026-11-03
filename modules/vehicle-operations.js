(function (global) {
  'use strict';

  async function saveFromForm(context) {
    const editingId = context.getEditingId();
    const result = global.YahmaVehicleForm.collect({
      fleet: context.fleet,
      editingId,
      todayStr: context.todayStr
    });
    if (result.error) {
      context.alert(result.error);
      return;
    }

    const { plate, data } = result;
    if (editingId) {
      const index = context.fleet.findIndex(car => car.id === editingId);
      context.fleet[index] = { ...context.fleet[index], ...data };
    } else {
      context.fleet.push({ id: context.uid(), ...data });
    }

    /* حالة التحميل على زر الحفظ عشان المستخدم يعرف إن العملية جارية */
    const saveButton = context.saveButton || document.getElementById('btn-save');
    let restored = false;
    function restoreButton() {
      if (restored) return;
      restored = true;
      if (saveButton) {
        saveButton.disabled = false;
        saveButton.textContent = 'حفظ';
      }
    }
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = 'جارِ الحفظ...';
    }

    const savedId = editingId || context.fleet[context.fleet.length - 1].id;
    let saved;
    try {
      saved = await context.saveData([savedId]);
    } finally {
      restoreButton();
    }
    if (!saved && context.supabaseReady) {
      context.alert('تعذر حفظ السيارة على Supabase. البيانات محفوظة محليًا فقط.');
      return;
    }

    /* إرسال الإشعار لا يجب أن يوقف حفظ السيارة أبدًا.
       كنا ننتظر الـ edge function، ولو رجّع خطأ بتظهر رسالة
       «لم يتم تحديث المستند» رغم إن البيانات اتحفظت فعلاً. */
    context.log(editingId ? 'تعديل سيارة' : 'إضافة سيارة', plate + ' — ' + (data.carStatus || 'غير محدد'));
    context.closeModal();
    context.render();
    if (!editingId && typeof context.notifyYahmaEvent === 'function') {
      /* في الخلفية ومن غير await — الحفظ خلص والشاشة اتحدّثت */
      Promise.resolve()
        .then(function () { return context.notifyYahmaEvent('vehicle_added', { plate, branch: data.branch || '' }); })
        .then(function (notice) {
          if (notice && ((!notice.ok && !notice.skipped) || notice.failed)) {
            console.warn('تعذر إرسال إشعار إضافة السيارة', notice.error || notice.failed);
          }
        })
        .catch(function (err) { console.warn('تعذر إرسال إشعار إضافة السيارة', err && err.message); });
    }
  }

  async function archiveEditing(context) {
    const editingId = context.getEditingId();
    if (!editingId) return;
    if (context.currentRole !== 'admin') {
      context.alert('الأرشفة متاحة للمدير فقط.');
      return;
    }
    if (!context.confirm('سيتم أرشفة السيارة بدل حذفها نهائيًا، ويمكن استعادتها لاحقًا. متابعة؟')) return;

    const car = context.fleet.find(item => item.id === editingId);
    const button = context.deleteButton;
    if (button) {
      button.disabled = true;
      button.textContent = 'جارِ الأرشفة...';
    }
    try {
      if (!car) return;
      car.carStatus = 'مؤرشفة';
      car.archivedAt = new Date().toISOString();
      car.archivedBy = context.userEmail || 'local-user';
      await context.saveData([editingId]);
      context.log('أرشفة سيارة', car.plate || editingId);
      context.closeModal();
      context.render();
      context.alert('تمت أرشفة السيارة ويمكن استعادتها بتغيير حالتها إلى نشط.');
    } catch (error) {
      console.error(error);
      context.alert('فشلت الأرشفة: ' + (error.message || error));
      if (button) {
        button.disabled = false;
        button.textContent = 'حذف العربية';
      }
    }
  }

  global.YahmaVehicleOperations = { saveFromForm, archiveEditing };
})(window);
