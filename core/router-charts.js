/* ===== core/router-charts.js — الرسوم البيانية =====
 *
 * الدونات والأعمدة والرسوم السنوية والملكية. بتستخدمها صفحة
 * الفروع و«الرئيسية».
 *
 * Moved out of core/render-router.js — same functions, same names.
 */
const CHART_COLORS = ['#E0A42E','#3B82C4','#2FA36B','#9C4FD6','#D5503F','#20A3A3','#E8792E','#5A6FD6','#4C9E57','#C15DA8'];
function colorAt(i){ return CHART_COLORS[i % CHART_COLORS.length]; }

function buildDonut(counts){
  const entries = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  const total = entries.reduce((s,[,c])=>s+c,0) || 1;
  const r = 68, cx = 90, cy = 90, sw = 26;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  let circles = '';
  entries.forEach(([label,count],i)=>{
    const len = (count/total) * circ;
    circles += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${colorAt(i)}" stroke-width="${sw}" stroke-dasharray="${len.toFixed(2)} ${(circ-len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" />`;
    offset += len;
  });
  const svg = `<svg viewBox="0 0 180 180" width="180" height="180">
    <g transform="rotate(-90 90 90)">${circles}</g>
    <circle cx="90" cy="90" r="${r - sw/2 - 3}" fill="var(--panel)"/>
    <text x="90" y="86" text-anchor="middle" font-size="24" font-weight="700" fill="#17202B" font-family="Cairo, sans-serif">${total}</text>
    <text x="90" y="105" text-anchor="middle" font-size="11" fill="#6B7280" font-family="Cairo, sans-serif">إجمالي العربيات</text>
  </svg>`;
  const legend = entries.map(([label,count],i)=>`
    <div class="legend-item">
      <span class="legend-swatch" style="background:${colorAt(i)}"></span>
      <span class="legend-label">${label}</span>
      <span class="legend-count">${count}</span>
      <span class="legend-pct">${Math.round(count/total*100)}%</span>
    </div>`).join('');
  return `<div class="donut-wrap"><div>${svg}</div><div class="legend">${legend}</div></div>`;
}

function buildStackedBar(label, counts, total){
  const order = ['green','amber','red','grey'];
  const segs = order.filter(k=>counts[k]>0).map(k=>`<div class="stack-seg ${k}" style="width:${(counts[k]/total*100).toFixed(1)}%"></div>`).join('');
  const partsText = order.filter(k=>counts[k]>0).map(k=>{
    const names = {green:'جيدة', amber:'قريبة', red:'متأخرة/منتهية', grey:'غير محددة'};
    return `${counts[k]} ${names[k]}`;
  }).join(' · ');
  return `<div class="stack-block">
    <div class="stack-label"><span>${label}</span><span class="muted">${partsText}</span></div>
    <div class="stack-track">${segs}</div>
  </div>`;
}

function buildYearChart(counts){
  const years = Object.keys(counts).sort();
  const max = Math.max(...Object.values(counts), 1);
  const cols = years.map(y=>{
    const h = Math.max((counts[y]/max)*110, 4);
    return `<div class="year-col">
      <div class="year-bar-num">${counts[y]}</div>
      <div class="year-bar" style="height:${h}px"></div>
      <div class="year-label">${y}</div>
    </div>`;
  }).join('');
  return `<div class="year-chart">${cols}</div>`;
}

function buildOwnerChart(counts){
  const entries = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const max = Math.max(...entries.map(e=>e[1]), 1);
  return entries.map(([owner,count])=>`
    <div class="owner-row">
      <div class="owner-top"><b>${owner}</b><span class="muted-small">${count} عربية</span></div>
      <div class="owner-track"><div class="owner-fill" style="width:${(count/max*100).toFixed(1)}%"></div></div>
    </div>`).join('') || '<div class="empty">لا توجد بيانات ملاك بعد</div>';
}


