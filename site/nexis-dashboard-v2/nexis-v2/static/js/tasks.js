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
  function todayKey() {
    return 'nexis-tasks-' + new Date().toISOString().slice(0, 10);
  }

  function load() {
    try { return JSON.parse(localStorage.getItem(todayKey()) || '[]'); } catch(e) { return []; }
  }

  function save(tasks) {
    localStorage.setItem(todayKey(), JSON.stringify(tasks));
  }

  function render() {
    const list = document.getElementById('task-list');
    if (!list) return;
    while (list.firstChild) list.removeChild(list.firstChild);

    let tasks = load();
    // Незавершённые вверху
    tasks.sort((a, b) => (a.done === b.done ? 0 : a.done ? 1 : -1));

    if (tasks.length === 0) {
      list.appendChild(_elT('div', 'task-empty', 'Нет задач на сегодня. Добавьте первую!'));
    } else {
      tasks.forEach(task => {
        const row = _elT('div', 'task-row' + (task.done ? ' task-done' : ''));

        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.className = 'task-cb'; cb.checked = task.done;
        cb.addEventListener('change', () => toggleTask(task.id));

        const txt = _elT('span', 'task-text', task.text);

        const del = _elT('button', 'task-del-btn', '×');
        del.title = 'Удалить';
        del.addEventListener('click', () => deleteTask(task.id));

        row.appendChild(cb); row.appendChild(txt); row.appendChild(del);
        list.appendChild(row);
      });
    }

    updateProgress(tasks);
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

  function addTask(text) {
    if (!text.trim()) return;
    const tasks = load();
    tasks.push({ id: Date.now(), text: text.trim(), done: false });
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

  function init() {
    render();
    const inp = document.getElementById('task-input');
    const addBtn = document.getElementById('task-add-btn');

    function doAdd() {
      if (!inp) return;
      addTask(inp.value);
      inp.value = '';
      inp.focus();
    }

    addBtn?.addEventListener('click', doAdd);
    inp?.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });

    // Кнопка очистки выполненных
    document.getElementById('task-clear-done')?.addEventListener('click', () => {
      const tasks = load().filter(t => !t.done);
      save(tasks);
      render();
    });
  }

  return { init, getProgress: () => { const t = load(); return { done: t.filter(x=>x.done).length, total: t.length }; } };
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
