'use strict';
/* ═══════════════════════════════════════════════════
   NEXIS Wellness Station v2 — Sound Engine (Web Audio)
   Без внешних файлов — генерируем звуки через AudioContext
═══════════════════════════════════════════════════ */

const nexisSound = (() => {
  let ctx = null;
  let enabled = localStorage.getItem('nexis-sound-enabled') !== 'false';

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, startTime, dur, vol = 0.18, type = 'sine') {
    const ac = getCtx();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(vol, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);
    osc.start(startTime);
    osc.stop(startTime + dur);
  }

  // ── Публичные звуки ──

  // Pomodoro завершён — приятный трезвучный аккорд
  function pomoComplete() {
    if (!enabled) return;
    const ac = getCtx();
    const now = ac.currentTime;
    tone(523, now,        0.3, 0.15); // C5
    tone(659, now + 0.18, 0.3, 0.15); // E5
    tone(784, now + 0.36, 0.5, 0.15); // G5
    tone(1047,now + 0.54, 0.4, 0.10); // C6
  }

  // Перерыв завершён — два низких тона
  function breakComplete() {
    if (!enabled) return;
    const ac = getCtx();
    const now = ac.currentTime;
    tone(440, now,        0.25, 0.13); // A4
    tone(523, now + 0.28, 0.35, 0.13); // C5
  }

  // Тик последних 5 секунд
  function tick() {
    if (!enabled) return;
    const ac = getCtx();
    tone(880, ac.currentTime, 0.06, 0.08, 'square');
  }

  // Финальный тик (0 секунд)
  function tickFinal() {
    if (!enabled) return;
    const ac = getCtx();
    const now = ac.currentTime;
    tone(1174, now,       0.08, 0.12, 'square');
    tone(1174, now + 0.1, 0.12, 0.08, 'square');
  }

  // Алерт (CO₂ или другое предупреждение)
  function alert() {
    if (!enabled) return;
    const ac = getCtx();
    const now = ac.currentTime;
    tone(880, now,       0.12, 0.1, 'sawtooth');
    tone(740, now + 0.15, 0.12, 0.1, 'sawtooth');
    tone(880, now + 0.3,  0.12, 0.1, 'sawtooth');
  }

  // Разблокировка достижения — восходящий арпеджио
  function achievement() {
    if (!enabled) return;
    const ac = getCtx();
    const now = ac.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => tone(f, now + i * 0.09, 0.2, 0.12));
  }

  // Позитивный тик (задача выполнена)
  function taskDone() {
    if (!enabled) return;
    const ac = getCtx();
    const now = ac.currentTime;
    tone(784, now, 0.08, 0.1);
    tone(1047, now + 0.09, 0.15, 0.08);
  }

  // Вкл/выкл звука
  function toggle() {
    enabled = !enabled;
    localStorage.setItem('nexis-sound-enabled', enabled);
    return enabled;
  }

  function isEnabled() { return enabled; }

  return { pomoComplete, breakComplete, tick, tickFinal, alert, achievement, taskDone, toggle, isEnabled };
})();

window.nexisSound = nexisSound;
