/*
 * modules/reports-view.js — واجهة لوحة التقارير
 *
 * القالب، الفلاتر، نافذة التفاصيل، وبطاقات المؤشرات والصفوف.
 * كل حاجة هنا بتلمس الـDOM.
 *
 * كل دالة بتاخد ctx — فيها الأسماء اللي كانت في نطاق renderReports.
 * القيم دي بتختلف مع كل رسم (القائمة المفلترة، الفترة، المؤشرات)،
 * فبتبعت صريح بدل ما تتقرأ من نطاق مشترك.
 */
(function (global) {
  'use strict';

  /* ===== القالب — HTML اللوحة ===== */
  function reportsTemplate(ctx) {
  const { DOC_BUCKETS, PERIOD_PRESETS, acc, activeCars, branchCompare, branchOpts, branchRevenue, branches, carsNoPrice, content, docDetail, donut, esc, expBuckets, fails, maint, maxFail, modelOpts, noRentalsNotice, notReady, out, ownerOpts, owners, pct, periodBounds, periodDays, periodLabel, prepOpen, prepOverdue, ready, readyPct, rentedDaysTotal, reportPresets, rf, rpFiltered, serviceDue, statusOpts, topDocBranches, topRevenueCars, topWorkshops, total, utilizationPct, weekBars } = ctx;
  return `
  <div class="rd-shell" id="reports-dashboard">
    <div class="rd-toolbar">
      <div class="rd-filters">
        <select id="rd-period" aria-label="فترة التقرير" title="فترة التقرير">${PERIOD_PRESETS.map(p=>`<option value="${p.key}" ${(window.periodRange.preset||'thisMonth')===p.key?'selected':''}>${p.label}</option>`).join('')}</select>
        <input type="date" id="rd-from" value="${esc((periodBounds().from==='1900-01-01'?'':periodBounds().from))}" style="display:none" title="من تاريخ">
        <input type="date" id="rd-to" value="${esc(periodBounds().to)}" style="display:none" title="إلى تاريخ">
        <select id="rd-wa-tpl" class="rd-wa-tpl" aria-label="قالب الرسالة" title="قالب الرسالة">
          <option value="daily">قالب: تقرير اليوم</option>
          <option value="monthly">قالب: الملخص الشهري</option>
          <option value="docs">قالب: تنبيه المستندات</option>
          <option value="branch">قالب: تقرير فرع</option>
        </select>
        <select id="rd-branch" aria-label="الفرع"><option value="all">كل الفروع</option>${branchOpts}</select>
        <select id="rd-owner" aria-label="المالك"><option value="all">كل الملاك</option>${ownerOpts}</select>
        <select id="rd-status" aria-label="الحالة"><option value="all">كل الحالات</option>${statusOpts}</select>
        <select id="rd-model" aria-label="الموديل"><option value="all">كل الموديلات</option>${modelOpts}</select>
        <select id="rd-issue" aria-label="نوع المشكلة">
          <option value="all" ${rf.issue==='all'?'selected':''}>كل المشاكل</option>
          <option value="notready" ${rf.issue==='notready'?'selected':''}>غير جاهز</option>
          <option value="card" ${rf.issue==='card'?'selected':''}>البطاقة</option>
          <option value="license" ${rf.issue==='license'?'selected':''}>الرخصة</option>
          <option value="inspection" ${rf.issue==='inspection'?'selected':''}>الفحص</option>
          <option value="insurance" ${rf.issue==='insurance'?'selected':''}>التأمين</option>
          <option value="maintenance" ${rf.issue==='maintenance'?'selected':''}>صيانة</option>
          <option value="out" ${rf.issue==='out'?'selected':''}>خارج الخدمة</option>
        </select>
        <select id="rd-saved-filter" aria-label="استعادة فلتر محفوظ" title="استعادة فلتر محفوظ">
          <option value="">اختر فلترًا محفوظًا (${reportPresets.length})</option>
          ${reportPresets.map((p,i)=>`<option value="${i}">${esc(p.name)}</option>`).join('')}
        </select>
        <button type="button" class="btn btn-ghost btn-small" id="rd-load-filter" ${reportPresets.length?'':'disabled'}>تطبيق المحفوظ</button>
        <button type="button" class="btn btn-ghost btn-small" id="rd-save-filter">حفظ الفلتر</button>
        <button type="button" class="btn btn-ghost btn-small" id="rd-delete-filter" ${reportPresets.length?'':'disabled'} title="حذف الفلتر المحدد">حذف المحفوظ</button>
      </div>
      <div class="rd-actions">
        <button type="button" class="btn btn-ghost btn-small" id="rd-refresh">↻ تحديث</button>
        ${window.currentRole==='admin'?'<button type="button" class="btn btn-ghost btn-small" id="rd-go-branch-mail" title="إعداد بريد الفروع وفحص خدمة الإرسال">📧 بريد الفروع</button>':''}
        <button type="button" class="btn btn-ghost btn-small" id="rd-audit">سجل النشاط</button>
        <button type="button" class="btn btn-ghost btn-small" id="rd-wa-copy">📋 نسخ</button>
        <button type="button" class="btn btn-primary btn-small" id="rd-formal">📑 التقرير الرسمي الشامل</button>
        <button type="button" class="btn btn-primary btn-small" id="rd-infog">📊 إنفوجرافيك</button>
        <button type="button" class="btn btn-ghost btn-small" id="rd-wa">واتساب</button>
        <button type="button" class="btn btn-ghost btn-small" id="rd-mail">إيميل</button>
        ${window.currentRole==='admin'?'<button type="button" class="btn btn-primary btn-small" id="rd-broadcast">✉ تعميم للمستخدمين</button>':''}
        <button type="button" class="btn btn-ghost btn-small" id="rd-excel">Excel</button>
        <button type="button" class="btn btn-primary btn-small" id="rd-pdf">PDF</button>
        <button type="button" class="btn btn-ghost btn-small" id="rd-shot">لقطة</button>
      </div>
    </div>
    <div class="rd-filter-status" id="rd-filter-status" aria-live="polite"></div>

    <div id="snd-banner"></div>

    <div class="rd-card rd-3d branch-mail-card" id="branch-mail-card" style="display:none"></div>

    <div class="rd-card rd-3d rd-acct-card">
      <div class="rd-card-h"><h3>مؤشرات محاسبية</h3><span class="rd-chip">تقديرية · ضمن الفترة</span></div>
      <div class="rd-acct">
        <div class="rd-acct-item ok"><b>${fmtSAR(acc.monthPotential)}</b><span>إيراد شهري متوقع</span><small>متوسط السعر اليومي × السيارات النشطة × 30 يوم</small></div>
        <div class="rd-acct-item"><b>${fmtSAR(acc.estMonthRev)}</b><span>إيراد حسب أيام التأجير</span><small>مجموع (السعر × الأيام المسجلة لكل سيارة)</small></div>
        <div class="rd-acct-item warn"><b>${fmtSAR(acc.maintCost)}</b><span>تكاليف صيانة مسجلة</span><small>مجموع «تكلفة آخر صيانة»</small></div>
        <div class="rd-acct-item ${acc.netEst>=0?'ok':'bad'}"><b>${fmtSAR(acc.netEst)}</b><span>صافي تقديري</span><small>الإيراد المتوقع − التكاليف</small></div>
        <div class="rd-acct-item"><b>${fmtSAR(acc.avgDaily)}</b><span>متوسط الإيراد اليومي</span><small>لكل سيارة</small></div>
        <div class="rd-acct-item"><b>${fmtSAR(acc.revPerCar)}</b><span>الإيراد لكل سيارة</span><small>شهريًا</small></div>
        <div class="rd-acct-item"><b>${acc.active}</b><span>سيارات نشطة</span><small>باستثناء خارج الخدمة/المؤرشفة/المباعة</small></div>
        <div class="rd-acct-item ${carsNoPrice.length?'warn':'ok'}" id="rd-noprice" role="button" tabindex="0" style="cursor:pointer" aria-label="سيارات بلا سعر يومي: ${carsNoPrice.length} — اضغط لعرضها"><b>${carsNoPrice.length}</b><span>بلا سعر يومي</span><small>اضغط لعرض السيارات</small></div>
        <div class="rd-acct-item"><b>${acc.days}</b><span>أيام الفترة</span><small>${esc(periodLabel())}</small></div>
      </div>
      ${acc.hasData?'':'<div class="rd-empty" style="margin-top:8px">لأرقام أدق: أدخل «سعر التأجير اليومي» و«أيام التأجير هذا الشهر» من نافذة تعديل كل سيارة — أو استورد عمود «سعر اليوم» من ملف Excel — الأرقام الحالية تقديرية من الأسعار المسجلة فقط.</div>'}
    </div>

    <div class="rd-grid rd-new-report-grid">
      /* ⭐ الكارت بيتلون حسب السبب: مفيش استئجارات ≠ استغلال صفر.
       0% حمرا بتقول المستخدم «أسطولك مش بيشتغل» وهي أصلاً
       «لسه محدّدش». الفرق ده كبير في القرار. */
      <div class="rd-card rd-3d">
        <div class="rd-card-h"><h3>تقرير الاستغلال والإيراد</h3><span class="rd-chip">من سجل الاستئجارات</span></div>
        ${rpFiltered.hasStore?`
        <div class="rd-acct">
          <div class="rd-acct-item ok"><b>${activeCars.length}</b><span>سيارات نشطة</span><small>قابلة للتأجير ضمن الفلتر</small></div>
          <div class="rd-acct-item ${utilizationPct>=50?'ok':(utilizationPct>0?'warn':'bad')}"><b>${utilizationPct}%</b><span>متوسط الاستغلال</span><small>${rentedDaysTotal} يوم تأجير مسجل من ${periodDays} يوم</small></div>
          <div class="rd-acct-item ok"><b>${fmtSAR(acc.estMonthRev)}</b><span>إيراد مسجل</span><small>${rpFiltered.carsRented} سيارة اتأجرت</small></div>
        </div>
        <div class="rd-report-list">${topRevenueCars.length?topRevenueCars.map(x=>`<div><span>${esc(x.car.plate||'—')} · ${esc(x.car.branch||'—')}</span><b>${fmtSAR(x.revenue)}</b></div>`).join(''):'<div class="rd-empty">مفيش استئجار مسجّل في الفترة دي.</div>'}</div>
        `:noRentalsNotice(rpFiltered.carsRented)}
      </div>
      <div class="rd-card rd-3d">
        <div class="rd-card-h"><h3>تقرير الصيانة</h3><span class="rd-chip">إجراءات قريبة</span></div>
        <div class="rd-acct">
          <div class="rd-acct-item warn"><b>${maint}</b><span>تحت الصيانة</span><small>ضمن الفترة الحالية</small></div>
          <div class="rd-acct-item bad"><b>${fmtSAR(acc.maintCost)}</b><span>تكلفة مسجلة</span><small>آخر صيانة</small></div>
          <div class="rd-acct-item ${serviceDue?'bad':'ok'}"><b>${serviceDue}</b><span>صيانة خلال 30 يوم</span><small>حسب الموعد القادم</small></div>
        </div>
        <div class="rd-report-list">${topWorkshops.length?topWorkshops.map(([name,count])=>`<div><span>${esc(name)}</span><b>${count} سيارة</b></div>`).join(''):'<div class="rd-empty">لا توجد سيارات تحت الصيانة ضمن الفلتر.</div>'}</div>
      </div>
    </div>

    <div class="rd-card rd-3d">
      <div class="rd-card-h"><h3>الإيراد حسب الفرع</h3><span class="rd-chip">من سعر اليوم المسجل</span></div>
      <div class="rd-report-list">${branchRevenue.length?branchRevenue.map(b=>`<div class="rd-rev-branch" data-rev-branch="${esc(b.name)}" role="button" tabindex="0" aria-label="إيراد فرع ${esc(b.name)}: ${fmtSAR(b.rev)}"><span>${esc(b.name)} · ${b.cars} سيارة · متوسط ${fmtSAR(b.avg)}/يوم</span><b>${fmtSAR(b.rev)}</b></div>`).join(''):'<div class="rd-empty">لا بيانات — أدخل سعر اليوم لكل سيارة.</div>'}</div>
    </div>

    <div class="rd-kpis">
      <div class="rd-kpi rd-3d" data-tip="إجمالي الأسطول ضمن الفلتر"><div class="rd-kpi-ico">🚗</div><b>${total}</b><span>إجمالي السيارات</span></div>
      <div class="rd-kpi rd-3d ok" data-tip="جاهزة للتأجير"><div class="rd-kpi-ico">✅</div><b>${ready}</b><span>جاهزة · ${readyPct}%</span></div>
      <div class="rd-kpi rd-3d bad" data-tip="غير جاهزة"><div class="rd-kpi-ico">⚠️</div><b>${notReady}</b><span>غير جاهزة · ${pct(notReady)}%</span></div>
      <div class="rd-kpi rd-3d warn" data-tip="قيد الصيانة"><div class="rd-kpi-ico">🔧</div><b>${maint}</b><span>صيانة</span></div>
      <div class="rd-kpi rd-3d" data-tip="مهام تجهيز مفتوحة"><div class="rd-kpi-ico">📋</div><b>${prepOpen}</b><span>مهام مفتوحة</span></div>
      <div class="rd-kpi rd-3d bad" data-tip="مهام متأخرة عن الاستحقاق"><div class="rd-kpi-ico">⏰</div><b>${prepOverdue}</b><span>مهام متأخرة</span></div>
    </div>

    <div class="rd-grid">
      <div class="rd-card rd-3d rd-span2">
        <div class="rd-card-h"><h3>الجاهزية</h3><span class="rd-chip">${total} سيارة</span></div>
        <div class="rd-donut-row">
          ${donut}
          <div class="rd-legend">
            <div class="rd-leg"><i style="background:#12AAA6"></i> جاهز <b>${ready}</b></div>
            <div class="rd-leg"><i style="background:#CE4B3D"></i> غير جاهز <b>${notReady}</b></div>
            <div class="rd-leg"><i style="background:#D6952A"></i> صيانة <b>${maint}</b></div>
            <div class="rd-leg"><i style="background:#6B7490"></i> خارج الخدمة <b>${out}</b></div>
            <div class="rd-meter"><span>نسبة الجاهزية</span><div class="rd-meter-track"><i style="width:${readyPct}%"></i></div><b>${readyPct}%</b></div>
          </div>
        </div>
      </div>

      <div class="rd-card rd-3d">
        <div class="rd-card-h"><h3>انتهاء المستندات</h3></div>
        <div class="rd-exp">
          <div class="rd-exp-row bad"><span>منتهي</span><b>${expBuckets.overdue}</b></div>
          <div class="rd-exp-row warn"><span>خلال 7 أيام</span><b>${expBuckets.d7}</b></div>
          <div class="rd-exp-row info"><span>خلال 30 يوم</span><b>${expBuckets.d30}</b></div>
          <div class="rd-exp-row"><span>خلال 90 يوم</span><b>${expBuckets.d90}</b></div>
        </div>
      </div>

      <div class="rd-card rd-3d rd-span2">
        <div class="rd-card-h"><h3>تفاصيل المستندات</h3><span class="rd-chip">حسب النوع والنطاق — اضغط أي رقم للتفاصيل</span></div>
        <div class="rd-doc-table" role="table" aria-label="تفاصيل المستندات حسب النوع">
          <div class="rd-doc-h" role="row"><span>المستند</span><span>منتهي</span><span>7 أيام</span><span>30 يوم</span><span>90 يوم</span></div>
          ${docDetail.map(d=>`
          <div class="rd-doc-r" role="row">
            <span>${esc(d.label)}</span>
            ${DOC_BUCKETS.map(b=>`<button type="button" class="rd-doc-cell ${b.cls}" data-doc="${d.key}" data-bucket="${b.key}" aria-label="${esc(d.label)} — ${esc(b.label)}: ${d.buckets[b.key].length}">${d.buckets[b.key].length}</button>`).join('')}
          </div>`).join('')}
        </div>
        <div class="rd-report-list">${topDocBranches.length?topDocBranches.map(([name,count])=>`<div class="rd-doc-branch" data-branch="${esc(name)}" role="button" tabindex="0" aria-label="مستندات منتهية في فرع ${esc(name)}: ${count}"><span>مستندات منتهية · ${esc(name)}</span><b>${count}</b></div>`).join(''):'<div class="rd-empty">لا مستندات منتهية ضمن الفلتر.</div>'}</div>
      </div>

      <div class="rd-card rd-3d">
        <div class="rd-card-h"><h3>أسباب عدم الجاهزية</h3></div>
        <div class="rd-bars">
          ${fails.length?fails.map(([lb,n])=>`
            <div class="rd-bar-row" title="${esc(lb)}">
              <span>${esc(lb)}</span>
              <div class="rd-bar-track"><i style="width:${Math.round(n/maxFail*100)}%"></i></div>
              <b>${n}</b>
            </div>`).join(''):'<div class="rd-empty">لا أسباب ضمن الفلتر</div>'}
        </div>
      </div>

      <div class="rd-card rd-3d rd-span2">
        <div class="rd-card-h"><h3>أداء الفروع</h3></div>
        <div class="rd-branch-table">
          <div class="rd-bt-h"><span>الفرع</span><span>الأسطول</span><span>الجاهز</span><span>النسبة</span><span>متأخر</span></div>
          ${branches.length?branches.map(b=>`
            <div class="rd-bt-r">
              <span>${esc(b.name)}</span>
              <span>${b.t}</span>
              <span>${b.r}</span>
              <span><div class="rd-mini"><i style="width:${b.pct}%"></i></div> ${b.pct}%</span>
              <span class="${b.ov?'rd-hot':''}">${b.ov}</span>
            </div>`).join(''):'<div class="rd-empty">لا بيانات</div>'}
        </div>
      </div>

      <div class="rd-card rd-3d" id="rd-owners-card">
        <div class="rd-card-h"><h3>توزيع الملاك</h3><span class="rd-chip">${owners.length} مالك</span></div>
        <div class="rd-bars" id="rd-owners-bars">
          ${(owners.length?owners:[]).slice(0,8).map(([n,c])=>`
            <div class="rd-bar-row rd-owner-row" data-owner="${esc(n)}" title="اضغط لعرض سيارات ${esc(n)}">
              <span>${esc(n)}</span>
              <div class="rd-bar-track"><i style="width:${Math.round(c/Math.max(1,(owners[0]||[0,1])[1])*100)}%;background:linear-gradient(90deg,#5a34ad,#7a4fd6)"></i></div>
              <b>${c}</b>
            </div>`).join('')||'<div class="rd-empty">—</div>'}
        </div>
        ${owners.length>8?`<button type="button" class="btn btn-ghost btn-small" id="rd-owners-more" style="margin-top:8px">عرض كل الملاك (${owners.length})</button>`:''}
      </div>
    </div>

    <div class="rd-grid rd-grid-bottom">
      <div class="rd-card rd-3d rd-span2">
        <div class="rd-card-h"><h3>الاتجاه الأسبوعي (تقريبي)</h3><span class="rd-chip">آخر 8 أسابيع</span></div>
        <div class="rd-week-chart" id="rd-week-chart">${weekBars}</div>
        <div class="rd-week-legend">
          <span><i style="background:#12AAA6"></i> مهام مكتملة</span>
          <span><i style="background:#CE4B3D"></i> مهام متأخرة</span>
          <span><i style="background:#D6952A"></i> مستندات قاربت</span>
        </div>
      </div>
      <div class="rd-card rd-3d">
        <div class="rd-card-h"><h3>مقارنة الفروع</h3><span class="rd-chip">جاهزية جنب بعض</span></div>
        <div class="rd-compare" id="rd-branch-compare">${branchCompare}</div>
      </div>
    </div>

    <div class="rd-card rd-3d rd-summary" id="rd-summary-card">
      <div class="rd-card-h"><h3>ملخص تنفيذي للمشاركة</h3><span class="rd-chip">واتساب / إيميل / PDF</span></div>
      <pre class="rd-summary-text" id="rd-summary-text">تقرير يهماء — منصة تحضير الأسطول
التاريخ: ${new Date().toLocaleString('ar-SA')}
الفترة: ${periodLabel()}
────────────────
إجمالي السيارات ضمن الفترة: ${total}
جاهزة: ${ready} (${readyPct}%)
غير جاهزة: ${notReady}
صيانة: ${maint} · خارج الخدمة: ${out}
مهام مفتوحة: ${prepOpen} · متأخرة: ${prepOverdue}
مستندات منتهية: ${expBuckets.overdue} · خلال 7 أيام: ${expBuckets.d7}
${acc.hasData?`مؤشرات محاسبية (تقديرية):
• إيراد شهري متوقع: ${fmtSAR(acc.estMonthRev||acc.monthPotential)}
• تكاليف صيانة: ${fmtSAR(acc.maintCost)}
• صافي تقديري: ${fmtSAR(acc.netEst)}`:'مؤشرات محاسبية: أدخل سعر التأجير اليومي وأيام التأجير من نافذة تعديل السيارة لعرض الأرقام'}
${branches.slice(0,5).map(b=>`• ${b.name}: ${b.pct}% جاهز (${b.r}/${b.t})`).join('\n')}
────────────────
فلتر: فرع=${rf.branch||'الكل'} · مشكلة=${rf.issue||'الكل'}
</pre>
    </div>
  </div>

    <div class="rd-card rd-3d snd-card">
      <div class="rd-card-h"><h3>📬 الإرسال المجدول وقائمة المستلمين</h3><span class="rd-chip">إرسال آلي من الخادم</span></div>
      <div class="snd-controls">
        <label><input type="checkbox" id="snd-en"> الجدولة مفعّلة</label>
        <label>تقرير يومي الساعة <input type="time" id="snd-daily-time" value="07:00"></label>
        <label>مستندات أسبوعي كل
          <select id="snd-weekly-day">
            <option value="0">الأحد</option><option value="1">الاثنين</option><option value="2">الثلاثاء</option><option value="3">الأربعاء</option><option value="4">الخميس</option><option value="5">الجمعة</option><option value="6">السبت</option>
          </select>
          الساعة <input type="time" id="snd-weekly-time" value="08:00"></label>
        <button type="button" class="btn btn-primary btn-small" id="snd-save-sched">حفظ الجدولة</button>
        <button type="button" class="btn btn-ghost btn-small" id="snd-mail-all">✉ فتح بريد للمستخدمين</button>
      </div>
      <div class="snd-form">
        <div class="fld"><label for="snd-name">الاسم</label><input id="snd-name" placeholder="مثال: مدير العمليات"></div>
        <div class="fld"><label for="snd-role">الدور</label><select id="snd-role"><option value="admin">مدير — كل الفروع</option><option value="branch">مشرف فرع</option></select></div>
        <div class="fld"><label for="snd-branch">الفرع (لمشرف الفرع)</label><input id="snd-branch" list="snd-branch-list" placeholder="اتركه فارغًا للمدير"><datalist id="snd-branch-list">${branchOpts}</datalist></div>
        <div class="fld"><label for="snd-phone">جوال واتساب</label><input id="snd-phone" dir="ltr" placeholder="9665xxxxxxxx"></div>
        <div class="fld"><label for="snd-email">البريد</label><input id="snd-email" dir="ltr" type="email" placeholder="name@company.com"></div>
        <div class="fld"><label>يستلم</label>
          <div style="display:flex;gap:10px">
            <label style="display:flex;align-items:center;gap:4px"><input type="checkbox" id="snd-gets-daily" checked> يومي</label>
            <label style="display:flex;align-items:center;gap:4px"><input type="checkbox" id="snd-gets-docs"> مستندات أسبوعي</label>
          </div>
        </div>
        <button type="button" class="btn btn-primary btn-small" id="snd-add">＋ إضافة مستلم</button>
      </div>
      <div class="snd-rows" id="snd-rows"></div>
      <div id="snd-batch" style="margin-top:12px"></div>
      <div class="rd-card-h" style="margin-top:14px"><h3>سجل الإرسال</h3><span class="rd-chip">آخر 20 عملية</span></div>
      <div class="snd-log" id="snd-log-rows"></div>
      <div class="snd-empty" id="snd-schedule-status">تصل التقارير المجدولة إلى جميع حسابات المنصة التي لديها بريد، حتى عند إغلاق المنصة. فعّل الجدولة واحفظها لبدء الإرسال. (الإرسال التلقائي يتطلب نشر دالة send-user-email وإعداد مفاتيح Resend — راجع README)</div>
    </div>`;
  }

  /* ===== الفلاتر — ربط عناصر التحكم ===== */
  function bindReportControls(ctx) {
  const { PERIOD_PRESETS, REPORT_PRESETS_KEY, content, esc, list, periodBounds, renderReports, rf } = ctx;
  const applyFilters = () => {
    window.periodRange.preset = document.getElementById('rd-period')?.value || 'thisMonth';
    if(window.periodRange.preset==='custom'){
      window.periodRange.from = document.getElementById('rd-from')?.value || '';
      window.periodRange.to   = document.getElementById('rd-to')?.value || '';
    }
    window.reportFilters = {
      branch: document.getElementById('rd-branch').value,
      owner: document.getElementById('rd-owner').value,
      status: document.getElementById('rd-status').value,
      model: document.getElementById('rd-model')?.value||'all',
      issue: document.getElementById('rd-issue').value,
      range: rf.range||'30'
    };
    persistReportState();
    renderReports(content);
  };
  const activeFilterLabels=()=>{
    const labels=[];
    if(rf.branch&&rf.branch!=='all') labels.push('الفرع: '+rf.branch);
    if(rf.owner&&rf.owner!=='all') labels.push('المالك: '+rf.owner);
    if(rf.status&&rf.status!=='all') labels.push('الحالة: '+rf.status);
    if(rf.model&&rf.model!=='all') labels.push('الموديل: '+rf.model);
    if(rf.issue&&rf.issue!=='all') labels.push('المشكلة: '+({notready:'غير جاهز',card:'البطاقة',license:'الرخصة',inspection:'الفحص',insurance:'التأمين',maintenance:'صيانة',out:'خارج الخدمة'}[rf.issue]||rf.issue));
    if(window.periodRange.preset!=='thisMonth') labels.push('الفترة: '+(PERIOD_PRESETS.find(p=>p.key===window.periodRange.preset)?.label||'مخصصة'));
    return labels;
  };
  const updateFilterStatus=()=>{
    const box=document.getElementById('rd-filter-status');
    if(!box) return;
    const labels=activeFilterLabels();
    box.innerHTML=`<span>${list.length} سيارة${labels.length?' · '+labels.length+' فلاتر نشطة':''}</span>${labels.length?`<span class="rd-filter-chips">${labels.map(label=>`<span class="rd-filter-chip">${esc(label)}</span>`).join('')}</span>`:''}<button type="button" class="btn btn-ghost btn-small" id="rd-clear-filters" ${labels.length?'':'disabled'}>إعادة ضبط الفلاتر</button>`;
    box.querySelector('#rd-clear-filters')?.addEventListener('click',()=>{
      window.reportFilters={branch:'all',owner:'all',status:'all',model:'all',issue:'all',range:'30'};
      window.periodRange={preset:'thisMonth',from:'',to:''};
      persistReportState();
      renderReports(content);
    });
  };
  updateFilterStatus();
  ['rd-branch','rd-owner','rd-status','rd-model','rd-issue','rd-period'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.onchange=applyFilters;
  });
  const syncCustomDates = ()=>{
    const per=document.getElementById('rd-period'); const f=document.getElementById('rd-from'); const t=document.getElementById('rd-to');
    if(!per||!f||!t) return;
    if(per.value==='custom'){ f.style.display=''; t.style.display=''; if(!f.value) f.value=periodBounds().from; if(!t.value) t.value=periodBounds().to; }
    else { f.style.display='none'; t.style.display='none'; }
  };
  syncCustomDates();
  /* زرار «لسه محدّدش استئجارات» — يوديه للتبويب عشان يسجّل
     أول عملية بدل ما يقفل التقرير عند 0%. */
  document.querySelectorAll('[data-goto-rentals]').forEach(b=>{
    b.addEventListener('click',()=>{
      if(typeof window.goTabFromRouter==='function') window.goTabFromRouter('rentals');
      else window.yahmaSetTab('rentals');
    });
  });
  const perEl=document.getElementById('rd-period'); if(perEl) perEl.addEventListener('change', syncCustomDates);
  ['rd-from','rd-to'].forEach(id=>{ const el=document.getElementById(id); if(el) el.addEventListener('change', ()=>{ if((window.periodRange.preset||'')==='custom') applyFilters(); }); });
  const savedFilterSelect=document.getElementById('rd-saved-filter');
  const applySavedFilter=()=>{
    if(!savedFilterSelect?.value){ alert('اختر فلترًا محفوظًا أولًا.'); return; }
    const index=Number(savedFilterSelect.value);
    const preset=getReportPresets()[index];
    if(!preset){ alert('الفلتر المحفوظ لم يعد متاحًا.'); return; }
    window.reportFilters={...preset.filters};
    window.periodRange={...preset.period};
    persistReportState();
    renderReports(content);
  };
  document.getElementById('rd-load-filter')?.addEventListener('click',applySavedFilter);
  document.getElementById('rd-save-filter')?.addEventListener('click',()=>{
    applyFiltersFromControls();
    const name=prompt('اكتب اسمًا واضحًا لهذا الفلتر:');
    if(!name||!name.trim()) return;
    const presets=getReportPresets();
    const entry={name:name.trim(),filters:{...window.reportFilters},period:{...window.periodRange}};
    const existing=presets.findIndex(p=>p.name.toLocaleLowerCase()===entry.name.toLocaleLowerCase());
    if(existing>=0) presets[existing]=entry; else presets.push(entry);
    try{ localStorage.setItem(REPORT_PRESETS_KEY,JSON.stringify(presets)); }
    catch(e){ alert('تعذر حفظ الفلتر في هذا المتصفح.'); return; }
    renderReports(content);
  });
  function applyFiltersFromControls(){
    window.periodRange.preset = document.getElementById('rd-period')?.value || 'thisMonth';
    if(window.periodRange.preset==='custom'){
      window.periodRange.from = document.getElementById('rd-from')?.value || '';
      window.periodRange.to = document.getElementById('rd-to')?.value || '';
    }
    window.reportFilters={
      branch:document.getElementById('rd-branch')?.value||'all',
      owner:document.getElementById('rd-owner')?.value||'all',
      status:document.getElementById('rd-status')?.value||'all',
      model:document.getElementById('rd-model')?.value||'all',
      issue:document.getElementById('rd-issue')?.value||'all',
      range:rf.range||'30'
    };
    persistReportState();
  }
  document.getElementById('rd-delete-filter')?.addEventListener('click',()=>{
    if(!savedFilterSelect?.value){ alert('اختر فلترًا محفوظًا لحذفه أولًا.'); return; }
    const index=Number(savedFilterSelect?.value);
    const presets=getReportPresets();
    if(!Number.isInteger(index)||!presets[index]){ alert('اختر فلترًا محفوظًا لحذفه أولًا.'); return; }
    if(!confirm(`حذف الفلتر «${presets[index].name}»؟`)) return;
    presets.splice(index,1);
    try{ localStorage.setItem(REPORT_PRESETS_KEY,JSON.stringify(presets)); }
    catch(e){ alert('تعذر حذف الفلتر المحفوظ.'); return; }
    renderReports(content);
  });
  document.getElementById('rd-refresh').onclick=()=>renderReports(content);
  document.getElementById('rd-audit')?.addEventListener('click',()=>window.openAuditReport&&window.openAuditReport());
  }

  /* ===== نافذة التفاصيل (drill-down) ===== */
  function openDrill(ctx, title, cars, extraCol){
  const { esc } = ctx;
  /* ---- Drill-down: click KPI / rows to see cars ---- */
  function openDrill(ctx, title, cars, extraCol){
    let ov = document.getElementById('rd-drill-overlay');
    if(!ov){
      ov = document.createElement('div');
      ov.id = 'rd-drill-overlay';
      ov.className = 'rd-drill-overlay';
      document.body.appendChild(ov);
    }
    const rows = (cars||[]).map(c=>{
      let ready='—';
      try{ if(typeof vehicleReadiness==='function'){ const r=vehicleReadiness(c); ready=r.ready?'جاهز':(r.label||'غير جاهز'); } }catch(e){yahmaErr(e,'reports.js:1353');}
      const extra = extraCol ? `<td>${esc(extraCol.get(c))}</td>` : '';
      return `<tr data-id="${esc(c.id)}">
        <td class="plate">${esc(c.plate||'—')}</td>
        <td>${esc([c.brand,c.model].filter(Boolean).join(' '))}</td>
        <td>${esc(c.branch||'—')}</td>
        <td>${esc(c.carStatus||'—')}</td>
        <td>${esc(ready)}</td>
        <td>${esc(c.owner||'—')}</td>${extra}
      </tr>`;
    }).join('') || `<tr><td colspan="${extraCol?7:6}" style="text-align:center;color:#888;padding:20px">لا توجد سيارات في هذا التصنيف</td></tr>`;
    ov.innerHTML = `<div class="rd-drill-modal" role="dialog">
      <div class="rd-drill-head">
        <div><h3>${esc(title)}</h3><p>${(cars||[]).length} سيارة</p></div>
        <button type="button" class="rd-drill-x" id="rd-drill-close">×</button>
      </div>
      <div class="rd-drill-body">
        <table class="rd-drill-table"><thead><tr>
          <th>اللوحة</th><th>السيارة</th><th>الفرع</th><th>الحالة</th><th>الجاهزية</th><th>المالك</th>${extraCol?`<th>${esc(extraCol.label)}</th>`:''}
        </tr></thead><tbody>${rows}</tbody></table>
      </div>
      <div class="rd-drill-foot">
        <button type="button" class="btn btn-ghost btn-small" id="rd-drill-excel">تصدير Excel</button>
        <button type="button" class="btn btn-primary btn-small" id="rd-drill-close2">إغلاق</button>
      </div>
    </div>`;
    ov.classList.add('open');
    const close = ()=>ov.classList.remove('open');
    ov.onclick = e => { if(e.target===ov) close(); };
    document.getElementById('rd-drill-close').onclick = close;
    document.getElementById('rd-drill-close2').onclick = close;
    ov.querySelectorAll('tbody tr[data-id]').forEach(tr=>{
      tr.onclick = ()=>{
        const id = tr.getAttribute('data-id');
        close();
        if(id && typeof openVehicle360==='function') openVehicle360(id);
        else if(id && typeof openModal==='function') openModal(id);
      };
    });
    document.getElementById('rd-drill-excel').onclick = async ()=>{
      if(!(await ensureXlsxReady())){ alert('مكتبة Excel غير متاحة'); return; }
      const data = (cars||[]).map(c=>{
        const r={
          'اللوحة':c.plate||'','الفرع':c.branch||'','الحالة':c.carStatus||'',
          'الماركة':c.brand||'','الموديل':c.model||'','المالك':c.owner||''
        };
        if(extraCol) r[extraCol.label]=extraCol.get(c);
        return r;
      });
      const ws=XLSX.utils.json_to_sheet(data.length?data:[{'اللوحة':'لا بيانات'}]);
      const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'التفاصيل');
      XLSX.writeFile(wb, 'yahma-drill-'+Date.now()+'.xlsx');
    };
  }
  }

  /* ===== بطاقات المؤشرات والصفوف ===== */
  function bindReportRows(ctx) {
  const { DOC_BUCKETS, DOC_TYPES, carsNoPrice, content, daysFrom, docBucketOf, docDetail, esc, expFields, list, ownersAll, ownersBars, ownersMore, today } = ctx;

  const carsReady = list.filter(c=>{ try{ return typeof vehicleReadiness==='function' && vehicleReadiness(c).ready; }catch(e){ return false; }});
  const carsNotReady = list.filter(c=>{ try{ return typeof vehicleReadiness==='function' ? !vehicleReadiness(c).ready : true; }catch(e){ return true; }});
  const carsMaint = list.filter(c=>String(c.carStatus||'').includes('صيانة'));
  const carsOut = list.filter(c=>String(c.carStatus||'').includes('خارج'));
  const carsPrepOpen = list.filter(c=>(c.prepTasks||[]).some(t=>t.status!=='done'));
  const carsPrepLate = list.filter(c=>(c.prepTasks||[]).some(t=>{
    if(t.status==='done'||!t.dueDate) return false;
    const d=new Date(t.dueDate); return !isNaN(d) && d<today;
  }));
  const carsExpOver = list.filter(c=>expFields.some(f=>{ const left=daysFrom(c[f]); return left!==null && left<0; }));
  const carsExp7 = list.filter(c=>expFields.some(f=>{ const left=daysFrom(c[f]); return left!==null && left>=0 && left<=7; }));
  const carsExp30 = list.filter(c=>expFields.some(f=>{ const left=daysFrom(c[f]); return left!==null && left>7 && left<=30; }));

  const kpis = content.querySelectorAll('.rd-kpi');
  // order matches render: total, ready, notReady, maint, prepOpen, prepOverdue
  const kpiMaps = [
    ['كل السيارات (الفلتر)', list],
    ['السيارات الجاهزة', carsReady],
    ['السيارات غير الجاهزة', carsNotReady],
    ['سيارات الصيانة', carsMaint],
    ['سيارات بمهام مفتوحة', carsPrepOpen],
    ['سيارات بمهام متأخرة', carsPrepLate]
  ];
  kpis.forEach((el, idx)=>{
    el.style.cursor = 'pointer';
    el.setAttribute('role','button');
    el.setAttribute('tabindex','0');
    el.setAttribute('aria-label',`${el.querySelector('span')?.textContent||'مؤشر'}: عرض التفاصيل`);
    el.onclick = (e)=>{ e.stopPropagation(); const m=kpiMaps[idx]; if(m) openDrill(ctx, m[0], m[1]); };
    el.onkeydown = e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); el.click(); } };
  });

  content.querySelectorAll('.rd-exp-row').forEach((el, idx)=>{
    el.style.cursor='pointer';
    el.setAttribute('role','button');
    el.setAttribute('tabindex','0');
    const maps=[
      ['مستندات منتهية', carsExpOver],
      ['تنتهي خلال 7 أيام', carsExp7],
      ['تنتهي خلال 30 يوم', carsExp30],
      ['تنتهي خلال 90 يوم', list.filter(c=>expFields.some(f=>{ const left=daysFrom(c[f]); return left!==null && left>30 && left<=90; }))]
    ];
    el.onclick = ()=>{ const m=maps[idx]; if(m) openDrill(ctx, m[0], m[1]); };
    el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click();}};
  });

  // تقرير المستندات التفصيلي: خلايا الأنواع والنطاقات
  content.querySelectorAll('.rd-doc-cell').forEach(el=>{
    el.onclick = ()=>{
      const doc = DOC_TYPES.find(d=>d.key===el.dataset.doc);
      const b = DOC_BUCKETS.find(x=>x.key===el.dataset.bucket);
      if(!doc||!b) return;
      const cars = (docDetail.find(d=>d.key===doc.key)||{buckets:{}}).buckets[b.key]||[];
      openDrill(ctx, doc.label+' — '+b.label, cars, {label:'انتهاء '+doc.label, get:c=>c[doc.key]||'—'});
    };
  });
  content.querySelectorAll('.rd-doc-branch').forEach(el=>{
    const open=()=>{
      const br=el.dataset.branch;
      const cars=list.filter(c=>(String(c.branch||'غير محدد').trim()||'غير محدد')===br && DOC_TYPES.some(dt=>docBucketOf(daysFrom(c[dt.key]))==='over'));
      openDrill(ctx, 'مستندات منتهية — '+br, cars);
    };
    el.onclick = open;
    el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}};
  });
  const nopriceEl=content.querySelector('#rd-noprice');
  if(nopriceEl){
    const open=()=>openDrill(ctx, 'سيارات بلا سعر يومي مسجل', carsNoPrice);
    nopriceEl.onclick=open;
    nopriceEl.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}};
  }
  content.querySelectorAll('.rd-rev-branch').forEach(el=>{
    const open=()=>{
      const br=el.dataset.revBranch;
      openDrill(ctx, 'إيراد فرع: '+br, list.filter(c=>(String(c.branch||'غير محدد').trim()||'غير محدد')===br));
    };
    el.onclick=open;
    el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}};
  });

  content.querySelectorAll('.rd-bar-row').forEach(el=>{
    el.style.cursor='pointer';
    el.setAttribute('role','button');
    el.setAttribute('tabindex','0');
    el.onclick = ()=>{
      const label = (el.querySelector('span')||{}).textContent||'';
      // filter cars whose readiness failure includes this label
      const cars = list.filter(c=>{
        try{
          if(typeof vehicleReadiness!=='function') return false;
          const r=vehicleReadiness(c);
          return (r.failed||[]).some(f=>String((f&&(f.label||f.name||f))||'')===label);
        }catch(e){ return false; }
      });
      // if in owner section (purple bars) - check parent card title
      const card = el.closest('.rd-card');
      const h = card && card.querySelector('h3') ? card.querySelector('h3').textContent : '';
      if(h && h.includes('ملاك')){
        const ownerCars = list.filter(c=>String(c.owner||'غير محدد').trim()===(label||'').trim() || String(c.owner||'غير محدد').trim()===label);
        openDrill(ctx, 'المالك: '+label, ownerCars.length?ownerCars:cars);
      } else {
        openDrill(ctx, 'سبب: '+label, cars);
      }
    };
    el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click();}};
  });

  content.querySelectorAll('.rd-bt-r').forEach(el=>{
    el.style.cursor='pointer';
    el.setAttribute('role','button');
    el.setAttribute('tabindex','0');
    el.onclick = ()=>{
      const name = el.querySelector('span') ? el.querySelector('span').textContent : '';
      openDrill(ctx, 'فرع: '+name, list.filter(c=>String(c.branch||'غير محدد').trim()===name));
    };
    el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click();}};
  });

  // تم إلغاء تأثير الميلان (3D tilt) — كان بيخلي الكارت يلتف ويزحلق
// المحتوى تحته لما الماوس يتحرك فوقه، وده كان مزعج أثناء القراءة.
  // الباقي زي ما هو: تظليل بسيط من CSS بس.
  content.querySelectorAll('.rd-3d').forEach(card=>{
    card.style.transformStyle = 'flat';
  });

  /* ===== تقرير الملاك: عرض الكل + تصفية بالضغط على المالك ===== */
  if (ownersMore && ownersBars && ownersAll.length) {
    let expanded = false;
    ownersMore.addEventListener('click', () => {
      expanded = !expanded;
      const shown = expanded ? ownersAll : ownersAll.slice(0, 8);
      ownersBars.innerHTML = shown.map(([n, c]) => {
        const pct = Math.round(c / Math.max(1, ownersAll[0][1]) * 100);
        return '<div class="rd-bar-row rd-owner-row" data-owner="' + esc(n) + '" title="اضغط لعرض سيارات ' + esc(n) + '">'
          + '<span>' + esc(n) + '</span>'
          + '<div class="rd-bar-track"><i style="width:' + pct + '%;background:linear-gradient(90deg,#5a34ad,#7a4fd6)"></i></div>'
          + '<b>' + c + '</b></div>';
      }).join('');
      ownersMore.textContent = expanded
        ? 'عرض أقل'
        : 'عرض كل الملاك (' + ownersAll.length + ')';
      bindOwnerRows(ctx);
    });
  }
  }

  /* ===== صفوف الملاك ===== */
  function bindOwnerRows(ctx){
  const { fleet, ownersBars } = ctx;
  function bindOwnerRows(ctx){
    if (!ownersBars) return;
    ownersBars.querySelectorAll('.rd-owner-row').forEach(row => {
      if (row._bound) return;
      row._bound = true;
      row.addEventListener('click', () => {
        const name = row.dataset.owner;
        if (!name || typeof openDrill !== 'function') return;
        const all = typeof fleet !== 'undefined' ? fleet : [];
        const list = all.filter(c => String(c.owner || 'غير محدد').trim() === String(name).trim());
        openDrill(ctx, 'مالك: ' + name, list);
      });
    });
  }
  }


  global.YahmaReportsView = {
    reportsTemplate, bindReportControls, openDrill, bindReportRows, bindOwnerRows
  };
})(typeof window !== 'undefined' ? window : this);
