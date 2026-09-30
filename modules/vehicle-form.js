(function (global) {
  'use strict';

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
    const finalReview = !!document.getElementById('f-prep-final').checked;
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
        plate,
        brand: trimmed('f-brand'),
        type: trimmed('f-type'),
        model: trimmed('f-model'),
        year: trimmed('f-year'),
        serial,
        cardNumber,
        cardStatus: trimmed('f-cardstatus'),
        cardExpiry: value('f-cardexpiry'),
        licenseStatus: trimmed('f-licensestatus'),
        licenseExpiry: value('f-licenseexpiry'),
        inspectionStatus: trimmed('f-inspection'),
        insuranceStatus: trimmed('f-insurance'),
        insuranceCompany: trimmed('f-insurancecompany'),
        insuranceExpiry: value('f-insuranceexpiry'),
        owner: trimmed('f-owner'),
        ownerNumber: trimmed('f-ownernumber'),
        branch: trimmed('f-branch'),
        carStatus: trimmed('f-carstatus'),
        notes: trimmed('f-notes'),
        odometer: trimmed('f-odometer'),
        dailyRate: trimmed('f-dailyrate'),
        rentedDaysMonth: trimmed('f-renteddays'),
        updatedAt: todayStr(),
        nextService: value('f-nextservice'),
        lastMaintenance: value('f-lastmaintenance'),
        maintenanceCost: trimmed('f-maintenancecost'),
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

  global.YahmaVehicleForm = { collect };
})(window);
