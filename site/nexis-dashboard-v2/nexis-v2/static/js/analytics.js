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

