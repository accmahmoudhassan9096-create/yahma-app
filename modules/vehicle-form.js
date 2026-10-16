(function (global) {
  'use strict';

  /* ===== الحقول المحمية =====
     نفس قائمة trigger يahma_guard_car_columns في القاعدة بالظبط.
     المقصود مش إننا نخفي البيانات — بتظهر وبتتفرأ عادي — المقصود إن
     حساب «مشاهدة» ما يعدّلش الحقول دي.

     formId ← اسم الحقل في كائن السيارة.
     'f-model' بيلفّ كمان year لأن collect بيعمل year من نفس الحقل. */
  const PROTECTED = [
    { field: 'plate', form: ['f-plate'] },
    { field: 'brand', form: ['f-brand'] },
    { field: 'type', form: ['f-type'] },
    { field: 'model', form: ['f-model'] },
    { field: 'serial', form: ['f-serial'] },
    { field: 'owner', form: ['f-owner'] },
    { field: 'ownerNumber', form: ['f-ownernumber'] },
    { field: 'branch', form: ['f-branch'] },
    { field: 'carStatus', form: ['f-carstatus'] },
    { field: 'dailyRate', form: ['f-dailyrate'] },
    { field: 'rentedDaysMonth', form: ['f-renteddays'] },
    { field: 'maintenanceCost', form: ['f-maintenancecost'] }
  ];

  /* «مشاهدة» هي اللي بتتقفل. تشغيل وإداري ومدير يعدّلوا كل حاجة. */
  function canTouchFields() {
    try {
      if (global._demoMode) return true;
      const perms = global.YahmaPerms;
      const r = (perms && typeof perms.role === 'function') ? perms.role() : global.currentRole;
      return r !== 'view';
    } catch (_) { return false; }
  }

  function protectedFormIds() {
    const out = [];
    PROTECTED.forEach((entry) => { out.push.apply(out, entry.form); });
    out.push('f-prep-final', 'f-prep-final-note');
    return out;
  }

  /* قفل الحقول في النموذج. بيتمسح القفل لما يرجع الدور.

     ⚠️ الـselect مالهوش readOnly — تعيين readOnly عليه بيعمل كده وخلاص
     والحقل يفضل قابل للتغيير. فبنقفله بـdisabled، والـvalue بنقراه
     بـJS مش بالفورم فمش مشكلة إنه مش هيتسلّم. */
  function applyFieldLocks() {
    const editable = canTouchFields();
    protectedFormIds().forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const isSelect = String(el.tagName).toLowerCase() === 'select';
      if (isSelect) {
        el.disabled = !editable;
      } else {
        el.readOnly = !editable;
      }
      const field = el.closest('.field');
      if (field) field.classList.toggle('field-locked', !editable);
      el.title = editable ? '' : 'هذا الحقل يعدّله مدير النظام أو الإداري فقط';
    });
  }

  /* هل الحقل مقفول دلوقتي؟ — بتستخدمه الاختبارات والواجهات. */
  function isLocked(formId) {
    const el = document.getElementById(formId);
    if (!el) return false;
    return String(el.tagName).toLowerCase() === 'select' ? !!el.disabled : !!el.readOnly;
  }

  function collect(context) {
    const { fleet, editingId, todayStr } = context;
    const value = id => document.getElementById(id).value;
    const trimmed = id => value(id).trim();
    const plate = trimmed('f-plate');
    if (!plate) return { error: 'من فضلك أدخل رقم اللوحة' };
    if (fleet.some(car => String(car.plate || '').trim().toLowerCase() === plate.toLowerCase() && car.id !== editingId)) {
      return { error: 'رقم اللوحة مسجل بالفعل. من فضلك استخدم رقمًا مختلفًا.' };
    }
    const serial = trimmed('f-serial');
    const cardNumber = trimmed('f-cardnumber');
    if (serial && fleet.some(car => String(car.serial || '').trim() === serial && car.id !== editingId)) {
      return { error: 'الرقم التسلسلي مسجل بالفعل لسيارة أخرى.' };
    }
    if (cardNumber && fleet.some(car => String(car.cardNumber || '').trim() === cardNumber && car.id !== editingId)) {
      return { error: 'رقم الكارت مسجل بالفعل لسيارة أخرى.' };
    }

    const currentCar = editingId && fleet.find(car => car.id === editingId);

    /* شبكة أمان: حتى لو الحقل اتفتح بالقوة (استرجاع، لصق، تعديل
       يدوي من الكونسول)، بنمشي بالقيمة القديمة مش اللي في الشاشة.
       كده الـtrigger في القاعدة مش هيتفاجأ أبدًا، والحفظ كله
       مانوش. */
    const editable = canTouchFields();
    const old = (field) => (currentCar && currentCar[field] != null) ? String(currentCar[field]) : '';
    const readField = (field, formId) => {
      if (editable) return trimmed(formId);
      return old(field);
    };

    const finalReview = editable
      ? !!document.getElementById('f-prep-final').checked
      : !!(currentCar && currentCar.prepChecklist && currentCar.prepChecklist.finalReview);
    const oldTasks = (currentCar?.prepTasks || []);
    const taskRows = [...document.querySelectorAll('#f-prep-tasks .prep-task-item')];
    taskRows.forEach(row => {
      const key = row.dataset.prepTask;
      const id = `auto-${editingId || 'new'}-${key}`;
      const item = {
        id,
        sourceId: id,
        title: key,
        auto: true,
        status: row.querySelector('.pt-status')?.value || 'open',
        assignee: row.querySelector('.pt-assignee')?.value.trim() || '',
        dueDate: row.querySelector('.pt-due')?.value || '',
        notes: ''
      };
      const index = oldTasks.findIndex(task => task.sourceId === `auto-${editingId}-${key}` || task.sourceId === item.sourceId);
      if (index >= 0) oldTasks[index] = { ...oldTasks[index], ...item, sourceId: `auto-${editingId}-${key}` };
      else oldTasks.push(item);
    });

    return {
      plate,
      data: {
        plate: readField('plate', 'f-plate'),
        brand: editable && typeof canonicalBrand === 'function'
          ? canonicalBrand(trimmed('f-brand'))
          : (editable ? trimmed('f-brand') : old('brand')),
        type: readField('type', 'f-type'),
        model: readField('model', 'f-model'),
        year: readField('model', 'f-model'),
        serial: readField('serial', 'f-serial'),
        cardNumber,
        cardStatus: trimmed('f-cardstatus'),
        cardExpiry: value('f-cardexpiry'),
        licenseStatus: trimmed('f-licensestatus'),
        licenseExpiry: value('f-licenseexpiry'),
        inspectionStatus: trimmed('f-inspection'),
        insuranceStatus: trimmed('f-insurance'),
        insuranceCompany: trimmed('f-insurancecompany'),
        insuranceExpiry: value('f-insuranceexpiry'),
        owner: readField('owner', 'f-owner'),
        ownerNumber: readField('ownerNumber', 'f-ownernumber'),
        branch: readField('branch', 'f-branch'),
        city: trimmed('f-city'),
        color: trimmed('f-color'),
        carStatus: readField('carStatus', 'f-carstatus'),
        notes: trimmed('f-notes'),
        odometer: trimmed('f-odometer'),
        dailyRate: readField('dailyRate', 'f-dailyrate'),
        rentedDaysMonth: readField('rentedDaysMonth', 'f-renteddays'),
        updatedAt: todayStr(),
        nextService: value('f-nextservice'),
        lastMaintenance: value('f-lastmaintenance'),
        maintenanceCost: readField('maintenanceCost', 'f-maintenancecost'),
        workshop: trimmed('f-workshop'),
        documentUrl: trimmed('f-documenturl'),
        maintenanceNotes: trimmed('f-maintenancenotes'),
        prepChecklist: {
          finalReview,
          finalNote: trimmed('f-prep-final-note'),
          finalReviewAt: finalReview ? new Date().toISOString() : currentCar?.prepChecklist?.finalReviewAt || ''
        },
        prepTasks: oldTasks.length || taskRows.length ? oldTasks : (currentCar?.prepTasks || [])
      }
    };
  }

  global.YahmaVehicleForm = {
    collect,
    applyFieldLocks,
    canTouchFields,
    isLocked,
    PROTECTED,
    protectedFormIds
  };
})(window);
