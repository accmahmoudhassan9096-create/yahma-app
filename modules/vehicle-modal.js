(function (global) {
  'use strict';

  function open(id, context) {
    const { fleet, setEditingId, normalizeDateValue, prepChecklistForCar, prepStatusForCar, escapeHtml } = context;
    setEditingId(id || null);
    const car = id ? fleet.find(item => item.id === id) : null;
    const value = (field, fallback = '') => car ? (car[field] ?? fallback) : fallback;
    const fields = {
      'f-plate': value('plate'), 'f-brand': value('brand'), 'f-type': value('type'),
      'f-model': value('model'), 'f-year': value('year'), 'f-serial': value('serial'),
      'f-cardnumber': value('cardNumber'), 'f-cardstatus': value('cardStatus'),
      'f-cardexpiry': car ? normalizeDateValue(car.cardExpiry) : '',
      'f-licensestatus': value('licenseStatus'),
      'f-licenseexpiry': car ? normalizeDateValue(car.licenseExpiry) : '',
      'f-inspection': value('inspectionStatus'), 'f-insurance': value('insuranceStatus'),
      'f-owner': value('owner'), 'f-ownernumber': value('ownerNumber'),
      'f-branch': value('branch'), 'f-carstatus': value('carStatus'), 'f-notes': value('notes'),
      'f-odometer': value('odometer'), 'f-dailyrate': value('dailyRate'),
      'f-renteddays': value('rentedDaysMonth'), 'f-nextservice': value('nextService'),
      'f-lastmaintenance': value('lastMaintenance'), 'f-maintenancecost': value('maintenanceCost'),
      'f-workshop': value('workshop'), 'f-documenturl': value('documentUrl'),
      'f-maintenancenotes': value('maintenanceNotes')
    };
    document.getElementById('modal-title').textContent = car ? 'تعديل بيانات العربية' : 'إضافة عربية';
    Object.entries(fields).forEach(([fieldId, fieldValue]) => {
      document.getElementById(fieldId).value = fieldValue;
    });
    // نطاق الفرع: سيارة المستخدم المرتبط بفرع تُقيد على فرعه ولا يقبل تغييره من النموذج
    try{
      const scope=(typeof userBranchScope==='function')?userBranchScope():null;
      const branchEl=document.getElementById('f-branch');
      if(branchEl){
        if(scope){ branchEl.value=scope; branchEl.setAttribute('readonly','readonly'); branchEl.title='مقيد على فرعك: '+scope; }
        else branchEl.removeAttribute('readonly');
      }
    }catch(_){}

    const prep = car ? prepChecklistForCar(car) : { checks: [], final: false, finalNote: '' };
    const prepStatus = car ? prepStatusForCar(car) : { level: 'grey', label: 'غير محددة' };
    const statusElement = document.getElementById('f-prep-status');
    if (statusElement) {
      statusElement.className = 'readiness-pill ' + prepStatus.level;
      statusElement.textContent = prepStatus.label;
    }
    const checklistElement = document.getElementById('f-prep-checklist');
    if (checklistElement) {
      checklistElement.innerHTML = prep.checks.map(item => `<div class="prep-check"><div class="prep-check-left"><span class="prep-check-icon">${item.ok ? '✓' : '✕'}</span><span>${escapeHtml(item.label)}</span></div><span class="readiness-pill ${item.ok ? 'green' : 'red'}">${item.ok ? 'مستوفى' : 'يحتاج إجراء'}</span></div>`).join('');
    }
    const tasksElement = document.getElementById('f-prep-tasks');
    if (tasksElement) {
      const failed = (prep.checks || []).filter(item => !item.ok);
      const existing = car ? (car.prepTasks || []) : [];
      tasksElement.innerHTML = failed.length ? failed.map(item => {
        const sourceId = `auto-${car.id}-${item.key}`;
        const task = existing.find(entry => entry.sourceId === sourceId) || {};
        return `<div class="prep-task-item" data-prep-task="${escapeHtml(item.key)}"><div class="prep-task-item-head"><strong>مهمة: ${escapeHtml(item.label)}</strong><span class="readiness-pill red">تحتاج إجراء</span></div><div class="prep-task-fields"><input class="pt-assignee" placeholder="المسؤول" value="${escapeHtml(task.assignee || '')}"><input class="pt-due" type="date" value="${escapeHtml(task.dueDate || '')}"><select class="pt-status"><option value="open" ${task.status === 'open' || !task.status ? 'selected' : ''}>مفتوحة</option><option value="progress" ${task.status === 'progress' ? 'selected' : ''}>قيد التنفيذ</option><option value="done" ${task.status === 'done' ? 'selected' : ''}>مكتملة</option></select></div></div>`;
      }).join('') : '<div class="muted-small" style="padding:8px 0">لا توجد مهام تلقائية؛ السيارة مستوفية بنود الجاهزية الحالية.</div>';
    }
    document.getElementById('f-prep-final').checked = prep.final;
    document.getElementById('f-prep-final-note').value = prep.finalNote;
    document.getElementById('btn-delete').style.display = car ? 'inline-block' : 'none';
    document.getElementById('overlay').style.display = 'flex';
  }

  global.YahmaVehicleModal = { open };
})(window);
