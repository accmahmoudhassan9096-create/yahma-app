(function (global) {
  'use strict';

  function checklistForCar(car, vehicleReadiness) {
    const readiness = vehicleReadiness(car);
    const checks = readiness.checks.map(item => ({
      key: item.key,
      label: item.label,
      ok: item.ok,
      source: 'auto'
    }));
    const checklist = car.prepChecklist || {};
    return {
      checks,
      final: !!checklist.finalReview,
      finalNote: checklist.finalNote || ''
    };
  }

  function statusForCar(car, vehicleReadiness) {
    const readiness = vehicleReadiness(car);
    const checklist = checklistForCar(car, vehicleReadiness);
    if (readiness.ready && checklist.final) return { level: 'green', label: 'جاهزة للتأجير' };
    if ((car.prepTasks || []).some(task => task.status !== 'done')) return { level: 'amber', label: 'تحت التجهيز' };
    if (!readiness.ready) return { level: 'red', label: 'تحتاج إجراء' };
    return { level: 'blue', label: 'مراجعة نهائية' };
  }

  function getTasks(fleet, vehicleReadiness) {
    const tasks = [];
    fleet.forEach(car => {
      const readiness = vehicleReadiness(car);
      (readiness.failed || []).forEach(item => {
        const id = `auto-${car.id}-${item.key}`;
        const existing = (car.prepTasks || []).find(task => task.sourceId === id);
        tasks.push({
          id,
          carId: car.id,
          plate: car.plate,
          branch: car.branch || '—',
          title: `${item.label} — ${car.plate}`,
          type: item.key,
          status: existing ? existing.status : 'open',
          assignee: existing?.assignee || '',
          dueDate: existing?.dueDate || '',
          notes: existing?.notes || '',
          auto: true,
          sourceId: id
        });
      });
      (car.prepTasks || []).filter(task => task.title && !task.auto).forEach(task => {
        tasks.push({ ...task, carId: car.id, plate: car.plate, branch: car.branch || '—' });
      });
    });
    return tasks;
  }

  function saveTask(fleet, task) {
    const car = fleet.find(item => item.id === task.carId);
    if (!car) return;
    car.prepTasks = Array.isArray(car.prepTasks) ? car.prepTasks : [];
    const index = car.prepTasks.findIndex(item => item.id === task.id || item.sourceId === task.sourceId);
    if (index >= 0) car.prepTasks[index] = { ...car.prepTasks[index], ...task };
    else car.prepTasks.push(task);
  }

  function statusLabel(status) {
    return status === 'done' ? 'مكتملة' : status === 'progress' ? 'قيد التنفيذ' : 'مفتوحة';
  }

  function dueState(value, today) {
    if (!value) return '';
    const currentDay = today || new Date().toISOString().slice(0, 10);
    return value < currentDay ? 'overdue' : value === currentDay ? 'today' : '';
  }

  async function saveInlineStatus(carId, taskId, status, context) {
    const car = context.fleet.find(item => item.id === carId);
    if (!car) return;
    car.prepTasks = Array.isArray(car.prepTasks) ? car.prepTasks : [];
    car.prepEvents = Array.isArray(car.prepEvents) ? car.prepEvents : [];
    let task = car.prepTasks.find(item => item.id === taskId || item.sourceId === taskId);
    if (!task) {
      task = { id: taskId, sourceId: taskId, title: 'مهمة تجهيز', auto: true };
      car.prepTasks.push(task);
    }
    const previousStatus = task.status || 'open';
    const now = new Date().toISOString();
    task.status = status;
    task.updatedAt = now;
    if (status === 'done' && previousStatus !== 'done') {
      task.completedAt = now;
      context.recordEvent(car, 'task', 'إكمال مهمة تجهيز', task.title || '');
    } else if (status !== previousStatus) {
      context.recordEvent(car, 'task', 'تحديث مهمة تجهيز', `${task.title || ''} — ${statusLabel(status)}`);
    }
    await context.saveData([carId]);
    context.render();
  }

  async function approveCar(car, note, context) {
    car.prepTasks = Array.isArray(car.prepTasks) ? car.prepTasks : [];
    car.prepEvents = Array.isArray(car.prepEvents) ? car.prepEvents : [];
    car.prepChecklist = car.prepChecklist || {};
    const readiness = context.vehicleReadiness(car);
    const pending = car.prepTasks.filter(task => task.status !== 'done');
    if (!readiness.ready || pending.length) return { ok: false, reason: 'requirements' };

    const now = new Date().toISOString();
    car.prepChecklist.finalReview = true;
    car.prepChecklist.finalReviewAt = now;
    car.prepChecklist.finalNote = String(note || '').trim();
    context.recordEvent(car, 'approval', 'اعتماد السيارة جاهزة للتأجير', car.prepChecklist.finalNote || 'تمت المراجعة النهائية');

    const saved = await context.saveData([car.id]);
    if (!saved && context.supabaseReady) return { ok: false, reason: 'save' };
    /* الاعتماد تم بالفعل — الإشعار بتبعت في الخلفية ومش بيؤثر على النتيجة */
    if (typeof context.notifyYahmaEvent === 'function') {
      Promise.resolve()
        .then(function () {
          return context.notifyYahmaEvent('vehicle_approved', { plate: car.plate || '', branch: car.branch || '' });
        })
        .then(function (notice) {
          if (notice && ((!notice.ok && !notice.skipped) || notice.failed)) {
            console.warn('تعذر إرسال إشعار الاعتماد', notice.error || notice.failed);
          }
        })
        .catch(function (err) { console.warn('تعذر إرسال إشعار الاعتماد', err && err.message); });
    }
    return { ok: true };
  }

  global.YahmaPreparationData = { checklistForCar, statusForCar, getTasks, saveTask, statusLabel, dueState, saveInlineStatus, approveCar };
})(window);
