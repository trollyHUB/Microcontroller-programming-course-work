'use strict';
/* NEXIS Wellness Station v2 — Pomodoro */

const pomodoro = (() => {
  let workMin = 25, breakMin = 5;
  let remaining = 25 * 60;
  let totalSec  = 25 * 60;
  let running = false, isBreak = false, cyclesDone = parseInt(localStorage.getItem('nexis-pomo-cycles') || '0');
  let interval = null;
  const history = [];
  let _deepWork = false;
  let _dailyGoal = parseInt(localStorage.getItem('nexis-pomo-goal') || '8');
  let _sessionElapsedSec = 0;
  let _sessionStartedAt = null;
  // Режим отслеживания: 'free' | 'computer'
  let _trackingMode = localStorage.getItem('nexis-pomo-tracking') || 'free';

  function updateGoalDisplay() {
    const bar = document.getElementById('pomo-goal-fill');
    const label = document.getElementById('pomo-goal-label');
    if (!bar || !label) return;
    const pct = Math.min(100, Math.round(cyclesDone / _dailyGoal * 100));
    bar.style.width = pct + '%';
    label.textContent = cyclesDone + ' / ' + _dailyGoal + ' помидоров (' + pct + '%)';
  }

  function applyDeepWork(active) {
    _deepWork = active;
    const tile = document.getElementById('tile-focus');
    if (tile) tile.style.borderColor = active ? '#7c3aed' : '';
    const ind = document.getElementById('deep-work-indicator');
    if (ind) ind.style.display = active ? 'flex' : 'none';
  }

  function updateDisplay() {
    const m = String(Math.floor(remaining/60)).padStart(2,'0');
    const s = String(remaining%60).padStart(2,'0');
    const str = m + ':' + s;

    const bigTime  = document.getElementById('pomoTime');
    const bigPhase = document.getElementById('pomoPhase');
    if (bigTime)  bigTime.textContent  = str;
    if (bigPhase) bigPhase.textContent = isBreak ? 'Перерыв' : 'Работа';

    const miniT = document.getElementById('miniPomoTimer');
    const miniP = document.getElementById('miniPomoPhase');
    if (miniT) miniT.textContent = str;
    if (miniP) miniP.textContent = isBreak ? '☕ Перерыв' : running ? '⚡ Работа' : 'Готов';

    const ring = document.getElementById('pomoRing');
    if (ring) {
      const pct = remaining / totalSec;
      const circ = 2 * Math.PI * 88;
      ring.style.strokeDashoffset = circ * (1 - pct);
      ring.setAttribute('class', 'ring-fill' + (isBreak ? ' break-mode' : ''));
    }

    updateDots();
    updateStats();
  }

  function updateDots() {
    ['pomoDots','miniPomoDots'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      while (el.firstChild) el.removeChild(el.firstChild);
      for (let i = 0; i < 8; i++) {
        const dot = document.createElement('div');
        dot.className = 'pd' +
          (i < cyclesDone % 8 ? ' done' :
           (running && !isBreak && i === cyclesDone % 8 ? ' curr' : ''));
        el.appendChild(dot);
      }
    });
  }

  function updateStats() {
    const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    s('ps-today',    cyclesDone);
    s('ps-mins',     cyclesDone * workMin);
    s('ps-mode',     workMin + '/' + breakMin);
    s('ps-status',   running ? (isBreak ? 'Перерыв' : 'Работа') : 'Остановлен');
    s('ps-tracking', _trackingMode === 'computer' ? '🖥 За компом' : '📓 Свободный');
    s('miniPomoCycles', cyclesDone);
    s('miniPomoMins',   cyclesDone * workMin);
    s('st-pomo',     cyclesDone);
  }

  function updateHistoryDisplay() {
    const el = document.getElementById('pomoHistory');
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
    if (!history.length) {
      const empty = document.createElement('div');
      empty.className = 'no-alerts';
      empty.textContent = 'Пока нет циклов';
      el.appendChild(empty);
      return;
    }
    history.forEach(h => {
      const row = document.createElement('div');
      row.className = 'ph-item';
      const typeEl = document.createElement('span');
      typeEl.className = 'ph-type';
      if (h.type === 'work') {
        typeEl.textContent = '🍅 Работа #' + h.num + ' — ' + h.duration + ' мин';
      } else if (h.type === 'break') {
        typeEl.textContent = '☕ Перерыв #' + h.num;
        typeEl.style.color = 'var(--text3)';
      } else if (h.type === 'interrupted') {
        typeEl.textContent = '⏹ Прервано #' + h.num + ' — ' + h.elapsed;
        typeEl.style.color = 'var(--orange, #f97316)';
      } else if (h.type === 'autopause') {
        typeEl.textContent = '👤 Авто-пауза — ' + h.reason;
        typeEl.style.color = 'var(--text3)';
      } else if (h.type === 'notif') {
        typeEl.textContent = '🔔 ' + h.msg;
        typeEl.style.color = 'var(--blue, #4d9eff)';
      } else {
        typeEl.textContent = h.msg || h.type;
      }
      const timeEl = document.createElement('span');
      timeEl.className = 'ph-time';
      timeEl.textContent = h.time;
      row.appendChild(typeEl);
      row.appendChild(timeEl);
      el.appendChild(row);
    });
  }

  function addEvent(type, data) {
    history.unshift(Object.assign({ type, time: new Date().toLocaleTimeString('ru') }, data));
    updateHistoryDisplay();
  }

  function tick() {
    remaining--;
    updateDisplay();
    if (remaining <= 0) onComplete();
  }

  function onComplete() {
    clearInterval(interval);
    running = false;
    _sessionElapsedSec = 0;
    _sessionStartedAt = null;
    if (!isBreak) {
      cyclesDone++;
      localStorage.setItem('nexis-pomo-cycles', cyclesDone);
      addEvent('work', { num: cyclesDone, duration: workMin });
      logger.add('pomodoro', '🍅 Pomodoro #' + cyclesDone + ' завершён! (' + workMin + ' мин работы)');
      toast.show('🍅 Pomodoro #' + cyclesDone + ' завершён! Перерыв ' + breakMin + ' минут.', 'success', 6000);
      if (typeof getNotifSetting === 'undefined' || getNotifSetting('pomoFinished')) {
        sendNotif('🍅 Pomodoro завершён!', 'Перерыв ' + breakMin + ' минут. Молодец!');
        addEvent('notif', { msg: 'Pomodoro #' + cyclesDone + ' завершён' });
      }
      updateGoalDisplay();
      if (cyclesDone === _dailyGoal) {
        toast.show('🎉 Цель дня выполнена! ' + _dailyGoal + ' помидоров завершено!', 'success', 8000);
        addEvent('notif', { msg: 'Цель дня выполнена — ' + _dailyGoal + ' помидоров!' });
      }
      fetch('/api/pomodoro', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'work', duration: workMin })
      }).catch(() => {});
      isBreak = true;
      remaining = breakMin * 60;
      totalSec  = breakMin * 60;
    } else {
      addEvent('break', { num: cyclesDone });
      logger.add('pomodoro', '☕ Перерыв завершён! Начинаем следующий цикл.');
      toast.show('☕ Перерыв окончен! Готов к новому циклу.', 'info', 4000);
      sendNotif('☕ Перерыв окончен!', 'Начинаем следующие ' + workMin + ' минут работы.');
      addEvent('notif', { msg: 'Перерыв #' + cyclesDone + ' окончен' });
      fetch('/api/pomodoro', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'break', duration: breakMin })
      }).catch(() => {});
      isBreak = false;
      remaining = workMin * 60;
      totalSec  = workMin * 60;
    }
    updateDisplay();
    updateBtnState();
  }

  function updateBtnState() {
    const btn  = document.getElementById('pomoBtn');
    const mini = document.getElementById('miniPomoStart');
    const label = running ? '⏸ Пауза' : '▶ Старт';
    if (btn)  { btn.textContent = label; btn.className = 'pomo-btn-main' + (running ? ' running' : ''); }
    if (mini) { mini.textContent = label; mini.className = 'btn-start' + (running ? ' running' : ''); }
  }

  function applyTrackingModeUI() {
    document.querySelectorAll('.pomo-track-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === _trackingMode);
    });
    const hint = document.getElementById('pomo-tracking-hint');
    if (hint) {
      hint.textContent = _trackingMode === 'computer'
        ? 'Авто-пауза через 15 сек если ушёл от стола (PIR)'
        : 'Таймер идёт всегда — PIR не влияет';
    }
    updateStats();
  }

  return {
    toggle() {
      if (running) {
        running = false;
        clearInterval(interval);
        if (_sessionStartedAt) {
          _sessionElapsedSec += Math.floor((Date.now() - _sessionStartedAt) / 1000);
          _sessionStartedAt = null;
        }
        logger.add('pomodoro', 'Pomodoro поставлен на паузу');
      } else {
        running = true;
        _sessionStartedAt = Date.now();
        if (!remaining) { remaining = workMin * 60; totalSec = workMin * 60; }
        interval = setInterval(tick, 1000);
        logger.add('pomodoro', 'Pomodoro запущен (' + (isBreak ? 'перерыв ' + breakMin : 'работа ' + workMin) + ' мин)');
      }
      updateBtnState();
      updateDisplay();
    },

    // Вызывается из app.js при PIR-авто-паузе
    autoPause(reason) {
      if (!running || isBreak) return;
      running = false;
      clearInterval(interval);
      if (_sessionStartedAt) {
        _sessionElapsedSec += Math.floor((Date.now() - _sessionStartedAt) / 1000);
        _sessionStartedAt = null;
      }
      addEvent('autopause', { reason });
      addEvent('notif', { msg: 'Авто-пауза: ' + reason });
      logger.add('pomodoro', '👤 Авто-пауза: ' + reason);
      toast.show('👤 Pomodoro на паузе: ' + reason, 'warning', 5000);
      if (typeof getNotifSetting === 'undefined' || getNotifSetting('pomoFinished')) {
        sendNotif('👤 Pomodoro на паузе', reason);
      }
      updateBtnState();
      updateDisplay();
    },

    reset() {
      const totalElapsed = _sessionElapsedSec +
        (_sessionStartedAt ? Math.floor((Date.now() - _sessionStartedAt) / 1000) : 0);

      if (totalElapsed >= 30 && !isBreak) {
        const m = Math.floor(totalElapsed / 60);
        const s = totalElapsed % 60;
        const timeStr = m > 0
          ? (m + ' мин' + (s > 0 ? ' ' + s + ' сек' : ''))
          : (s + ' сек');
        addEvent('interrupted', { num: cyclesDone + 1, elapsed: timeStr });
        toast.show('⏹ Pomodoro прерван на ' + timeStr, 'warning', 4000);
        logger.add('pomodoro', '⏹ Pomodoro прерван (' + timeStr + ' из ' + workMin + ' мин)');
      }

      running = false; isBreak = false;
      clearInterval(interval);
      _sessionElapsedSec = 0; _sessionStartedAt = null;
      remaining = workMin * 60; totalSec = workMin * 60;
      cyclesDone = 0;
      localStorage.removeItem('nexis-pomo-cycles');
      updateDisplay(); updateBtnState(); updateGoalDisplay();
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
      logger.add('pomodoro', 'Кастомный режим: ' + workMin + '/' + breakMin + ' мин');
      toast.show('Режим установлен: ' + workMin + ' мин работы / ' + breakMin + ' мин перерыв', 'info', 3000);
    },

    setTrackingMode(mode) {
      _trackingMode = mode;
      localStorage.setItem('nexis-pomo-tracking', mode);
      applyTrackingModeUI();
      const label = mode === 'computer' ? '🖥 За компом' : '📓 Свободный';
      toast.show('Режим отслеживания: ' + label, 'info', 2500);
      logger.add('pomodoro', 'Режим отслеживания: ' + label);
    },

    get isRunning()    { return running; },
    get isBreak()      { return isBreak; },
    get isDeepWork()   { return _deepWork; },
    get trackingMode() { return _trackingMode; },

    toggleDeepWork(active) { applyDeepWork(active !== undefined ? active : !_deepWork); },

    setGoal(n) {
      _dailyGoal = Math.max(1, Math.min(20, n));
      localStorage.setItem('nexis-pomo-goal', _dailyGoal);
      updateGoalDisplay();
    },

    initGoal() { updateGoalDisplay(); applyTrackingModeUI(); },
  };
})();

window.pomodoro = pomodoro;
