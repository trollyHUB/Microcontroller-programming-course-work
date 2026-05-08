'use strict';
/* ═══════════════════════════════════════════════════
   NEXIS Wellness Station v2 — Main App
   Sidebar SPA, Режимы, Датчики, Pomodoro, Журнал
═══════════════════════════════════════════════════ */

// ──────────────────────────────────────────────────
// КОНФИГУРАЦИЯ
// ──────────────────────────────────────────────────
const CFG = {
  thresholds: {
    temperature: { warn: 27,   danger: 30,   low: 18,   lowWarn: 20  },
    humidity:    { warn: 65,   danger: 75,   low: 30,   lowWarn: 40  },
    co2:         { warn: 800,  danger: 1200                           },
    light:       { lowDanger: 50, lowWarn: 150                        },
    noise:       { warn: 55,   danger: 70                             },
  },
  metricColor: {
    temperature: '#4d9eff', humidity: '#20c97a',
    co2: '#f5a623', light: '#9b7ff5', noise: '#f04040'
  },
};

const SENSORS_META = {
  'sensor-temp': {
    key: 'temperature', label: 'Температура', icon: '🌡', unit: '°C',
    chip: 'BME280 (основной) + DHT11 (доп.)',
    description: 'Температура рабочего места напрямую влияет на продуктивность и самочувствие. При температуре ниже 18°C скорость реакции снижается, при выше 26°C — концентрация и умственная работоспособность падают. Оптимальная температура для офисной работы — 20–24°C. Основной датчик — BME280 (Bosch Sensortec), профессиональный MEMS-сенсор. Дополнительно — DHT11 для резервного измерения.',
    specs: [
      ['Основной датчик', 'BME280 (Bosch Sensortec)'], ['Доп. датчик', 'DHT11'],
      ['Диапазон BME280', '-40...+85°C'], ['Точность BME280', '±0.5°C'],
      ['Диапазон DHT11', '0...+50°C'], ['Точность DHT11', '±2°C'],
      ['Интерфейс BME280', 'I2C (адрес 0x76)'], ['Интерфейс DHT11', 'Single-wire (GPIO4)'],
      ['Частота опроса', 'Раз в 10 сек'], ['Питание', '3.3V'],
      ['GPIO SDA/SCL', 'GPIO21 / GPIO22'],
    ],
    ranges: [
      { level: 'ok',     label: 'Комфортно',   val: '20–26°C' },
      { level: 'warn',   label: 'Тепловато',   val: '26–30°C' },
      { level: 'danger', label: 'Горячо!',      val: '> 30°C'  },
      { level: 'warn',   label: 'Прохладно',   val: '18–20°C' },
      { level: 'danger', label: 'Холодно',      val: '< 18°C'  },
    ],
    tips: [
      { icon: '🪟', text: 'При температуре выше 26°C рекомендуется проветрить помещение или включить кондиционер.' },
      { icon: '🧥', text: 'При работе ниже 20°C скорость мышления снижается — оденьтесь теплее или включите обогреватель.' },
      { icon: '🌡', text: 'Резкие перепады температуры (более 5°C/час) негативно влияют на концентрацию.' },
    ],
  },
  'sensor-hum': {
    key: 'humidity', label: 'Влажность', icon: '💧', unit: '%',
    chip: 'BME280 (основной) + DHT11 (доп.)',
    description: 'Относительная влажность воздуха — важный параметр для здоровья и работоспособности. Слишком сухой воздух раздражает слизистые оболочки и кожу, вызывает усталость глаз. Слишком влажный создаёт риск появления плесени и ощущение духоты. Основной датчик — BME280, измеряет влажность вместе с температурой и давлением. DHT11 используется как дополнительный датчик.',
    specs: [
      ['Основной датчик', 'BME280 (Bosch Sensortec)'], ['Доп. датчик', 'DHT11'],
      ['Диапазон BME280', '0–100% RH'], ['Точность BME280', '±3% RH'],
      ['Диапазон DHT11', '20–90% RH'], ['Точность DHT11', '±5% RH'],
      ['Интерфейс BME280', 'I2C (адрес 0x76)'], ['Питание', '3.3V'],
      ['GPIO SDA/SCL', 'GPIO21 / GPIO22'],
    ],
    ranges: [
      { level: 'ok',     label: 'Оптимально',  val: '40–60%' },
      { level: 'warn',   label: 'Сухо',         val: '30–40%' },
      { level: 'danger', label: 'Очень сухо',   val: '< 30%'  },
      { level: 'warn',   label: 'Влажно',       val: '60–70%' },
      { level: 'danger', label: 'Слишком влажно', val: '> 70%' },
    ],
    tips: [
      { icon: '💧', text: 'При влажности ниже 40% используйте увлажнитель воздуха — это снизит усталость глаз при работе с монитором.' },
      { icon: '🌿', text: 'Комнатные растения естественно увлажняют воздух и улучшают его качество.' },
      { icon: '🚪', text: 'Высокая влажность выше 70% — признак плохой вентиляции. Проветрите помещение.' },
    ],
  },
  'sensor-co2': {
    key: 'co2', label: 'CO₂ / Воздух', icon: '🌬', unit: 'ppm',
    chip: 'Winsen ZM106-VOC (основной) + MQ-135 (доп.)',
    description: 'Углекислый газ (CO₂) — главный индикатор качества воздуха в помещении. Концентрация CO₂ напрямую влияет на когнитивные способности: при 1000 ppm когнитивные функции снижаются на 15%, при 2500 ppm — на 50%. Основной датчик — Winsen ZM106-VOC, профессиональный UART-сенсор с высокой точностью для измерения CO₂ и летучих органических соединений (VOC). Дополнительно — MQ-135 как аналоговый резервный датчик.',
    specs: [
      ['Основной датчик', 'Winsen ZM106-VOC'], ['Интерфейс ZM106', 'UART 9600 бод'],
      ['GPIO ZM106', 'RX=GPIO16, TX=GPIO17'], ['Питание ZM106', '5V (VIN)'],
      ['Доп. датчик', 'MQ-135 (аналог)'], ['GPIO MQ-135', 'GPIO36 (ADC1)'],
      ['Питание MQ-135', '5V (VIN)'], ['Прогрев MQ-135', '24–48 часов'],
    ],
    ranges: [
      { level: 'ok',     label: 'Отличный воздух',  val: '400–800 ppm'  },
      { level: 'warn',   label: 'Повышен CO₂',       val: '800–1200 ppm' },
      { level: 'danger', label: 'Проветрите!',        val: '> 1200 ppm'   },
    ],
    tips: [
      { icon: '🪟', text: 'CO₂ выше 800 ppm — сигнал к проветриванию. Откройте окно на 5–10 минут.' },
      { icon: '🧠', text: 'Исследования NASA показывают: CO₂ выше 1000 ppm снижает концентрацию на 15–50%.' },
      { icon: '🌿', text: 'Растения поглощают CO₂ и выделяют кислород, улучшая микроклимат.' },
    ],
  },
  'sensor-light': {
    key: 'light', label: 'Освещённость', icon: '💡', unit: 'lux',
    chip: 'BH1750 FVI (GY-302)',
    description: 'Правильная освещённость — фундамент комфортной работы. Недостаточный свет вызывает усталость глаз, головную боль и снижает продуктивность. Избыточное освещение создаёт блики на экране. BH1750 измеряет освещённость с точностью до 1 lux.',
    specs: [
      ['Датчик', 'BH1750 FVI (GY-302)'], ['Диапазон', '1–65535 lux'],
      ['Точность', '±20%'], ['Интерфейс', 'I2C (0x23)'],
      ['GPIO', 'GPIO21 (SDA), GPIO22 (SCL)'], ['Питание', '3.3V'],
    ],
    ranges: [
      { level: 'danger', label: 'Очень темно', val: '< 50 lux'      },
      { level: 'warn',   label: 'Темновато',   val: '50–200 lux'    },
      { level: 'ok',     label: 'Комфортно',   val: '200–1000 lux'  },
      { level: 'ok',     label: 'Ярко',        val: '1000–5000 lux' },
    ],
    tips: [
      { icon: '💡', text: 'Для работы за компьютером рекомендуется 300–500 lux — это снижает нагрузку на глаза.' },
      { icon: '☀️', text: 'Дневной свет (2000+ lux) улучшает настроение и циркадные ритмы. По возможности работайте у окна.' },
      { icon: '🌙', text: 'Вечером яркость ниже 100 lux сигнализирует о необходимости дополнительного освещения.' },
    ],
  },
  'sensor-noise': {
    key: 'noise', label: 'Уровень шума', icon: '🔊', unit: 'dB',
    chip: 'KY-037 (аналоговый)',
    description: 'Шум — один из главных факторов снижения продуктивности при умственном труде. Уровень выше 55 dB значительно ухудшает концентрацию, а при 70+ dB работа с документами и кодом становится крайне затруднённой. Датчик KY-037 фиксирует относительный уровень акустического шума.',
    specs: [
      ['Датчик', 'KY-037 Sound Sensor'], ['Диапазон', '30–120 dB (отн.)'],
      ['Интерфейс', 'Analog ADC'], ['GPIO пин', 'GPIO39 (ADC1)'],
      ['Питание', '3.3V'], ['Тип выхода', 'Analog + Digital'],
    ],
    ranges: [
      { level: 'ok',     label: 'Тихо (библиотека)',  val: '< 40 dB'  },
      { level: 'ok',     label: 'Нормально',           val: '40–55 dB' },
      { level: 'warn',   label: 'Шумновато',           val: '55–70 dB' },
      { level: 'danger', label: 'Громко!',              val: '> 70 dB'  },
    ],
    tips: [
      { icon: '🎧', text: 'При шуме выше 55 dB используйте шумоподавляющие наушники для сохранения концентрации.' },
      { icon: '📚', text: 'Оптимальный уровень шума для умственного труда — 40–50 dB (фоновый шум кафе).' },
      { icon: '⏰', text: 'Система уведомит вас если шум превысит установленный порог — идеально для открытых офисов.' },
    ],
  },
  'sensor-pressure': {
    key: 'pressure', label: 'Давление', icon: '🏔', unit: 'hPa',
    chip: 'BME280 (Bosch)',
    description: 'Атмосферное давление влияет на самочувствие и работоспособность. Резкие перепады давления могут вызывать головную боль и снижение концентрации. Нормальное атмосферное давление — около 1013 hPa (760 мм рт.ст.). BME280 — единственный датчик в наборе, который измеряет давление с высокой точностью.',
    specs: [
      ['Датчик', 'BME280 (Bosch Sensortec)'], ['Диапазон', '300–1100 hPa'],
      ['Точность', '±1 hPa'], ['Интерфейс', 'I2C (адрес 0x76)'],
      ['Питание', '3.3V'], ['GPIO SDA', 'GPIO21'], ['GPIO SCL', 'GPIO22'],
    ],
    ranges: [
      { level: 'danger', label: 'Очень низкое',  val: '< 980 hPa'     },
      { level: 'warn',   label: 'Пониженное',     val: '980–1000 hPa'  },
      { level: 'ok',     label: 'Нормальное',     val: '1000–1025 hPa' },
      { level: 'warn',   label: 'Повышенное',     val: '1025–1040 hPa' },
      { level: 'danger', label: 'Очень высокое',  val: '> 1040 hPa'    },
    ],
    tips: [
      { icon: '🌤', text: 'Нормальное давление 1013 hPa (760 мм рт.ст.) — оптимальные условия для работы.' },
      { icon: '🤕', text: 'Резкие изменения давления (более 10 hPa за час) могут вызвать головную боль у метеочувствительных людей.' },
      { icon: '📊', text: 'BME280 также используется для определения высоты над уровнем моря — полезно для калибровки других датчиков.' },
    ],
  },
  'sensor-motion': {
    key: 'motion', label: 'Присутствие', icon: '👤', unit: '',
    chip: 'PIR HC-SR501',
    description: 'Пассивный инфракрасный датчик (PIR) HC-SR501 определяет присутствие человека в зоне наблюдения, регистрируя тепловое излучение тела. Используется для отслеживания времени пребывания на рабочем месте и автоматической активации/деактивации мониторинга.',
    specs: [
      ['Датчик', 'HC-SR501 PIR'], ['Дальность', '3–7 метров'],
      ['Угол обзора', '120°'], ['GPIO пин', 'GPIO27'],
      ['Питание', '5V (VIN)'], ['Задержка', 'Настраивается 0.3–200 сек'],
    ],
    ranges: [
      { level: 'ok',  label: 'Присутствие есть', val: 'HIGH сигнал' },
      { level: 'warn', label: 'Отсутствует',      val: 'LOW сигнал'  },
    ],
    tips: [
      { icon: '⏰', text: 'Система отслеживает время за столом и напоминает вставать каждые 60–90 минут.' },
      { icon: '💡', text: 'Датчик можно использовать для автоматического включения подсветки при приближении.' },
      { icon: '🔋', text: 'При отсутствии движения более 10 минут система может снизить частоту опроса датчиков для экономии ресурсов.' },
    ],
  },
};

// ──────────────────────────────────────────────────
// СОСТОЯНИЕ
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
const logger = {
  entries: [],
  maxEntries: 200,
  filter: 'all',

  add(type, message) {
    const entry = {
      id: Date.now() + Math.random(),
      time: new Date(),
      type,   // 'sensor' | 'alert' | 'pomodoro' | 'system'
      message,
    };
    this.entries.unshift(entry);
    if (this.entries.length > this.maxEntries) this.entries.pop();
    this.render();

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
    return { sensor: 'Датчик', alert: 'Алерт', pomodoro: 'Pomodoro', system: 'Система' }[t] || t;
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
// SIDEBAR
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
  if (page === 'analytics') loadAnalytics();

  const titles = {
    'dashboard': 'Dashboard', 'pomodoro': 'Pomodoro', 'logs': 'Журнал событий',
    'analytics': 'Аналитика', 'about': 'О станции', 'coursework': 'Курсовая работа', 'settings': 'Настройки',
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
  return {
    temperature: 22 + Math.sin(t * 0.08) * 2.5 + Math.random() * 0.4,
    humidity:    50 + Math.sin(t * 0.05) * 8   + Math.random() * 1.5,
    co2:         680 + Math.sin(t * 0.04) * 200 + Math.random() * 30,
    light:       380 + Math.sin(t * 0.06) * 120 + Math.random() * 40,
    noise:       38  + Math.random() * 14,
    motion:      t % 22 < 16 ? 1 : 0,
    pressure:    1013 + Math.sin(t * 0.02) * 8 + Math.random() * 2,
    timestamp:   new Date().toISOString(),
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
// ПРИМЕНЕНИЕ ДАННЫХ
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

const STATUS_TEXT = {
  temperature: { ok: 'Комфортно', warn: 'Повышена', danger: 'Слишком жарко' },
  humidity:    { ok: 'Норма',     warn: 'Отклонение', danger: 'Критично'  },
  co2:         { ok: 'Чистый воздух', warn: 'Повышен CO₂', danger: 'Проветрите!' },
  light:       { ok: 'Хорошее освещение', warn: 'Мало света', danger: 'Очень темно' },
  noise:       { ok: 'Тихо',      warn: 'Шумновато', danger: 'Очень громко' },
};

function getBarPct(key, val) {
  const r = { temperature:[10,40], humidity:[0,100], co2:[400,2000], light:[0,2000], noise:[20,100] };
  const [mn,mx] = r[key] || [0,100];
  return Math.min(100, Math.max(2, ((val-mn)/(mx-mn))*100));
}

function fmt(n, d=1) { return n == null ? '--' : Number(n).toFixed(d); }

let alertLog = [];
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
        newAlerts.push({ level: lvl, message: msg });
        alertLog = alertLog.filter(a => a.key !== key);
        alertLog.push({ key, time: now });
        logger.add('alert', msg);
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
    div.className = `alert-entry ${a.level}`;
    div.innerHTML = `<div class="ae-dot"></div><div class="ae-msg">${a.message}</div><div class="ae-time">${new Date().toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'})}</div>`;
    list.insertBefore(div, list.firstChild);
    // Покажем toast только для danger
    if (a.level === 'danger') toast.show(a.message, 'danger', 6000);
    else if (a.level === 'warning') toast.show(a.message, 'warning', 4000);
    while (list.children.length > 8) list.lastChild.remove();
  });
}

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

  // PIR → авто-пауза Pomodoro если ушёл от стола
  if (data.motion === 0 && pomodoro.isRunning && !pomodoro.isBreak) {
    pomodoro.toggle();
    toast.show('👤 Отошёл от стола — таймер на паузе', 'info', 4000);
    logger.add('pomodoro', 'Авто-пауза: нет присутствия (PIR датчик)');
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

  // Обновить страницу датчика если открыта
  if (state.currentPage.startsWith('sensor-')) updateSensorPageValues(state.currentPage, data);

  // Статистика
  updateStats(data);

  // Алерты
  checkAlerts(data);

  // Добавить точку на график
  addChartPoint(data);
}

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

// ──────────────────────────────────────────────────
// ГЛАВНЫЙ ГРАФИК
// ──────────────────────────────────────────────────
let mainChart = null;

function initMainChart() {
  const ctx = document.getElementById('mainChart');
  if (!ctx) return;
  const c = getChartThemeColors();
  mainChart = new Chart(ctx, {
    type: 'line',
    data: { labels: [], datasets: [{ label: 'Температура', data: [], borderColor: CFG.metricColor.temperature, backgroundColor: CFG.metricColor.temperature+'18', borderWidth: 2, pointRadius: 3, pointHoverRadius: 6, fill: true, tension: 0.4 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 300 },
      interaction: { mode: 'index', intersect: false },
      onClick(e, elements) {
        if (!elements.length) return;
        const idx = elements[0].index;
        const pt  = state.chartData[idx];
        if (!pt) return;
        const val = pt.full[state.activeMetric];
        const unit = { temperature: '°C', humidity: '%', co2: ' ppm', light: ' lux', noise: ' dB' }[state.activeMetric] || '';
        toast.show(`${pt.label}  →  ${fmt(val, state.activeMetric === 'co2' ? 0 : 1)}${unit}`, 'info', 3000);
      },
      plugins: { legend: { display: false }, tooltip: { backgroundColor: c.ttBg, borderColor: c.ttBorder, borderWidth: 1, titleColor: c.ttTitle, bodyColor: c.ttBody, padding: 10 } },
      scales: {
        x: { grid: { color: c.grid }, ticks: { color: c.ticks, maxTicksLimit: 8, maxRotation: 0 } },
        y: { grid: { color: c.grid }, ticks: { color: c.ticks } }
      }
    }
  });
}

function addChartPoint(data) {
  if (!mainChart) return;
  const label = new Date().toLocaleTimeString('ru', {hour:'2-digit',minute:'2-digit'});
  const val = data[state.activeMetric];
  if (val == null) return;
  state.chartData.push({ label, value: val, full: data });
  if (state.chartData.length > 200) state.chartData.shift();

  mainChart.data.labels.push(label);
  mainChart.data.datasets[0].data.push(val);
  if (mainChart.data.labels.length > 200) {
    mainChart.data.labels.shift();
    mainChart.data.datasets[0].data.shift();
  }
  mainChart.update('none');
}

function switchChartMetric(metric) {
  state.activeMetric = metric;
  if (!mainChart) return;
  mainChart.data.labels = state.chartData.map(d => d.label);
  mainChart.data.datasets[0].data = state.chartData.map(d => d.full[metric]);
  mainChart.data.datasets[0].borderColor = CFG.metricColor[metric];
  mainChart.data.datasets[0].backgroundColor = CFG.metricColor[metric] + '18';
  mainChart.update('none');
}

document.querySelectorAll('.ctab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.ctab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    switchChartMetric(btn.dataset.m);
  });
});

// ──────────────────────────────────────────────────
// SPARK-LINES (мини-графики внутри тайлов)
// ──────────────────────────────────────────────────
const sparkData   = { temp: [], hum: [], co2: [], light: [], noise: [] };
const sparkCharts = {};
const SPARK_MAX   = 20;

function initSparkCharts() {
  const defs = [
    { id: 'spark-temp',  key: 'temp',  color: CFG.metricColor.temperature },
    { id: 'spark-hum',   key: 'hum',   color: CFG.metricColor.humidity    },
    { id: 'spark-co2',   key: 'co2',   color: CFG.metricColor.co2         },
    { id: 'spark-light', key: 'light', color: CFG.metricColor.light       },
    { id: 'spark-noise', key: 'noise', color: CFG.metricColor.noise       },
  ];
  defs.forEach(({ id, key, color }) => {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    sparkCharts[key] = new Chart(ctx, {
      type: 'line',
      data: { labels: [], datasets: [{ data: [], borderColor: color, backgroundColor: color + '22', borderWidth: 1.5, pointRadius: 0, fill: true, tension: 0.4 }] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
        events: [],
      }
    });
  });
}

function updateSpark(key, val) {
  const arr = sparkData[key];
  if (!arr) return;
  arr.push(val);
  if (arr.length > SPARK_MAX) arr.shift();
  const chart = sparkCharts[key];
  if (!chart) return;
  chart.data.labels = arr.map((_, i) => i);
  chart.data.datasets[0].data = [...arr];
  chart.update('none');
}

// Сенсорные графики (каждая страница датчика)
const sensorCharts = {};

function getSensorChart(sensorKey, canvasId, color) {
  if (sensorCharts[sensorKey]) return sensorCharts[sensorKey];
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;
  sensorCharts[sensorKey] = new Chart(ctx, {
    type: 'line',
    data: { labels: [], datasets: [{ data: [], borderColor: color, backgroundColor: color+'18', borderWidth: 2, pointRadius: 0, fill: true, tension: 0.4 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1a1d2a', borderWidth: 1, borderColor:'rgba(255,255,255,0.1)', titleColor:'#7a82a0', bodyColor:'#dde1ee', padding:10 } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#444b66', maxTicksLimit: 6, maxRotation: 0 } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#444b66' } }
      }
    }
  });
  return sensorCharts[sensorKey];
}

// ──────────────────────────────────────────────────
// СТРАНИЦЫ ДАТЧИКОВ — ДИНАМИЧЕСКАЯ ГЕНЕРАЦИЯ
// ──────────────────────────────────────────────────
function buildSensorPage(pageId) {
  const meta = SENSORS_META[pageId];
  if (!meta) return;
  const container = document.getElementById(`page-${pageId}`);
  if (!container) return;

  const colorKey = meta.key === 'motion' ? 'green' : meta.key;
  const color = CFG.metricColor[colorKey] || '#4d9eff';
  const chartId = `chart-${pageId}`;
  const bigValId = `sbig-val-${pageId}`;
  const bigStId  = `sbig-st-${pageId}`;
  const bigCardId = `sbig-card-${pageId}`;

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">${meta.icon} ${meta.label}</h1>
      <p class="page-desc">Датчик: ${meta.chip}</p>
    </div>
    <div class="sensor-page-layout">
      <div class="sensor-main-col">
        <div class="sensor-big-card" id="${bigCardId}">
          <div class="sbig-icon">${meta.icon}</div>
          <div class="sbig-body">
            <div class="sbig-label">${meta.label}</div>
            <div class="sbig-value">
              <span id="${bigValId}">--</span>
              <span class="sbig-unit">${meta.unit}</span>
            </div>
            <div class="sbig-status" id="${bigStId}">Ожидание данных</div>
          </div>
        </div>
        <div class="sensor-chart-card">
          <div class="card-title">График за последние 100 измерений</div>
          <div class="sensor-chart-wrap"><canvas id="${chartId}"></canvas></div>
        </div>
        <div class="sensor-info-card">
          <h4>О параметре</h4>
          <p>${meta.description}</p>
        </div>
        <div class="sensor-info-card">
          <h4>💡 Советы</h4>
          <div class="sensor-tips">
            ${meta.tips.map(t => `<div class="tip-item"><span class="tip-icon">${t.icon}</span><span>${t.text}</span></div>`).join('')}
          </div>
        </div>
      </div>
      <div class="sensor-side-col">
        <div class="sensor-info-card">
          <h4>Технические характеристики</h4>
          <div class="sensor-specs">
            ${meta.specs.map(([k,v]) => `<div class="spec-row"><span class="spec-key">${k}</span><span class="spec-val">${v}</span></div>`).join('')}
          </div>
        </div>
        <div class="sensor-info-card">
          <h4>Диапазоны значений</h4>
          <div class="sensor-ranges">
            ${meta.ranges.map(r => `<div class="range-row"><div class="range-dot ${r.level}"></div><span class="range-label">${r.label}</span><span class="range-val">${r.val}</span></div>`).join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  // Инициализировать график
  setTimeout(() => getSensorChart(pageId, chartId, color), 100);

  // Если есть данные — применить
  if (state.sensors && Object.keys(state.sensors).length) {
    updateSensorPageValues(pageId, state.sensors);
  }
}

function updateSensorPageValues(pageId, data) {
  const meta = SENSORS_META[pageId];
  if (!meta) return;
  const key = meta.key;
  const val = data[key];
  const lvl = getLevel(key, val);

  const bigVal  = document.getElementById(`sbig-val-${pageId}`);
  const bigSt   = document.getElementById(`sbig-st-${pageId}`);
  const bigCard = document.getElementById(`sbig-card-${pageId}`);

  if (bigVal) bigVal.textContent = key === 'motion' ? (val ? 'Обнаружено' : 'Не обнаружено') : fmt(val, key==='co2'?0:1);
  if (bigSt)  bigSt.textContent  = STATUS_TEXT[key]?.[lvl] || (val ? 'Активно' : 'Нет');
  if (bigCard) bigCard.className = `sensor-big-card ${lvl}`;

  // Добавить точку на граф датчика
  const chart = sensorCharts[pageId];
  if (chart && val != null && key !== 'motion') {
    const colorKey = meta.key;
    const label = new Date().toLocaleTimeString('ru', {hour:'2-digit',minute:'2-digit',second:'2-digit'});
    chart.data.labels.push(label);
    chart.data.datasets[0].data.push(val);
    if (chart.data.labels.length > 100) {
      chart.data.labels.shift();
      chart.data.datasets[0].data.shift();
    }
    chart.update('none');
  }
}

// ──────────────────────────────────────────────────
// POMODORO
// ──────────────────────────────────────────────────
const pomodoro = (() => {
  let workMin = 25, breakMin = 5;
  let remaining = 25 * 60;
  let totalSec  = 25 * 60;
  let running = false, isBreak = false, cyclesDone = parseInt(localStorage.getItem('nexis-pomo-cycles') || '0');
  let interval = null;
  const history = [];

  function updateDisplay() {
    const m = String(Math.floor(remaining/60)).padStart(2,'0');
    const s = String(remaining%60).padStart(2,'0');
    const str = `${m}:${s}`;

    // Main page
    const bigTime  = document.getElementById('pomoTime');
    const bigPhase = document.getElementById('pomoPhase');
    if (bigTime)  bigTime.textContent  = str;
    if (bigPhase) bigPhase.textContent = isBreak ? 'Перерыв' : 'Работа';

    // Mini dashboard
    const miniT = document.getElementById('miniPomoTimer');
    const miniP = document.getElementById('miniPomoPhase');
    if (miniT) miniT.textContent = str;
    if (miniP) miniP.textContent = isBreak ? '☕ Перерыв' : running ? '⚡ Работа' : 'Готов';

    // Ring
    const ring = document.getElementById('pomoRing');
    if (ring) {
      const pct = remaining / totalSec;
      const circ = 2 * Math.PI * 88;
      ring.style.strokeDashoffset = circ * (1 - pct);
      ring.className = `ring-fill${isBreak ? ' break-mode' : ''}`;
    }

    updateDots();
    updateStats();
  }

  function updateDots() {
    ['pomoDots','miniPomoDots'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.innerHTML = Array.from({length:8},(_,i) => {
        const cls = i < cyclesDone % 8 ? 'done' : (running && !isBreak && i === cyclesDone%8 ? 'curr' : '');
        return `<div class="pd ${cls}"></div>`;
      }).join('');
    });
  }

  function updateStats() {
    const s = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
    s('ps-today',   cyclesDone);
    s('ps-mins',    cyclesDone * workMin);
    s('ps-mode',    `${workMin}/${breakMin}`);
    s('ps-status',  running ? (isBreak?'Перерыв':'Работа') : 'Остановлен');
    s('miniPomoCycles', cyclesDone);
    s('miniPomoMins',   cyclesDone * workMin);
    s('st-pomo',    cyclesDone);
  }

  function updateHistoryDisplay() {
    const el = document.getElementById('pomoHistory');
    if (!el) return;
    if (!history.length) { el.innerHTML = '<div class="no-alerts">Пока нет циклов</div>'; return; }
    el.innerHTML = history.map(h => `
      <div class="ph-item">
        <span class="ph-type">${h.type==='work'?'🍅 Работа':'☕ Перерыв'} #${h.num}</span>
        <span class="ph-time">${h.time}</span>
      </div>
    `).join('');
  }

  function tick() {
    remaining--;
    updateDisplay();
    if (remaining <= 0) onComplete();
  }

  function onComplete() {
    clearInterval(interval); running = false;
    if (!isBreak) {
      cyclesDone++;
      localStorage.setItem('nexis-pomo-cycles', cyclesDone);
      history.unshift({ type:'work', num:cyclesDone, time: new Date().toLocaleTimeString('ru') });
      logger.add('pomodoro', `🍅 Pomodoro #${cyclesDone} завершён! (${workMin} мин работы)`);
      toast.show(`🍅 Pomodoro #${cyclesDone} завершён! Перерыв ${breakMin} минут.`, 'success', 6000);
      sendNotif('🍅 Pomodoro завершён!', `Перерыв ${breakMin} минут. Молодец!`);
      fetch('/api/pomodoro', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ type:'work', duration: workMin }) }).catch(() => {});
      isBreak = true;
      remaining = breakMin * 60;
      totalSec  = breakMin * 60;
    } else {
      history.unshift({ type:'break', num:cyclesDone, time: new Date().toLocaleTimeString('ru') });
      logger.add('pomodoro', `☕ Перерыв завершён! Начинаем следующий цикл.`);
      toast.show('☕ Перерыв окончен! Готов к новому циклу.', 'info', 4000);
      sendNotif('☕ Перерыв окончен!', `Начинаем следующие ${workMin} минут работы.`);
      fetch('/api/pomodoro', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ type:'break', duration: breakMin }) }).catch(() => {});
      isBreak = false;
      remaining = workMin * 60;
      totalSec  = workMin * 60;
    }
    updateDisplay();
    updateHistoryDisplay();
    updateBtnState();
  }

  function updateBtnState() {
    const btn = document.getElementById('pomoBtn');
    const mini = document.getElementById('miniPomoStart');
    const label = running ? '⏸ Пауза' : '▶ Старт';
    if (btn)  { btn.textContent = label; btn.className = `pomo-btn-main${running?' running':''}`; }
    if (mini) { mini.textContent = running ? '⏸ Пауза' : '▶ Старт'; mini.className = `btn-start${running?' running':''}`; }
  }

  return {
    toggle() {
      if (running) {
        running = false;
        clearInterval(interval);
        logger.add('pomodoro', 'Pomodoro поставлен на паузу');
      } else {
        running = true;
        if (!remaining) { remaining = workMin*60; totalSec = workMin*60; }
        interval = setInterval(tick, 1000);
        logger.add('pomodoro', `Pomodoro запущен (${isBreak?'перерыв':'работа'} ${isBreak?breakMin:workMin} мин)`);
      }
      updateBtnState();
      updateDisplay();
    },
    reset() {
      running = false; isBreak = false;
      clearInterval(interval);
      remaining = workMin*60; totalSec = workMin*60;
      cyclesDone = 0;
      localStorage.removeItem('nexis-pomo-cycles');
      updateDisplay(); updateBtnState();
      logger.add('pomodoro', 'Pomodoro сброшен');
    },
    setMode(btn) {
      document.querySelectorAll('.pomo-mode').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      workMin  = parseInt(btn.dataset.work);
      breakMin = parseInt(btn.dataset.break);
      this.reset();
    },
    applyCustom() {
      const w = parseInt(document.getElementById('customWork')?.value) || 25;
      const b = parseInt(document.getElementById('customBreak')?.value) || 5;
      workMin  = Math.min(120, Math.max(1, w));
      breakMin = Math.min(60,  Math.max(1, b));
      document.querySelectorAll('.pomo-mode').forEach(btn => btn.classList.remove('active'));
      this.reset();
      logger.add('pomodoro', `Кастомный режим: ${workMin}/${breakMin} мин`);
      toast.show(`Режим установлен: ${workMin} мин работы / ${breakMin} мин перерыв`, 'info', 3000);
    },
    get isRunning() { return running; },
    get isBreak()   { return isBreak;  },
  };
})();

window.pomodoro = pomodoro;

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

// ──────────────────────────────────────────────────
// ОЧИСТКА ИСТОРИИ
// ──────────────────────────────────────────────────
function clearHistory() {
  if (!confirm('Удалить все данные датчиков из базы? Это действие нельзя отменить.')) return;
  fetch('/api/history/clear', { method: 'DELETE' })
    .then(r => r.json())
    .then(() => {
      toast.show('История очищена', 'success', 3000);
      logger.add('system', 'История датчиков очищена пользователем');
      if (mainChart) { mainChart.data.labels = []; mainChart.data.datasets[0].data = []; mainChart.update('none'); }
      state.chartData = [];
    })
    .catch(() => toast.show('Ошибка очистки', 'danger', 3000));
}
window.clearHistory = clearHistory;

// ──────────────────────────────────────────────────
// АНАЛИТИКА
// ──────────────────────────────────────────────────
let analyticsChart = null;

function loadAnalytics(hours) {
  hours = hours || 24;
  const st = document.getElementById('analyticsStatus');

  // Демо-режим: используем буфер из памяти браузера
  if (state.mode === 'demo' && state.chartData.length > 0) {
    const rows = state.chartData.map(pt => pt.full);
    if (st) st.textContent = 'Демо-данные — ' + rows.length + ' точек в памяти';
    renderAnalyticsChart(rows);
    renderAnalyticsStats(rows);
    return;
  }

  // Live-режим или пустой демо: читаем из базы данных
  if (st) st.textContent = 'Загрузка из БД...';
  fetch('/api/history?hours=' + hours)
    .then(r => r.json())
    .then(rows => {
      if (!Array.isArray(rows) || !rows.length) {
        if (st) {
          st.textContent = state.mode === 'demo'
            ? 'Подождите — демо-данные ещё накапливаются. Обновите через несколько секунд.'
            : 'Нет данных за выбранный период';
        }
        return;
      }
      if (st) st.textContent = 'Из БД — ' + rows.length + ' точек';
      renderAnalyticsChart(rows);
      renderAnalyticsStats(rows);
    })
    .catch(() => { if (st) st.textContent = 'Ошибка загрузки'; });
}
window.loadAnalytics = loadAnalytics;

function renderAnalyticsChart(rows) {
  const ctx = document.getElementById('analyticsChart');
  if (!ctx) return;
  if (analyticsChart) { analyticsChart.destroy(); analyticsChart = null; }
  const c = getChartThemeColors();
  const labels = rows.map(r => new Date(r.timestamp).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }));
  analyticsChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'T \xb0C', data: rows.map(r => r.temperature), borderColor: CFG.metricColor.temperature, backgroundColor: CFG.metricColor.temperature + '18', borderWidth: 2, pointRadius: 0, fill: false, tension: 0.4, yAxisID: 'y'  },
        { label: 'CO₂ ppm', data: rows.map(r => r.co2),     borderColor: CFG.metricColor.co2,         backgroundColor: CFG.metricColor.co2 + '18',         borderWidth: 2, pointRadius: 0, fill: false, tension: 0.4, yAxisID: 'y2' },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: true, labels: { color: c.ticks } }, tooltip: { backgroundColor: c.ttBg, borderColor: c.ttBorder, borderWidth: 1, titleColor: c.ttTitle, bodyColor: c.ttBody, padding: 10 } },
      scales: {
        x:  { grid: { color: c.grid }, ticks: { color: c.ticks, maxTicksLimit: 10, maxRotation: 0 } },
        y:  { grid: { color: c.grid }, ticks: { color: c.ticks }, position: 'left',  title: { display: true, text: '\xb0C', color: c.ticks } },
        y2: { grid: { display: false }, ticks: { color: c.ticks }, position: 'right', title: { display: true, text: 'ppm', color: c.ticks } },
      }
    }
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
// INIT
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
// БРАУЗЕРНЫЕ УВЕДОМЛЕНИЯ
// ──────────────────────────────────────────────────
function requestNotifPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}
function sendNotif(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body });
  }
}
window.sendNotif = sendNotif;

// ──────────────────────────────────────────────────
// НАСТРОЙКИ (localStorage)
// ──────────────────────────────────────────────────
const SETTINGS_DEFAULTS = JSON.parse(JSON.stringify(CFG.thresholds));

function loadSettings() {
  try {
    const saved = localStorage.getItem('nexis-settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      Object.keys(parsed).forEach(k => {
        if (CFG.thresholds[k]) Object.assign(CFG.thresholds[k], parsed[k]);
      });
    }
  } catch (e) {}
  renderSettingsInputs();
}

function renderSettingsInputs() {
  const map = {
    'set-temp-warn':    ['temperature', 'warn'],
    'set-temp-danger':  ['temperature', 'bad'],
    'set-hum-warn':     ['humidity',    'warn'],
    'set-hum-danger':   ['humidity',    'bad'],
    'set-co2-warn':     ['co2',         'warn'],
    'set-co2-danger':   ['co2',         'bad'],
    'set-light-warn':   ['light',       'warn'],
    'set-light-danger': ['light',       'bad'],
    'set-noise-warn':   ['noise',       'warn'],
    'set-noise-danger': ['noise',       'bad'],
  };
  Object.entries(map).forEach(([id, [sensor, level]]) => {
    const el = document.getElementById(id);
    if (el) el.value = CFG.thresholds[sensor]?.[level] ?? '';
  });
}

function saveSettings() {
  const map = {
    'set-temp-warn':    ['temperature', 'warn'],
    'set-temp-danger':  ['temperature', 'bad'],
    'set-hum-warn':     ['humidity',    'warn'],
    'set-hum-danger':   ['humidity',    'bad'],
    'set-co2-warn':     ['co2',         'warn'],
    'set-co2-danger':   ['co2',         'bad'],
    'set-light-warn':   ['light',       'warn'],
    'set-light-danger': ['light',       'bad'],
    'set-noise-warn':   ['noise',       'warn'],
    'set-noise-danger': ['noise',       'bad'],
  };
  Object.entries(map).forEach(([id, [sensor, level]]) => {
    const el = document.getElementById(id);
    if (el && el.value !== '') CFG.thresholds[sensor][level] = parseFloat(el.value);
  });
  localStorage.setItem('nexis-settings', JSON.stringify(CFG.thresholds));
  toast.show('✅ Настройки сохранены', 'success', 3000);
  logger.add('system', 'Пороги алертов обновлены');
}

function resetSettings() {
  Object.keys(SETTINGS_DEFAULTS).forEach(k => {
    CFG.thresholds[k] = { ...SETTINGS_DEFAULTS[k] };
  });
  localStorage.removeItem('nexis-settings');
  renderSettingsInputs();
  toast.show('Настройки сброшены по умолчанию', 'info', 3000);
}

window.saveSettings  = saveSettings;
window.resetSettings = resetSettings;

// ──────────────────────────────────────────────────
// ЭКСПОРТ CSV
// ──────────────────────────────────────────────────
function doExport() {
  const h = document.getElementById('exportHours')?.value || 24;
  window.location.href = `/api/export/csv?hours=${h}`;
}
window.doExport = doExport;

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

  logger.add('system', '🚀 NEXIS Wellness Station v2 запущена');
  logger.add('system', 'Режим: Демо-данные');

  loadHistoryIntoChart();
  loadStatsFromDB();

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
}

document.addEventListener('DOMContentLoaded', init);
