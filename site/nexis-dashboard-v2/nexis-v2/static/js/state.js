'use strict';
/* NEXIS Wellness Station v2 — State & Utils */

// ──────────────────────────────────────────────────
// СОСТОЯНИЕ
// ──────────────────────────────────────────────────
// ──────────────────────────────────────────────────
const state = {
  mode: 'demo',      // 'off' | 'demo' | 'live'
  currentPage: 'dashboard',
  sensors: {},
  demoTick: 0,
  sidebarCollapsed: false,
  chartData: [],
  activeMetric: 'temperature',
};

// ──────────────────────────────────────────────────
// LOGGER (Журнал событий)
// ──────────────────────────────────────────────────
// ──────────────────────────────────────────────────
const logger = {
  entries: [],
  maxEntries: 200,
  filter: 'all',

  add(type, message) {
    const entry = {
      id: Date.now() + Math.random(),
      time: new Date(),
      type,   // 'sensor' | 'alert' | 'pomodoro' | 'task' | 'health' | 'system'
      message,
    };
    this.entries.unshift(entry);
    if (this.entries.length > this.maxEntries) this.entries.pop();
    this.render();
    this.updateStats();

    // Обновить бейдж
    const nb = document.getElementById('nb-logs');
    if (nb) { nb.textContent = this.entries.length; }
  },

  render() {
    const container = document.getElementById('logsContainer');
    if (!container) return;
    const filtered = this.filter === 'all'
      ? this.entries
      : this.entries.filter(e => e.type === this.filter);

    if (!filtered.length) {
      container.innerHTML = '<div class="no-alerts" style="padding:20px">Нет записей</div>';
      return;
    }
    container.innerHTML = filtered.map(e => `
      <div class="log-entry">
        <span class="log-time">${e.time.toLocaleTimeString('ru')}</span>
        <span class="log-type-badge ${e.type}">${this.typeLabel(e.type)}</span>
        <span class="log-msg">${e.message}</span>
      </div>
    `).join('');
  },

  typeLabel(t) {
    return { sensor: 'Датчик', alert: 'Алерт', pomodoro: 'Pomodoro', task: 'Задача', health: 'Здоровье', system: 'Система' }[t] || t;
  },

  updateStats() {
    const count = type => this.entries.filter(e => e.type === type).length;
    const el = id => document.getElementById(id);
    const a = el('ls-alerts');   if (a)  a.textContent  = count('alert');
    const p = el('ls-pomodoro'); if (p)  p.textContent  = count('pomodoro');
    const t = el('ls-tasks');    if (t)  t.textContent  = count('task');
    const h = el('ls-health');   if (h)  h.textContent  = count('health');
    const tot = el('ls-total');  if (tot) tot.textContent = this.entries.length;
    const badge = el('log-count-badge');
    if (badge) badge.textContent = this.entries.length + ' событий';
  },

  clear() {
    this.entries = [];
    this.render();
    const nb = document.getElementById('nb-logs');
    if (nb) nb.textContent = '0';
    toast.show('Журнал очищен', 'info');
  },

  setFilter(f) {
    this.filter = f;
    this.render();
  }
};

// ──────────────────────────────────────────────────
// TOAST
// ──────────────────────────────────────────────────
// ──────────────────────────────────────────────────
const toast = {
  el: document.getElementById('toast'),
  timer: null,
  show(msg, level = 'info', dur = 4000) {
    this.el.textContent = msg;
    this.el.className = `toast show ${level}`;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.el.classList.remove('show'), dur);
  }
};

// ──────────────────────────────────────────────────
// CLOCK
// ──────────────────────────────────────────────────
// ──────────────────────────────────────────────────
function updateClock() {
  const t = new Date().toLocaleTimeString('ru');
  const el1 = document.getElementById('sidebarTime');
  const el2 = document.getElementById('topbarTime');
  if (el1) el1.textContent = t;
  if (el2) el2.textContent = t;
}
updateClock();
setInterval(updateClock, 1000);

// ──────────────────────────────────────────────────
// СВЕТЛАЯ / ТЁМНАЯ ТЕМА
// ──────────────────────────────────────────────────
// ──────────────────────────────────────────────────
function getChartThemeColors() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  return {
    grid:   isLight ? 'rgba(0,0,0,0.06)'          : 'rgba(255,255,255,0.04)',
    ticks:  isLight ? '#8892aa'                    : '#444b66',
    ttBg:   isLight ? '#ffffff'                    : '#1a1d2a',
    ttTitle:isLight ? '#4a5068'                    : '#7a82a0',
    ttBody: isLight ? '#1a1d2a'                    : '#dde1ee',
    ttBorder:isLight ? 'rgba(0,0,0,0.1)'           : 'rgba(255,255,255,0.1)',
  };
}

function updateChartsTheme() {
  const c = getChartThemeColors();
  [mainChart, ...Object.values(sensorCharts)].forEach(chart => {
    if (!chart) return;
    chart.options.scales.x.grid.color   = c.grid;
    chart.options.scales.y.grid.color   = c.grid;
    chart.options.scales.x.ticks.color  = c.ticks;
    chart.options.scales.y.ticks.color  = c.ticks;
    chart.options.plugins.tooltip.backgroundColor = c.ttBg;
    chart.options.plugins.tooltip.titleColor      = c.ttTitle;
    chart.options.plugins.tooltip.bodyColor       = c.ttBody;
    chart.options.plugins.tooltip.borderColor     = c.ttBorder;
    chart.update('none');
  });
}

function toggleTheme() {
  const isNowDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const next = isNowDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('nexis-theme', next);

  const icon  = document.getElementById('themeIcon');
  const label = document.getElementById('themeLabel');
  if (icon)  icon.textContent  = isNowDark ? '🌙' : '☀️';
  if (label) label.textContent = isNowDark ? 'Тёмная тема' : 'Светлая тема';

  updateChartsTheme();
  logger.add('system', `Тема изменена: ${isNowDark ? 'Светлая' : 'Тёмная'}`);
}
window.toggleTheme = toggleTheme;

// Применить сохранённую тему при загрузке
(function applyStoredTheme() {
  const saved = localStorage.getItem('nexis-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  const icon  = document.getElementById('themeIcon');
  const label = document.getElementById('themeLabel');
  if (saved === 'light') {
    if (icon)  icon.textContent  = '🌙';
    if (label) label.textContent = 'Тёмная тема';
  }
})();

// ──────────────────────────────────────────────────
// УТИЛИТЫ
// ──────────────────────────────────────────────────
// ──────────────────────────────────────────────────
function getLevel(key, val) {
  const t = CFG.thresholds[key];
  if (!t || val == null) return 'ok';
  if (key === 'light') {
    if (val < t.lowDanger) return 'danger';
    if (val < t.lowWarn)   return 'warn';
    return 'ok';
  }
  if (t.danger && val > t.danger) return 'danger';
  if (t.warn   && val > t.warn)   return 'warn';
  if (t.low    && val < t.low)    return 'danger';
  if (t.lowWarn && val < t.lowWarn) return 'warn';
  return 'ok';
}


function getBarPct(key, val) {
  const r = { temperature:[10,40], humidity:[0,100], co2:[400,2000], light:[0,2000], noise:[20,100] };
  const [mn,mx] = r[key] || [0,100];
  return Math.min(100, Math.max(2, ((val-mn)/(mx-mn))*100));
}


function fmt(n, d=1) { return n == null ? '--' : Number(n).toFixed(d); }


let alertLog = [];

// ──────────────────────────────────────────────────
// РАБОЧЕЕ ВРЕМЯ — утилита форматирования
// ──────────────────────────────────────────────────
function formatWorkTime(secs) {
  if (!secs || secs <= 0) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}ч ${m}м` : `${m}м`;
}


// ──────────────────────────────────────────────────
// ЕДИНИЦЫ ТЕМПЕРАТУРЫ
// ──────────────────────────────────────────────────
let tempUnit = localStorage.getItem('nexis-temp-unit') || 'C';

function setTempUnit(unit) {
  tempUnit = unit;
  localStorage.setItem('nexis-temp-unit', unit);
  document.querySelectorAll('.tu-btn').forEach(b => b.classList.toggle('active', b.dataset.unit === unit));
  const unitLabel = document.getElementById('tu-unit');
  if (unitLabel) unitLabel.textContent = unit === 'F' ? '\xb0F' : '\xb0C';
  if (state.sensors && state.sensors.temperature != null) applyData(state.sensors);
}
window.setTempUnit = setTempUnit;

function displayTemp(valC) {
  if (tempUnit === 'F') return fmt(valC * 9/5 + 32, 1);
  return fmt(valC, 1);
}

