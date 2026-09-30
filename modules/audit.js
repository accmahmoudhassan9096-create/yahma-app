(function (global) {
  'use strict';

  function renderAuditPage(content, context) {
    document.getElementById('topbar-title').textContent = 'سجل نشاط المستخدمين';
    document.getElementById('topbar-sub').textContent = 'كل الحركات المسجلة بالتاريخ والوقت';
    content.innerHTML = '<div class="panel audit-page-launch"><h2>سجل نشاط المستخدمين</h2><p class="muted-small">يعرض هذا التقرير عمليات الإضافة والتعديل والحذف والاستيراد وتسجيل الدخول.</p><button type="button" class="btn btn-primary" id="audit-page-open">عرض سجل النشاط</button></div>';
    global._yahmaCurrentPdfData = () => ({
      title: 'سجل نشاط المستخدمين',
      subtitle: 'افتح سجل النشاط أولًا لعرض البيانات',
      headers: ['التاريخ والوقت', 'المستخدم', 'الدور', 'الحركة', 'التفاصيل'],
      rows: []
    });
    document.getElementById('audit-page-open')?.addEventListener('click', () => global.openAuditReport && global.openAuditReport());
    if (context.currentRole !== 'admin') document.getElementById('audit-page-open').disabled = true;
  }

  global.YahmaAudit = { render: renderAuditPage };
})(window);
