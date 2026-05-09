'use strict';
/* ═══════════════════════════════════════════════════
   NEXIS — Таймер, Секундомер, Ambient звуки
═══════════════════════════════════════════════════ */

// ──────────────────────────────────────────────────
// DOM HELPER
// ──────────────────────────────────────────────────
function _el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// ──────────────────────────────────────────────────
// AUDIO ENGINE
// ──────────────────────────────────────────────────
const audioEngine = (() => {
  let ctx = null;
  let ambientSource = null;
  let gainNode = null;
  let volume = 0.3;

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function beep(freq, dur, vol) {
    try {
      const c = getCtx();
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.connect(g); g.connect(c.destination);
      osc.frequency.value = freq || 880;
      g.gain.setValueAtTime(vol || 0.4, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + (dur || 0.15));
      osc.start(); osc.stop(c.currentTime + (dur || 0.15));
    } catch(e) {}
  }

  function finishBeep() {
    beep(880, 0.15, 0.5);
    setTimeout(() => beep(1100, 0.15, 0.5), 200);
    setTimeout(() => beep(1320, 0.3, 0.5), 400);
  }

  function makeNoiseBuf(c) {
    const bufSize = c.sampleRate * 2;
    const buf = c.createBuffer(1, bufSize, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf; src.loop = true;
    return src;
  }

  function stopAmbient() {
    try { if (ambientSource) ambientSource.stop(); } catch(e) {}
    try { if (gainNode) gainNode.disconnect(); } catch(e) {}
    ambientSource = null; gainNode = null;
  }

  function startAmbient(type) {
    stopAmbient();
    if (type === 'none') return;
    try {
      const c = getCtx();
      gainNode = c.createGain();
      gainNode.gain.value = volume;
      gainNode.connect(c.destination);
      ambientSource = makeNoiseBuf(c);

      if (type === 'rain') {
        const filter = c.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 800;
        filter.Q.value = 0.5;
        ambientSource.connect(filter);
        filter.connect(gainNode);
      } else {
        ambientSource.connect(gainNode);
      }
      ambientSource.start();
    } catch(e) { console.warn('Audio error:', e); }
  }

  function setVolume(v) {
    volume = v;
    if (gainNode) gainNode.gain.value = v;
  }

  return { beep, finishBeep, startAmbient, stopAmbient, setVolume };
})();

// ──────────────────────────────────────────────────
// ТАЙМЕР
// ──────────────────────────────────────────────────
const timerModule = (() => {
  let remaining = 0;
  let total = 0;
  let running = false;
  let interval = null;

  function fmt2(n) { return String(n).padStart(2, '0'); }

  function render() {
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    const el = document.getElementById('timer-display');
    if (el) el.textContent = fmt2(m) + ':' + fmt2(s);

    const ring = document.getElementById('timer-ring-fill');
    if (ring && total > 0) {
      const circ = 2 * Math.PI * 88;
      ring.style.strokeDashoffset = circ * (1 - remaining / total);
    }

    const btn = document.getElementById('timerStartBtn');
    if (btn) btn.textContent = running ? '⏸ Пауза' : (remaining < total && remaining > 0 ? '▶ Продолжить' : '▶ Старт');
  }

  function tick() {
    if (remaining <= 0) {
      running = false;
      clearInterval(interval);
      audioEngine.finishBeep();
      if (typeof showToast === 'function') showToast('Таймер завершён! ⏰');
      render();
      return;
    }
    remaining--;
    render();
  }

  function start() {
    if (running) {
      running = false;
      clearInterval(interval);
      render();
      return;
    }
    if (remaining <= 0) {
      const inp = document.getElementById('timerMinutes');
      const mins = parseInt(inp ? inp.value : 25, 10) || 25;
      total = mins * 60;
      remaining = total;
    }
    running = true;
    interval = setInterval(tick, 1000);
    render();
  }

  function reset() {
    running = false;
    clearInterval(interval);
    const inp = document.getElementById('timerMinutes');
    const mins = parseInt(inp ? inp.value : 25, 10) || 25;
    total = mins * 60;
    remaining = total;
    render();
  }

  function addMinutes(n) {
    remaining = Math.max(0, remaining + n * 60);
    if (!running && remaining > 0) total = remaining;
    render();
  }

  function init() {
    reset();
    document.getElementById('timerStartBtn')?.addEventListener('click', start);
    document.getElementById('timerResetBtn')?.addEventListener('click', reset);
    document.getElementById('timer-add-5')?.addEventListener('click', () => addMinutes(5));
    document.getElementById('timer-sub-5')?.addEventListener('click', () => addMinutes(-5));
    document.getElementById('timerMinutes')?.addEventListener('change', () => { if (!running) reset(); });

    document.querySelectorAll('.timer-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const inp = document.getElementById('timerMinutes');
        if (inp) inp.value = btn.dataset.min;
        running = false;
        clearInterval(interval);
        reset();
      });
    });
  }

  return { init };
})();

// ──────────────────────────────────────────────────
// СЕКУНДОМЕР
// ──────────────────────────────────────────────────
const stopwatchModule = (() => {
  let elapsed = 0;
  let startTime = null;
  let running = false;
  let animId = null;
  let laps = [];
  let lastLapTime = 0;

  function fmt(ms) {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const cs = Math.floor((ms % 1000) / 10);
    return String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0') + '.' + String(cs).padStart(2,'0');
  }

  function render() {
    const current = running ? elapsed + (Date.now() - startTime) : elapsed;
    const el = document.getElementById('sw-display');
    if (el) el.textContent = fmt(current);
  }

  function loop() {
    render();
    if (running) animId = requestAnimationFrame(loop);
  }

  function toggle() {
    if (running) {
      elapsed += Date.now() - startTime;
      running = false;
      cancelAnimationFrame(animId);
      render();
    } else {
      startTime = Date.now();
      running = true;
      loop();
    }
    const btn = document.getElementById('swStartBtn');
    if (btn) btn.textContent = running ? '⏸ Стоп' : '▶ Старт';
  }

  function lap() {
    if (!running) return;
    const current = elapsed + (Date.now() - startTime);
    const lapTime = current - lastLapTime;
    lastLapTime = current;
    laps.unshift({ n: laps.length + 1, total: current, lap: lapTime });
    renderLaps();
  }

  function reset() {
    running = false;
    cancelAnimationFrame(animId);
    elapsed = 0; startTime = null; laps = []; lastLapTime = 0;
    render(); renderLaps();
    const btn = document.getElementById('swStartBtn');
    if (btn) btn.textContent = '▶ Старт';
  }

  function renderLaps() {
    const el = document.getElementById('sw-laps');
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);

    if (laps.length === 0) {
      el.appendChild(_el('div', 'sw-no-laps', 'Нет отметок'));
      return;
    }

    const minLap = laps.reduce((a, b) => b.lap < a.lap ? b : a);
    const maxLap = laps.reduce((a, b) => b.lap > a.lap ? b : a);

    laps.forEach(l => {
      const row = _el('div', 'sw-lap-row' + (laps.length > 1 && l.lap === minLap.lap ? ' sw-lap-best' : laps.length > 1 && l.lap === maxLap.lap ? ' sw-lap-worst' : ''));
      const n = _el('span', 'sw-lap-n'); n.textContent = 'Круг ' + l.n;
      const t = _el('span', 'sw-lap-time', fmt(l.lap));
      const tot = _el('span', 'sw-lap-total', fmt(l.total));
      row.appendChild(n); row.appendChild(t); row.appendChild(tot);
      el.appendChild(row);
    });
  }

  function init() {
    render(); renderLaps();
    document.getElementById('swStartBtn')?.addEventListener('click', toggle);
    document.getElementById('swLapBtn')?.addEventListener('click', lap);
    document.getElementById('swResetBtn')?.addEventListener('click', reset);
  }

  return { init };
})();

// ──────────────────────────────────────────────────
// AMBIENT SOUNDS UI
// ──────────────────────────────────────────────────
function buildAmbientPanel(container) {
  while (container.firstChild) container.removeChild(container.firstChild);

  container.appendChild(_el('div', 'ambient-label', 'Фоновый звук'));

  const btnsRow = _el('div', 'ambient-btns');
  [['none','🔇 Тишина'], ['white','🌫️ Белый шум'], ['rain','🌧️ Дождь']].forEach(([sound, label]) => {
    const b = _el('button', 'ambient-btn' + (sound === 'none' ? ' active' : ''));
    b.textContent = label;
    b.dataset.sound = sound;
    b.addEventListener('click', () => {
      document.querySelectorAll('.ambient-btn').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('.ambient-btn[data-sound="' + sound + '"]').forEach(x => x.classList.add('active'));
      audioEngine.startAmbient(sound);
    });
    btnsRow.appendChild(b);
  });
  container.appendChild(btnsRow);

  const volWrap = _el('div', 'ambient-vol-wrap');
  volWrap.appendChild(_el('span', 'ambient-vol-icon', '🔉'));
  const slider = document.createElement('input');
  slider.type = 'range'; slider.className = 'ambient-vol-slider';
  slider.min = 0; slider.max = 100; slider.value = 30;
  const pct = _el('span', 'ambient-vol-pct', '30%');
  slider.addEventListener('input', () => {
    audioEngine.setVolume(slider.value / 100);
    document.querySelectorAll('.ambient-vol-pct').forEach(el => el.textContent = slider.value + '%');
  });
  volWrap.appendChild(slider); volWrap.appendChild(pct);
  container.appendChild(volWrap);
}

// ──────────────────────────────────────────────────
// ИНИЦИАЛИЗАЦИЯ СТРАНИЦЫ ТАЙМЕРА
// ──────────────────────────────────────────────────
function initTimerPage() {
  document.querySelectorAll('.timer-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.timer-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.timer-tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const tab = document.getElementById('timer-tab-' + btn.dataset.tab);
      if (tab) tab.classList.add('active');
    });
  });

  timerModule.init();
  stopwatchModule.init();

  document.querySelectorAll('.ambient-panel').forEach(buildAmbientPanel);
}
