(function(){
const B=window.WX_BUST,$=id=>document.getElementById(id);
const fmt=d=>new Date(d+"T00:00:00Z").toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"});
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const col=p=>{const t=Math.min(1,p/.6);return `rgb(${Math.round(242-120*t)},${Math.round(238-160*t)},${Math.round(233-142*t)})`};
const fg=p=>Math.min(1,p/.6)>.55?"#fff":"#2b2523",pc=p=>Math.round(p*100)+"%",f=(v,n)=>v==null?"n/a":v.toFixed(n);
if(!B)return;const M=B.meta;
window.PS79_bust=function(mode,day,lead,pts,map){
  const set=(a,b,c,d)=>{$("dataStatus").textContent=a;$("fieldValue").textContent=b;$("fieldDescription").textContent=c;$("pointCount").textContent=d};
  $("mapTitle").textContent=(mode==="confidence"?"Forecast confidence":"Bust probability")+` · Day ${lead} · issued ${fmt(day)}`;
  if(!B.pred[day]){set("Outside test period","No held-out prediction",`Baseline predictions exist only for held-out test issue dates (${fmt(B.dates[0])} to ${fmt(B.dates[B.dates.length-1])}). Pick a date in that range.`,"0 regions");$("mapLegend").innerHTML='<span class="source-chip">Held-out dates only</span>';return true}
  const P=B.pred[day],rows=[];pts.clearLayers();const al=B.regions.map((_,i)=>P[i][lead-1]).filter(p=>p>=0).sort((a,b)=>a-b),q=al[Math.floor(.8*al.length)];
  B.regions.forEach((r,i)=>{const p=P[i][lead-1];if(p<0)return;const v=mode==="confidence"?1-p:p;rows.push(p);
    L.circleMarker(B.cent[i],{radius:11,weight:1,color:"#2b2523",fillColor:col(mode==="confidence"?1-v:v),fillOpacity:.92}).bindPopup(`<strong>${esc(r)}</strong><br>Day ${lead} bust probability: <strong>${pc(p)}</strong><br>Confidence: <strong>${pc(1-p)}</strong><br>${p>=q?"Elevated: top fifth of regions for this date and lead":"Not in the top fifth for this date and lead"}`).addTo(pts)});
  if(!rows.length){set("No data","No predictions","No region has a Day "+lead+" prediction for this date.","0 regions");return true}
  const hi=rows.filter(p=>p>=q).length;
  set("Baseline model, held-out",`${pc(rows.reduce((a,b)=>a+b)/rows.length)} mean bust probability`,`${hi} of ${rows.length} regions are in the top fifth of probabilities for this date and lead (training base rate ${pc(M.base)}). Persistence baseline forecast, not NWP.`,`${rows.length} regions`);
  $("mapLegend").innerHTML=`<div class="legend-wrap"><div class="legend"><span>0%</span><div class="legend-bar"></div><span>60%+</span></div><div class="legend-labels"><span>${mode==="confidence"?"bust probability (darker = lower confidence)":"bust probability"}</span></div></div>`;return true};
const lt=$("leadTable");if(lt)lt.innerHTML=M.lead.map(l=>`<tr><td>Day ${l.k} (${l.k*24} h)</td><td>Persistence baseline (temperature)</td><td>${l.mae.toFixed(2)} °C</td><td>${f(l.roc,3)}</td></tr>`).join("");
const app=$("bustApp");if(!app)return;
const sel=$("bustDate"),btn=$("bustReveal");let shown=false;
B.dates.forEach(d=>sel.add(new Option(fmt(d),d)));sel.value=B.dates[Math.floor(B.dates.length/2)];
const order=(P)=>B.regions.map((r,i)=>i).sort((x,y)=>{const m=i=>{const a=P[i].filter(p=>p>=0);return a.reduce((s,v)=>s+v,0)/(a.length||1)};return m(y)-m(x)});
function draw(){const d=sel.value,P=B.pred[d],A=B.act[d],U=B.bust[d];
  let h='<thead><tr><th>Region</th>'+Array.from({length:10},(_,i)=>`<th>Day ${i+1}</th>`).join("")+'</tr></thead><tbody>';
  order(P).forEach(i=>{h+=`<tr><td>${esc(B.regions[i])}</td>`+P[i].map((p,k)=>{if(p<0)return'<td>n/a</td>';let t=pc(p),tip=`Bust probability ${pc(p)}, confidence ${pc(1-p)}`;
    if(shown){if(U[i][k]<0)t+=" ?";else{t+=U[i][k]?" ▲":" ○";tip+=`. Actual error ${A[i][k]} °C, ${U[i][k]?"BUST":"no bust"}`}}
    return`<td title="${tip}" style="background:${col(p)};color:${fg(p)};white-space:nowrap">${t}</td>`}).join("")+'</tr>'});
  $("bustGrid").innerHTML=h+'</tbody>';
  const all=P.flat().filter(p=>p>=0).sort((a,b)=>a-b),q=all[Math.floor(.8*all.length)];let n=0,b=0,fl=0,hit=0;P.forEach((r,i)=>r.forEach((p,k)=>{if(p<0||U[i][k]<0)return;n++;b+=U[i][k];if(p>=q){fl++;hit+=U[i][k]}}));
  $("bustSummary").textContent=shown?`Verification for ${fmt(d)}: ${b} of ${n} region-lead cells were busts (${pc(b/(n||1))}). The model flagged the top fifth of cells by probability (${fl}); ${hit} of them were busts${fl?` (${pc(hit/fl)})`:""}, catching ${hit} of ${b} busts. ▲ = bust, ○ = no bust, ? = not yet verifiable.`:`Cells show the probability that the Day-N persistence forecast error reaches the bust threshold. Regions are sorted by mean probability. Press “Reveal verification” to compare with what happened.`;
  btn.textContent=shown?"Hide verification":"Reveal verification"}
sel.onchange=()=>{shown=false;draw()};btn.onclick=()=>{shown=!shown;draw()};draw();
const m=Object.entries(M.metrics).map(([k,v])=>`<tr><td>${k}</td><td>${v.pr_auc}</td><td>${f(v.roc_auc,3)}</td><td>${v.brier}</td></tr>`).join("");
$("bustMetrics").innerHTML=`<p class="eyebrow">EVALUATION</p><h2>Held-out results</h2><div class="table-wrap"><table><thead><tr><th>Model (test ${fmt(M.test[0])} to ${fmt(M.test[1])})</th><th>PR-AUC</th><th>ROC-AUC</th><th>Brier</th></tr></thead><tbody>${m}</tbody></table></div>
<p class="data-note"><strong>Read this honestly.</strong> ${M.n_test.toLocaleString()} test cases, ${pc(M.test_bust)} of them busts, against a ${pc(M.base)} training base rate: the test months are warmer and less stable than the training months, so thresholds frozen from the training period are exceeded more often. The calibrated boosting model has the best Brier score, but the simple recent-volatility baseline ranks risky cases better (higher PR-AUC and ROC-AUC). With one season-limited sample and a persistence stand-in forecast, no claim of skill is made. Multi-year HRES/ERA5 or NCMRWF forecasts are needed for a real result.</p>
<div class="two-column" style="align-items:start;gap:24px;margin-top:30px"><div class="data-card"><p class="eyebrow">DEFINITIONS</p><div class="metric-list"><div><span>Forecast</span><strong>Persistence, regional mean °C</strong></div><div><span>Error</span><strong>|observed − forecast|</strong></div><div><span>Bust</span><strong>≥ 90th pct. of training error</strong></div><div><span>Confidence</span><strong>1 − bust probability</strong></div><div><span>Train</span><strong>${fmt(M.train[0])} – ${fmt(M.train[1])}</strong></div><div><span>Validation</span><strong>${fmt(M.val[0])} – ${fmt(M.val[1])}</strong></div><div><span>Test</span><strong>${fmt(M.test[0])} – ${fmt(M.test[1])}</strong></div><div><span>Embargo</span><strong>${M.embargo} days between splits</strong></div></div></div>
<div class="data-card"><p class="eyebrow">MODEL-ASSOCIATED SIGNALS</p><div class="metric-list">${M.importance.map(([k,v])=>`<div><span>${{k:"Lead day",temp:"Temperature at issue",chg3:"3-day temperature change",vol5:"5-day volatility",spat:"Spread across locations",sin:"Season (sine)",cos:"Season (cosine)",thr:"Historical error threshold"}[k]}</span><strong>${pc(v)}</strong></div>`).join("")}</div><p class="data-note">Feature importance shows what the model used, not a proven physical cause.</p></div></div>`;
})();
