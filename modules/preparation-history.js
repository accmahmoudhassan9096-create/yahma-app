(function (global) {
  'use strict';

  function appendEvent(car, type, title, details) {
    car.prepEvents = Array.isArray(car.prepEvents) ? car.prepEvents : [];
    car.prepEvents.unshift({
      id: 'evt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      at: new Date().toISOString(),
      type,
      title,
      details: details || ''
    });
    car.prepEvents = car.prepEvents.slice(0, 100);
  }

  function formatDateTime(value) {
    if (!value) return '—';
    try { return new Date(value).toLocaleString('ar-EG-u-ca-gregory', { dateStyle: 'short', timeStyle: 'short' }); }
    catch (_) { return value; }
  }

  function renderTimeline(carId, context) {
    const { fleet, vehicleReadiness, prepStatusForCar, prepChecklistForCar, escapeHtml } = context;
    const car = fleet.find(item => item.id === carId);
    if (!car) return;
    car.prepEvents = Array.isArray(car.prepEvents) ? car.prepEvents : [];
    car.prepTasks = Array.isArray(car.prepTasks) ? car.prepTasks : [];

    const readiness = vehicleReadiness(car);
    const status = prepStatusForCar(car);
    const checklist = prepChecklistForCar(car);
    const autoEvents = [{ at: car.createdAt || '', title: 'بيانات السيارة', details: 'السيارة ضمن الأسطول' }];
    (readiness.failed || []).forEach(item => autoEvents.push({ at: '', title: 'سبب عدم الجاهزية', details: item.label }));
    if (checklist.final) {
      autoEvents.push({
        at: car.prepChecklist?.finalReviewAt || '',
        title: 'المراجعة النهائية',
        details: checklist.finalNote || 'تم اعتماد المراجعة النهائية'
      });
    }
    const events = [...car.prepEvents, ...autoEvents]
      .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
    const esc = value => escapeHtml(value ?? '');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.id = 'prep-timeline-overlay';
    overlay.innerHTML = `<div class="modal" style="max-width:760px"><div class="modal-head"><div><h3>مسار تجهيز السيارة</h3><div class="muted-small">${esc(car.plate || '—')} — ${esc(car.brand || '')} ${esc(car.model || '')}</div></div><span class="readiness-pill ${status.level}">${esc(status.label)}</span></div><div class="prep-summary"><div class="box"><span class="num">${readiness.checks.filter(item => item.ok).length}</span><span class="lbl">بنود مستوفاة</span></div><div class="box"><span class="num">${readiness.failed.length}</span><span class="lbl">بنود تحتاج إجراء</span></div><div class="box"><span class="num">${car.prepTasks.filter(task => task.status === 'done').length}</span><span class="lbl">مهام مكتملة</span></div><div class="box"><span class="num">${car.prepTasks.filter(task => task.status !== 'done').length}</span><span class="lbl">مهام مفتوحة</span></div><div class="box"><span class="num">${checklist.final ? '✓' : '—'}</span><span class="lbl">مراجعة نهائية</span></div></div><div class="panel"><h4 style="margin:0 0 12px">Timeline</h4><div class="prep-timeline">${events.length ? events.map(event => `<div class="prep-event"><b>${esc(event.title || 'حدث')}</b><small>${esc(event.details || '')}${event.at ? ' — ' + esc(formatDateTime(event.at)) : ''}</small></div>`).join('') : '<div class="empty">لا توجد أحداث مسجلة بعد</div>'}</div></div><div class="modal-foot"><button class="btn btn-ghost" id="close-prep-timeline">إغلاق</button></div></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#close-prep-timeline').onclick = () => overlay.remove();
    overlay.onclick = event => { if (event.target === overlay) overlay.remove(); };
  }

  global.YahmaPreparationHistory = { appendEvent, renderTimeline };
})(window);
