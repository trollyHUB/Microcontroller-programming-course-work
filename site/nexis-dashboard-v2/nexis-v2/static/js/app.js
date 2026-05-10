'use strict';
/* ═══════════════════════════════════════════════════
   NEXIS Wellness Station v2 — Main App
   Sidebar SPA, Режимы, Датчики, Pomodoro, Журнал
═══════════════════════════════════════════════════ */

let _timerPageInited = false;

// ──────────────────────────────────────────────────
// SIDEBAR
// ──────────────────────────────────────────────────
// ──────────────────────────────────────────────────
const sidebar = document.getElementById('sidebar');
const mainEl  = document.getElementById('main');

document.getElementById('sidebarToggle')?.addEventListener('click', () => {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  sidebar.classList.toggle('collapsed', state.sidebarCollapsed);
  mainEl.classList.toggle('expanded', state.sidebarCollapsed);
});

document.getElementById('menuBtn')?.addEventListener('click', () => {
  sidebar.classList.toggle('mobile-open');
});

// ──────────────────────────────────────────────────
// НАВИГАЦИЯ
// ──────────────────────────────────────────────────
function navigateTo(page) {
  // Убрать active со всех страниц
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  // Если страница датчика — инициализировать её
  if (page.startsWith('sensor-') && !document.getElementById(`page-${page}`)?.hasChildNodes()) {
    buildSensorPage(page);
  }

  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) pageEl.classList.add('active');

  const navEl = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (navEl) navEl.classList.add('active');

  state.currentPage = page;

  // Обновить topbar title
  if (page === 'analytics') { loadAnalytics(); setTimeout(initCorrelation, 300); loadWeeklyStats(); }
  if (page === 'dashboard') { loadWellnessHistory(); }
  if (page === 'pomodoro')  { loadWeeklyStats(); loadAnalyticsComparison(_analyticsMetric); }
  if (page === 'settings')  { checkTelegramStatus(); if (typeof loadNotifSettings === 'function') loadNotifSettings(); }
  if (page === 'timer' && !_timerPageInited) { initTimerPage(); _timerPageInited = true; }
  if (page === 'tasks')        { initTasksPage(); }
  if (page === 'achievements') { if (typeof achievements !== 'undefined') achievements.render(); }

  const titles = {
    'dashboard': 'Dashboard', 'pomodoro': 'Pomodoro', 'logs': 'Журнал событий',
    'analytics': 'Аналитика', 'about': 'О станции', 'coursework': 'Курсовая работа', 'settings': 'Настройки',
    'timer': 'Таймер', 'tasks': 'Задачи дня', 'achievements': 'Достижения',
    'sensor-temp': 'Температура', 'sensor-hum': 'Влажность',
    'sensor-co2': 'CO₂ / Воздух', 'sensor-light': 'Освещённость',
    'sensor-noise': 'Шум', 'sensor-motion': 'Присутствие',
    'sensor-pressure': 'Давление',
  };
  const tb = document.getElementById('topbarTitle');
  if (tb) tb.textContent = titles[page] || page;

  // Закрыть мобильное меню
  sidebar.classList.remove('mobile-open');
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    navigateTo(item.dataset.page);
  });
});

document.querySelectorAll('.tile.clickable').forEach(tile => {
  tile.addEventListener('click', () => navigateTo(tile.dataset.goto));
});

// ──────────────────────────────────────────────────
// РЕЖИМЫ РАБОТЫ
// ──────────────────────────────────────────────────
// ──────────────────────────────────────────────────
function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));

  const modeStatusEl = document.getElementById('modeStatus');
  const espDot  = document.getElementById('espDot');
  const espText = document.getElementById('espText');

  if (mode === 'off') {
    if (modeStatusEl) modeStatusEl.textContent = 'Отключено';
    if (espDot)  { espDot.className = 'esp-dot'; }
    if (espText) espText.textContent = 'Отключено';
    logger.add('system', 'Режим изменён: Отключено');
    clearSensorDisplay();
    stopDemoLoop();
  } else if (mode === 'demo') {
    if (modeStatusEl) modeStatusEl.textContent = 'Демо-режим';
    if (espDot)  { espDot.className = 'esp-dot demo'; }
    if (espText) espText.textContent = 'Демо-режим';
    logger.add('system', 'Режим изменён: Демо-данные');
    startDemoLoop();
  } else if (mode === 'live') {
    if (modeStatusEl) modeStatusEl.textContent = 'ESP32 Live';
    if (espDot)  { espDot.className = 'esp-dot'; }
    if (espText) espText.textContent = 'Ожидание ESP32...';
    logger.add('system', 'Режим изменён: Ожидание данных с ESP32');
    stopDemoLoop();
    connectSocket();
  }
}

document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => setMode(btn.dataset.mode));
});

// ──────────────────────────────────────────────────
// ДЕМО-ДАННЫЕ
// ──────────────────────────────────────────────────
// ──────────────────────────────────────────────────
let demoInterval = null;
let demoIntervalMs = parseInt(localStorage.getItem('nexis-demo-interval') || '3000');

function setDemoInterval(ms) {
  demoIntervalMs = ms;
  localStorage.setItem('nexis-demo-interval', ms);
  document.querySelectorAll('.di-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.ms) === ms));
  if (state.mode === 'demo') startDemoLoop();
}
window.setDemoInterval = setDemoInterval;

function demoData() {
  const t = state.demoTick++;
  // Счётчик рабочего времени растёт реалистично: ~10 сек за тик
  const demoWorkBase = 3600 + t * 10;
  return {
    temperature:     22 + Math.sin(t * 0.08) * 2.5 + Math.random() * 0.4,
    humidity:        50 + Math.sin(t * 0.05) * 8   + Math.random() * 1.5,
    co2:             680 + Math.sin(t * 0.04) * 200 + Math.random() * 30,
    light:           380 + Math.sin(t * 0.06) * 120 + Math.random() * 40,
    noise:           38  + Math.random() * 14,
    motion:          t % 120 < 108 ? 1 : 0,
    pressure:        1013 + Math.sin(t * 0.02) * 8 + Math.random() * 2,
    work_time_today: demoWorkBase,
    timestamp:       new Date().toISOString(),
  };
}

function startDemoLoop() {
  stopDemoLoop();
  applyData(demoData());
  demoInterval = setInterval(() => applyData(demoData()), demoIntervalMs);
}

function stopDemoLoop() {
  clearInterval(demoInterval);
  demoInterval = null;
}

// ──────────────────────────────────────────────────
// D3: SEVERITY SCORE для алертов (1–10)
// ──────────────────────────────────────────────────
const _severityLog = []; // { time, level, msg, score, key }

function calcSeverity(key, val, level) {
  const th = CFG.thresholds[key];
  if (!th) return level === 'danger' ? 7 : 4;
  let base = level === 'danger' ? 6 : 3;
  let excess = 0;
  if (key === 'co2')   excess = Math.max(0, (val - (level === 'danger' ? th.danger : th.warn)) / th.warn);
  else if (key === 'noise') excess = Math.max(0, (val - (level === 'danger' ? th.danger : th.warn)) / th.warn);
  else if (key === 'temperature') excess = Math.max(0, (val - (level === 'danger' ? th.danger : th.warn)) / th.warn);
  else if (key === 'light') excess = Math.max(0, ((level === 'danger' ? th.lowDanger : th.lowWarn) - val) / (th.lowWarn || 150));
  return Math.min(10, Math.round(base + excess * 4));
}

function addSeverityEntry(key, val, level, msg) {
  const score = calcSeverity(key, val, level);
  _severityLog.unshift({ time: new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }), level, msg, score, key });
  if (_severityLog.length > 50) _severityLog.pop();
  renderSeverityLog();
  return score;
}

function renderSeverityLog(minScore) {
  const container = document.getElementById('severity-log-list');
  if (!container) return;
  const filter = minScore || parseInt(document.getElementById('severity-filter')?.value || '1');
  const filtered = _severityLog.filter(e => e.score >= filter);
  while (container.firstChild) container.removeChild(container.firstChild);
  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'no-alerts';
    empty.textContent = 'Нет аномалий с оценкой ≥ ' + filter;
    container.appendChild(empty);
    return;
  }
  filtered.forEach(e => {
    const row = document.createElement('div');
    row.className = 'sev-row sev-' + e.level;
    const badge = document.createElement('span');
    badge.className = 'sev-badge sev-badge-' + (e.score >= 8 ? 'high' : e.score >= 5 ? 'mid' : 'low');
    badge.textContent = e.score;
    const msg = document.createElement('span');
    msg.className = 'sev-msg';
    msg.textContent = e.msg;
    const time = document.createElement('span');
    time.className = 'sev-time';
    time.textContent = e.time;
    row.appendChild(badge); row.appendChild(msg); row.appendChild(time);
    container.appendChild(row);
  });
}

window.renderSeverityLog = renderSeverityLog;

// ──────────────────────────────────────────────────
// АЛЕРТЫ
// ──────────────────────────────────────────────────
function checkAlerts(data) {
  const checks = [
    { key:'co2',  val:data.co2,  warnMsg:`CO₂ повышен: ${fmt(data.co2,0)} ppm. Рекомендуется проветрить.`, dangerMsg:`CO₂ критически высокий: ${fmt(data.co2,0)} ppm!` },
    { key:'temperature', val:data.temperature, warnMsg:`Температура повышена: ${fmt(data.temperature)}°C`, dangerMsg:`Критически высокая температура: ${fmt(data.temperature)}°C!` },
    { key:'light', val:data.light, warnMsg:`Освещённость низкая: ${fmt(data.light,0)} lux`, dangerMsg:`Очень темно: ${fmt(data.light,0)} lux!` },
    { key:'noise', val:data.noise, warnMsg:`Шумно: ${fmt(data.noise,0)} dB`, dangerMsg:`Очень громко: ${fmt(data.noise,0)} dB!` },
  ];

  const newAlerts = [];
  checks.forEach(({ key, val, warnMsg, dangerMsg }) => {
    const lvl = getLevel(key, val);
    if (lvl === 'danger' || lvl === 'warn') {
      // Дебаунс — не спамить одинаковыми
      const last = alertLog.find(a => a.key === key);
      const now = Date.now();
      if (!last || now - last.time > 120000) {
        const msg = lvl === 'danger' ? dangerMsg : warnMsg;
        const score = addSeverityEntry(key, val, lvl, msg);
        newAlerts.push({ level: lvl, message: msg, score });
        alertLog = alertLog.filter(a => a.key !== key);
        alertLog.push({ key, time: now });
        logger.add('alert', '[S:' + score + '] ' + msg);
      }
    }
  });

  if (newAlerts.length) {
    renderDashAlerts(newAlerts);
  }
}

function renderDashAlerts(alerts) {
  const list = document.getElementById('dashAlerts');
  if (!list) return;
  const empty = list.querySelector('.no-alerts');
  if (empty) empty.remove();

  alerts.forEach(a => {
    const div = document.createElement('div');
    div.className = 'alert-entry ' + a.level;
    const dot = document.createElement('div'); dot.className = 'ae-dot';
    const msg = document.createElement('div'); msg.className = 'ae-msg'; msg.textContent = a.message;
    const time = document.createElement('div'); time.className = 'ae-time';
    time.textContent = new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
    if (a.score) {
      const badge = document.createElement('span');
      badge.className = 'ae-score sev-badge-' + (a.score >= 8 ? 'high' : a.score >= 5 ? 'mid' : 'low');
      badge.textContent = 'S:' + a.score;
      div.appendChild(dot); div.appendChild(msg); div.appendChild(badge); div.appendChild(time);
    } else {
      div.appendChild(dot); div.appendChild(msg); div.appendChild(time);
    }
    list.insertBefore(div, list.firstChild);
    if (a.level === 'danger') toast.show(a.message, 'danger', 6000);
    else if (a.level === 'warning') toast.show(a.message, 'warning', 4000);
    while (list.children.length > 8) list.lastChild.remove();
  });
}


// ──────────────────────────────────────────────────
// ПРИМЕНЕНИЕ ДАННЫХ
// ──────────────────────────────────────────────────
function applyData(data) {
  if (state.mode === 'off') return;
  state.sensors = data;

  const keys = ['temp','hum','co2','light','noise'];
  const map   = { temp:'temperature', hum:'humidity', co2:'co2', light:'light', noise:'noise' };

  keys.forEach(k => {
    const key = map[k];
    const val = data[key];
    const lvl = getLevel(key, val);

    // Tile
    const tile = document.getElementById(`tile-${k}`);
    if (tile) tile.className = `tile clickable ${lvl}`;
    const dVal = document.getElementById(`d-${k}`);
    if (dVal) { dVal.textContent = key === 'temperature' ? displayTemp(val) : fmt(val, key==='co2'?0:1); dVal.classList.add('pop'); setTimeout(()=>dVal.classList.remove('pop'),300); }
    const dSt = document.getElementById(`ds-${k}`);
    if (dSt) dSt.textContent = STATUS_TEXT[key]?.[lvl] || lvl;
    const dBar = document.getElementById(`db-${k}`);
    if (dBar) dBar.style.width = getBarPct(key, val) + '%';

    // Spark-line
    if (val != null) updateSpark(k, val);

    // Nav badge
    const nb = document.getElementById(`nb-${k}`);
    if (nb) nb.textContent = fmt(val, key==='co2'?0:1) + (key==='temperature'?'°':key==='humidity'?'%':key==='co2'?'p':key==='light'?'l':'d');
  });

  // Давление (BME280)
  if (data.pressure != null) {
    const pVal = data.pressure;
    const pTile = document.getElementById('tile-pressure');
    if (pTile) pTile.className = 'tile clickable pressure-tile ok';
    const dPres = document.getElementById('d-pressure');
    if (dPres) { dPres.textContent = fmt(pVal, 1); }
    const dPresSt = document.getElementById('ds-pressure');
    if (dPresSt) {
      if      (pVal < 980 || pVal > 1040) dPresSt.textContent = 'Отклонение';
      else if (pVal < 1000 || pVal > 1025) dPresSt.textContent = 'Норма';
      else                                  dPresSt.textContent = 'Идеально';
    }
    const dPresBar = document.getElementById('db-pressure');
    if (dPresBar) dPresBar.style.width = Math.min(100, Math.max(2, ((pVal - 950) / (1060 - 950)) * 100)) + '%';
    const nbPres = document.getElementById('nb-pressure');
    if (nbPres) nbPres.textContent = fmt(pVal, 0) + 'h';
    if (state.currentPage === 'sensor-pressure') updateSensorPageValues('sensor-pressure', data);
  }

  // PIR → авто-пауза + возврат (режим 'computer', 15-сек дебаунс)
  if (pomodoro.trackingMode === 'computer') {
    if (data.motion === 0) {
      if (!state._pirAbsenceStart) state._pirAbsenceStart = Date.now();
      const absenceSec = (Date.now() - state._pirAbsenceStart) / 1000;
      if (absenceSec >= 15 && pomodoro.isRunning && !pomodoro.isBreak) {
        pomodoro.autoPause('нет присутствия у стола');
        state._pirAbsenceStart = null;
        state._pirWasPaused = true;
      }
    } else {
      // C3: при возврате к столу — toast с предложением продолжить
      if (state._pirWasPaused && !pomodoro.isRunning) {
        const absMin = state._pirAbsenceStart ? Math.round((Date.now() - state._pirAbsenceStart) / 60000) : '?';
        toast.show('👋 С возвращением! Продолжить Pomodoro? Нажмите ▶', 'info', 8000);
        state._pirWasPaused = false;
      }
      state._pirAbsenceStart = null;
    }
  }

  // B4: авто-предложение запустить Pomodoro при возвращении к столу (перерыв >5 мин)
  if (!pomodoro.isRunning && !pomodoro.isBreak) {
    const prev = state._lastMotionOff;
    if (data.motion === 1 && prev && (Date.now() - prev) > 5 * 60 * 1000) {
      toast.show('▶ Готов к новому Pomodoro? Нажмите Старт!', 'info', 6000);
    }
  }
  if (data.motion === 0) {
    if (!state._lastMotionOff) state._lastMotionOff = Date.now();
  } else {
    state._lastMotionOff = null;
  }

  // Движение
  const hasMotion = data.motion === 1 || data.motion === true;
  const mTile = document.getElementById('tile-motion');
  if (mTile) mTile.className = `tile clickable ${hasMotion ? 'ok' : ''}`;
  const dMot = document.getElementById('d-motion');
  if (dMot) dMot.textContent = hasMotion ? 'Обнаружено' : 'Не обнаружено';
  const dMotSt = document.getElementById('ds-motion');
  if (dMotSt) dMotSt.textContent = hasMotion ? 'Присутствие' : 'Пусто';
  const dMotBar = document.getElementById('db-motion');
  if (dMotBar) { dMotBar.style.width = hasMotion ? '100%' : '5%'; dMotBar.style.background = hasMotion ? 'var(--green)' : 'var(--text3)'; }
  const nbMot = document.getElementById('nb-motion');
  if (nbMot) nbMot.textContent = hasMotion ? '●' : '○';

  if (typeof eyeStrainModule !== 'undefined') eyeStrainModule.onMotionChange(hasMotion ? 1 : 0);

  // Обновить страницу датчика если открыта
  if (state.currentPage.startsWith('sensor-')) updateSensorPageValues(state.currentPage, data);

  // Статистика
  updateStats(data);

  // Алерты
  checkAlerts(data);

  // Добавить точку на график
  addChartPoint(data);

  if (typeof updateCo2Forecast === 'function') updateCo2Forecast(state.chartData);

  // Wellness Index
  updateWellnessCard(data);

  // Work Conditions Index
  updateWCITile(data);

  if (typeof hydrationModule !== 'undefined') hydrationModule.render(data);

  // Рабочее время
  updateWorkTimeTile(data);

  // Умные рекомендации (не обновлять в Deep Work режиме)
  if (typeof pomodoro === 'undefined' || !pomodoro.isDeepWork) {
    updateRecommendationsPanel(data);
  }

  // IAQ, Humidex, накопление шума, аномалии CO₂
  if (typeof updateWellnessExtended === 'function') updateWellnessExtended(data);

  // Focus indicator на Pomodoro плитке дашборда
  const focusTile = document.getElementById('tile-focus');
  if (focusTile && typeof pomodoro !== 'undefined') {
    const miniTimer = document.getElementById('miniPomoTimer');
    if (pomodoro.isRunning && !pomodoro.isBreak) {
      focusTile.classList.add('pomo-active');
    } else {
      focusTile.classList.remove('pomo-active');
    }
  }

  // Достижения + Day Score
  if (typeof achievements !== 'undefined') achievements.onSensorUpdate(data);
}


// ──────────────────────────────────────────────────
// WEBSOCKET (Live режим)
// ──────────────────────────────────────────────────
let socket = null;

function connectSocket() {
  if (socket) return;
  socket = io();
  socket.on('connect', () => {
    logger.add('system', '🔌 WebSocket подключён к серверу');
  });
  socket.on('disconnect', () => {
    logger.add('system', '❌ WebSocket соединение потеряно');
    if (state.mode === 'live') {
      const espDot = document.getElementById('espDot');
      if (espDot) espDot.className = 'esp-dot';
    }
  });
  socket.on('sensor_update', (data) => {
    if (state.mode !== 'live') return;
    const espDot  = document.getElementById('espDot');
    const espText = document.getElementById('espText');
    if (espDot)  espDot.className = 'esp-dot online';
    if (espText) espText.textContent = 'ESP32 Online';
    applyData(data);
    logger.add('sensor', `Данные получены: T=${fmt(data.temperature)}°C CO₂=${fmt(data.co2,0)}ppm Свет=${fmt(data.light,0)}lux`);
  });
  socket.on('new_alerts', (alerts) => {
    alerts.forEach(a => {
      toast.show(a.message, a.level, 5000);
    });
  });
}


// ──────────────────────────────────────────────────
// LOG FILTERS
// ──────────────────────────────────────────────────
document.querySelectorAll('.lf-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.lf-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    logger.setFilter(btn.dataset.filter);
  });
});


// ──────────────────────────────────────────────────
// COURSEWORK — TOC SCROLLING
// ──────────────────────────────────────────────────
document.querySelectorAll('.toc-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    const href = item.getAttribute('href');
    if (href && href.startsWith('#')) {
      const target = document.querySelector(href);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});


// ──────────────────────────────────────────────────
// HISTORY & STATS
// ──────────────────────────────────────────────────
function loadHistoryIntoChart() {
  fetch('/api/history?hours=24')
    .then(r => r.json())
    .then(rows => {
      if (!Array.isArray(rows) || rows.length === 0) return;
      rows.forEach(row => {
        const label = new Date(row.timestamp).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
        const val   = row[state.activeMetric];
        if (val == null) return;
        state.chartData.push({ label, value: val, full: row });
        if (mainChart) {
          mainChart.data.labels.push(label);
          mainChart.data.datasets[0].data.push(val);
        }
      });
      if (mainChart) mainChart.update('none');
      logger.add('system', `📊 Загружено ${rows.length} точек истории из БД`);
    })
    .catch(() => {});
}


function loadStatsFromDB() {
  fetch('/api/stats')
    .then(r => r.json())
    .then(s => {
      if (!s) return;
      const set = (id, val, d = 1) => {
        const el = document.getElementById(id);
        if (el && val != null) el.textContent = Number(val).toFixed(d);
      };
      set('st-avgTemp',  s.avg_temp);
      set('st-avgHum',   s.avg_humidity, 0);
      set('st-avgCo2',   s.avg_co2, 0);
      set('st-maxCo2',   s.max_co2, 0);
      const poEl = document.getElementById('st-pomo');
      if (poEl && s.pomodoro_today != null) poEl.textContent = s.pomodoro_today;
      const rdEl = document.getElementById('st-readings');
      if (rdEl && s.total_readings != null) rdEl.textContent = s.total_readings;
    })
    .catch(() => {});
}


// ──────────────────────────────────────────────────
// INIT
// ──────────────────────────────────────────────────
function init() {
  initMainChart();
  initSparkCharts();
  updateChartsTheme();
  loadSettings();

  document.querySelectorAll('.tu-btn').forEach(b => b.classList.toggle('active', b.dataset.unit === tempUnit));
  document.querySelectorAll('.di-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.ms) === demoIntervalMs));

  // Авто-тема по времени суток (только если пользователь не выбирал вручную)
  // Используем documentElement — тот же механизм что и toggleTheme()
  if (!localStorage.getItem('nexis-theme')) {
    const hour = new Date().getHours();
    document.documentElement.setAttribute('data-theme', (hour >= 8 && hour < 20) ? 'light' : 'dark');
  }

  // PWA Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/static/sw.js').catch(() => {});
  }

  logger.add('system', '🚀 NEXIS Wellness Station v2 запущена');
  logger.add('system', 'Режим: Демо-данные');

  loadHistoryIntoChart();
  loadStatsFromDB();
  loadWeeklyStats();
  if (typeof loadWellnessHistory === 'function') loadWellnessHistory();

  fetch('/api/sensors')
    .then(r => r.json())
    .then(data => {
      if (data && data.temperature != null) {
        logger.add('system', '📡 Обнаружены данные на сервере — переключаем на Live');
        setMode('live');
        applyData(data);
        connectSocket();
      } else {
        startDemoLoop();
      }
    })
    .catch(() => startDemoLoop());

  fetch('/api/alerts?limit=5')
    .then(r => r.json())
    .then(alerts => {
      if (Array.isArray(alerts) && alerts.length) renderDashAlerts(alerts);
    })
    .catch(() => {});

  const pt = document.getElementById('pomoTime');
  const mt = document.getElementById('miniPomoTimer');
  if (pt) pt.textContent = '25:00';
  if (mt) mt.textContent = '25:00';

  // Напоминание о разминке (фоновое, не зависит от страницы)
  if (typeof initStretchReminder === 'function') initStretchReminder();

  // Инициализировать цель Pomodoro
  if (typeof pomodoro !== 'undefined') pomodoro.initGoal();

  // Трекер воды и защита глаз
  if (typeof hydrationModule !== 'undefined') hydrationModule.init();
  if (typeof eyeStrainModule !== 'undefined') eyeStrainModule.init();

  // Достижения и Day Score
  if (typeof achievements !== 'undefined') achievements.init();

  // Кнопка звука
  initSoundBtn();
}

// ──────────────────────────────────────────────────
// FOCUS MODE (фича 7)
// ──────────────────────────────────────────────────
let _focusMode = false;

function toggleFocusMode() {
  _focusMode = !_focusMode;
  document.body.classList.toggle('focus-mode', _focusMode);
  if (_focusMode) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
  const btn = document.getElementById('focusModeBtn');
  if (btn) btn.title = _focusMode ? 'Выйти из Focus Mode' : 'Focus Mode';
  toast.show(_focusMode ? '🎯 Focus Mode включён. ESC для выхода.' : 'Focus Mode выключен.', 'info', 3000);
}

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && _focusMode) {
    _focusMode = false;
    document.body.classList.remove('focus-mode');
  }
});

window.toggleFocusMode = toggleFocusMode;

// ──────────────────────────────────────────────────
// BOTTOM NAV (mobile)
// ──────────────────────────────────────────────────
function updateBottomNav(page) {
  document.querySelectorAll('.bottom-nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.page === page);
  });
}
window.updateBottomNav = updateBottomNav;

// Touch swipe между страницами
(function() {
  const pages = ['dashboard', 'analytics', 'pomodoro', 'tasks', 'settings'];
  let touchStartX = 0;
  document.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].clientX; }, { passive: true });
  document.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) < 60) return;
    const cur = pages.indexOf(state.currentPage);
    if (cur === -1) return;
    const next = dx < 0 ? Math.min(pages.length - 1, cur + 1) : Math.max(0, cur - 1);
    if (next !== cur) { navigateTo(pages[next]); updateBottomNav(pages[next]); }
  }, { passive: true });
})();

// ──────────────────────────────────────────────────
// DND — Не беспокоить
// ──────────────────────────────────────────────────
let _dndActive = false;
let _dndTimer  = null;

function toggleDND(forceOff) {
  if (forceOff === true) _dndActive = false;
  else _dndActive = !_dndActive;

  const btn = document.getElementById('dndBtn');
  if (btn) {
    btn.classList.toggle('dnd-on', _dndActive);
    btn.title = _dndActive ? 'Не беспокоить — ВКЛ (нажмите, чтобы отключить)' : 'Не беспокоить';
    btn.textContent = _dndActive ? '🔕' : '🔔';
  }

  clearTimeout(_dndTimer);
  if (_dndActive) {
    toast.show('🔕 Не беспокоить включён на 25 минут', 'info', 3000);
    logger.add('system', 'Не беспокоить: включён');
    _dndTimer = setTimeout(() => toggleDND(true), 25 * 60 * 1000);
  } else {
    toast.show('🔔 Режим "Не беспокоить" выключен', 'info', 2000);
    logger.add('system', 'Не беспокоить: выключен');
  }
}
window.toggleDND = toggleDND;

// Патчим toast.show — при DND скрываем некритичные тосты
const _origToastShow = toast.show.bind(toast);
toast.show = function(msg, level = 'info', dur = 4000) {
  if (_dndActive && level !== 'danger') return;
  _origToastShow(msg, level, dur);
};

// ──────────────────────────────────────────────────
// ЗВУК — кнопка вкл/выкл
// ──────────────────────────────────────────────────
function toggleSoundUI() {
  if (typeof nexisSound === 'undefined') return;
  const on = nexisSound.toggle();
  const btn = document.getElementById('soundBtn');
  if (btn) btn.textContent = on ? '🔊' : '🔇';
  _origToastShow(on ? '🔊 Звуки включены' : '🔇 Звуки выключены', 'info', 2000);
}
window.toggleSoundUI = toggleSoundUI;

function initSoundBtn() {
  const btn = document.getElementById('soundBtn');
  if (btn && typeof nexisSound !== 'undefined') {
    btn.textContent = nexisSound.isEnabled() ? '🔊' : '🔇';
  }
}

// ──────────────────────────────────────────────────
// ЖУРНАЛ — фильтры и экспорт
// ──────────────────────────────────────────────────
document.querySelectorAll('.lf-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.lf-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    logger.setFilter(btn.dataset.filter || 'all');
  });
});

function exportLogsCSV() {
  const rows = [['Время', 'Тип', 'Сообщение']];
  logger.entries.forEach(e => {
    rows.push([
      e.time.toLocaleString('ru'),
      logger.typeLabel(e.type),
      e.message.replace(/;/g, ','),
    ]);
  });
  const bom = '﻿';
  const csv = bom + rows.map(r => r.join(';')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'nexis-logs-' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}
window.exportLogsCSV = exportLogsCSV;

// ──────────────────────────────────────────────────
// PDF ОТЧЁТ ДНЯ
// ──────────────────────────────────────────────────
function exportDayPDF() {
  if (typeof window.jspdf === 'undefined' && typeof window.jsPDF === 'undefined') {
    toast.show('jsPDF не загружен', 'danger', 3000);
    return;
  }
  const { jsPDF } = window.jspdf || window;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const s = state.sensors;
  const today = new Date().toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' });
  const wi  = document.getElementById('wellness-index')?.textContent || '--';
  const ds  = document.getElementById('day-score-num')?.textContent  || '--';
  const dsg = document.getElementById('day-score-grade')?.textContent || '';
  const cycles = localStorage.getItem('nexis-pomo-cycles') || '0';
  const goal   = localStorage.getItem('nexis-pomo-goal')   || '8';

  let y = 20;
  const lh = 8;
  const col1 = 20, col2 = 120;

  // Шапка
  doc.setFillColor(13, 14, 20);
  doc.rect(0, 0, 210, 30, 'F');
  doc.setTextColor(77, 158, 255);
  doc.setFontSize(18); doc.setFont('helvetica', 'bold');
  doc.text('NEXIS Wellness Station', col1, 14);
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.setTextColor(180, 190, 220);
  doc.text('Отчёт рабочего дня · ' + today, col1, 22);
  y = 40;

  // Wellness Index + Day Score
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(13); doc.setFont('helvetica', 'bold');
  doc.text('Wellness Index: ' + wi + ' / 100', col1, y);
  doc.text('День: ' + ds + ' / 100  (' + dsg + ')', col2, y);
  y += lh * 1.5;

  // Разделитель
  doc.setDrawColor(200, 200, 200);
  doc.line(col1, y, 190, y); y += lh;

  // Датчики
  doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text('Показатели датчиков', col1, y); y += lh;
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');

  const rows = [
    ['Температура', s.temperature != null ? s.temperature.toFixed(1) + ' °C' : '--'],
    ['Влажность',   s.humidity    != null ? s.humidity.toFixed(1)    + ' %'  : '--'],
    ['CO₂',         s.co2         != null ? Math.round(s.co2)        + ' ppm': '--'],
    ['Освещённость',s.light       != null ? Math.round(s.light)      + ' lux': '--'],
    ['Шум',         s.noise       != null ? s.noise.toFixed(1)       + ' dB' : '--'],
    ['Давление',    s.pressure    != null ? s.pressure.toFixed(1)    + ' hPa': '--'],
  ];
  rows.forEach(([label, val]) => {
    doc.text(label + ':', col1, y);
    doc.text(val, col1 + 55, y);
    y += lh;
  });

  y += 4;
  doc.line(col1, y, 190, y); y += lh;

  // Продуктивность
  doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text('Продуктивность', col1, y); y += lh;
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text('Pomodoro завершено: ' + cycles + ' / ' + goal, col1, y); y += lh;
  const taskLabel = document.getElementById('task-progress-label')?.textContent || '0 / 0 задач';
  doc.text('Задачи: ' + taskLabel, col1, y); y += lh;
  const energyLevel = parseInt(localStorage.getItem('nexis-energy-level') || '0');
  const energyText  = ['—','Истощён','Устал','Нормально','Хорошо','Отлично'][energyLevel] || '—';
  doc.text('Уровень энергии: ' + energyText + ' (' + energyLevel + '/5)', col1, y); y += lh * 1.5;

  // Алерты из журнала
  const alerts = logger.entries.filter(e => e.type === 'alert').slice(0, 5);
  if (alerts.length) {
    doc.line(col1, y, 190, y); y += lh;
    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text('Алерты за день (' + alerts.length + ')', col1, y); y += lh;
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    alerts.forEach(a => {
      const line = doc.splitTextToSize(a.time.toLocaleTimeString('ru') + '  ' + a.message, 170);
      doc.text(line, col1, y); y += lh * line.length;
    });
  }

  // Подпись
  y = Math.max(y + 10, 260);
  doc.setFontSize(8); doc.setTextColor(150, 150, 150);
  doc.text('NEXIS Wellness Station v2 · ESP32 IoT Dashboard · ' + new Date().toLocaleString('ru'), col1, y);

  doc.save('nexis-report-' + new Date().toISOString().slice(0, 10) + '.pdf');
  toast.show('📄 PDF-отчёт сохранён', 'success', 3000);
  logger.add('system', 'PDF-отчёт дня экспортирован');
}
window.exportDayPDF = exportDayPDF;

document.addEventListener('DOMContentLoaded', init);

window.navigateTo = navigateTo;
