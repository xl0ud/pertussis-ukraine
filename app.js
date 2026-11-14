/**
 * EpiPulse Ukraine: Кашлюк (МКХ-10: А37)
 * Лаконічна та швидка панель епіднагляду
 * Zero emojis, strictly institutional style
 */

// ================= GLOBAL STATE =================
let selectedRegion = 'all';
let selectedYear = '2024';   // Default to peak outbreak year
let selectedMonth = 'all';   // 'all' or '1'..'12'
let mapMetric = 'rate';      // 'rate' or 'abs'

// Instances
let yearsChartInstance = null;
let monthlyChartInstance = null;
let leafletMap = null;
let geoJsonLayer = null;
let kyivMarker = null;
let sevastopolMarker = null;

// ================= INITIALIZATION =================
document.addEventListener('DOMContentLoaded', () => {
  if (!window.EPI_DATA) return;

  populateRegionSelect();
  initSidebarState();
  initLeafletMap();
  updateView();
  renderYearsChart();
  renderMonthlyChart();

  window.addEventListener('resize', () => {
    if (leafletMap) {
      setTimeout(() => leafletMap.invalidateSize(), 250);
    }
  });
});

// ================= SIDEBAR TOGGLE =================
function initSidebarState() {
  if (window.innerWidth >= 1024) {
    document.body.classList.add('sidebar-open');
    document.body.classList.remove('sidebar-closed');
  } else {
    document.body.classList.remove('sidebar-open');
    document.body.classList.remove('mobile-sidebar-open');
  }
}

function toggleSidebar() {
  const isLg = window.innerWidth >= 1024;
  const backdrop = document.getElementById('sidebarBackdrop');

  if (isLg) {
    if (document.body.classList.contains('sidebar-closed')) {
      document.body.classList.remove('sidebar-closed');
      document.body.classList.add('sidebar-open');
    } else {
      document.body.classList.remove('sidebar-open');
      document.body.classList.add('sidebar-closed');
    }
  } else {
    const isMobileOpen = document.body.classList.toggle('mobile-sidebar-open');
    if (backdrop) {
      if (isMobileOpen) {
        backdrop.classList.remove('hidden');
      } else {
        backdrop.classList.add('hidden');
      }
    }
  }

  // Auto-resize leaflet map & charts
  setTimeout(() => {
    if (leafletMap) leafletMap.invalidateSize();
    if (yearsChartInstance) yearsChartInstance.resize();
    if (monthlyChartInstance) monthlyChartInstance.resize();
  }, 260);
}

// ================= CONTROLS =================
function populateRegionSelect() {
  const sel = document.getElementById('regionSelect');
  if (!sel || !window.EPI_DATA.regional) return;

  const names = Object.keys(window.EPI_DATA.regional).sort();
  names.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    if (name === 'м. Київ') {
      opt.textContent = 'м. Київ (столиця)';
    } else if (name === 'АР Крим') {
      opt.textContent = 'Автономна Республіка Крим';
    } else if (name === 'м. Севастополь') {
      opt.textContent = 'м. Севастополь';
    } else {
      opt.textContent = `${name} область`;
    }
    sel.appendChild(opt);
  });
}

function onRegionChange(reg) {
  selectedRegion = reg;
  syncControls();
  updateView();
  updateMapHighlight();
}

function onYearChange(yr) {
  selectedYear = yr;
  syncControls();
  updateView();
  renderYearsChart();
  renderMonthlyChart();
  updateMapColors();
}

function selectYear(yr) {
  selectedYear = yr;
  syncControls();
  updateView();
  renderYearsChart();
  renderMonthlyChart();
  updateMapColors();
}

function onMonthChange(m) {
  selectedMonth = m;
  syncControls();
  updateView();
  renderMonthlyChart();
  updateMapColors();
}

function setMapMetric(metric) {
  mapMetric = metric;
  const btnRate = document.getElementById('btn-map-rate');
  const btnAbs = document.getElementById('btn-map-abs');
  if (btnRate && btnAbs) {
    if (metric === 'rate') {
      btnRate.className = 'px-2.5 py-1 rounded bg-white text-indigo-700 shadow-2xs font-semibold';
      btnAbs.className = 'px-2.5 py-1 rounded text-slate-600 hover:text-slate-900 font-medium';
    } else {
      btnAbs.className = 'px-2.5 py-1 rounded bg-white text-indigo-700 shadow-2xs font-semibold';
      btnRate.className = 'px-2.5 py-1 rounded text-slate-600 hover:text-slate-900 font-medium';
    }
  }
  updateMapColors();
}

function resetFilters() {
  selectedRegion = 'all';
  selectedYear = '2024';
  selectedMonth = 'all';
  mapMetric = 'rate';

  syncControls();
  updateView();
  renderYearsChart();
  renderMonthlyChart();
  updateMapColors();

  if (leafletMap && geoJsonLayer) {
    leafletMap.fitBounds(geoJsonLayer.getBounds(), { padding: [12, 12] });
  }
}

function syncControls() {
  const yrSel = document.getElementById('yearSelect');
  if (yrSel) yrSel.value = selectedYear;

  const mSel = document.getElementById('monthSelect');
  if (mSel) mSel.value = selectedMonth;

  const topMSel = document.getElementById('topMonthSelect');
  if (topMSel) topMSel.value = selectedMonth;

  const regSel = document.getElementById('regionSelect');
  if (regSel) regSel.value = selectedRegion;

  // Sync top year buttons
  ['all', '2023', '2024', '2025'].forEach(y => {
    const btn = document.getElementById(`top-yr-${y}`);
    if (btn) {
      if (selectedYear === y) {
        btn.className = 'px-2 py-1 rounded bg-rose-600 text-white font-semibold transition-colors';
      } else {
        btn.className = 'px-2 py-1 rounded text-slate-600 hover:text-slate-900 transition-colors font-medium';
      }
    }
  });
}

// ================= STATS CALCULATION =================
function getCurrentStats() {
  const isAllYears = selectedYear === 'all';
  const isAllMonths = selectedMonth === 'all';
  const isUkraine = selectedRegion === 'all';

  const profile = window.EPI_DATA.yearly_profiles[selectedYear] || window.EPI_DATA.yearly_profiles['all'];
  const regionalData = window.EPI_DATA.regional;

  let monthRatio = 1.0;
  let monthName = 'Весь рік (зведено)';
  let monthNationalCases = null;

  if (!isAllMonths) {
    const mIdx = parseInt(selectedMonth) - 1;
    const mItem = window.EPI_DATA.months_list.find(x => x.id === selectedMonth);
    if (mItem) monthName = mItem.name;

    if (selectedYear === '2024') {
      monthNationalCases = window.EPI_DATA.monthly_dynamics.cases_2024[mIdx];
      monthRatio = monthNationalCases / 7545;
    } else if (selectedYear === '2025') {
      monthNationalCases = window.EPI_DATA.monthly_dynamics.cases_2025[mIdx];
      monthRatio = monthNationalCases / 1123;
    } else {
      const weights = [0.065, 0.043, 0.065, 0.164, 0.207, 0.140, 0.098, 0.062, 0.037, 0.052, 0.064, 0.042];
      monthRatio = weights[mIdx] || 0.083;
      monthNationalCases = Math.round(profile.cases * monthRatio);
    }
  }

  let cases = 0;
  let rate = 0;
  let changeStr = profile.change_str;
  let statusStr = profile.status;
  let hotspotStr = profile.hotspot;
  let hotspotSub = profile.hotspot_sub;

  if (isUkraine) {
    if (isAllMonths) {
      cases = profile.cases;
      rate = profile.rate;
    } else {
      cases = monthNationalCases !== null ? monthNationalCases : Math.round(profile.cases * monthRatio);
      rate = Number(((cases / 41000000) * 100000).toFixed(2));
      changeStr = `Місяць ${selectedMonth} (${selectedYear} р.)`;
    }
  } else {
    const reg = regionalData[selectedRegion];
    if (reg) {
      let regYearCases = reg.cases_2024;
      let regYearRate = reg.rate_2024;

      if (selectedYear === '2025') {
        regYearCases = reg.cases_2025;
        regYearRate = reg.rate_2025;
      } else if (selectedYear === '2023') {
        regYearCases = reg.cases_2023;
        regYearRate = reg.rate_2023;
      } else if (isAllYears) {
        regYearCases = reg.cases_10y;
        regYearRate = reg.rate_10y;
      }

      if (isAllMonths) {
        cases = regYearCases;
        rate = regYearRate;
      } else {
        cases = Math.max(0, Math.round(regYearCases * monthRatio));
        rate = reg.pop > 0 ? Number(((cases / reg.pop) * 100000).toFixed(2)) : 0;
      }

      hotspotStr = `${selectedRegion} (${cases} вип.)`;
      hotspotSub = `${rate} на 100 тис. населення`;
      statusStr = rate > 30 ? 'Епідемічний підйом' : (rate > 10 ? 'Підвищений рівень' : (rate > 2 ? 'Помірний рівень' : 'Фоновий рівень'));
    }
  }

  return {
    cases,
    rate,
    monthName,
    changeStr,
    statusStr,
    hotspotStr,
    hotspotSub
  };
}

function getRegionDataForActiveSelection(regName) {
  const reg = window.EPI_DATA.regional[regName];
  if (!reg) return { cases: 0, rate: 0, name: regName };

  let yearCases = reg.cases_2024;
  let yearRate = reg.rate_2024;

  if (selectedYear === '2025') {
    yearCases = reg.cases_2025;
    yearRate = reg.rate_2025;
  } else if (selectedYear === '2023') {
    yearCases = reg.cases_2023;
    yearRate = reg.rate_2023;
  } else if (selectedYear === 'all') {
    yearCases = reg.cases_10y;
    yearRate = reg.rate_10y;
  } else {
    const yrProfile = window.EPI_DATA.yearly_profiles[selectedYear];
    const totalYr = yrProfile ? yrProfile.cases : 2000;
    yearCases = Math.round(totalYr * (reg.cases_10y / 22779));
    yearRate = reg.pop > 0 ? Number(((yearCases / reg.pop) * 100000).toFixed(2)) : 0;
  }

  if (selectedMonth === 'all') {
    return { name: reg.name, cases: yearCases, rate: yearRate, pop: reg.pop };
  }

  const mIdx = parseInt(selectedMonth) - 1;
  let monthRatio = 0.083;
  if (selectedYear === '2024') {
    monthRatio = window.EPI_DATA.monthly_dynamics.cases_2024[mIdx] / 7545;
  } else if (selectedYear === '2025') {
    monthRatio = window.EPI_DATA.monthly_dynamics.cases_2025[mIdx] / 1123;
  } else {
    const weights = [0.065, 0.043, 0.065, 0.164, 0.207, 0.140, 0.098, 0.062, 0.037, 0.052, 0.064, 0.042];
    monthRatio = weights[mIdx] || 0.083;
  }

  const mCases = Math.max(0, Math.round(yearCases * monthRatio));
  const mRate = reg.pop > 0 ? Number(((mCases / reg.pop) * 100000).toFixed(2)) : 0;

  return { name: reg.name, cases: mCases, rate: mRate, pop: reg.pop };
}

// ================= VIEW UPDATES =================
function updateView() {
  const stats = getCurrentStats();

  // Top active filter tag
  const tag = document.getElementById('activeFilterTag');
  if (tag) {
    const regLabel = selectedRegion === 'all' ? 'Вся Україна' : `${selectedRegion} область`;
    const yrLabel = selectedYear === 'all' ? '2016–2025 рр.' : `${selectedYear} рік`;
    tag.textContent = `${yrLabel} • ${stats.monthName} • ${regLabel}`;
  }

  // Map Period Label
  const mapPeriod = document.getElementById('mapPeriodLabel');
  if (mapPeriod) {
    const yrLabel = selectedYear === 'all' ? '2016–2025 рр.' : `${selectedYear} рік`;
    mapPeriod.textContent = `${yrLabel}, ${stats.monthName}`;
  }

  // KPI 1: Cases
  const kpiCasesVal = document.getElementById('kpiCasesVal');
  const kpiCasesChange = document.getElementById('kpiCasesChange');
  if (kpiCasesVal) kpiCasesVal.textContent = stats.cases.toLocaleString('uk-UA');
  if (kpiCasesChange) kpiCasesChange.textContent = stats.changeStr;

  // KPI 2: Rate
  const kpiRateVal = document.getElementById('kpiRateVal');
  const kpiRateBenchmark = document.getElementById('kpiRateBenchmark');
  if (kpiRateVal) kpiRateVal.textContent = stats.rate.toFixed(2);
  if (kpiRateBenchmark) {
    kpiRateBenchmark.textContent = stats.rate > 5.56 
      ? `Базис: 5.56 (в ${(stats.rate / 5.56).toFixed(1)} р. вище)`
      : `Базис: 5.56 на 100 тис.`;
  }

  // KPI 3: Hotspot
  const kpiHotspotVal = document.getElementById('kpiHotspotVal');
  const kpiHotspotSub = document.getElementById('kpiHotspotSub');
  const kpiStatusVal = document.getElementById('kpiStatusVal');
  if (kpiHotspotVal) kpiHotspotVal.textContent = stats.hotspotStr;
  if (kpiHotspotSub) kpiHotspotSub.textContent = stats.hotspotSub;
  if (kpiStatusVal) kpiStatusVal.textContent = stats.statusStr;
}

// ================= PURE VECTOR MAP OF UKRAINE (ZERO WATERMARKS) =================
function initLeafletMap() {
  const mapContainer = document.getElementById('ukraineMap');
  if (!mapContainer || typeof L === 'undefined') return;

  // Completely disable attribution control and watermarks
  leafletMap = L.map('ukraineMap', {
    attributionControl: false,
    zoomControl: true,
    scrollWheelZoom: false,
    doubleClickZoom: false
  });

  // Pure vector GeoJSON layer - NO raster tiles = NO watermarks!
  if (window.UKRAINE_GEOJSON) {
    geoJsonLayer = L.geoJson(window.UKRAINE_GEOJSON, {
      style: getFeatureStyle,
      onEachFeature: onEachFeature
    }).addTo(leafletMap);

    // Auto-fit to Ukraine bounds
    leafletMap.fitBounds(geoJsonLayer.getBounds(), { padding: [10, 10] });
  }

  // City markers
  addSpecialCityMarkers();
}

function addSpecialCityMarkers() {
  if (!leafletMap) return;

  // Kyiv City coordinates [50.4501, 30.5234]
  kyivMarker = L.circleMarker([50.4501, 30.5234], {
    radius: 8,
    fillColor: '#e11d48',
    color: '#ffffff',
    weight: 2,
    opacity: 1,
    fillOpacity: 0.95
  }).addTo(leafletMap);

  kyivMarker.bindTooltip('м. Київ (столиця)', { className: 'map-tooltip', direction: 'top' });
  kyivMarker.on('click', () => onRegionChange('м. Київ'));
  kyivMarker.on('mouseover', () => {
    const data = getRegionDataForActiveSelection('м. Київ');
    updateHoverPanel('м. Київ', data.cases, data.rate);
  });
  kyivMarker.on('mouseout', resetHoverPanel);

  // Sevastopol [44.6166, 33.5254]
  sevastopolMarker = L.circleMarker([44.6166, 33.5254], {
    radius: 6,
    fillColor: '#cbd5e1',
    color: '#ffffff',
    weight: 1.5,
    opacity: 1,
    fillOpacity: 0.9
  }).addTo(leafletMap);

  sevastopolMarker.bindTooltip('м. Севастополь', { className: 'map-tooltip', direction: 'bottom' });
  sevastopolMarker.on('click', () => onRegionChange('м. Севастополь'));
}

function normalizeGeoName(featureName) {
  if (!featureName) return '';
  if (featureName === 'Автономна Республіка Крим') return 'АР Крим';
  return featureName.replace(' область', '').trim();
}

function getOutbreakColor(val, isRate = true) {
  if (isRate) {
    if (val >= 30.0) return '#e11d48'; // Rose-600 Outbreak
    if (val >= 10.0) return '#f97316'; // Orange-500 High
    if (val >= 2.0)  return '#f59e0b'; // Amber-500 Moderate
    if (val > 0.0)   return '#10b981'; // Emerald-500 Baseline
    return '#e2e8f0';                  // Light gray No data
  } else {
    if (val >= 500) return '#e11d48';
    if (val >= 150) return '#f97316';
    if (val >= 30)  return '#f59e0b';
    if (val > 0)    return '#10b981';
    return '#e2e8f0';
  }
}

function getFeatureStyle(feature) {
  const normName = normalizeGeoName(feature.properties.name);
  const data = getRegionDataForActiveSelection(normName);
  const val = mapMetric === 'rate' ? data.rate : data.cases;
  const isSelected = selectedRegion === normName;

  return {
    fillColor: getOutbreakColor(val, mapMetric === 'rate'),
    weight: isSelected ? 2.5 : 1,
    opacity: 1,
    color: isSelected ? '#0f172a' : '#ffffff',
    fillOpacity: 0.88
  };
}

function onEachFeature(feature, layer) {
  const normName = normalizeGeoName(feature.properties.name);

  layer.on({
    mouseover: (e) => {
      const l = e.target;
      l.setStyle({ weight: 2.2, color: '#0f172a', fillOpacity: 0.98 });
      l.bringToFront();

      const data = getRegionDataForActiveSelection(normName);
      updateHoverPanel(normName, data.cases, data.rate);
    },
    mouseout: (e) => {
      geoJsonLayer.resetStyle(e.target);
      resetHoverPanel();
    },
    click: () => onRegionChange(normName)
  });

  layer.bindTooltip(normName, { className: 'map-tooltip', direction: 'center' });
}

function updateHoverPanel(name, cases, rate) {
  const hName = document.getElementById('mapHoverName');
  const hStats = document.getElementById('mapHoverStats');
  if (hName) hName.textContent = name === 'м. Київ' ? 'м. Київ (столиця)' : `${name} область`;
  if (hStats) {
    hStats.textContent = `${cases.toLocaleString('uk-UA')} вип. (${rate.toFixed(2)} на 100 тис.)`;
  }
}

function resetHoverPanel() {
  const hName = document.getElementById('mapHoverName');
  const hStats = document.getElementById('mapHoverStats');
  if (hName) hName.textContent = 'Наведіть на область';
  if (hStats) hStats.textContent = 'Оберіть регіон для перегляду';
}

function updateMapColors() {
  if (!geoJsonLayer) return;
  geoJsonLayer.eachLayer(layer => {
    layer.setStyle(getFeatureStyle(layer.feature));
  });

  if (kyivMarker) {
    const kData = getRegionDataForActiveSelection('м. Київ');
    const val = mapMetric === 'rate' ? kData.rate : kData.cases;
    kyivMarker.setStyle({
      fillColor: getOutbreakColor(val, mapMetric === 'rate'),
      weight: selectedRegion === 'м. Київ' ? 3 : 2,
      color: selectedRegion === 'м. Київ' ? '#0f172a' : '#ffffff'
    });
  }

  if (sevastopolMarker) {
    const sData = getRegionDataForActiveSelection('м. Севастополь');
    const val = mapMetric === 'rate' ? sData.rate : sData.cases;
    sevastopolMarker.setStyle({
      fillColor: getOutbreakColor(val, mapMetric === 'rate'),
      weight: selectedRegion === 'м. Севастополь' ? 3 : 1.5
    });
  }
}

function updateMapHighlight() {
  updateMapColors();
}

// ================= CHARTS =================
function renderYearsChart() {
  const ctx = document.getElementById('yearsChart');
  if (!ctx || typeof Chart === 'undefined') return;

  const history = window.EPI_DATA.history_10y;
  const pointBgColors = history.years.map(y => String(y) === String(selectedYear) ? '#e11d48' : '#4f46e5');
  const pointRadii = history.years.map(y => String(y) === String(selectedYear) ? 7 : 3.5);

  if (yearsChartInstance) {
    yearsChartInstance.destroy();
  }

  yearsChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: history.years.map(String),
      datasets: [{
        label: 'Випадки',
        data: history.cases,
        borderColor: '#4f46e5',
        borderWidth: 2,
        backgroundColor: 'rgba(79, 70, 229, 0.08)',
        fill: true,
        tension: 0.25,
        pointBackgroundColor: pointBgColors,
        pointBorderColor: '#ffffff',
        pointBorderWidth: 1.5,
        pointRadius: pointRadii
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f172a',
          padding: 8,
          callbacks: {
            label: (item) => ` ${item.raw.toLocaleString('uk-UA')} випадків`
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#64748b' } },
        y: { beginAtZero: true, grid: { color: '#f8fafc' }, ticks: { font: { size: 10 }, color: '#64748b' } }
      },
      onClick: (e, elements) => {
        if (elements && elements.length > 0) {
          const idx = elements[0].index;
          selectYear(String(history.years[idx]));
        }
      }
    }
  });
}

function renderMonthlyChart() {
  const ctx = document.getElementById('monthlyChart');
  if (!ctx || typeof Chart === 'undefined') return;

  const dyn = window.EPI_DATA.monthly_dynamics;
  const months = dyn.months;
  const mIdx = selectedMonth !== 'all' ? parseInt(selectedMonth) - 1 : -1;

  const bg2024 = months.map((_, i) => i === mIdx ? '#be123c' : 'rgba(225, 29, 72, 0.82)');
  const bg2025 = months.map((_, i) => i === mIdx ? '#047857' : 'rgba(16, 185, 129, 0.82)');

  if (monthlyChartInstance) {
    monthlyChartInstance.destroy();
  }

  monthlyChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: months,
      datasets: [
        {
          label: '2024 р. (спалах)',
          data: dyn.cases_2024,
          backgroundColor: bg2024,
          borderRadius: 4
        },
        {
          label: '2025 р. (спад)',
          data: dyn.cases_2025,
          backgroundColor: bg2025,
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { font: { size: 10 }, boxWidth: 10, boxHeight: 10, color: '#334155' }
        },
        tooltip: {
          backgroundColor: '#0f172a',
          padding: 8,
          callbacks: {
            label: (item) => ` ${item.dataset.label}: ${item.raw.toLocaleString('uk-UA')} вип.`
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#64748b' } },
        y: { beginAtZero: true, grid: { color: '#f8fafc' }, ticks: { font: { size: 10 }, color: '#64748b' } }
      },
      onClick: (e, elements) => {
        if (elements && elements.length > 0) {
          const idx = elements[0].index;
          onMonthChange(String(idx + 1));
        }
      }
    }
  });
}
