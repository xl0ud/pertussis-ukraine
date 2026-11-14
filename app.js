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

var trendStartYear = 2016;
var trendEndYear = 2025;
var compareYear1 = '2024';
var compareYear2 = '2025';

var yearsChartInstance = null;
var monthlyChartInstance = null;

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
  initSvgMap();
  updateView();
  renderYearsChart();
  renderMonthlyChart();
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
  resetHoverPanel();
}

function onRegionClick(reg) {
  if (selectedRegion === reg) {
    selectedRegion = 'all';
  } else {
    selectedRegion = reg;
  }
  syncControls();
  updateView();
  updateMapColors();
  resetHoverPanel();
}

function resetMapSelection() {
  selectedRegion = 'all';
  syncControls();
  updateView();
  updateMapColors();
  resetHoverPanel();
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
          var r23 = reg.cases_2023 || 0;
          var mult = r23 > 0 ? (regYearCases / r23).toFixed(1) : null;
          var multStr = mult ? ' (у ' + mult + ' р. більше до 2023 р.)' : ' до 2023 р.';
          changeStr = (reg.change_24_23 || '') + multStr;
        } else if (selectedYear === '2025') {
          var r24 = reg.cases_2024 || 0;
          var mult2 = (regYearCases > 0 && r24 > 0) ? (r24 / regYearCases).toFixed(1) : null;
          var multStr2 = mult2 ? ' (спад у ' + mult2 + ' р. до 2024 р.)' : ' до 2024 р.';
          changeStr = (reg.change_25_24 || '') + multStr2;
        } else if (selectedYear === '2023') {
          changeStr = reg.cases_2023 + ' вип. за 2023 р.';
        } else if (isAllYears) {
          changeStr = '10 років спостереження (2016–2025 рр.)';
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
  var kpiCasesBadge = document.getElementById('kpiCasesBadge');
  if (kpiCasesVal) kpiCasesVal.textContent = stats.cases.toLocaleString('uk-UA');
  if (kpiCasesChange) kpiCasesChange.textContent = stats.changeStr;
  if (kpiCasesBadge) {
    if (selectedMonth !== 'all') {
      kpiCasesBadge.textContent = 'Місячний зріз';
      kpiCasesBadge.className = 'font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 text-[10px]';
    } else if (selectedYear === '2024') {
      kpiCasesBadge.textContent = 'Приріст';
      kpiCasesBadge.className = 'font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px]';
    } else if (selectedYear === '2025') {
      kpiCasesBadge.textContent = 'Спад';
      kpiCasesBadge.className = 'font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px]';
    } else if (selectedYear === 'all') {
      kpiCasesBadge.textContent = '10 років';
      kpiCasesBadge.className = 'font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[10px]';
    } else {
      kpiCasesBadge.textContent = 'Динаміка';
      kpiCasesBadge.className = 'font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 text-[10px]';
    }
  }

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

// ================= OUTBREAK HELPERS =================
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
  if (rate >= 30.0) return { label: 'Спалах (> 30)', color: 'bg-rose-100 text-rose-800 border-rose-200', dot: '#e11d48' };
  if (rate >= 10.0) return { label: 'Високий (10-30)', color: 'bg-orange-100 text-orange-800 border-orange-200', dot: '#f97316' };
  if (rate >= 2.0) return { label: 'Помірний (2-10)', color: 'bg-amber-100 text-amber-800 border-amber-200', dot: '#f59e0b' };
  if (rate > 0) return { label: 'Фоновий (< 2)', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', dot: '#10b981' };
  return { label: 'Немає даних', color: 'bg-slate-100 text-slate-600 border-slate-200', dot: '#94a3b8' };
}

// ================= ADAPTIVE SVG MAP OF UKRAINE =================
function initSvgMap() {
  var svg = document.getElementById('ukraineSvg');
  if (!svg || !window.UKRAINE_SVG_MAP) return;

  var mapData = window.UKRAINE_SVG_MAP;
  svg.setAttribute('viewBox', mapData.viewBox);
  svg.innerHTML = '';

  // Container group for oblasts
  var gRegions = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  gRegions.setAttribute('id', 'regionsGroup');

  for (var i = 0; i < mapData.regions.length; i++) {
    var r = mapData.regions[i];
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('id', 'region-' + r.name);
    path.setAttribute('d', r.d);
    path.setAttribute('class', 'region-path cursor-pointer');
    path.setAttribute('data-name', r.name);

    (function (regName) {
      path.addEventListener('mouseenter', function () { onRegionHover(regName); });
      path.addEventListener('mouseleave', function () { onRegionLeave(); });
      path.addEventListener('click', function () { onRegionClick(regName); });
    })(r.name);

    gRegions.appendChild(path);
  }
  svg.appendChild(gRegions);

  // Capital City Kyiv Marker
  if (mapData.kyiv) {
    var k = mapData.kyiv;
    var gKyiv = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    gKyiv.setAttribute('id', 'kyivGroup');
    gKyiv.setAttribute('class', 'cursor-pointer');

    // Outer glow ring
    var kPulse = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    kPulse.setAttribute('cx', k.cx);
    kPulse.setAttribute('cy', k.cy);
    kPulse.setAttribute('r', k.r + 4);
    kPulse.setAttribute('fill', 'none');
    kPulse.setAttribute('stroke', '#e11d48');
    kPulse.setAttribute('stroke-width', '2');
    kPulse.setAttribute('opacity', '0.35');
    gKyiv.appendChild(kPulse);

    // Inner marker circle
    var kCirc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    kCirc.setAttribute('id', 'kyivCircle');
    kCirc.setAttribute('cx', k.cx);
    kCirc.setAttribute('cy', k.cy);
    kCirc.setAttribute('r', k.r);
    kCirc.setAttribute('fill', '#e11d48');
    kCirc.setAttribute('stroke', '#ffffff');
    kCirc.setAttribute('stroke-width', '2.5');
    gKyiv.appendChild(kCirc);

    // City label
    var kText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    kText.setAttribute('x', k.cx);
    kText.setAttribute('y', k.cy - 12);
    kText.setAttribute('text-anchor', 'middle');
    kText.setAttribute('font-size', '12');
    kText.setAttribute('font-weight', 'bold');
    kText.setAttribute('fill', '#0f172a');
    kText.setAttribute('class', 'pointer-events-none select-none');
    kText.textContent = 'Київ';
    gKyiv.appendChild(kText);

    gKyiv.addEventListener('mouseenter', function () { onRegionHover('м. Київ'); });
    gKyiv.addEventListener('mouseleave', function () { onRegionLeave(); });
    gKyiv.addEventListener('click', function () { onRegionClick('м. Київ'); });

    svg.appendChild(gKyiv);
  }

  updateMapColors();
  resetHoverPanel();
}

function onRegionHover(name) {
  var data = getRegionDataForActiveSelection(name);
  updateHoverPanel(name, data.cases, data.rate);

  var path = document.getElementById('region-' + name);
  if (path && selectedRegion !== name) {
    path.setAttribute('stroke', '#0f172a');
    path.setAttribute('stroke-width', '2.5');
  }
}

function onRegionLeave() {
  updateMapColors();
  resetHoverPanel();
}

function updateHoverPanel(name, cases, rate) {
  var hName = document.getElementById('mapBarName');
  var hCases = document.getElementById('mapBarCases');
  var hRate = document.getElementById('mapBarRate');
  var hBadge = document.getElementById('mapBarBadge');
  var hDot = document.getElementById('mapBarDot');
  var hSub = document.getElementById('mapBarSub');

  if (hName) hName.textContent = formatRegionLabel(name);
  if (hCases) hCases.textContent = cases.toLocaleString('uk-UA') + ' вип.';
  if (hRate) hRate.textContent = rate.toFixed(2);

  var badge = getOutbreakBadge(rate);
  if (hBadge) {
    hBadge.textContent = badge.label;
    hBadge.className = 'text-[10px] font-bold px-2 py-0.5 rounded border ' + badge.color;
  }
  if (hDot) {
    hDot.style.backgroundColor = badge.dot;
  }
  if (hSub) {
    if (name === 'all' || name === 'Вся Україна') {
      hSub.textContent = 'Оберіть область на карті нижче для деталізації';
    } else if (selectedRegion === name) {
      hSub.textContent = 'Обраний регіон для детального аналізу';
    } else {
      hSub.textContent = 'Натисніть на область для вибору';
    }
  }
}

function resetHoverPanel() {
  if (selectedRegion !== 'all') {
    var data = getRegionDataForActiveSelection(selectedRegion);
    updateHoverPanel(selectedRegion, data.cases, data.rate);
  } else {
    var stats = getCurrentStats();
    updateHoverPanel('Вся Україна', stats.cases, stats.rate);
  }
}

function updateMapColors() {
  if (!window.UKRAINE_SVG_MAP) return;

  var regions = window.UKRAINE_SVG_MAP.regions;
  var selectedElem = null;

  for (var i = 0; i < regions.length; i++) {
    var r = regions[i];
    var path = document.getElementById('region-' + r.name);
    if (!path) continue;

    var data = getRegionDataForActiveSelection(r.name);
    var val = mapMetric === 'rate' ? data.rate : data.cases;
    var color = getOutbreakColor(val, mapMetric === 'rate');
    var isSelected = selectedRegion === r.name;

    path.setAttribute('fill', color);
    if (isSelected) {
      path.setAttribute('stroke', '#0f172a');
      path.setAttribute('stroke-width', '3.2');
      path.setAttribute('class', 'region-path active-selected cursor-pointer');
      selectedElem = path;
    } else {
      path.setAttribute('stroke', '#ffffff');
      path.setAttribute('stroke-width', '1.5');
      path.setAttribute('class', 'region-path cursor-pointer');
    }
  }

  // Bring selected path to the top of SVG stack
  if (selectedElem && selectedElem.parentNode) {
    selectedElem.parentNode.appendChild(selectedElem);
  }

  // Kyiv marker update
  var kCirc = document.getElementById('kyivCircle');
  if (kCirc) {
    var kData = getRegionDataForActiveSelection('м. Київ');
    var kVal = mapMetric === 'rate' ? kData.rate : kData.cases;
    var kColor = getOutbreakColor(kVal, mapMetric === 'rate');
    kCirc.setAttribute('fill', kColor);
    if (selectedRegion === 'м. Київ') {
      kCirc.setAttribute('stroke', '#0f172a');
      kCirc.setAttribute('stroke-width', '3.5');
    } else {
      kCirc.setAttribute('stroke', '#ffffff');
      kCirc.setAttribute('stroke-width', '2.5');
    }
  }
}

// ================= CHARTS =================
function onTrendRangeChange() {
  var sSel = document.getElementById('trendStartYear');
  var eSel = document.getElementById('trendEndYear');
  if (sSel && eSel) {
    var sVal = parseInt(sSel.value);
    var eVal = parseInt(eSel.value);
    if (sVal > eVal) {
      eSel.value = sVal;
      eVal = sVal;
    }
    trendStartYear = sVal;
    trendEndYear = eVal;
  }
  renderYearsChart();
}

function onCompareYearsChange() {
  var sel1 = document.getElementById('compareYear1');
  var sel2 = document.getElementById('compareYear2');
  if (sel1) compareYear1 = sel1.value;
  if (sel2) compareYear2 = sel2.value;
  renderMonthlyChart();
}

function renderYearsChart() {
  var ctx = document.getElementById('yearsChart');
  if (!ctx || typeof Chart === 'undefined') return;

  var history = window.EPI_DATA.history_10y;
  var allYears = history.years;
  var allCases = history.cases;

  var filteredYears = [];
  var filteredCases = [];

  for (var i = 0; i < allYears.length; i++) {
    var y = allYears[i];
    if (y >= trendStartYear && y <= trendEndYear) {
      filteredYears.push(String(y));
      filteredCases.push(allCases[i]);
    }
  }

  var titleSpan = document.getElementById('yearsChartTitle');
  if (titleSpan) {
    if (trendStartYear === 2016 && trendEndYear === 2025) {
      titleSpan.textContent = 'Динаміка за 10 років (2016-2025 рр.)';
    } else {
      titleSpan.textContent = 'Динаміка за ' + trendStartYear + '–' + trendEndYear + ' рр.';
    }
  }

  var pointBgColors = [];
  var pointRadii = [];
  for (var j = 0; j < filteredYears.length; j++) {
    if (filteredYears[j] === String(selectedYear)) {
      pointBgColors.push('#e11d48');
      pointRadii.push(7);
    } else {
      pointBgColors.push('#4f46e5');
      pointRadii.push(3.5);
    }
  }

  if (yearsChartInstance) {
    yearsChartInstance.destroy();
  }

  yearsChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: filteredYears,
      datasets: [{
        label: 'Випадки',
        data: filteredCases,
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
              if (items && items.length > 0) return items[0].label + ' рік';
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
          selectYear(filteredYears[idx]);
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

  var data1 = dyn.by_year && dyn.by_year[compareYear1] ? dyn.by_year[compareYear1] : dyn.cases_2024;
  var data2 = dyn.by_year && dyn.by_year[compareYear2] ? dyn.by_year[compareYear2] : dyn.cases_2025;

  var bg1 = [];
  var bg2 = [];
  for (var i = 0; i < months.length; i++) {
    bg1.push(i === mIdx ? '#be123c' : 'rgba(225, 29, 72, 0.85)');
    bg2.push(i === mIdx ? '#047857' : 'rgba(16, 185, 129, 0.85)');
  }

  var mTitle = document.getElementById('monthlyChartTitle');
  if (mTitle) {
    mTitle.textContent = 'Помісячний розподіл (' + compareYear1 + ' vs ' + compareYear2 + ')';
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
          label: compareYear1 + ' рік',
          data: data1,
          backgroundColor: bg1,
          borderRadius: 3
        },
        {
          label: compareYear2 + ' рік',
          data: data2,
          backgroundColor: bg2,
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
            // Full Ukrainian Month Name
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
