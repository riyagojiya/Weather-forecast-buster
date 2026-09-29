document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.querySelector(".nav-toggle"), nav = document.querySelector(".site-nav");
  if (toggle && nav) toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open"); toggle.setAttribute("aria-expanded", String(open));
  });
  const mapEl = document.getElementById("weatherMap");
  if (!mapEl) return;
  const $ = id => document.getElementById(id);
  const leadSel = $("leadDay"), dateSel = $("dataDate"), varSel = $("dataVariable"), regSel = $("regionFilter"), modeSel = $("mapMode");
  const fmt = d => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"});
  const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const FIELDS = { temperature_celsius:["Temperature","°C",5], precip_mm:["Precipitation","mm",6], humidity:["Humidity","%",7], wind_kph:["Wind speed","km/h",8], pressure_mb:["Pressure","mb",9], cloud:["Cloud cover","%",10], visibility_km:["Visibility","km",11], uv_index:["UV index","",12] };
  const META = window.WX_META;
  if (!META) { mapEl.innerHTML = '<div class="map-loading">Data index missing. Keep the data/ folder next to forecast.html.</div>'; $("dataStatus").textContent = "Data missing"; return; }
  if (typeof L === "undefined") { mapEl.innerHTML = '<div class="map-loading">The map library (Leaflet) could not load. Check your internet connection.</div>'; $("dataStatus").textContent = "Map library missing"; return; }

  META.dates.forEach(d => dateSel.add(new Option(fmt(d), d)));
  META.regions.forEach(r => regSel.add(new Option(r, r)));
  dateSel.value = META.dates[META.dates.length - 1];

  const map = L.map(mapEl, { minZoom: 4, maxZoom: 9, preferCanvas: true }).setView([22.5, 79], 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map);
  const stateLayer = L.layerGroup().addTo(map), pts = L.layerGroup().addTo(map);
  fetch("https://raw.githubusercontent.com/india-in-data/india-states-2019/master/india_states.geojson").then(r => r.json())
    .then(g => L.geoJSON(g, { style: { color: "#6f625d", weight: 1, fillColor: "#efe9e4", fillOpacity: .1 }, interactive: false }).addTo(stateLayer)).catch(() => {});

  const color = (v, a, b) => { const t = Math.max(0, Math.min(1, (v - a) / ((b - a) || 1)));
    return `rgb(${Math.round(242 - 120 * t)},${Math.round(238 - 160 * t)},${Math.round(233 - 142 * t)})`; };

  function loadDay(day) {
    window.WX_DAY = window.WX_DAY || {};
    if (WX_DAY[day]) return Promise.resolve(WX_DAY[day]);
    return new Promise((ok, fail) => { const s = document.createElement("script"); s.src = `data/index.js`;
      s.onload = () => WX_DAY[day] ? ok(WX_DAY[day]) : fail(new Error("Empty file for " + day));
      s.onerror = () => fail(new Error(`Could not load data/index.js`)); document.head.appendChild(s); });
  }

  function trend(field, day) {
    const v = META.daily[field], n = v.length, W = 760, H = 190, p = 34;
    const lo = Math.min(...v), hi = Math.max(...v), x = i => p + i * (W - 2 * p) / (n - 1), y = t => H - p - (t - lo) / ((hi - lo) || 1) * (H - 2 * p);
    const sel = META.dates.indexOf(day), f = FIELDS[field];
    $("trendChart").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily mean ${f[0]} across plotted locations, ${META.dates[0]} to ${META.dates[n-1]}"><text x="4" y="${y(hi) + 4}" font-size="11" fill="#665A55">${hi.toFixed(1)}</text><text x="4" y="${y(lo) + 4}" font-size="11" fill="#665A55">${lo.toFixed(1)}</text><polyline fill="none" stroke="#7A4E5B" stroke-width="1.6" points="${v.map((t, i) => x(i) + "," + y(t)).join(" ")}"/><line x1="${x(sel)}" x2="${x(sel)}" y1="${p / 2}" y2="${H - p}" stroke="#2B2523" stroke-dasharray="4 3"/><text x="${p}" y="${H - 8}" font-size="11" fill="#665A55">${fmt(META.dates[0])}</text><text x="${W - p}" y="${H - 8}" font-size="11" text-anchor="end" fill="#665A55">${fmt(META.dates[n-1])}</text><text x="${x(sel)}" y="12" font-size="11" text-anchor="${x(sel) > W / 2 ? "end" : "start"}" dx="${x(sel) > W / 2 ? -5 : 5}" fill="#2B2523">${fmt(day)}</text></svg>`;
    $("trendNote").textContent = `Daily mean ${f[0].toLowerCase()} of the latest reading per location (${fmt(META.dates[0])} to ${fmt(META.dates[n-1])}). Early days cover fewer locations (${Math.min(...META.counts)} to ${Math.max(...META.counts)} per day), so compare trends with care.`;
  }

  async function render() {
    const mode = modeSel.value, field = varSel.value, f = FIELDS[field], day = dateSel.value, status = $("dataStatus");
    if (mode !== "reference") {
      if (window.PS79_bust && window.PS79_bust(mode, day, +leadSel.value, pts, map)) { if (mode !== modeSel.value) return; return; }
      pts.clearLayers(); $("mapTitle").textContent = mode === "confidence" ? "Forecast confidence" : "Forecast bust probability";
      status.textContent = "Inference pending"; $("fieldValue").textContent = "No forecast fields connected";
      $("fieldDescription").textContent = "This layer stays empty until forecast fields and matched verification data are available. No values are estimated or filled in.";
      $("pointCount").textContent = "No inference shown"; $("mapLegend").innerHTML = '<span class="source-chip">Inference layer pending</span>'; return;
    }
    status.textContent = "Loading " + day + "…";
    let rows; try { rows = await loadDay(day); } catch (e) { status.textContent = "Data error"; $("fieldValue").textContent = "Could not load " + day; $("fieldDescription").textContent = e.message; return; }
    if (day !== dateSel.value || mode !== modeSel.value) return;
    const reg = regSel.value, list = rows.filter(r => (reg === "all" || r[1] === reg) && Number.isFinite(r[f[2]]));
    pts.clearLayers(); $("mapTitle").textContent = `${f[0]} · ${fmt(day)}`;
    if (!list.length) { status.textContent = "No data"; $("fieldValue").textContent = "No readings"; $("fieldDescription").textContent = `No readings for ${reg} on ${fmt(day)}. Choose another date or region.`; $("pointCount").textContent = "0 locations"; $("extremes").innerHTML = ""; return; }
    const vals = list.map(r => r[f[2]]), lo = Math.min(...vals), hi = Math.max(...vals), avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const bounds = [];
    list.forEach(r => { const u = f[1] ? " " + f[1] : ""; bounds.push([r[2], r[3]]);
      L.circleMarker([r[2], r[3]], { radius: 6, weight: 1, color: "#2b2523", fillColor: color(r[f[2]], lo, hi), fillOpacity: .9 })
        .bindPopup(`<strong>${esc(r[0])}</strong><br>${esc(r[1])}<br><br>${f[0]}: <strong>${r[f[2]]}${u}</strong><br>Reading time: ${esc(r[4])}`).addTo(pts); });
    if (reg !== "all") map.fitBounds(bounds, { padding: [30, 30], maxZoom: 8 }); else map.setView([22.5, 79], 5);
    status.textContent = "Data loaded"; $("fieldValue").textContent = `${avg.toFixed(1)} ${f[1]} mean`;
    $("fieldDescription").textContent = `${list.length} locations in ${reg === "all" ? "all regions" : reg} on ${fmt(day)}. Range ${lo} to ${hi} ${f[1]}. Click a point for its value.`;
    $("pointCount").textContent = `${list.length} plotted locations`;
    $("mapLegend").innerHTML = `<div class="legend-wrap"><div class="legend"><span>${lo}</span><div class="legend-bar"></div><span>${hi}</span></div><div class="legend-labels"><span>${f[1] || "index"}</span><span>higher</span></div></div>`;
    const s = [...list].sort((a, b) => b[f[2]] - a[f[2]]), row = r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${r[f[2]]} ${f[1]}</td></tr>`;
    $("extremes").innerHTML = `<div class="table-wrap"><table><thead><tr><th>Highest ${f[0].toLowerCase()}</th><th>Region</th><th>Value</th></tr></thead><tbody>${s.slice(0, 5).map(row).join("")}</tbody></table></div><div class="table-wrap"><table><thead><tr><th>Lowest ${f[0].toLowerCase()}</th><th>Region</th><th>Value</th></tr></thead><tbody>${s.slice(-5).reverse().map(row).join("")}</tbody></table></div>`;
    trend(field, day);
  }
  [dateSel, varSel, regSel, modeSel, leadSel].forEach(el => el.addEventListener("change", render));
  render();
});
