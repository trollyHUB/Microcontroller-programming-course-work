/**
 * NEXIS Wellness Station — Dashboard JS
 * WebSocket + Chart.js + Pomodoro таймер
 */

'use strict';

// ══════════════════════════════════════════════
// КОНФИГУРАЦИЯ
// ══════════════════════════════════════════════
const CONFIG = {
  thresholds: {
    temperature: { ok: [18, 26], warn: [15, 29] },
    humidity:    { ok: [40, 60], warn: [30, 70] },
    co2:         { ok: [0, 800], warn: [800, 1200] },
    light:       { ok: [200, 2000], warn: [100, 200] },
    noise:       { ok: [0, 55],  warn: [55, 70] },
  },
  statusText: {
    temperature: { ok: 'Комфорт', warn: 'Повышена', danger: 'Слишком высоко' },
    humidity:    { ok: 'Норма',   warn: 'Высокая',  danger: 'Очень высокая' },
    co2:         { ok: 'Чисто',   warn: 'Повышен',  danger: 'Проветрите!' },
    light:       { ok: 'Хорошо', warn: 'Мало',     danger: 'Очень темно' },
    noise:       { ok: 'Тихо',   warn: 'Шумно',    danger: 'Очень громко' },
  },
};

// ══════════════════════════════════════════════
// УТИЛИТЫ
// ══════════════════════════════════════════════
function getLevel(metric, value) {
  const t = CONFIG.thresholds[metric];
  if (!t || value == null) return 'ok';
  // Для CO2 и noise — чем больше, тем хуже
  if (['co2', 'noise', 'temperature'].includes(metric)) {
    if (value > t.warn[1]) return 'danger';
    if (value > t.ok[1])   return 'warn';
    return 'ok';
  }
  // Для light — чем меньше, тем хуже
  if (metric === 'light') {
    if (value < t.warn[1]) return 'danger';
    if (value < t.ok[0])   return 'warn';
    return 'ok';
  }
  // Humidity
  if (value > t.warn[1] || value < t.warn[0]) return 'danger';
  if (value > t.ok[1]   || value < t.ok[0])   return 'warn';
  return 'ok';
}

function getBarPct(metric, value) {
  const ranges = { temperature: [10, 40], humidity: [0, 100],
                   co2: [0, 2000], light: [0, 2000], noise: [0, 100] };
  const [min, max] = ranges[metric] || [0, 100];
  return Math.min(100, Math.max(2, ((value - min) / (max - min)) * 100));
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
}

function formatNumber(n, decimals = 1) {
  if (n == null || isNaN(n)) return '--';
  return Number(n).toFixed(decimals);
}

function popValue(el) {
  el.classList.remove('value-pop');
  void el.offsetWidth; // reflow
  el.classList.add('value-pop');
}

// ══════════════════════════════════════════════
// TOAST УВЕДОМЛЕНИЕ
// ══════════════════════════════════════════════
const toast = {
  el: document.getElementById('toast'),
  timer: null,
  show(msg, level = 'info', duration = 4000) {
    this.el.textContent = msg;
    this.el.className = `toast show ${level}`;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.el.classList.remove('show');
    }, duration);
  }
};

// ══════════════════════════════════════════════
// ЧАСЫ В NAVBAR
// ══════════════════════════════════════════════
function updateClock() {
  const el = document.getElementById('nav-clock');
  if (el) el.textContent = new Date().toLocaleTimeString('ru');
}
updateClock();
setInterval(updateClock, 1000);

// ══════════════════════════════════════════════
// ОБНОВЛЕНИЕ КАРТОЧКИ ДАТЧИКА
// ══════════════════════════════════════════════
function updateSensorCard(metric, value, unit) {
  const valEl  = document.getElementById(`val-${metric}`);
  const stEl   = document.getElementById(`st-${metric}`);
  const barEl  = document.getElementById(`bar-${metric}`);
  const cardEl = document.getElementById(`card-${metric}`);

  if (!valEl) return;

  const level = getLevel(metric, value);
  const displayVal = formatNumber(value, metric === 'co2' ? 0 : 1);

  valEl.textContent = displayVal;
  popValue(valEl);

  stEl.textContent = CONFIG.statusText[metric]?.[level] ?? level;
  barEl.style.width = getBarPct(metric, value) + '%';

  cardEl.className = `sensor-card ${level}`;
}

// ══════════════════════════════════════════════
// ОБНОВЛЕНИЕ ВСЕХ ДАННЫХ
// ══════════════════════════════════════════════
let lastTimestamp = null;

function applyData(data) {
  if (!data || Object.keys(data).length === 0) return;

  updateSensorCard('temp',  data.temperature, '°C');
  updateSensorCard('hum',   data.humidity,    '%');
  updateSensorCard('co2',   data.co2,         'ppm');
  updateSensorCard('light', data.light,       'lux');
  updateSensorCard('noise', data.noise,       'dB');

  // Движение
  const motionEl = document.getElementById('val-motion');
  const motionSt = document.getElementById('st-motion');
  const motionCard = document.getElementById('card-motion');
  const motionBar  = document.getElementById('bar-motion');
  if (motionEl) {
    const hasMotion = data.motion === 1 || data.motion === true;
    motionEl.textContent = hasMotion ? 'Обнаружено' : 'Нет';
    motionSt.textContent = hasMotion ? 'Присутствие' : 'Пусто';
    motionCard.className = `sensor-card ${hasMotion ? 'ok' : ''}`;
    motionBar.style.width = hasMotion ? '100%' : '5%';
    motionBar.style.background = hasMotion ? 'var(--green)' : 'var(--text3)';
  }

  // Время обновления
  const upd = document.getElementById('last-update');
  if (upd) {
    const ts = data.timestamp ? formatTime(data.timestamp) : new Date().toLocaleTimeString('ru');
    upd.textContent = `Обновлено в ${ts}`;
  }
}

// ══════════════════════════════════════════════
// ГЛАВНЫЙ ГРАФИК
// ══════════════════════════════════════════════
let mainChart = null;
let chartData = [];
let activeMetric = 'temperature';

const metricColors = {
  temperature: '#4a9eff',
  humidity:    '#1db973',
  co2:         '#f0a500',
  light:       '#c97bfc',
  noise:       '#e94040',
};
const metricLabels = {
  temperature: 'Температура (°C)',
  humidity:    'Влажность (%)',
  co2:         'CO2 (ppm)',
  light:       'Освещённость (lux)',
  noise:       'Шум (dB)',
};

function initChart() {
  const ctx = document.getElementById('main-chart');
  if (!ctx) return;

  mainChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: metricLabels[activeMetric],
        data: [],
        borderColor: metricColors[activeMetric],
        backgroundColor: metricColors[activeMetric] + '18',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: true,
        tension: 0.35,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 400 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1a1d27',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor: '#8b90a0',
          bodyColor: '#e8eaf0',
          padding: 10,
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#555b6e', maxTicksLimit: 8, maxRotation: 0 }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#555b6e' }
        }
      }
    }
  });
}

function renderChart(metric) {
  if (!mainChart || !chartData.length) return;
  const labels  = chartData.map(d => formatTime(d.timestamp));
  const values  = chartData.map(d => d[metric]);
  mainChart.data.labels = labels;
  mainChart.data.datasets[0].data   = values;
  mainChart.data.datasets[0].label  = metricLabels[metric];
  mainChart.data.datasets[0].borderColor     = metricColors[metric];
  mainChart.data.datasets[0].backgroundColor = metricColors[metric] + '18';
  mainChart.update('none');
}

function addPointToChart(data) {
  if (!mainChart) return;
  const label = formatTime(data.timestamp || new Date().toISOString());
  const value = data[activeMetric];
  if (value == null) return;

  mainChart.data.labels.push(label);
  mainChart.data.datasets[0].data.push(value);

  // Держим не больше 200 точек
  if (mainChart.data.labels.length > 200) {
    mainChart.data.labels.shift();
    mainChart.data.datasets[0].data.shift();
  }
  mainChart.update('none');
}

// Переключение метрики
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeMetric = btn.dataset.metric;
    renderChart(activeMetric);
  });
});

// ══════════════════════════════════════════════
// ЗАГРУЗКА ИСТОРИИ
// ══════════════════════════════════════════════
async function loadHistory() {
  try {
    const res  = await fetch('/api/history?hours=24');
    chartData  = await res.json();
    renderChart(activeMetric);
  } catch(e) {
    console.warn('История недоступна:', e);
  }
}

// ══════════════════════════════════════════════
// СТАТИСТИКА
// ══════════════════════════════════════════════
async function loadStats() {
  try {
    const res  = await fetch('/api/stats');
    const data = await res.json();

    const set = (id, val, dec = 1) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val != null ? formatNumber(val, dec) : '--';
    };
    set('stat-avg-temp', data.avg_temp);
    set('stat-avg-hum',  data.avg_humidity, 0);
    set('stat-avg-co2',  data.avg_co2, 0);
    set('stat-max-co2',  data.max_co2, 0);
    set('stat-pomo',     data.pomodoro_today, 0);
    set('stat-readings', data.total_readings, 0);

    const pomoEl = document.getElementById('pomo-today');
    const minsEl = document.getElementById('pomo-mins');
    if (pomoEl) pomoEl.textContent = data.pomodoro_today || 0;
    if (minsEl) minsEl.textContent = (data.pomodoro_today || 0) * 25;
  } catch(e) {
    console.warn('Статистика недоступна:', e);
  }
}

// ══════════════════════════════════════════════
// АЛЕРТЫ
// ══════════════════════════════════════════════
function renderAlerts(alerts) {
  const list = document.getElementById('alerts-list');
  if (!list || !alerts.length) return;

  list.innerHTML = '';
  alerts.forEach(a => {
    const time = a.timestamp ? formatTime(a.timestamp) : '';
    const div = document.createElement('div');
    div.className = `alert-item ${a.level || 'info'}`;
    div.innerHTML = `
      <div class="alert-dot"></div>
      <div class="alert-text">${a.message}</div>
      <div class="alert-time">${time}</div>
    `;
    list.appendChild(div);
  });
}

function prependAlert(alert) {
  const list = document.getElementById('alerts-list');
  if (!list) return;

  const empty = list.querySelector('.alert-empty');
  if (empty) empty.remove();

  const div = document.createElement('div');
  div.className = `alert-item ${alert.level || 'info'}`;
  div.innerHTML = `
    <div class="alert-dot"></div>
    <div class="alert-text">${alert.message}</div>
    <div class="alert-time">Сейчас</div>
  `;
  list.insertBefore(div, list.firstChild);

  // Максимум 10 алертов
  while (list.children.length > 10) list.lastChild.remove();
}

async function loadAlerts() {
  try {
    const res   = await fetch('/api/alerts?limit=10');
    const data  = await res.json();
    renderAlerts(data);
  } catch(e) {
    console.warn('Алерты недоступны:', e);
  }
}

// ══════════════════════════════════════════════
// POMODORO
// ══════════════════════════════════════════════
const pomodoro = {
  workDur:  25 * 60,
  breakDur: 5  * 60,
  remaining: 25 * 60,
  isRunning: false,
  isBreak: false,
  cyclesDone: 0,
  timer: null,

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.remaining = this.isBreak ? this.breakDur : this.workDur;
    document.getElementById('pomo-start').style.display = 'none';
    document.getElementById('pomo-stop').style.display  = 'block';
    document.getElementById('pomo-phase').textContent   = this.isBreak ? '☕ Перерыв' : '⚡ Работа';

    this.timer = setInterval(() => this.tick(), 1000);
  },

  stop() {
    this.isRunning = false;
    clearInterval(this.timer);
    this.isBreak   = false;
    this.remaining = this.workDur;
    this.updateDisplay();
    document.getElementById('pomo-start').style.display = 'block';
    document.getElementById('pomo-stop').style.display  = 'none';
    document.getElementById('pomo-phase').textContent   = 'Готов к работе';
  },

  tick() {
    this.remaining--;
    this.updateDisplay();
    if (this.remaining <= 0) {
      this.onComplete();
    }
  },

  onComplete() {
    clearInterval(this.timer);
    this.isRunning = false;

    if (!this.isBreak) {
      this.cyclesDone++;
      this.updateDots();
      toast.show(`🍅 Pomodoro #${this.cyclesDone} завершён! Перерыв 5 минут.`, 'success', 6000);
      document.getElementById('pomo-mins').textContent = this.cyclesDone * 25;
      document.getElementById('pomo-today').textContent = this.cyclesDone;
      this.isBreak = true;
    } else {
      toast.show('☕ Перерыв окончен! Начинаем работу?', 'info', 4000);
      this.isBreak = false;
    }
    this.remaining = this.isBreak ? this.breakDur : this.workDur;
    document.getElementById('pomo-start').style.display = 'block';
    document.getElementById('pomo-stop').style.display  = 'none';
    document.getElementById('pomo-phase').textContent   = this.isBreak ? 'Время перерыва!' : 'Готов к работе';
    this.updateDisplay();
  },

  updateDisplay() {
    const m = Math.floor(this.remaining / 60).toString().padStart(2, '0');
    const s = (this.remaining % 60).toString().padStart(2, '0');
    document.getElementById('pomo-display').textContent = `${m}:${s}`;
  },

  updateDots() {
    const dots = document.querySelectorAll('.pdot');
    dots.forEach((d, i) => {
      d.classList.toggle('done', i < this.cyclesDone % 8);
    });
  }
};

// Делаем pomodoro глобальным (используется в onclick)
window.pomodoro = pomodoro;

// ══════════════════════════════════════════════
// WEBSOCKET ПОДКЛЮЧЕНИЕ
// ══════════════════════════════════════════════
const connDot    = document.getElementById('conn-dot');
const connStatus = document.getElementById('conn-status');

function setOnline() {
  connDot.className    = 'nav-dot online';
  connStatus.className = 'nav-badge online';
  connStatus.textContent = 'ESP32 Online';
}
function setOffline() {
  connDot.className    = 'nav-dot offline';
  connStatus.className = 'nav-badge offline';
  connStatus.textContent = 'Нет данных';
}
function setConnecting() {
  connDot.className    = 'nav-dot';
  connStatus.className = 'nav-badge';
  connStatus.textContent = 'Подключение...';
}

const socket = io();

socket.on('connect', () => {
  console.log('✅ WebSocket подключён');
  setConnecting();
});

socket.on('disconnect', () => {
  console.log('❌ WebSocket отключён');
  setOffline();
});

let onlineTimer = null;
socket.on('sensor_update', (data) => {
  setOnline();
  applyData(data);
  addPointToChart(data);

  // Если нет данных 30 секунд — помечаем как offline
  clearTimeout(onlineTimer);
  onlineTimer = setTimeout(setOffline, 30000);
});

socket.on('new_alerts', (alerts) => {
  alerts.forEach(alert => {
    prependAlert(alert);
    toast.show(alert.message, alert.level, 5000);
  });
});

socket.on('pomodoro_event', (data) => {
  if (data.type === 'work') {
    pomodoro.cyclesDone++;
    pomodoro.updateDots();
  }
});

// ══════════════════════════════════════════════
// ДЕМО-РЕЖИМ (если ESP32 не подключён)
// ══════════════════════════════════════════════
function startDemo() {
  console.log('🎮 Демо-режим активен (ESP32 не подключён)');
  connStatus.textContent = 'Демо-режим';
  connStatus.className = 'nav-badge';

  let tick = 0;
  setInterval(() => {
    tick++;
    const demo = {
      temperature: 22 + Math.sin(tick * 0.1) * 2 + Math.random() * 0.3,
      humidity:    48 + Math.sin(tick * 0.07) * 5 + Math.random() * 1,
      co2:         650 + Math.sin(tick * 0.05) * 150 + Math.random() * 20,
      light:       400 + Math.sin(tick * 0.08) * 100 + Math.random() * 30,
      noise:       35  + Math.random() * 10,
      motion:      tick % 20 < 14 ? 1 : 0,
      timestamp:   new Date().toISOString(),
    };
    applyData(demo);
    addPointToChart(demo);
  }, 3000);
}

// ══════════════════════════════════════════════
// ИНИЦИАЛИЗАЦИЯ
// ══════════════════════════════════════════════
async function init() {
  initChart();
  await loadHistory();
  await loadStats();
  await loadAlerts();

  // Получаем последние данные
  try {
    const res  = await fetch('/api/sensors');
    const data = await res.json();
    if (data && data.temperature) {
      applyData(data);
    } else {
      // Нет данных от ESP32 — запускаем демо
      setTimeout(startDemo, 2000);
    }
  } catch(e) {
    setTimeout(startDemo, 2000);
  }

  // Обновляем статистику каждые 60 секунд
  setInterval(loadStats, 60000);
}

document.addEventListener('DOMContentLoaded', init);
