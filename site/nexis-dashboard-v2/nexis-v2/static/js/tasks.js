'use strict';
/* ═══════════════════════════════════════════════════
   NEXIS — Список задач, Напоминания, Оценка энергии
═══════════════════════════════════════════════════ */

// ──────────────────────────────────────────────────
// DOM HELPER
// ──────────────────────────────────────────────────
function _elT(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// ──────────────────────────────────────────────────
// СПИСОК ЗАДАЧ
// ──────────────────────────────────────────────────
const tasksModule = (() => {
  const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
  const PRIORITY_META  = {
    high:   { label: '🔴 Высокий', cls: 'pri-high' },
    medium: { label: '🟡 Средний', cls: 'pri-medium' },
    low:    { label: '🟢 Низкий',  cls: 'pri-low' },
  };

  function todayKey() {
    return 'nexis-tasks-' + new Date().toISOString().slice(0, 10);
  }

  function load() {
    try { return JSON.parse(localStorage.getItem(todayKey()) || '[]'); } catch(e) { return []; }
  }

  function save(tasks) {
    localStorage.setItem(todayKey(), JSON.stringify(tasks));
  }

  function sortTasks(tasks) {
    return tasks.slice().sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return (PRIORITY_ORDER[a.priority || 'medium'] || 1) - (PRIORITY_ORDER[b.priority || 'medium'] || 1);
    });
  }

  function render() {
    const list = document.getElementById('task-list');
    if (!list) return;
    while (list.firstChild) list.removeChild(list.firstChild);

    const tasks = sortTasks(load());

    if (tasks.length === 0) {
      list.appendChild(_elT('div', 'task-empty', 'Нет задач на сегодня. Добавьте первую!'));
    } else {
      tasks.forEach(task => {
        const p = task.priority || 'medium';
        const row = _elT('div', 'task-row' + (task.done ? ' task-done' : ''));

        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.className = 'task-cb'; cb.checked = task.done;
        cb.addEventListener('change', () => toggleTask(task.id));

        const badge = _elT('span', 'task-pri-badge ' + PRIORITY_META[p].cls, '');
        badge.title = PRIORITY_META[p].label;

        const txt = _elT('span', 'task-text', task.text);

        const del = _elT('button', 'task-del-btn', '×');
        del.title = 'Удалить';
        del.addEventListener('click', () => deleteTask(task.id));

        row.appendChild(cb); row.appendChild(badge); row.appendChild(txt); row.appendChild(del);
        list.appendChild(row);
      });
    }

    updateProgress(load());
  }

  function updateProgress(tasks) {
    tasks = tasks || load();
    const done = tasks.filter(t => t.done).length;
    const total = tasks.length;
    const pct = total > 0 ? Math.round(done / total * 100) : 0;

    const bar = document.getElementById('task-progress-fill');
    if (bar) bar.style.width = pct + '%';
    const label = document.getElementById('task-progress-label');
    if (label) label.textContent = done + ' / ' + total + ' задач выполнено (' + pct + '%)';
  }

  function addTask(text, priority) {
    if (!text.trim()) return;
    const tasks = load();
    tasks.push({ id: Date.now(), text: text.trim(), done: false, priority: priority || 'medium' });
    save(tasks);
    render();
  }

  function toggleTask(id) {
    const tasks = load();
    const t = tasks.find(x => x.id === id);
    if (t) { t.done = !t.done; save(tasks); render(); }
  }

  function deleteTask(id) {
    const tasks = load().filter(x => x.id !== id);
    save(tasks);
    render();
  }

  function getSelectedPriority() {
    const active = document.querySelector('.task-pri-btn.active');
    return active ? active.dataset.priority : 'medium';
  }

  function carryOverHighPriority() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yKey = 'nexis-tasks-' + yesterday.toISOString().slice(0, 10);
    let yTasks = [];
    try { yTasks = JSON.parse(localStorage.getItem(yKey) || '[]'); } catch(e) { return; }

    const highLeft = yTasks.filter(t => !t.done && t.priority === 'high');
    if (!highLeft.length) return;

    const today = load();
    const todayTexts = new Set(today.map(t => t.text));
    let added = 0;
    highLeft.forEach(t => {
      if (!todayTexts.has(t.text)) {
        today.push({ id: Date.now() + Math.random(), text: t.text, done: false, priority: 'high' });
        added++;
      }
    });
    if (added > 0) {
      save(today);
      if (typeof toast !== 'undefined') toast.show('📋 Перенесено ' + added + ' важных задач со вчера', 'info', 5000);
    }
  }

  function init() {
    carryOverHighPriority();
    render();
    const inp = document.getElementById('task-input');
    const addBtn = document.getElementById('task-add-btn');

    // Priority buttons
    document.querySelectorAll('.task-pri-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.task-pri-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    function doAdd() {
      if (!inp) return;
      addTask(inp.value, getSelectedPriority());
      inp.value = '';
      inp.focus();
    }

    addBtn?.addEventListener('click', doAdd);
    inp?.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });

    document.getElementById('task-clear-done')?.addEventListener('click', () => {
      save(load().filter(t => !t.done));
      render();
    });
  }

  return {
    init,
    getTodayTasks: () => load(),
    getProgress: () => { const t = load(); return { done: t.filter(x=>x.done).length, total: t.length }; }
  };
})();

// ──────────────────────────────────────────────────
// ОЦЕНКА ЭНЕРГИИ
// ──────────────────────────────────────────────────
const energyModule = (() => {
  function todayHourKey() {
    const now = new Date();
    return 'nexis-energy-' + now.toISOString().slice(0,10) + '-' + now.getHours();
  }

  function todayKey() { return new Date().toISOString().slice(0,10); }

  function save(level) {
    const key = 'nexis-energy-' + todayKey();
    const data = JSON.parse(localStorage.getItem(key) || '{}');
    data[new Date().getHours()] = level;
    localStorage.setItem(key, JSON.stringify(data));
  }

  function getCurrent() {
    const key = 'nexis-energy-' + todayKey();
    const data = JSON.parse(localStorage.getItem(key) || '{}');
    return data[new Date().getHours()] || 0;
  }

  function getTodayData() {
    const key = 'nexis-energy-' + todayKey();
    return JSON.parse(localStorage.getItem(key) || '{}');
  }

  function render() {
    const current = getCurrent();
    document.querySelectorAll('.energy-star').forEach((btn, i) => {
      btn.classList.toggle('active', i < current);
    });
    const label = document.getElementById('energy-label');
    if (label) {
      const labels = ['', 'Истощён 😴', 'Устал 😕', 'Нормально 😐', 'Хорошо 😊', 'Отлично! ⚡'];
      label.textContent = current > 0 ? labels[current] : 'Оцените уровень энергии';
    }
  }

  function init() {
    document.querySelectorAll('.energy-star').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        save(i + 1);
        render();
        if (typeof showToast === 'function') showToast('Энергия: ' + (i + 1) + '/5 ⚡');
      });
      // Hover preview
      btn.addEventListener('mouseenter', () => {
        document.querySelectorAll('.energy-star').forEach((b, j) => b.classList.toggle('hover', j <= i));
      });
      btn.addEventListener('mouseleave', () => {
        document.querySelectorAll('.energy-star').forEach(b => b.classList.remove('hover'));
      });
    });
    render();
  }

  return { init, getTodayData, getCurrent };
})();

// ──────────────────────────────────────────────────
// НАПОМИНАНИЕ О РАЗМИНКЕ
// ──────────────────────────────────────────────────
const stretchReminder = (() => {
  let timer = null;
  const DEFAULT_INTERVAL = 60; // минуты

  function getInterval() {
    return parseInt(localStorage.getItem('nexis-stretch-interval') || DEFAULT_INTERVAL, 10);
  }

  function schedule() {
    clearTimeout(timer);
    const ms = getInterval() * 60 * 1000;
    timer = setTimeout(() => {
      if (typeof showToast === 'function') showToast('Время размяться! Встаньте и потянитесь 🤸');
      if (typeof sendNotif === 'function') sendNotif('NEXIS — Разминка', 'Вы сидите уже ' + getInterval() + ' минут. Самое время размяться! 🤸');
      schedule(); // Повторить
    }, ms);
  }

  function stop() { clearTimeout(timer); }

  function updateInterval(mins) {
    localStorage.setItem('nexis-stretch-interval', mins);
    schedule();
  }

  function init() {
    schedule();
    // Синхронизировать UI если он есть
    const inp = document.getElementById('stretch-interval-input');
    if (inp) {
      inp.value = getInterval();
      inp.addEventListener('change', () => updateInterval(parseInt(inp.value, 10) || DEFAULT_INTERVAL));
    }
  }

  return { init, stop, updateInterval, getInterval };
})();

// ──────────────────────────────────────────────────
// A2: ГИДРАТАЦИЯ — трекер воды
// ──────────────────────────────────────────────────
const hydrationModule = (() => {
  const DEFAULT_INTERVAL = 45; // мин

  function todayKey() { return 'nexis-hydration-' + new Date().toISOString().slice(0, 10); }

  function getDrunk() { return parseInt(localStorage.getItem(todayKey()) || '0', 10); }

  function addGlass() {
    const val = getDrunk() + 1;
    localStorage.setItem(todayKey(), val);
    render();
    toast.show('💧 Стакан воды записан! Молодец! (' + val + ' сегодня)', 'success', 2500);
    return val;
  }

  function getGoal(temp, humidity) {
    let goal = 2000;
    if ((temp || 22) > 26) goal += 200;
    if ((humidity || 50) < 40) goal += 150;
    return goal;
  }

  function getGoalGlasses(temp, humidity) {
    return Math.round(getGoal(temp, humidity) / 250);
  }

  function render(sensors) {
    const drunk = getDrunk();
    const goal = getGoalGlasses(sensors && sensors.temperature, sensors && sensors.humidity);
    const pct = Math.min(100, Math.round(drunk / goal * 100));

    const bar = document.getElementById('hydration-bar-fill');
    if (bar) bar.style.width = pct + '%';
    const label = document.getElementById('hydration-label');
    if (label) label.textContent = drunk + ' / ' + goal + ' стаканов (' + pct + '%)';
    const count = document.getElementById('hydration-count');
    if (count) {
      count.textContent = drunk;
      count.style.color = pct >= 100 ? 'var(--green)' : pct >= 50 ? '#f5a623' : 'var(--text3)';
    }
    const goalEl = document.getElementById('hydration-goal');
    if (goalEl) goalEl.textContent = goal + ' стак.';
    const hint = document.getElementById('hydration-hint');
    if (hint) {
      if (pct >= 100) hint.textContent = '✅ Норма выполнена!';
      else if (pct >= 75) hint.textContent = '💪 Почти готово!';
      else if (pct >= 50) hint.textContent = '💧 Половина выполнена';
      else hint.textContent = '⚠️ Пейте больше воды';
      hint.style.color = pct >= 100 ? 'var(--green)' : pct >= 50 ? '#f5a623' : 'var(--red)';
    }
  }

  let _hydTimer = null;

  function scheduleReminder() {
    clearTimeout(_hydTimer);
    const mins = parseInt(localStorage.getItem('nexis-hydration-interval') || DEFAULT_INTERVAL, 10);
    _hydTimer = setTimeout(() => {
      const drunk = getDrunk();
      toast.show('💧 Пора выпить стакан воды! Выпито сегодня: ' + drunk, 'info', 6000);
      if (typeof sendNotif === 'function') sendNotif('💧 Напоминание о воде', 'Выпито ' + drunk + ' стаканов. Выпейте ещё!');
      scheduleReminder();
    }, mins * 60 * 1000);
  }

  function init(sensors) {
    render(sensors);
    scheduleReminder();
    document.getElementById('hydration-add-btn')?.addEventListener('click', () => {
      addGlass();
    });
  }

  return { init, render, addGlass, getDrunk, getGoalGlasses };
})();

window.hydrationModule = hydrationModule;

// ──────────────────────────────────────────────────
// A1: EYE STRAIN TIMER — правило 20-20-20
// ──────────────────────────────────────────────────
const eyeStrainModule = (() => {
  const DEFAULT_INTERVAL = 20; // минут
  let _eyeTimer = null;
  let _presenceStart = null;
  let _overlayTimer = null;
  let _countdownInterval = null;
  let _enabled = localStorage.getItem('nexis-eye-strain-enabled') !== 'false';

  function getInterval() {
    return parseInt(localStorage.getItem('nexis-eye-interval') || DEFAULT_INTERVAL, 10);
  }

  function showOverlay() {
    const overlay = document.getElementById('eye-strain-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    let sec = 20;
    const cd = document.getElementById('eye-strain-countdown');
    if (cd) cd.textContent = sec;
    clearInterval(_countdownInterval);
    _countdownInterval = setInterval(() => {
      sec--;
      if (cd) cd.textContent = sec;
      if (sec <= 0) {
        clearInterval(_countdownInterval);
        hideOverlay();
        scheduleNext();
      }
    }, 1000);
    if (typeof sendNotif === 'function') sendNotif('👁 Отдых для глаз', 'Посмотри вдаль (>6 м) 20 секунд — правило 20-20-20');
  }

  function hideOverlay() {
    const overlay = document.getElementById('eye-strain-overlay');
    if (overlay) overlay.style.display = 'none';
    clearInterval(_countdownInterval);
  }

  function scheduleNext() {
    clearTimeout(_eyeTimer);
    if (!_enabled) return;
    _eyeTimer = setTimeout(() => {
      showOverlay();
      toast.show('👁 Отдых для глаз! Посмотри вдаль 20 секунд.', 'info', 5000);
    }, getInterval() * 60 * 1000);
  }

  function onMotionChange(motion) {
    if (!_enabled) return;
    if (motion) {
      if (!_presenceStart) {
        _presenceStart = Date.now();
        scheduleNext();
      }
    } else {
      _presenceStart = null;
      clearTimeout(_eyeTimer);
    }
  }

  function setEnabled(val) {
    _enabled = val;
    localStorage.setItem('nexis-eye-strain-enabled', val ? 'true' : 'false');
    if (!val) { clearTimeout(_eyeTimer); hideOverlay(); }
    else scheduleNext();
    const toggle = document.getElementById('eye-strain-toggle');
    if (toggle) toggle.checked = val;
  }

  function init() {
    const toggle = document.getElementById('eye-strain-toggle');
    if (toggle) {
      toggle.checked = _enabled;
      toggle.addEventListener('change', () => setEnabled(toggle.checked));
    }
    document.getElementById('eye-strain-skip')?.addEventListener('click', hideOverlay);
    if (_enabled) scheduleNext();
    updateSettingsUI();
  }

  function updateSettingsUI() {
    const inp = document.getElementById('eye-strain-interval');
    if (inp) {
      inp.value = getInterval();
      inp.addEventListener('change', () => {
        localStorage.setItem('nexis-eye-interval', parseInt(inp.value, 10) || DEFAULT_INTERVAL);
        if (_enabled) { clearTimeout(_eyeTimer); scheduleNext(); }
      });
    }
  }

  return { init, onMotionChange, setEnabled, showOverlay, hideOverlay };
})();

window.eyeStrainModule = eyeStrainModule;

// ──────────────────────────────────────────────────
// ИНИЦИАЛИЗАЦИЯ СТРАНИЦЫ ЗАДАЧ
// ──────────────────────────────────────────────────
function initTasksPage() {
  tasksModule.init();
  energyModule.init();
}

// Запуск напоминания глобально (не только на странице)
// Вызывается из init() в app.js после загрузки
function initStretchReminder() {
  stretchReminder.init();
}
