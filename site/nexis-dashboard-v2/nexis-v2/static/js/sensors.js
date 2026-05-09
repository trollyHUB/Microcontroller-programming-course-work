'use strict';
/* NEXIS Wellness Station v2 — Sensors Pages */

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

