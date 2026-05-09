'use strict';
/* NEXIS Wellness Station v2 — Analytics */

let weeklyChart = null;

function loadWeeklyStats() {
  // В демо-режиме — сразу рисуем с фейковыми данными
  if (state.mode === 'demo') {
    const today = new Date();
    const demoRows = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today); d.setDate(d.getDate() - (6 - i));
      return { day: d.toISOString().slice(0, 10), pomodoros: [2,4,3,5,4,6,3][i] || 0 };
    });
    renderWeeklyChart(demoRows);
    renderProductivityScore(demoRows);
    return;
  }
  fetch('/api/stats/week')
    .then(r => r.json())
    .then(rows => {
      if (!Array.isArray(rows) || !rows.length) {
        // Нет данных в БД — показать нули
        const today = new Date();
        const emptyRows = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(today); d.setDate(d.getDate() - (6 - i));
          return { day: d.toISOString().slice(0, 10), pomodoros: 0 };
        });
        renderWeeklyChart(emptyRows);
        return;
      }
      renderWeeklyChart(rows);
      renderProductivityScore(rows);
    })
    .catch(() => {});
}


function renderWeeklyChart(rows) {
  const ctx = document.getElementById('weeklyPomodoroChart');
  if (!ctx) return;
  if (weeklyChart) { weeklyChart.destroy(); weeklyChart = null; }
  const c = getChartThemeColors();
  const labels = rows.map(r => {
    const d = new Date(r.day);
    return d.toLocaleDateString('ru', { weekday: 'short', day: 'numeric' });
  });
  weeklyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Помодоро',
        data: rows.map(r => r.pomodoros || 0),
        backgroundColor: '#4d9eff88',
        borderColor: '#4d9eff',
        borderWidth: 2,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { backgroundColor: c.ttBg, titleColor: c.ttTitle, bodyColor: c.ttBody } },
      scales: {
        x: { grid: { color: c.grid }, ticks: { color: c.ticks } },
        y: { grid: { color: c.grid }, ticks: { color: c.ticks, stepSize: 1 }, beginAtZero: true },
      },
    },
  });
}


function renderProductivityScore(weekRows) {
  const el = document.getElementById('productivity-score');
  if (!el) return;
  const today = weekRows[weekRows.length - 1] || {};
  const pomoScore = Math.min(100, (today.pomodoros || 0) * 10);
  const { index: wIndex } = calcWellnessIndex(state.sensors);
  const workSecs = state.sensors.work_time_today || 0;
  const workScore = Math.min(100, (workSecs / (8 * 3600)) * 100);
  const score = Math.round(pomoScore * 0.4 + wIndex * 0.4 + workScore * 0.2);
  el.textContent = score;
  const lbl = document.getElementById('productivity-score-label');
  if (lbl) lbl.textContent = score > 80 ? 'Отличный день!' : score > 60 ? 'Хороший день' : score > 40 ? 'Средний день' : 'Слабый день';

  // Обновляем "лучшее время" на основе данных из буфера
  renderBestHours();
}


function renderBestHours() {
  const el = document.getElementById('best-hours-text');
  if (!el) return;

  const rows = state.chartData.map(pt => pt.full).filter(r => r.co2 != null);
  if (rows.length < 6) { el.textContent = 'Накапливаются данные...'; return; }

  // Группируем по часу, берём средний CO₂
  const byHour = {};
  rows.forEach(r => {
    const h = new Date(r.timestamp).getHours();
    if (!byHour[h]) byHour[h] = [];
    byHour[h].push(r.co2);
  });

  // Находим час с минимальным средним CO₂ (лучший воздух = лучший фокус)
  let bestH = null, bestCo2 = Infinity;
  Object.entries(byHour).forEach(([h, vals]) => {
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    if (avg < bestCo2) { bestCo2 = avg; bestH = +h; }
  });

  if (bestH == null) { el.textContent = 'Недостаточно данных'; return; }
  const endH = (bestH + 2) % 24;
  el.textContent = `${String(bestH).padStart(2,'0')}:00 — ${String(endH).padStart(2,'0')}:00`;

  const co2El = document.getElementById('best-hours-co2');
  if (co2El) co2El.textContent = 'CO₂ ≈ ' + Math.round(bestCo2) + ' ppm';
}


function loadAnalyticsComparison(metric) {
  metric = metric || state.activeMetric || 'temperature';

  // Demo-режим: разбиваем буфер на «вчера» (первая половина) и «сегодня» (вторая)
  if (state.mode === 'demo') {
    if (state.chartData.length < 4) {
      // Ещё нет данных — показать заглушку через секунду
      setTimeout(() => loadAnalyticsComparison(metric), 2000);
      return;
    }
    const all  = state.chartData.map(pt => pt.full);
    const half = Math.floor(all.length / 2);
    // Имитируем метки «вчера»: сдвигаем timestamp на сутки назад
    const yesterday = all.slice(0, half).map(r => ({
      ...r,
      timestamp: new Date(new Date(r.timestamp).getTime() - 86400000).toISOString(),
    }));
    renderComparisonChart(all.slice(half), yesterday, metric);
    return;
  }

  fetch('/api/history?hours=48')
    .then(r => r.json())
    .then(rows => {
      if (!Array.isArray(rows) || !rows.length) return;
      const todayStr     = new Date().toDateString();
      const yesterdayStr = new Date(Date.now() - 86400000).toDateString();
      renderComparisonChart(
        rows.filter(r => new Date(r.timestamp).toDateString() === todayStr),
        rows.filter(r => new Date(r.timestamp).toDateString() === yesterdayStr),
        metric,
      );
    })
    .catch(() => {});
}


let comparisonChart = null;


function renderComparisonChart(todayRows, yesterdayRows, metric) {
  const ctx = document.getElementById('comparisonChart');
  if (!ctx) return;
  if (comparisonChart) { comparisonChart.destroy(); comparisonChart = null; }
  const c = getChartThemeColors();
  const toTime = r => new Date(r.timestamp).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  comparisonChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: todayRows.map(toTime),
      datasets: [
        { label: 'Сегодня', data: todayRows.map(r => r[metric]), borderColor: '#4d9eff', backgroundColor: '#4d9eff18', borderWidth: 2, pointRadius: 0, fill: true, tension: 0.4 },
        { label: 'Вчера',   data: yesterdayRows.map(r => r[metric]), borderColor: '#888', backgroundColor: '#88888818', borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.4, borderDash: [4, 4] },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: true, labels: { color: c.ticks } }, tooltip: { backgroundColor: c.ttBg, titleColor: c.ttTitle, bodyColor: c.ttBody } },
      scales: {
        x: { grid: { color: c.grid }, ticks: { color: c.ticks, maxTicksLimit: 10, maxRotation: 0 } },
        y: { grid: { color: c.grid }, ticks: { color: c.ticks } },
      },
    },
  });
}
window.loadAnalyticsComparison = loadAnalyticsComparison;


function clearSensorDisplay() {
  ['temp','hum','co2','light','noise'].forEach(k => {
    const el = document.getElementById(`d-${k}`);
    if (el) el.textContent = '--';
    const el2 = document.getElementById(`ds-${k}`);
    if (el2) el2.textContent = '--';
    const tile = document.getElementById(`tile-${k}`);
    if (tile) tile.className = 'tile clickable';
  });
}


function updateStats(data) {
  // Простая статистика из текущих данных
  const s = (id, val, d=1) => { const el = document.getElementById(id); if (el) el.textContent = val != null ? fmt(val,d) : '--'; };
  s('st-avgTemp',  data.temperature);
  s('st-avgHum',   data.humidity, 0);
  s('st-avgCo2',   data.co2, 0);
  s('st-maxCo2',   data.co2, 0);
  s('st-readings', state.demoTick || 1, 0);
}


let analyticsChart = null;
let _analyticsHours  = 24;
let _analyticsMetric = 'temperature';


function loadAnalytics(hours, metric) {
  if (hours  !== undefined) _analyticsHours  = hours;
  if (metric !== undefined) _analyticsMetric = metric;
  hours  = _analyticsHours;
  metric = _analyticsMetric;

  // Синхронизировать активную вкладку
  document.querySelectorAll('#analyticsMetricTabs .ctab').forEach(b => {
    b.classList.toggle('active', b.dataset.am === metric);
  });
  const titleEl = document.getElementById('analyticsChartTitle');
  if (titleEl) titleEl.textContent = (METRIC_META[metric] || {}).label || metric;

  const st = document.getElementById('analyticsStatus');

  // Демо-режим: используем буфер из памяти браузера
  if (state.mode === 'demo' && state.chartData.length > 0) {
    const rows = state.chartData.map(pt => pt.full);
    if (st) st.textContent = 'Демо — ' + rows.length + ' точек';
    renderAnalyticsChart(rows, metric);
    renderAnalyticsStats(rows);
    renderSummaryTable(rows);
    renderStreak();
    loadWeekComparison();
    renderHeatmap();
    return;
  }

  // Live-режим: читаем из базы данных
  if (st) st.textContent = 'Загрузка...';
  fetch('/api/history?hours=' + hours)
    .then(r => r.json())
    .then(rows => {
      if (!Array.isArray(rows) || !rows.length) {
        if (st) st.textContent = state.mode === 'demo'
          ? 'Подождите — демо-данные ещё накапливаются'
          : 'Нет данных за выбранный период';
        return;
      }
      if (st) st.textContent = 'БД — ' + rows.length + ' точек';
      renderAnalyticsChart(rows, metric);
      renderAnalyticsStats(rows);
      renderSummaryTable(rows);
      renderStreak();
      loadWeekComparison();
      renderHeatmap();
    })
    .catch(() => { if (st) st.textContent = 'Ошибка загрузки'; });
}
window.loadAnalytics = loadAnalytics;


function renderAnalyticsChart(rows, metric) {
  metric = metric || _analyticsMetric || 'temperature';
  const ctx = document.getElementById('analyticsChart');
  if (!ctx) return;
  if (analyticsChart) { analyticsChart.destroy(); analyticsChart = null; }

  const meta   = METRIC_META[metric] || { label: metric, unit: '', warn: null, danger: null, color: '#4d9eff' };
  const c      = getChartThemeColors();
  const labels = rows.map(r => {
    const d = new Date(r.timestamp);
    return d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  });
  const data   = rows.map(r => r[metric] != null ? +r[metric] : null);
  const vals   = data.filter(v => v != null);
  const avg    = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;

  const datasets = [
    {
      label: meta.label + ' (' + meta.unit + ')',
      data,
      borderColor: meta.color,
      backgroundColor: meta.color + '22',
      borderWidth: 2.5,
      pointRadius: 0,
      pointHoverRadius: 4,
      fill: true,
      tension: 0.4,
    },
  ];

  // Пороговые линии (warn / danger)
  if (meta.warn != null) datasets.push({
    label: 'Предупреждение (' + meta.warn + ' ' + meta.unit + ')',
    data: rows.map(() => meta.warn),
    borderColor: 'rgba(245,166,35,0.6)', borderWidth: 1.5,
    borderDash: [6, 4], pointRadius: 0, fill: false, tension: 0,
  });
  if (meta.danger != null) datasets.push({
    label: 'Опасно (' + meta.danger + ' ' + meta.unit + ')',
    data: rows.map(() => meta.danger),
    borderColor: 'rgba(240,64,64,0.55)', borderWidth: 1.5,
    borderDash: [4, 3], pointRadius: 0, fill: false, tension: 0,
  });

  analyticsChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, labels: { color: c.ticks, boxHeight: 2 } },
        tooltip: {
          backgroundColor: c.ttBg, borderColor: c.ttBorder, borderWidth: 1,
          titleColor: c.ttTitle, bodyColor: c.ttBody, padding: 10,
          callbacks: {
            afterBody: (items) => {
              const v = items[0]?.raw;
              if (v == null || avg == null) return '';
              const diff = v - avg;
              return 'Среднее: ' + fmt(avg, 1) + ' ' + meta.unit + '   Δ ' + (diff >= 0 ? '+' : '') + fmt(diff, 1);
            },
          },
        },
      },
      scales: {
        x: { grid: { color: c.grid }, ticks: { color: c.ticks, maxTicksLimit: 12, maxRotation: 0 } },
        y: { grid: { color: c.grid }, ticks: { color: c.ticks }, title: { display: true, text: meta.unit, color: c.ticks } },
      },
    },
  });
}


function renderSummaryTable(rows) {
  const tbody = document.getElementById('summaryTableBody');
  if (!tbody) return;
  tbody.textContent = '';

  const defs = [
    { key: 'temperature', icon: '🌡', label: 'Температура', unit: '°C',  d: 1,
      level: avg => avg > 30 ? 'danger' : avg > 27 ? 'warn' : avg >= 18 ? 'ok' : 'warn' },
    { key: 'co2',         icon: '🌿', label: 'CO₂',         unit: 'ppm', d: 0,
      level: avg => avg > 1200 ? 'danger' : avg > 800 ? 'warn' : 'ok' },
    { key: 'humidity',    icon: '💧', label: 'Влажность',   unit: '%',   d: 0,
      level: avg => avg > 75 || avg < 25 ? 'danger' : avg > 65 || avg < 30 ? 'warn' : 'ok' },
    { key: 'light',       icon: '☀️', label: 'Освещённость', unit: 'lux', d: 0,
      level: avg => avg < 50 ? 'danger' : avg < 150 ? 'warn' : 'ok' },
    { key: 'noise',       icon: '🔊', label: 'Шум',          unit: 'dB',  d: 1,
      level: avg => avg > 70 ? 'danger' : avg > 55 ? 'warn' : 'ok' },
  ];

  const STATUS = {
    ok:     { dot: '🟢', label: 'Норма',    cls: 'sum-ok'     },
    warn:   { dot: '🟡', label: 'Внимание', cls: 'sum-warn'   },
    danger: { dot: '🔴', label: 'Опасно',   cls: 'sum-danger' },
  };

  defs.forEach(({ key, icon, label, unit, d, level }) => {
    const vals = rows.map(r => r[key]).filter(v => v != null);
    if (!vals.length) return;
    const mn  = Math.min(...vals);
    const mx  = Math.max(...vals);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const st  = STATUS[level(avg)];

    const tr = document.createElement('tr');
    tr.className = st.cls;

    const tdName = document.createElement('td');
    tdName.className = 'sum-name';
    const iconSpan = document.createElement('span');
    iconSpan.textContent = icon + ' ';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = label;
    tdName.appendChild(iconSpan);
    tdName.appendChild(nameSpan);

    const tdMin = document.createElement('td');
    tdMin.className = 'sum-num';
    tdMin.textContent = fmt(mn, d) + ' ' + unit;

    const tdAvg = document.createElement('td');
    tdAvg.className = 'sum-num sum-avg';
    tdAvg.textContent = fmt(avg, d) + ' ' + unit;

    const tdMax = document.createElement('td');
    tdMax.className = 'sum-num';
    tdMax.textContent = fmt(mx, d) + ' ' + unit;

    const tdSt = document.createElement('td');
    tdSt.className = 'sum-status';
    const dot = document.createElement('span');
    dot.textContent = st.dot;
    const stLabel = document.createElement('span');
    stLabel.textContent = ' ' + st.label;
    tdSt.appendChild(dot);
    tdSt.appendChild(stLabel);

    tr.appendChild(tdName);
    tr.appendChild(tdMin);
    tr.appendChild(tdAvg);
    tr.appendChild(tdMax);
    tr.appendChild(tdSt);
    tbody.appendChild(tr);
  });
}


function renderAnalyticsStats(rows) {
  const grid = document.getElementById('analyticsStatsGrid');
  if (!grid) return;
  grid.textContent = '';

  const defs = [
    { key: 'temperature', label: 'T\xb0C',       unit: '\xb0C', d: 1 },
    { key: 'humidity',    label: 'Влажность',  unit: '%',   d: 0 },
    { key: 'co2',         label: 'CO₂',       unit: 'ppm', d: 0 },
    { key: 'light',       label: 'Освещённость', unit: 'lux', d: 0 },
    { key: 'noise',       label: 'Шум',        unit: 'dB',  d: 1 },
  ];

  defs.forEach(({ key, label, unit, d }) => {
    const vals = rows.map(r => r[key]).filter(v => v != null);
    if (!vals.length) return;
    const mn  = Math.min(...vals);
    const mx  = Math.max(...vals);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;

    const card = document.createElement('div');
    card.className = 'ast-card';

    const title = document.createElement('div');
    title.className = 'ast-title';
    title.textContent = label;
    card.appendChild(title);

    [['Мин', mn], ['Среднее', avg], ['Макс', mx]].forEach(([lbl, val]) => {
      const row = document.createElement('div');
      row.className = 'ast-row';
      const s = document.createElement('span');
      s.textContent = lbl;
      const b = document.createElement('b');
      b.textContent = fmt(val, d) + ' ' + unit;
      row.appendChild(s);
      row.appendChild(b);
      card.appendChild(row);
    });

    grid.appendChild(card);
  });
}


// ──────────────────────────────────────────────────
// ФИЧА 13: STREAK — серия продуктивных дней
// ──────────────────────────────────────────────────
function calcStreak() {
  const today = new Date().toISOString().slice(0, 10);
  let dates = [];
  try { dates = JSON.parse(localStorage.getItem('nexis-streak-dates') || '[]'); } catch(e) {}

  // Пометить сегодня продуктивным если >= 4 помодоро
  const pomoToday = parseInt(localStorage.getItem('nexis-pomo-cycles') || '0', 10);
  if (pomoToday >= 4 && !dates.includes(today)) {
    dates.push(today);
    localStorage.setItem('nexis-streak-dates', JSON.stringify(dates));
  }

  // Считаем подряд идущие дни назад от сегодня
  let streak = 0;
  let check = new Date();
  for (let i = 0; i < 365; i++) {
    const d = check.toISOString().slice(0, 10);
    if (dates.includes(d)) { streak++; check.setDate(check.getDate() - 1); }
    else if (i === 0) { check.setDate(check.getDate() - 1); } // сегодня ещё не помечен — ок
    else break;
  }
  return streak;
}

function renderStreak() {
  const el = document.getElementById('analytics-streak');
  if (!el) return;
  let streak = calcStreak();
  // Demo: рандомный streak если нет реальных данных
  if (state.mode === 'demo' && streak === 0) streak = Math.floor(Math.random() * 7) + 1;
  el.textContent = '🔥 Серия: ' + streak + (streak === 1 ? ' день' : streak < 5 ? ' дня' : ' дней') + ' подряд';
}

// ──────────────────────────────────────────────────
// ФИЧА 14: СРАВНЕНИЕ НЕДЕЛЬ
// ──────────────────────────────────────────────────
let weekCompChart = null;

function renderWeekComparison(currentWeek, prevWeek) {
  const ctx = document.getElementById('week-comparison-chart');
  if (!ctx) return;
  if (weekCompChart) { weekCompChart.destroy(); weekCompChart = null; }

  const c = getChartThemeColors();
  const days = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

  weekCompChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: days,
      datasets: [
        {
          label: 'Эта неделя',
          data: currentWeek,
          backgroundColor: '#4d9eff88',
          borderColor: '#4d9eff',
          borderWidth: 2, borderRadius: 3,
        },
        {
          label: 'Прошлая неделя',
          data: prevWeek,
          backgroundColor: 'rgba(150,150,150,0.3)',
          borderColor: 'rgba(150,150,150,0.6)',
          borderWidth: 2, borderRadius: 3,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: true, labels: { color: c.ticks, font: { size: 12 } } },
        tooltip: { backgroundColor: c.ttBg, titleColor: c.ttTitle, bodyColor: c.ttBody },
      },
      scales: {
        x: { grid: { color: c.grid }, ticks: { color: c.ticks } },
        y: { grid: { color: c.grid }, ticks: { color: c.ticks, stepSize: 1 }, beginAtZero: true },
      },
    },
  });

  // Дельта
  const sumCur = currentWeek.reduce((a, b) => a + b, 0);
  const sumPrev = prevWeek.reduce((a, b) => a + b, 0);
  const delta = document.getElementById('week-comp-delta');
  if (delta && sumPrev > 0) {
    const pct = Math.round((sumCur - sumPrev) / sumPrev * 100);
    delta.textContent = (pct >= 0 ? '+' : '') + pct + '% по помодоро vs прошлой недели';
    delta.style.color = pct >= 0 ? 'var(--green)' : 'var(--red)';
  } else if (delta) {
    delta.textContent = 'Нет данных прошлой недели';
  }
}

function loadWeekComparison() {
  if (state.mode === 'demo') {
    const cur  = [3, 5, 4, 6, 4, 2, 1];
    const prev = [2, 4, 3, 5, 6, 1, 0];
    renderWeekComparison(cur, prev);
    return;
  }
  fetch('/api/stats/week')
    .then(r => r.json())
    .then(rows => {
      const cur = Array(7).fill(0);
      rows.forEach(r => {
        const d = new Date(r.day).getDay();
        const idx = d === 0 ? 6 : d - 1;
        cur[idx] = r.pomodoros || 0;
      });
      let prev = [];
      try { prev = JSON.parse(localStorage.getItem('nexis-prev-week') || '[]'); } catch(e) {}
      if (!prev.length) prev = Array(7).fill(0);
      // Сохранить текущую как "прошлую" для следующей недели (раз в воскресенье)
      if (new Date().getDay() === 0) localStorage.setItem('nexis-prev-week', JSON.stringify(cur));
      renderWeekComparison(cur, prev);
    })
    .catch(() => {});
}

// ──────────────────────────────────────────────────
// ФИЧА 15: HEATMAP продуктивности по часам
// ──────────────────────────────────────────────────
function renderHeatmap() {
  const container = document.getElementById('heatmap-container');
  if (!container) return;
  while (container.firstChild) container.removeChild(container.firstChild);

  // Собираем данные: hour × day → активность (count точек)
  const matrix = Array.from({ length: 24 }, () => Array(7).fill(0));

  const rows = state.mode === 'demo'
    ? state.chartData.map(pt => pt.full)
    : [];

  rows.forEach(r => {
    if (!r.timestamp) return;
    const d = new Date(r.timestamp);
    const h = d.getHours();
    const dow = d.getDay() === 0 ? 6 : d.getDay() - 1;
    matrix[h][dow]++;
  });

  const maxVal = Math.max(1, ...matrix.flat());
  const days = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

  // Заголовки дней
  const header = document.createElement('div');
  header.className = 'heatmap-header';
  const empty = document.createElement('div'); empty.className = 'heatmap-h-cell heatmap-hour-label';
  header.appendChild(empty);
  days.forEach(d => {
    const cell = document.createElement('div');
    cell.className = 'heatmap-h-cell';
    cell.textContent = d;
    header.appendChild(cell);
  });
  container.appendChild(header);

  // Строки по часам
  for (let h = 0; h < 24; h++) {
    const row = document.createElement('div');
    row.className = 'heatmap-row';
    const label = document.createElement('div');
    label.className = 'heatmap-hour-label';
    label.textContent = String(h).padStart(2, '0');
    row.appendChild(label);
    for (let d = 0; d < 7; d++) {
      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';
      const val = matrix[h][d];
      const intensity = val / maxVal;
      // Цвет: 0=серый, 0.25=синий, 0.5=зелёный, 1=оранжевый
      let bg;
      if (intensity === 0) bg = 'var(--bg3)';
      else if (intensity < 0.33) bg = 'rgba(77,158,255,' + (0.3 + intensity) + ')';
      else if (intensity < 0.66) bg = 'rgba(34,197,94,' + (0.3 + intensity * 0.7) + ')';
      else bg = 'rgba(249,115,22,' + (0.4 + intensity * 0.6) + ')';
      cell.style.background = bg;
      cell.title = days[d] + ' ' + String(h).padStart(2,'0') + ':00 — ' + val + ' точек';
      if (val > 0) {
        cell.textContent = val;
        cell.style.color = intensity > 0.5 ? '#fff' : 'rgba(0,0,0,0.6)';
        cell.style.fontSize = '9px';
        cell.style.display = 'flex';
        cell.style.alignItems = 'center';
        cell.style.justifyContent = 'center';
        cell.style.fontWeight = '600';
      }
      row.appendChild(cell);
    }
    container.appendChild(row);
  }

  // Легенда
  const legend = document.createElement('div');
  legend.className = 'heatmap-legend';
  [['Нет', 'var(--bg3)'], ['Мало', 'rgba(77,158,255,0.5)'], ['Средне', 'rgba(34,197,94,0.7)'], ['Активно', 'rgba(249,115,22,0.9)']].forEach(([label, color]) => {
    const item = document.createElement('div'); item.className = 'heatmap-legend-item';
    const dot = document.createElement('div'); dot.className = 'heatmap-legend-dot'; dot.style.background = color;
    const lbl = document.createElement('span'); lbl.textContent = label;
    item.appendChild(dot); item.appendChild(lbl);
    legend.appendChild(item);
  });
  container.appendChild(legend);
}

// ──────────────────────────────────────────────────
// B3: КОРРЕЛЯЦИЯ — среда рабочего места → продуктивность
// ──────────────────────────────────────────────────
let _corrChart = null;

function renderCorrelationChart(metric) {
  const canvas = document.getElementById('correlation-chart');
  if (!canvas) return;

  // Группируем chartData по часам: для каждого часа — среднее metric + кол-во поводоро
  const hourBuckets = {};
  state.chartData.forEach(pt => {
    if (!pt.full || pt.full[metric] == null || !pt.full.timestamp) return;
    const h = new Date(pt.full.timestamp).getHours();
    if (!hourBuckets[h]) hourBuckets[h] = { metricSum: 0, count: 0 };
    hourBuckets[h].metricSum += pt.full[metric];
    hourBuckets[h].count++;
  });

  // Pomodoro по часам из localStorage history
  const pomoLog = JSON.parse(localStorage.getItem('nexis-pomo-history-by-hour') || '{}');

  // Demo: генерируем синтетические данные с реалистичной корреляцией
  const points = [];
  if (state.mode === 'demo') {
    // CO₂ vs pomodoro: антикорреляция — при высоком CO₂ меньше помодоро
    for (let i = 0; i < 24; i++) {
      const base = { co2: 600 + Math.random() * 600, temperature: 20 + Math.random() * 8, humidity: 35 + Math.random() * 40, noise: 30 + Math.random() * 45, light: 100 + Math.random() * 700 };
      const metricVal = base[metric] != null ? base[metric] : base.co2;
      // Антикорреляция с CO₂, прямая — с остальными
      let pomo;
      if (metric === 'co2') pomo = Math.max(0, Math.round(4 - (metricVal - 600) / 200 + Math.random() * 1.5));
      else if (metric === 'noise') pomo = Math.max(0, Math.round(4 - (metricVal - 30) / 15 + Math.random() * 1.5));
      else pomo = Math.max(0, Math.round(1 + Math.random() * 3));
      points.push({ x: Math.round(metricVal * 10) / 10, y: pomo });
    }
  } else {
    Object.entries(hourBuckets).forEach(([h, data]) => {
      if (data.count === 0) return;
      points.push({ x: Math.round(data.metricSum / data.count * 10) / 10, y: parseInt(pomoLog[h] || 0) });
    });
  }

  if (points.length < 3) {
    const msg = document.getElementById('correlation-msg');
    if (msg) msg.textContent = 'Недостаточно данных для корреляции (нужно больше истории)';
    return;
  }

  // Линия тренда (МНК)
  const n = points.length;
  let sx = 0, sy = 0, sxy = 0, sx2 = 0;
  points.forEach(p => { sx += p.x; sy += p.y; sxy += p.x * p.y; sx2 += p.x * p.x; });
  const slope = (n * sxy - sx * sy) / (n * sx2 - sx * sx);
  const intercept = (sy - slope * sx) / n;

  const xMin = Math.min(...points.map(p => p.x));
  const xMax = Math.max(...points.map(p => p.x));
  const trendLine = [{ x: xMin, y: Math.max(0, intercept + slope * xMin) }, { x: xMax, y: Math.max(0, intercept + slope * xMax) }];

  // Корреляция Пирсона
  const meanX = sx / n, meanY = sy / n;
  let num = 0, d1 = 0, d2 = 0;
  points.forEach(p => { num += (p.x - meanX) * (p.y - meanY); d1 += (p.x - meanX) ** 2; d2 += (p.y - meanY) ** 2; });
  const r = d1 * d2 > 0 ? num / Math.sqrt(d1 * d2) : 0;

  const metaLabels = { co2: 'CO₂ (ppm)', temperature: 'Температура (°C)', humidity: 'Влажность (%)', noise: 'Шум (dB)', light: 'Освещённость (lux)' };

  if (_corrChart) { _corrChart.destroy(); _corrChart = null; }
  _corrChart = new Chart(canvas, {
    data: {
      datasets: [
        { type: 'scatter', label: 'Час дня', data: points, backgroundColor: 'rgba(77,158,255,0.65)', pointRadius: 7, pointHoverRadius: 9 },
        { type: 'line', label: 'Тренд', data: trendLine, borderColor: slope < 0 ? '#f97316' : '#20c97a', borderDash: [5, 4], pointRadius: 0, fill: false }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: 'var(--text2)', font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => ctx.dataset.type === 'scatter' ? (metaLabels[metric] + ': ' + ctx.parsed.x + ' → ' + ctx.parsed.y + ' помодоро') : '' } }
      },
      scales: {
        x: { title: { display: true, text: metaLabels[metric] || metric, color: 'var(--text3)' }, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'var(--text3)' } },
        y: { title: { display: true, text: 'Pomodoro / час', color: 'var(--text3)' }, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'var(--text3)', stepSize: 1 }, min: 0 }
      }
    }
  });

  // Вывод: вывод корреляции
  const msg = document.getElementById('correlation-msg');
  if (msg) {
    const rStr = Math.abs(r).toFixed(2);
    const dir = slope < 0 ? '↓ отрицательная' : '↑ положительная';
    const str = Math.abs(r) > 0.6 ? 'сильная' : Math.abs(r) > 0.3 ? 'умеренная' : 'слабая';
    const insight = metric === 'co2' && slope < -0.01 ? 'При CO₂ < 800 ppm продуктивность выше' : metric === 'noise' && slope < -0.01 ? 'Шум снижает концентрацию' : 'Нет выраженной зависимости';
    msg.textContent = 'Корреляция: r = ' + rStr + ' (' + str + ', ' + dir + ') · ' + insight;
    msg.style.color = Math.abs(r) > 0.5 ? '#f97316' : 'var(--text3)';
  }
}

function initCorrelation() {
  const btns = document.querySelectorAll('.corr-metric-btn');
  let activeMetric = 'co2';
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeMetric = btn.dataset.metric;
      renderCorrelationChart(activeMetric);
    });
  });
  renderCorrelationChart(activeMetric);
}

// ──────────────────────────────────────────────────
// B2: Daily Digest — сводка дня
// ──────────────────────────────────────────────────
function generateDailyDigest() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('ru', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // Pomodoro
  const pomoCycles = parseInt(localStorage.getItem('nexis-pomo-cycles') || '0');
  const pomoMins = pomoCycles * 25;

  // Tasks
  let tasksDone = 0, tasksTotal = 0;
  if (typeof tasksModule !== 'undefined') {
    const p = tasksModule.getProgress();
    tasksDone = p.done; tasksTotal = p.total;
  }

  // Sensors (last known)
  const s = (typeof state !== 'undefined') ? state.sensors : {};
  const avgCo2 = s.co2 ? Math.round(s.co2) : '--';
  const avgTemp = s.temperature ? s.temperature.toFixed(1) : '--';
  const avgHum  = s.humidity ? Math.round(s.humidity) : '--';

  // WI
  let wiStr = '--';
  if (typeof calcWellnessIndex !== 'undefined' && s.co2) {
    wiStr = calcWellnessIndex(s).index + '/100';
  }

  // Energy
  let energyStr = '';
  if (typeof energyModule !== 'undefined') {
    const lvl = energyModule.getCurrent();
    if (lvl > 0) energyStr = '\n⚡ Уровень энергии: ' + ['', 'Истощён', 'Устал', 'Нормально', 'Хорошо', 'Отлично!'][lvl] + ' (' + lvl + '/5)';
  }

  // Hydration
  let hydStr = '';
  if (typeof hydrationModule !== 'undefined') {
    const drunk = hydrationModule.getDrunk();
    const goal  = hydrationModule.getGoalGlasses();
    if (drunk > 0) hydStr = '\n💧 Гидратация: ' + drunk + ' / ' + goal + ' стаканов';
  }

  const lines = [
    '═══════════════════════════════',
    '📋 NEXIS Daily Digest',
    '📅 ' + dateStr,
    '═══════════════════════════════',
    '',
    '🍅 Pomodoro: ' + pomoCycles + ' цикл(а) · ' + pomoMins + ' мин фокуса',
    '✅ Задачи: ' + tasksDone + ' / ' + tasksTotal + ' выполнено',
    '',
    '🌿 Условия рабочего места:',
    '   CO₂: ' + avgCo2 + ' ppm',
    '   Температура: ' + avgTemp + '°C',
    '   Влажность: ' + avgHum + '%',
    '   Wellness Index: ' + wiStr,
    energyStr,
    hydStr,
    '',
    '═══════════════════════════════',
    '🤖 NEXIS Wellness Station v2',
  ].join('\n').trim();

  // Show modal
  const modal = document.getElementById('digest-modal');
  const text  = document.getElementById('digest-text');
  if (modal && text) {
    text.textContent = lines;
    modal.style.display = 'flex';
  }
}

function sendDigestToTelegram() {
  const text = document.getElementById('digest-text');
  if (!text || !text.textContent) return;
  const btn = document.getElementById('digest-tg-btn');
  if (btn) { btn.textContent = '⏳ Отправка...'; btn.disabled = true; }
  fetch('/api/telegram/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: text.textContent }),
  })
  .then(r => r.json())
  .then(d => {
    if (btn) { btn.textContent = '✈ Telegram'; btn.disabled = false; }
    if (d.status === 'ok') toast.show('✅ Дайджест отправлен в Telegram!', 'success', 3000);
    else toast.show('⚠️ Telegram не настроен (нет токена)', 'warning', 4000);
  })
  .catch(() => {
    if (btn) { btn.textContent = '✈ Telegram'; btn.disabled = false; }
    toast.show('❌ Ошибка отправки в Telegram', 'danger', 4000);
  });
}

window.generateDailyDigest = generateDailyDigest;
window.sendDigestToTelegram = sendDigestToTelegram;

// ──────────────────────────────────────────────────
// D1: PDF-отчёт за неделю
// ──────────────────────────────────────────────────
function generatePDFReport() {
  if (typeof window.jspdf === 'undefined') {
    toast.show('⏳ Загрузка jsPDF...', 'info', 2000);
    setTimeout(generatePDFReport, 1500);
    return;
  }
  toast.show('📄 Генерация PDF...', 'info', 3000);

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210; // A4 width mm
  let y = 18;

  // ─── Header ───
  doc.setFillColor(13, 17, 30);
  doc.rect(0, 0, W, 30, 'F');
  doc.setTextColor(77, 158, 255);
  doc.setFontSize(20); doc.setFont('helvetica', 'bold');
  doc.text('NEXIS Wellness Station', 14, 14);
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.setTextColor(180, 190, 220);
  doc.text('Недельный отчёт · ' + new Date().toLocaleDateString('ru', { year: 'numeric', month: 'long', day: 'numeric' }), 14, 22);
  doc.setTextColor(30, 30, 30);
  y = 40;

  // ─── Sensor summary ───
  doc.setFontSize(13); doc.setFont('helvetica', 'bold');
  doc.text('Сводка показаний', 14, y); y += 8;

  const s = (typeof state !== 'undefined') ? state.sensors : {};
  const rows = [
    ['Температура', (s.temperature != null ? s.temperature.toFixed(1) + ' °C' : '--')],
    ['Влажность',   (s.humidity    != null ? Math.round(s.humidity) + ' %'   : '--')],
    ['CO₂',         (s.co2         != null ? Math.round(s.co2) + ' ppm'      : '--')],
    ['Освещённость',(s.light       != null ? Math.round(s.light) + ' lux'    : '--')],
    ['Шум',         (s.noise       != null ? s.noise.toFixed(1) + ' dB'      : '--')],
    ['Давление',    (s.pressure    != null ? Math.round(s.pressure) + ' hPa' : '--')],
  ];

  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  rows.forEach(([label, val]) => {
    doc.setFillColor(240, 243, 255);
    doc.rect(14, y - 5, 182, 7, 'F');
    doc.setTextColor(60, 60, 80); doc.text(label, 18, y);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
    doc.text(val, 130, y);
    doc.setFont('helvetica', 'normal');
    y += 9;
  });

  // ─── Pomodoro stats ───
  y += 6;
  doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
  doc.text('Продуктивность', 14, y); y += 8;
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  const pomoCycles = parseInt(localStorage.getItem('nexis-pomo-cycles') || '0');
  const pomoMins   = pomoCycles * 25;
  let tasksDone = 0, tasksTotal = 0;
  if (typeof tasksModule !== 'undefined') { const p = tasksModule.getProgress(); tasksDone = p.done; tasksTotal = p.total; }

  [[' Pomodoro циклов сегодня', pomoCycles], [' Минут глубокой работы', pomoMins], [' Задач выполнено', tasksDone + ' / ' + tasksTotal]].forEach(([label, val]) => {
    doc.setFillColor(240, 243, 255);
    doc.rect(14, y - 5, 182, 7, 'F');
    doc.setTextColor(60, 60, 80); doc.text(label, 18, y);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
    doc.text(String(val), 130, y);
    doc.setFont('helvetica', 'normal');
    y += 9;
  });

  // ─── Capture main chart ───
  const chartCanvas = document.getElementById('mainChart') || document.getElementById('analyticsChart');
  if (chartCanvas) {
    try {
      y += 6;
      doc.setFontSize(13); doc.setFont('helvetica', 'bold');
      doc.text('График показаний', 14, y); y += 4;
      const imgData = chartCanvas.toDataURL('image/png');
      const imgW = 182, imgH = Math.round(imgW * chartCanvas.height / chartCanvas.width);
      const maxH = 70;
      const finalH = Math.min(imgH, maxH);
      doc.addImage(imgData, 'PNG', 14, y, imgW, finalH);
      y += finalH + 8;
    } catch(e) { /* canvas may be tainted in some browsers */ }
  }

  // ─── WI History chart ───
  const wiCanvas = document.getElementById('wi-history-chart');
  if (wiCanvas && y < 240) {
    try {
      doc.setFontSize(13); doc.setFont('helvetica', 'bold');
      doc.text('Wellness Index — 7 дней', 14, y); y += 4;
      const imgData2 = wiCanvas.toDataURL('image/png');
      doc.addImage(imgData2, 'PNG', 14, y, 182, 50);
      y += 58;
    } catch(e) {}
  }

  // ─── Footer ───
  const pageH = 297;
  doc.setFontSize(8); doc.setTextColor(150, 150, 170);
  doc.text('Сгенерировано NEXIS Wellness Station · ' + new Date().toLocaleString('ru'), 14, pageH - 8);
  doc.text('PM3304 · ЕНУ им. Л.Н. Гумилёва · 2026', W - 14, pageH - 8, { align: 'right' });

  const fname = 'NEXIS_Report_' + new Date().toISOString().slice(0, 10) + '.pdf';
  doc.save(fname);
  toast.show('✅ PDF сохранён: ' + fname, 'success', 4000);
}

window.generatePDFReport = generatePDFReport;
