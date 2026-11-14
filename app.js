/**
 * EpiPulse Ukraine: Кашлюк (МКХ-10: А37)
 * Панель епідеміологічного нагляду (2016-2025 рр.)
 * ЦГЗ МОЗ України
 */

// ================= GLOBAL STATE =================
var selectedRegion = 'all';
var selectedYear = '2024';
var selectedMonth = 'all';
var mapMetric = 'rate';

var yearsChartInstance = null;
var monthlyChartInstance = null;
var leafletMap = null;
var geoJsonLayer = null;
var kyivMarker = null;
var isMapDragging = false;

// Full Ukrainian Month Names
var FULL_MONTH_NAMES = [
  'Січень', 'Лютий', 'Березень', 'Квітень',
  'Травень', 'Червень', 'Липень', 'Серпень',
  'Вересень', 'Жовтень', 'Листопад', 'Грудень'
];

// ================= INITIALIZATION =================
document.addEventListener('DOMContentLoaded', function () {
  if (!window.EPI_DATA) return;

  populateRegionSelect();
  initLeafletMap();
  updateView();
  renderYearsChart();
  renderMonthlyChart();

  window.addEventListener('resize', function () {
    if (leafletMap) {
      setTimeout(function () { leafletMap.invalidateSize(); }, 200);
    }
  });
});

// ================= OFFCANVAS SIDEBAR (ZERO REFLOW LAG) =================
function toggleSidebar() {
  var sidebar = document.getElementById('sidebar');
  var backdrop = document.getElementById('sidebarBackdrop');
  if (!sidebar) return;

  var isClosed = sidebar.classList.contains('-translate-x-full');
  if (isClosed) {
    sidebar.classList.remove('-translate-x-full');
    sidebar.classList.add('translate-x-0');
    if (backdrop) backdrop.classList.remove('hidden');
  } else {
    sidebar.classList.remove('translate-x-0');
    sidebar.classList.add('-translate-x-full');
    if (backdrop) backdrop.classList.add('hidden');
  }
}

// ================= CONTROLS =================
function populateRegionSelect() {
  var sel = document.getElementById('regionSelect');
  if (!sel || !window.EPI_DATA.regional) return;

  var names = Object.keys(window.EPI_DATA.regional).sort();
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    var opt = document.createElement('option');
    opt.value = name;
    if (name === 'м. Київ') {
      opt.textContent = 'м. Київ (столиця)';
    } else if (name === 'АР Крим') {
      opt.textContent = 'Автономна Республіка Крим';
    } else if (name === 'м. Севастополь') {
      opt.textContent = 'м. Севастополь';
    } else {
      opt.textContent = name + ' область';
    }
    sel.appendChild(opt);
  }
}

function onRegionChange(reg) {
  selectedRegion = reg;
  syncControls();
  updateView();
  updateMapColors();

  if (reg !== 'all') {
    var data = getRegionDataForActiveSelection(reg);
    updateHoverPanel(reg, data.cases, data.rate);
  } else {
    resetHoverPanel();
  }
}

function resetMapSelection() {
  selectedRegion = 'all';
  syncControls();
  updateView();
  updateMapColors();
  resetHoverPanel();

  if (leafletMap && geoJsonLayer) {
    leafletMap.fitBounds(geoJsonLayer.getBounds(), { padding: [15, 15] });
  }
}

function onYearChange(yr) {
  selectedYear = yr;
  syncControls();
  updateView();
  renderYearsChart();
  renderMonthlyChart();
  updateMapColors();
  resetHoverPanel();
}

function selectYear(yr) {
  selectedYear = yr;
  syncControls();
  updateView();
  renderYearsChart();
  renderMonthlyChart();
  updateMapColors();
  resetHoverPanel();
}

function onMonthChange(m) {
  selectedMonth = m;
  syncControls();
  updateView();
  renderMonthlyChart();
  updateMapColors();
  resetHoverPanel();
}

function setMapMetric(metric) {
  mapMetric = metric;
  var btnRate = document.getElementById('btn-map-rate');
  var btnAbs = document.getElementById('btn-map-abs');
  if (btnRate && btnAbs) {
    if (metric === 'rate') {
      btnRate.className = 'px-2.5 py-1 rounded bg-white text-indigo-700 shadow-sm font-semibold cursor-pointer';
      btnAbs.className = 'px-2.5 py-1 rounded text-slate-600 hover:text-slate-900 font-medium cursor-pointer';
    } else {
      btnAbs.className = 'px-2.5 py-1 rounded bg-white text-indigo-700 shadow-sm font-semibold cursor-pointer';
      btnRate.className = 'px-2.5 py-1 rounded text-slate-600 hover:text-slate-900 font-medium cursor-pointer';
    }
  }
  updateMapColors();
  resetHoverPanel();
}

function resetFilters() {
  selectedRegion = 'all';
  selectedYear = '2024';
  selectedMonth = 'all';
  mapMetric = 'rate';

  setMapMetric('rate');
  syncControls();
  updateView();
  renderYearsChart();
  renderMonthlyChart();
  updateMapColors();
  resetHoverPanel();

  if (leafletMap && geoJsonLayer) {
    leafletMap.fitBounds(geoJsonLayer.getBounds(), { padding: [15, 15] });
  }
}

function syncControls() {
  var yrSel = document.getElementById('yearSelect');
  if (yrSel) yrSel.value = selectedYear;

  var mSel = document.getElementById('monthSelect');
  if (mSel) mSel.value = selectedMonth;

  var regSel = document.getElementById('regionSelect');
  if (regSel) regSel.value = selectedRegion;

  var years = ['all', '2023', '2024', '2025'];
  for (var i = 0; i < years.length; i++) {
    var y = years[i];
    var btn = document.getElementById('top-yr-' + y);
    if (btn) {
      if (selectedYear === y) {
        btn.className = 'px-2 py-1 rounded bg-rose-600 text-white font-semibold shadow-xs';
      } else {
        btn.className = 'px-2 py-1 rounded text-slate-600 hover:text-slate-900 font-medium';
      }
    }
  }
}

// ================= REGION LABEL HELPER =================
function formatRegionLabel(name) {
  if (name === 'all') return 'Вся Україна';
  if (name === 'м. Київ') return 'м. Київ (столиця)';
  if (name === 'м. Севастополь') return 'м. Севастополь';
  if (name === 'АР Крим') return 'АР Крим';
  return name + ' область';
}

// ================= STATS CALCULATION =================
function getMonthlySum(arr) {
  var s = 0;
  for (var i = 0; i < arr.length; i++) s += arr[i];
  return s;
}

function getCurrentStats() {
  var isAllYears = selectedYear === 'all';
  var isAllMonths = selectedMonth === 'all';
  var isUkraine = selectedRegion === 'all';

  var profile = window.EPI_DATA.yearly_profiles[selectedYear] || window.EPI_DATA.yearly_profiles['all'];

  var monthRatio = 1.0;
  var monthName = 'Весь рік (зведено)';
  var monthNationalCases = null;

  if (!isAllMonths) {
    var mIdx = parseInt(selectedMonth) - 1;
    monthName = FULL_MONTH_NAMES[mIdx] || 'Місяць ' + selectedMonth;

    if (selectedYear === '2024') {
      monthNationalCases = window.EPI_DATA.monthly_dynamics.cases_2024[mIdx];
      monthRatio = monthNationalCases / getMonthlySum(window.EPI_DATA.monthly_dynamics.cases_2024);
    } else if (selectedYear === '2025') {
      monthNationalCases = window.EPI_DATA.monthly_dynamics.cases_2025[mIdx];
      monthRatio = monthNationalCases / getMonthlySum(window.EPI_DATA.monthly_dynamics.cases_2025);
    } else {
      var weights = [0.065, 0.043, 0.065, 0.164, 0.207, 0.140, 0.098, 0.062, 0.037, 0.052, 0.064, 0.042];
      monthRatio = weights[mIdx] || 0.083;
      monthNationalCases = Math.round(profile.cases * monthRatio);
    }
  }

  var cases = 0;
  var rate = 0;
  var changeStr = profile.change_str;
  var statusStr = profile.status;
  var hotspotStr = profile.hotspot;
  var hotspotSub = profile.hotspot_sub;

  if (isUkraine) {
    if (isAllMonths) {
      cases = profile.cases;
      rate = profile.rate;
    } else {
      cases = monthNationalCases !== null ? monthNationalCases : Math.round(profile.cases * monthRatio);
      rate = Number(((cases / 41000000) * 100000).toFixed(2));
      changeStr = monthName + ' (' + selectedYear + ' р.)';
    }
  } else {
    var reg = window.EPI_DATA.regional[selectedRegion];
    if (reg) {
      var regYearCases = reg.cases_2024;
      var regYearRate = reg.rate_2024;

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
        if (selectedYear === '2024') {
          changeStr = reg.change_24_23 ? reg.change_24_23 + ' до 2023 р.' : 'Річні дані';
        } else if (selectedYear === '2025') {
          changeStr = reg.change_25_24 ? reg.change_25_24 + ' до 2024 р.' : 'Річні дані';
        } else if (selectedYear === '2023') {
          changeStr = reg.cases_2023 + ' вип. за 2023 р.';
        } else if (isAllYears) {
          changeStr = '10 років спостереження';
        }
      } else {
        cases = Math.max(0, Math.round(regYearCases * monthRatio));
        rate = reg.pop > 0 ? Number(((cases / reg.pop) * 100000).toFixed(2)) : 0;
        changeStr = monthName + ' (' + selectedYear + ' р.)';
      }

      hotspotStr = formatRegionLabel(selectedRegion);
      hotspotSub = cases.toLocaleString('uk-UA') + ' вип. (' + rate.toFixed(2) + ' на 100 тис.)';
      statusStr = rate > 30 ? 'Епідемічний підйом' : (rate > 10 ? 'Підвищений рівень' : (rate > 2 ? 'Помірний рівень' : 'Фоновий рівень'));
    }
  }

  return {
    cases: cases,
    rate: rate,
    monthName: monthName,
    changeStr: changeStr,
    statusStr: statusStr,
    hotspotStr: hotspotStr,
    hotspotSub: hotspotSub
  };
}

function getRegionDataForActiveSelection(regName) {
  var reg = window.EPI_DATA.regional[regName];
  if (!reg) return { cases: 0, rate: 0, name: regName };

  var yearCases = reg.cases_2024;
  var yearRate = reg.rate_2024;

  if (selectedYear === '2025') {
    yearCases = reg.cases_2025;
    yearRate = reg.rate_2025;
  } else if (selectedYear === '2023') {
    yearCases = reg.cases_2023;
    yearRate = reg.rate_2023;
  } else if (selectedYear === 'all') {
    yearCases = reg.cases_10y;
    yearRate = reg.rate_10y;
  } else if (selectedYear !== '2024') {
    var yrProfile = window.EPI_DATA.yearly_profiles[selectedYear];
    var totalYr = yrProfile ? yrProfile.cases : 2000;
    yearCases = Math.round(totalYr * (reg.cases_10y / 20679));
    yearRate = reg.pop > 0 ? Number(((yearCases / reg.pop) * 100000).toFixed(2)) : 0;
  }

  if (selectedMonth === 'all') {
    return { name: reg.name, cases: yearCases, rate: yearRate, pop: reg.pop };
  }

  var mIdx = parseInt(selectedMonth) - 1;
  var monthRatio = 0.083;
  if (selectedYear === '2024') {
    monthRatio = window.EPI_DATA.monthly_dynamics.cases_2024[mIdx] / getMonthlySum(window.EPI_DATA.monthly_dynamics.cases_2024);
  } else if (selectedYear === '2025') {
    monthRatio = window.EPI_DATA.monthly_dynamics.cases_2025[mIdx] / getMonthlySum(window.EPI_DATA.monthly_dynamics.cases_2025);
  } else {
    var weights = [0.065, 0.043, 0.065, 0.164, 0.207, 0.140, 0.098, 0.062, 0.037, 0.052, 0.064, 0.042];
    monthRatio = weights[mIdx] || 0.083;
  }

  var mCases = Math.max(0, Math.round(yearCases * monthRatio));
  var mRate = reg.pop > 0 ? Number(((mCases / reg.pop) * 100000).toFixed(2)) : 0;

  return { name: reg.name, cases: mCases, rate: mRate, pop: reg.pop };
}

// ================= VIEW UPDATES =================
function updateView() {
  var stats = getCurrentStats();

  var tag = document.getElementById('activeFilterTag');
  if (tag) {
    var regLabel = formatRegionLabel(selectedRegion);
    var yrLabel = selectedYear === 'all' ? '2016-2025 рр.' : selectedYear + ' рік';
    tag.textContent = yrLabel + ' | ' + stats.monthName + ' | ' + regLabel;
  }

  var mapPeriod = document.getElementById('mapPeriodLabel');
  if (mapPeriod) {
    var yrLabel2 = selectedYear === 'all' ? '2016-2025 рр.' : selectedYear + ' рік';
    mapPeriod.textContent = yrLabel2 + ', ' + stats.monthName;
  }

  var kpiCasesVal = document.getElementById('kpiCasesVal');
  var kpiCasesChange = document.getElementById('kpiCasesChange');
  if (kpiCasesVal) kpiCasesVal.textContent = stats.cases.toLocaleString('uk-UA');
  if (kpiCasesChange) kpiCasesChange.textContent = stats.changeStr;

  var kpiRateVal = document.getElementById('kpiRateVal');
  var kpiRateBenchmark = document.getElementById('kpiRateBenchmark');
  if (kpiRateVal) kpiRateVal.textContent = stats.rate.toFixed(2);
  if (kpiRateBenchmark) {
    kpiRateBenchmark.textContent = stats.rate > 5.04
      ? 'Базис: 5.04 (в ' + (stats.rate / 5.04).toFixed(1) + ' р. вище)'
      : 'Базис: 5.04 на 100 тис.';
  }

  var kpiHotspotTitle = document.getElementById('kpiHotspotTitle');
  if (kpiHotspotTitle) {
    kpiHotspotTitle.textContent = selectedRegion === 'all' ? 'Епіцентр спалаху' : 'Обраний регіон';
  }

  var kpiHotspotVal = document.getElementById('kpiHotspotVal');
  var kpiHotspotSub = document.getElementById('kpiHotspotSub');
  var kpiStatusVal = document.getElementById('kpiStatusVal');
  if (kpiHotspotVal) kpiHotspotVal.textContent = stats.hotspotStr;
  if (kpiHotspotSub) kpiHotspotSub.textContent = stats.hotspotSub;
  if (kpiStatusVal) kpiStatusVal.textContent = stats.statusStr;
}

// ================= LEAFLET MAP =================
function initLeafletMap() {
  var mapContainer = document.getElementById('ukraineMap');
  if (!mapContainer || typeof L === 'undefined') return;

  leafletMap = L.map('ukraineMap', {
    attributionControl: false,
    zoomControl: true,
    scrollWheelZoom: false,
    touchZoom: true,
    dragging: true,
    doubleClickZoom: true
  });

  // Track dragging to prevent ghost tooltips & hover lag
  leafletMap.on('dragstart', function () {
    isMapDragging = true;
    leafletMap.closeTooltip();
  });
  leafletMap.on('dragend', function () {
    setTimeout(function () { isMapDragging = false; }, 80);
  });

  if (window.UKRAINE_GEOJSON) {
    geoJsonLayer = L.geoJson(window.UKRAINE_GEOJSON, {
      style: getFeatureStyle,
      onEachFeature: onEachFeature
    }).addTo(leafletMap);

    leafletMap.fitBounds(geoJsonLayer.getBounds(), { padding: [15, 15] });
  }

  addKyivMarker();
}

function addKyivMarker() {
  if (!leafletMap) return;

  kyivMarker = L.circleMarker([50.4501, 30.5234], {
    radius: 7.5,
    fillColor: '#e11d48',
    color: '#ffffff',
    weight: 2,
    opacity: 1,
    fillOpacity: 0.95
  }).addTo(leafletMap);

  kyivMarker.bindTooltip('м. Київ', { className: 'map-tooltip', direction: 'top', sticky: false });
  kyivMarker.on('click', function () { onRegionChange('м. Київ'); });
  kyivMarker.on('mouseover', function () {
    if (isMapDragging) return;
    var data = getRegionDataForActiveSelection('м. Київ');
    updateHoverPanel('м. Київ', data.cases, data.rate);
  });
  kyivMarker.on('mouseout', function () {
    if (isMapDragging) return;
    resetHoverPanel();
  });
}

function normalizeGeoName(featureName) {
  if (!featureName) return '';
  if (featureName === 'Автономна Республіка Крим') return 'АР Крим';
  return featureName.replace(' область', '').trim();
}

function getOutbreakColor(val, isRate) {
  if (isRate) {
    if (val >= 30.0) return '#e11d48';
    if (val >= 10.0) return '#f97316';
    if (val >= 2.0) return '#f59e0b';
    if (val > 0.0) return '#10b981';
    return '#e2e8f0';
  } else {
    if (val >= 500) return '#e11d48';
    if (val >= 150) return '#f97316';
    if (val >= 30) return '#f59e0b';
    if (val > 0) return '#10b981';
    return '#e2e8f0';
  }
}

function getOutbreakBadge(rate) {
  if (rate >= 30.0) return { label: 'Спалах', color: 'bg-rose-100 text-rose-700 border-rose-200' };
  if (rate >= 10.0) return { label: 'Високий', color: 'bg-amber-100 text-amber-800 border-amber-200' };
  if (rate >= 2.0) return { label: 'Помірний', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' };
  if (rate > 0) return { label: 'Фоновий', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
  return { label: 'Немає даних', color: 'bg-slate-100 text-slate-600 border-slate-200' };
}

function getFeatureStyle(feature) {
  var normName = normalizeGeoName(feature.properties.name);
  var data = getRegionDataForActiveSelection(normName);
  var val = mapMetric === 'rate' ? data.rate : data.cases;
  var isSelected = selectedRegion === normName;

  return {
    fillColor: getOutbreakColor(val, mapMetric === 'rate'),
    weight: isSelected ? 2.5 : 1.2,
    opacity: 1,
    color: isSelected ? '#0f172a' : '#ffffff',
    fillOpacity: 0.90
  };
}

function onEachFeature(feature, layer) {
  var normName = normalizeGeoName(feature.properties.name);

  layer.on({
    mouseover: function (e) {
      if (isMapDragging) return;
      var l = e.target;
      l.setStyle({ weight: 2.2, color: '#0f172a', fillOpacity: 0.98 });
      l.bringToFront();
      if (kyivMarker) kyivMarker.bringToFront();

      var data = getRegionDataForActiveSelection(normName);
      updateHoverPanel(normName, data.cases, data.rate);
    },
    mouseout: function (e) {
      if (isMapDragging) return;
      geoJsonLayer.resetStyle(e.target);
      if (kyivMarker) kyivMarker.bringToFront();
      resetHoverPanel();
    },
    click: function () { onRegionChange(normName); }
  });

  // Non-sticky center tooltip for zero jitter while panning
  layer.bindTooltip(normName, { className: 'map-tooltip', direction: 'center', permanent: false, sticky: false });
}

function updateHoverPanel(name, cases, rate) {
  var hName = document.getElementById('mapHoverName');
  var hCases = document.getElementById('mapHoverCases');
  var hRate = document.getElementById('mapHoverRate');
  var hBadge = document.getElementById('mapHoverBadge');
  var hHint = document.getElementById('mapHoverHint');

  if (hName) hName.textContent = formatRegionLabel(name);
  if (hCases) hCases.textContent = cases.toLocaleString('uk-UA');
  if (hRate) hRate.textContent = rate.toFixed(2);

  if (hBadge) {
    var b = getOutbreakBadge(rate);
    hBadge.textContent = b.label;
    hBadge.className = 'text-[10px] font-bold px-1.5 py-0.5 rounded border ' + b.color;
  }

  if (hHint) {
    hHint.textContent = selectedRegion === name ? 'Обраний регіон' : 'Натисніть для вибору';
  }
}

function resetHoverPanel() {
  if (selectedRegion !== 'all') {
    var data = getRegionDataForActiveSelection(selectedRegion);
    updateHoverPanel(selectedRegion, data.cases, data.rate);
  } else {
    var stats = getCurrentStats();
    updateHoverPanel('Вся Україна', stats.cases, stats.rate);
    var hHint = document.getElementById('mapHoverHint');
    if (hHint) hHint.textContent = 'Оберіть область на карті';
  }
}

function updateMapColors() {
  if (!geoJsonLayer) return;
  geoJsonLayer.eachLayer(function (layer) {
    layer.setStyle(getFeatureStyle(layer.feature));
  });

  if (kyivMarker) {
    var kData = getRegionDataForActiveSelection('м. Київ');
    var val = mapMetric === 'rate' ? kData.rate : kData.cases;
    kyivMarker.setStyle({
      fillColor: getOutbreakColor(val, mapMetric === 'rate'),
      weight: selectedRegion === 'м. Київ' ? 3 : 2,
      color: selectedRegion === 'м. Київ' ? '#0f172a' : '#ffffff'
    });
    kyivMarker.bringToFront();
  }
}

// ================= CHARTS =================
function renderYearsChart() {
  var ctx = document.getElementById('yearsChart');
  if (!ctx || typeof Chart === 'undefined') return;

  var history = window.EPI_DATA.history_10y;
  var pointBgColors = [];
  var pointRadii = [];
  for (var i = 0; i < history.years.length; i++) {
    if (String(history.years[i]) === String(selectedYear)) {
      pointBgColors.push('#e11d48');
      pointRadii.push(7);
    } else {
      pointBgColors.push('#4f46e5');
      pointRadii.push(3.5);
    }
  }

  var labels = [];
  for (var j = 0; j < history.years.length; j++) {
    labels.push(String(history.years[j]));
  }

  if (yearsChartInstance) {
    yearsChartInstance.destroy();
  }

  yearsChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
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
        pointRadius: pointRadii,
        pointHitRadius: 18
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f172a',
          padding: 8,
          titleFont: { size: 12, weight: 'bold' },
          bodyFont: { size: 12 },
          callbacks: {
            title: function (items) {
              if (items && items.length > 0) {
                return items[0].label + ' рік';
              }
              return '';
            },
            label: function (item) {
              return ' ' + item.raw.toLocaleString('uk-UA') + ' випадків';
            }
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#64748b' } },
        y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 }, color: '#64748b' } }
      },
      onClick: function (e, elements) {
        if (elements && elements.length > 0) {
          var idx = elements[0].index;
          selectYear(String(history.years[idx]));
        }
      }
    }
  });
}

function renderMonthlyChart() {
  var ctx = document.getElementById('monthlyChart');
  if (!ctx || typeof Chart === 'undefined') return;

  var dyn = window.EPI_DATA.monthly_dynamics;
  var months = dyn.months;
  var mIdx = selectedMonth !== 'all' ? parseInt(selectedMonth) - 1 : -1;

  var bg2024 = [];
  var bg2025 = [];
  for (var i = 0; i < months.length; i++) {
    bg2024.push(i === mIdx ? '#be123c' : 'rgba(225, 29, 72, 0.85)');
    bg2025.push(i === mIdx ? '#047857' : 'rgba(16, 185, 129, 0.85)');
  }

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
          borderRadius: 3
        },
        {
          label: '2025 р. (спад)',
          data: dyn.cases_2025,
          backgroundColor: bg2025,
          borderRadius: 3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: { font: { size: 10 }, boxWidth: 10, boxHeight: 10, color: '#334155' }
        },
        tooltip: {
          backgroundColor: '#0f172a',
          padding: 8,
          titleFont: { size: 12, weight: 'bold' },
          bodyFont: { size: 12 },
          callbacks: {
            // Full Ukrainian Month Name in Tooltip
            title: function (items) {
              if (items && items.length > 0) {
                var idx = items[0].dataIndex;
                return FULL_MONTH_NAMES[idx] || items[0].label;
              }
              return '';
            },
            label: function (item) {
              return ' ' + item.dataset.label + ': ' + item.raw.toLocaleString('uk-UA') + ' вип.';
            }
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#64748b' } },
        y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 }, color: '#64748b' } }
      },
      onClick: function (e, elements) {
        if (elements && elements.length > 0) {
          var idx = elements[0].index;
          onMonthChange(String(idx + 1));
        }
      }
    }
  });
}
