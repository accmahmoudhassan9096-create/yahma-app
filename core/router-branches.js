/* ===== core/router-branches.js — تبويب الفروع =====
 *
 * رسم صفحة الفروع، استيراد ملف حالة الفروع، وإرسال رسالة
 * للفروع (إيميل/واتساب)، ونافذة تعديل الفرع.
 *
 * Moved out of core/render-router.js — same functions, same names.
 */
async function downloadBranchStatusTemplate(){
  if(!(await ensureXlsxReady())){ alert('مكتبة Excel غير متاحة. تأكد من الاتصال بالإنترنت.'); return; }
  const headers=['رقم اللوحة','الفرع','حالة السيارة'];
  const examples=[
    ['ر ن س 6724','فرع الرياض','نشط'],
    ['ر ن س 6725','فرع جدة','تحت الصيانة'],
    ['ر ن س 6726','فرع الدمام','خارج الخدمة']
  ];
  const ws=XLSX.utils.aoa_to_sheet([headers,...examples]);
  ws['!cols']=[{wch:18},{wch:18},{wch:16}];
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'تحديث فرع وحالة');
  XLSX.writeFile(wb,'نموذج-تحديث-فرع-وحالة.xlsx');
}
async function handleBranchStatusImport(file){
  if(!(await ensureXlsxReady())){ alert('مكتبة Excel غير متاحة. تأكد من الاتصال بالإنترنت.'); return; }
  let rows;
  try{
    const buf=await file.arrayBuffer();
    const wb=XLSX.read(buf,{type:'array',cellDates:true});
    const ws=wb.Sheets[wb.SheetNames[0]];
    rows=XLSX.utils.sheet_to_json(ws,{defval:''});
  }catch(e){
    alert('تعذر قراءة الملف.');
    return;
  }
  if(!rows.length){ alert('الملف فارغ.'); return; }

  const normPlate=typeof normalizePlateKey==='function'?normalizePlateKey:(p=>String(p||'').replace(/\s+/g,'').toLowerCase());
  const byPlate=new Map();
  fleet.forEach(c=>{ byPlate.set(normPlate(c.plate), c); });

  let updated=0, notFound=0, skipped=0;
  const changes=[];
  const changedIds=[];
  rows.forEach(row=>{
    let plate='', branch='', status='';
    Object.keys(row).forEach(h=>{
      const nh=String(h).replace(/\s+/g,'').toLowerCase();
      const field=typeof findField==='function'?findField(h):null;
      if(field==='plate'||nh.includes('لوح')||nh.includes('plate')) plate=row[h];
      else if(field==='branch'||nh.includes('فرع')||nh.includes('branch')) branch=row[h];
      else if(field==='carStatus'||nh.includes('حالة')||nh.includes('status')) status=row[h];
    });
    // fallback: columns by order
    const vals=Object.values(row);
    if(!plate && vals[0]) plate=vals[0];
    if(!branch && vals[1]!=null && vals[1]!=='') branch=vals[1];
    if(!status && vals[2]!=null && vals[2]!=='') status=vals[2];

    plate=String(plate||'').trim();
    branch=String(branch||'').trim();
    status=String(status||'').trim();
    if(!plate){ skipped++; return; }
    if(!branch && !status){ skipped++; return; }

    const car=byPlate.get(normPlate(plate));
    if(!car){ notFound++; return; }

    let changed=false;
    if(branch && String(car.branch||'').trim()!==branch){
      car.branch=branch;
      ensureBranchName(branch);
      changed=true;
    }
    if(status){
      // تطبيع بسيط للحالة
      let st=status;
      if(st.includes('صيان')) st='تحت الصيانة';
      else if(st.includes('خارج')) st='خارج الخدمة';
      else if(st==='نشط'||st==='ساري'||st.toLowerCase()==='active') st='نشط';
      if(String(car.carStatus||'').trim()!==st){
        car.carStatus=st;
        changed=true;
      }
    }
    if(changed){ updated++; changes.push(car.plate); changedIds.push(car.id); }
  });

  if(!updated){
    alert('لم يتم تحديث أي سيارة.\nغير موجودة: '+notFound+'\nتم تجاهل: '+skipped);
    return;
  }
  if(!confirm('سيتم تحديث '+updated+' سيارة (فرع و/أو حالة).\nمتابعة؟')) return;
  await saveData(changedIds);
  render();
  alert('تم تحديث '+updated+' سيارة.'+(notFound? '\nغير موجودة بالأسطول: '+notFound:'')+(skipped? '\nصفوف متجاهلة: '+skipped:''));
}

function buildBranchMessage(branchName, kind){
  const st=branchStats(branchName);
  const lines=[];
  const title=kind==='insp'?'السيارات غير المفحوصة':kind==='card'?'الكروت التي تحتاج متابعة':kind==='lic'?'الرخص التي تحتاج متابعة':'ملخص جاهزية الفرع';
  lines.push('📋 *'+title+'*');
  lines.push('الفرع: *'+branchName+'*');
  lines.push('التاريخ: '+new Date().toLocaleDateString('ar-EG'));
  lines.push('————————————');
  let list=st.cars;
  if(kind==='insp') list=st.cars.filter(c=>inspectionDisplayStatus(c.inspectionStatus).level!=='green');
  else if(kind==='card') list=st.cars.filter(c=>cardDisplayStatus(c.cardExpiry,c.cardStatus).level!=='green');
  else if(kind==='lic') list=st.cars.filter(c=>licenseDisplayStatus(c.licenseExpiry).level!=='green');
  else if(kind==='summary'){
    lines.push('إجمالي السيارات: '+st.total);
    lines.push('جاهزة: '+st.ready);
    lines.push('تحتاج فحص: '+st.insp);
    lines.push('كارت يحتاج متابعة: '+st.card);
    lines.push('رخصة تحتاج متابعة: '+st.lic);
    lines.push('————————————');
    lines.push('مرسل من نظام إدارة الأسطول');
    return lines.join('\n');
  }
  lines.push('العدد: *'+list.length+'*');
  lines.push('————————————');
  if(!list.length) lines.push('✅ لا توجد عناصر.');
  else list.slice(0,80).forEach((c,i)=>{
    lines.push((i+1)+') '+(c.plate||'—')+' | '+(c.carStatus||'—'));
    if(kind==='insp') lines.push('   الفحص: '+inspectionDisplayStatus(c.inspectionStatus).label);
    if(kind==='card') lines.push('   الكارت: '+cardDisplayStatus(c.cardExpiry,c.cardStatus).label+(c.cardExpiry?' | '+fmtDate(c.cardExpiry):''));
    if(kind==='lic') lines.push('   الرخصة: '+licenseDisplayStatus(c.licenseExpiry).label+(c.licenseExpiry?' | '+fmtDate(c.licenseExpiry):''));
  });
  if(list.length>80) lines.push('… و '+(list.length-80)+' أخرى');
  lines.push('————————————');
  lines.push('مرسل من نظام إدارة الأسطول');
  return lines.join('\n');
}
function emailBranch(branchName, kind){
  const b=getBranchByName(branchName);
  const to=(b&&b.email)||'';
  const subject='تقرير '+(kind==='insp'?'الفحص':kind==='card'?'الكارت':kind==='lic'?'الرخصة':'الجاهزية')+' — فرع '+branchName;
  const body=buildBranchMessage(branchName, kind||'summary');
  const email=to||prompt('بريد الفرع (أو اتركه فارغًا واختر من برنامج البريد):', '')||'';
  window.location.href='mailto:'+encodeURIComponent(email)+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
}
function whatsappBranch(branchName, kind){
  const b=getBranchByName(branchName);
  const phone=(b&&b.phone)||prompt('رقم واتساب الفرع (مثال: 2010xxxxxxxx) — اتركه فارغًا للاختيار يدويًا:','')||'';
  const st=branchStats(branchName);
  let list=st.cars, title='ملخص فرع '+branchName, headers, rows, filename;
  kind=kind||'summary';
  if(kind==='insp'){
    list=st.cars.filter(c=>inspectionDisplayStatus(c.inspectionStatus).level!=='green');
    title='غير المفحوصة — فرع '+branchName;
    headers=['رقم اللوحة','الماركة','الفرع','المالك','حالة السيارة','حالة الفحص','حالة الرخصة','انتهاء الرخصة'];
    rows=carsToInspRows(list);
    filename='فحص-'+branchName+'-'+todayStr();
  }else if(kind==='card'){
    list=st.cars.filter(c=>cardDisplayStatus(c.cardExpiry,c.cardStatus).level!=='green');
    title='كروت تحتاج متابعة — فرع '+branchName;
    headers=['رقم اللوحة','الماركة','الفرع','رقم الكارت','حالة السيارة','حالة الكارت','انتهاء الكارت','التأمين'];
    rows=carsToCardRows(list);
    filename='كارت-'+branchName+'-'+todayStr();
  }else if(kind==='lic'){
    list=st.cars.filter(c=>licenseDisplayStatus(c.licenseExpiry).level!=='green');
    title='رخص تحتاج متابعة — فرع '+branchName;
    headers=['رقم اللوحة','الماركة','الفرع','المالك','حالة السيارة','حالة الرخصة','انتهاء الرخصة'];
    rows=list.map(c=>[c.plate||'—',c.brand||'—',c.branch||'—',c.owner||'—',c.carStatus||'—',licenseDisplayStatus(c.licenseExpiry).label,fmtDate(c.licenseExpiry)]);
    filename='رخصة-'+branchName+'-'+todayStr();
  }else{
    title='ملخص جاهزية — فرع '+branchName;
    headers=['البند','العدد'];
    rows=[['إجمالي السيارات',String(st.total)],['جاهزة',String(st.ready)],['تحتاج فحص',String(st.insp)],['كارت يحتاج متابعة',String(st.card)],['رخصة تحتاج متابعة',String(st.lic)]];
    filename='ملخص-'+branchName+'-'+todayStr();
  }
  sharePdfOnWhatsApp({
    title,
    subtitle:'فرع '+branchName+' — '+list.length+' سجل',
    headers,
    rows,
    phone:String(phone||'').trim(),
    filename,
    caption:'📋 '+title+' ('+list.length+') — مرفق PDF',
    fallbackText:buildBranchMessage(branchName, kind)
  });
}

function renderBranches(content){
  return window.YahmaBranches.render(content, {
    fleet,
    getBranches: () => branches,
    replaceBranches: next => { branches = next; },
    ensureBranchName,
    branchStats,
    openBranchModal,
    saveBranches,
    emailBranch,
    whatsappBranch,
    downloadBranchStatusTemplate,
    escapeHtml
  });
}

function openBranchModal(id){
  const existing=id?branches.find(b=>b.id===id):null;
  editingBranchId=id||null;
  const name=existing?existing.name:'';
  const email=existing?existing.email:'';
  const phone=existing?existing.phone:'';
  const manager=existing?existing.manager:'';
  const notes=existing?existing.notes:'';
  const overlay=document.createElement('div');
  overlay.className='overlay';
  overlay.id='branch-overlay';
  overlay.style.display='flex';
  overlay.innerHTML=`<div class="modal" style="max-width:480px">
    <h2>${existing?'تعديل فرع':'إضافة فرع'}</h2>
    <div class="field-grid">
      <div class="field full"><label for="br-f-name">اسم الفرع *</label><input id="br-f-name" value="${escapeHtml(name)}"></div>
      <div class="field"><label for="br-f-manager">المسؤول</label><input id="br-f-manager" value="${escapeHtml(manager)}"></div>
      <div class="field"><label for="br-f-phone">واتساب</label><input id="br-f-phone" value="${escapeHtml(phone)}" placeholder="2010xxxxxxxx"></div>
      <div class="field full"><label for="br-f-email">الإيميل</label><input id="br-f-email" type="email" value="${escapeHtml(email)}" placeholder="branch@example.com"></div>
      <div class="field full"><label for="br-f-notes">ملاحظات</label><textarea id="br-f-notes">${escapeHtml(notes)}</textarea></div>
    </div>
    <div class="modal-actions">
      <div></div>
      <div class="modal-actions-right">
        <button class="btn btn-ghost" id="br-cancel">إلغاء</button>
        <button class="btn btn-primary" id="br-save">حفظ</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#br-cancel').onclick=()=>overlay.remove();
  overlay.onclick=e=>{ if(e.target===overlay) overlay.remove(); };
  overlay.querySelector('#br-save').onclick=()=>{
    const n=(document.getElementById('br-f-name').value||'').trim();
    if(!n){ alert('اسم الفرع مطلوب'); return; }
    const data={
      name:n,
      manager:(document.getElementById('br-f-manager').value||'').trim(),
      phone:(document.getElementById('br-f-phone').value||'').trim(),
      email:(document.getElementById('br-f-email').value||'').trim(),
      notes:(document.getElementById('br-f-notes').value||'').trim()
    };
    if(editingBranchId){
      const b=branches.find(x=>x.id===editingBranchId);
      if(b) Object.assign(b,data);
    }else{
      branches.push({id:'b'+Date.now()+Math.floor(Math.random()*999),...data});
    }
    saveBranches();
    overlay.remove();
    if(currentTab==='branches') render();
    else {
      const cb=document.getElementById('count-branches'); if(cb) cb.textContent=branches.length;
    }
  };
}

