'use strict';
/* NEXIS Wellness Station v2 — Charts */

let mainChart = null;


const sparkData   = { temp: [], hum: [], co2: [], light: [], noise: [] };
const sparkCharts = {};
const SPARK_MAX   = 20;


const sensorCharts = {};


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
    // Вкладки аналитики обрабатываются отдельным делегатом ниже
    if (btn.dataset.am) return;
    // Вкладки сравнения сегодня/вчера — тоже обрабатываются через onclick в HTML
    if (btn.closest('#comparisonTabsCard')) return;
    btn.closest('.chart-tabs').querySelectorAll('.ctab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    switchChartMetric(btn.dataset.m);
  });
});

// Вкладки выбора метрики в основном графике аналитики
document.getElementById('analyticsMetricTabs')?.addEventListener('click', e => {
  const btn = e.target.closest('.ctab');
  if (!btn || !btn.dataset.am) return;
  loadAnalytics(undefined, btn.dataset.am);
});


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

