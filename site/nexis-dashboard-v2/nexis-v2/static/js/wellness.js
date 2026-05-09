'use strict';
/* NEXIS Wellness Station v2 — Wellness Index */

function calcWellnessIndex(s) {
  const co2   = s.co2   ?? 400;
  const temp  = s.temperature ?? 22;
  const hum   = s.humidity   ?? 50;
  const light = s.light      ?? 400;
  const noise = s.noise      ?? 40;

  const sCo2   = co2 < 600  ? 100 : co2 < 800  ? 80 : co2 < 1000 ? 50 : 20;
  const sTemp  = temp >= 20 && temp <= 25 ? 100 : temp >= 18 && temp <= 27 ? 70 : 30;
  const sHum   = hum  >= 40 && hum  <= 60 ? 100 : hum  >= 30 && hum  <= 70 ? 70 : 30;
  const sLight = light >= 300 && light <= 700 ? 100 : light >= 150 ? 70 : 30;
  const sNoise = noise < 40 ? 100 : noise < 55 ? 80 : noise < 70 ? 50 : 20;
  return {
    index: Math.round((sCo2 + sTemp + sHum + sLight + sNoise) / 5),
    components: { air: sCo2, temperature: sTemp, humidity: sHum, light: sLight, noise: sNoise },
  };
}


function updateWellnessCard(s) {
  const { index, components } = calcWellnessIndex(s);
  const level = index > 80 ? 'ok' : index > 50 ? 'warn' : 'bad';
  const color = level === 'ok' ? 'var(--green)' : level === 'warn' ? '#f5a623' : 'var(--red)';

  const strip = document.querySelector('.wellness-strip');
  if (strip) strip.dataset.level = level;

  const el = document.getElementById('wellness-index');
  if (el) { el.textContent = index; el.style.color = color; el.classList.add('pop'); setTimeout(() => el.classList.remove('pop'), 300); }

  const bar = document.getElementById('wellness-bar');
  if (bar) { bar.style.width = index + '%'; bar.style.background = color; }

  const lbl = document.getElementById('wellness-label');
  if (lbl) {
    lbl.textContent = index > 80 ? 'Отлично' : index > 60 ? 'Хорошо' : index > 40 ? 'Средне' : 'Плохо';
    lbl.dataset.level = level;
  }

  Object.entries(components).forEach(([key, score]) => {
    const dot = document.getElementById(`wc-bar-${key}`);
    if (dot) dot.style.background = score > 70 ? 'var(--green)' : score > 40 ? '#f5a623' : 'var(--red)';
    const val = document.getElementById(`wc-val-${key}`);
    if (val) val.textContent = score;
  });
}


function calcWCI(s) {
  const co2   = s.co2   ?? 400;
  const light = s.light ?? 400;
  const noise = s.noise ?? 40;
  const sCo2   = co2 < 600  ? 100 : co2 < 800  ? 80 : co2 < 1000 ? 50 : 20;
  const sLight = light >= 200 && light <= 800 ? 100 : light >= 100 ? 70 : 30;
  const sNoise = noise < 40 ? 100 : noise < 55 ? 80 : noise < 70 ? 50 : 20;
  return Math.round((sCo2 * 2 + sLight + sNoise * 1.5) / 4.5);
}


function updateWCITile(s) {
  const wci = calcWCI(s);
  const el  = document.getElementById('d-wci');
  if (el) el.textContent = wci + '%';
  const st = document.getElementById('ds-wci');
  if (st) st.textContent = wci > 80 ? '🟢 Отличные' : wci > 50 ? '🟡 Средние' : '🔴 Плохие';
  const tile = document.getElementById('tile-wci');
  if (tile) tile.className = `tile wci-tile ${wci > 80 ? 'ok' : wci > 50 ? 'warn' : 'danger'}`;
  const bar = document.getElementById('db-wci');
  if (bar) bar.style.width = wci + '%';
}


function getSmartRecommendations(s) {
  const tips = [];
  const co2  = s.co2   ?? 0;
  const temp = s.temperature ?? 22;
  const hum  = s.humidity   ?? 50;
  const lux  = s.light      ?? 400;
  const db   = s.noise      ?? 40;

  if (co2 > 1200) tips.push({ level: 'danger',  icon: '🚨', text: `CO₂ критически высокий (${Math.round(co2)} ppm)! Срочно проветрите!` });
  else if (co2 > 1000) tips.push({ level: 'warning', icon: '🪟', text: `CO₂ повышен (${Math.round(co2)} ppm) — откройте окно` });
  else if (co2 > 800)  tips.push({ level: 'info',    icon: '💨', text: `CO₂ немного повышен (${Math.round(co2)} ppm) — проветрите скоро` });

  if (lux < 50)       tips.push({ level: 'warning', icon: '💡', text: `Очень темно (${Math.round(lux)} lux) — включите освещение` });
  else if (lux < 150) tips.push({ level: 'info',    icon: '🔆', text: `Освещённость низкая (${Math.round(lux)} lux) — добавьте свет` });

  if (db > 70)      tips.push({ level: 'warning', icon: '🔇', text: `Очень шумно (${Math.round(db)} dB) — наденьте наушники` });
  else if (db > 55) tips.push({ level: 'info',    icon: '🎧', text: `Шумно (${Math.round(db)} dB) — наушники помогут сосредоточиться` });

  if (temp > 27)      tips.push({ level: 'warning', icon: '🌡', text: `Жарко (${temp.toFixed(1)}°C) — включите вентиляцию` });
  else if (temp < 18) tips.push({ level: 'warning', icon: '🧥', text: `Холодно (${temp.toFixed(1)}°C) — оденьтесь теплее` });

  if (hum < 30)      tips.push({ level: 'info', icon: '💧', text: `Воздух сухой (${Math.round(hum)}%) — используйте увлажнитель` });
  else if (hum > 70) tips.push({ level: 'info', icon: '🚿', text: `Высокая влажность (${Math.round(hum)}%) — улучшите вентиляцию` });

  if (!tips.length) tips.push({ level: 'ok', icon: '✅', text: 'Условия на рабочем месте отличные!' });
  return tips.slice(0, 3);
}


function updateRecommendationsPanel(s) {
  const panel = document.getElementById('recommendations-panel');
  if (!panel) return;
  const tips = getSmartRecommendations(s);
  panel.textContent = '';
  tips.forEach(tip => {
    const item = document.createElement('div');
    item.className = `rec-item rec-${tip.level}`;
    const icon = document.createElement('span');
    icon.className = 'rec-icon';
    icon.textContent = tip.icon;
    const text = document.createElement('span');
    text.className = 'rec-text';
    text.textContent = tip.text;
    item.appendChild(icon);
    item.appendChild(text);
    panel.appendChild(item);
  });
}


function updateWorkTimeTile(s) {
  const secs = s.work_time_today;
  const el   = document.getElementById('d-worktime');
  if (el) el.textContent = formatWorkTime(secs);
  const pct  = Math.min(100, ((secs || 0) / (8 * 3600)) * 100);
  const bar  = document.getElementById('db-worktime');
  if (bar) bar.style.width = pct + '%';
  const st = document.getElementById('ds-worktime');
  if (st) {
    const h = Math.floor((secs || 0) / 3600);
    st.textContent = h >= 8 ? 'Полный день' : h >= 4 ? 'Половина дня' : 'Начало дня';
  }
}

// ──────────────────────────────────────────────────
// ФИЧА 9: IAQ — Indoor Air Quality 5 уровней
// ──────────────────────────────────────────────────
function calcIAQ(s) {
  const co2   = s.co2   ?? 400;
  const noise = s.noise ?? 40;
  const light = s.light ?? 400;
  if (co2 < 600 && noise < 40 && light > 200)
    return { level: 'excellent', label: 'Отличный', color: '#22c55e' };
  if (co2 < 800)
    return { level: 'good',     label: 'Хороший',  color: '#86efac' };
  if (co2 < 1000)
    return { level: 'moderate', label: 'Умеренный', color: '#f59e0b' };
  if (co2 < 1400)
    return { level: 'poor',     label: 'Плохой',   color: '#f97316' };
  return   { level: 'hazardous',label: 'Опасный',  color: '#ef4444' };
}

function updateIAQBadge(s) {
  const badge = document.getElementById('iaq-badge');
  if (!badge) return;
  const iaq = calcIAQ(s);
  badge.textContent = 'IAQ: ' + iaq.label;
  badge.style.background = iaq.color + '22';
  badge.style.color = iaq.color;
  badge.style.borderColor = iaq.color + '55';
}

// ──────────────────────────────────────────────────
// ФИЧА 10: Humidex — ощущаемая температура
// ──────────────────────────────────────────────────
function calcHumidex(temp, humidity) {
  if (temp < 15 || humidity < 30) return null;
  return +(temp + (humidity - 40) * 0.14).toFixed(1);
}

function updateHumidexDisplay(s) {
  const el = document.getElementById('humidex-val');
  if (!el) return;
  const h = calcHumidex(s.temperature ?? 22, s.humidity ?? 50);
  el.textContent = h !== null ? '(ощущ. ' + displayTemp(h) + ')' : '';
}

// ──────────────────────────────────────────────────
// ФИЧА 11: Накопленная шумовая нагрузка
// ──────────────────────────────────────────────────
if (!window._noiseAccumMins) window._noiseAccumMins = 0;
const _noiseThreshold = 55;

function updateNoiseAccum(noise) {
  if ((noise ?? 0) > _noiseThreshold) window._noiseAccumMins++;
  const el = document.getElementById('noise-accum-label');
  if (el) el.textContent = 'Шум >' + _noiseThreshold + 'dB уже ' + window._noiseAccumMins + ' мин';
  return window._noiseAccumMins;
}

// ──────────────────────────────────────────────────
// ФИЧА 12: Обнаружение аномалий CO₂
// ──────────────────────────────────────────────────
if (!window._co2History) window._co2History = [];
let _co2AlertCooldown = 0;

function checkCo2Anomaly(co2) {
  if (!co2) return;
  window._co2History.push(co2);
  if (window._co2History.length > 5) window._co2History.shift();
  if (window._co2History.length < 5) return;
  const avg = window._co2History.reduce((a, b) => a + b, 0) / window._co2History.length;
  const now = Date.now();
  if (co2 > avg * 1.25 && now - _co2AlertCooldown > 300000) {
    _co2AlertCooldown = now;
    if (typeof showToast === 'function') showToast('CO₂ резко вырос! Проветрите немедленно ⚠️', 'warning', 6000);
    if (typeof sendNotif === 'function') sendNotif('NEXIS ⚠️ CO₂ аномалия', 'CO₂ резко вырос до ' + Math.round(co2) + ' ppm. Откройте окно!');
  }
}

// ──────────────────────────────────────────────────
// Обновление всех wellness-расширений за одним вызовом
// ──────────────────────────────────────────────────
function updateWellnessExtended(s) {
  updateIAQBadge(s);
  updateHumidexDisplay(s);
  updateNoiseAccum(s.noise);
  checkCo2Anomaly(s.co2);
  // Шумовая нагрузка: добавить к рекомендациям
  if (window._noiseAccumMins >= 60) {
    const panel = document.getElementById('recommendations-panel');
    if (panel) {
      const existing = Array.from(panel.querySelectorAll('.rec-text')).map(e => e.textContent);
      if (!existing.some(t => t.includes('давно!'))) {
        const item = document.createElement('div');
        item.className = 'rec-item rec-warning';
        const icon = document.createElement('span'); icon.className = 'rec-icon'; icon.textContent = '🎧';
        const text = document.createElement('span'); text.className = 'rec-text';
        text.textContent = 'Наденьте наушники (давно!) — шум >55dB уже ' + window._noiseAccumMins + ' мин';
        item.appendChild(icon); item.appendChild(text);
        if (panel.children.length < 3) panel.appendChild(item);
      }
    }
  }
}

