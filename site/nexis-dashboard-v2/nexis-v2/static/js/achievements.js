'use strict';
/* ═══════════════════════════════════════════════════
   NEXIS Wellness Station v2 — Achievements & Day Score
═══════════════════════════════════════════════════ */

const ACH_DEFS = [
  // ── Здоровье ──
  { id: 'fresh_air',     cat: 'health',       icon: '🌿', title: 'Свежий воздух',      desc: 'CO₂ < 800 ppm 30 минут подряд',        check: s => s._co2OkMinutes >= 30 },
  { id: 'ideal_temp',    cat: 'health',       icon: '🌡️', title: 'Идеальная температура', desc: 'Температура 20–24 °C 1 час подряд',  check: s => s._tempOkMinutes >= 60 },
  { id: 'well_lit',      cat: 'health',       icon: '💡', title: 'Хорошее освещение',   desc: 'Освещённость > 300 lux 1 час',          check: s => s._lightOkMinutes >= 60 },
  { id: 'quiet_zone',    cat: 'health',       icon: '🔇', title: 'Тишина',              desc: 'Уровень шума < 55 dB 30 минут',         check: s => s._quietMinutes >= 30 },
  { id: 'stretch_done',  cat: 'health',       icon: '🤸', title: 'Разминка выполнена',  desc: 'Выполнена разминка',                    check: s => s._stretchDone },
  // ── Продуктивность ──
  { id: 'pomo_first',    cat: 'productivity', icon: '🍅', title: 'Первый помидор',      desc: 'Завершите первый Pomodoro',             check: s => s._pomoCycles >= 1 },
  { id: 'pomo_four',     cat: 'productivity', icon: '🔥', title: 'Четыре подряд',       desc: 'Завершите 4 Pomodoro за день',          check: s => s._pomoCycles >= 4 },
  { id: 'pomo_eight',    cat: 'productivity', icon: '⚡', title: 'Ударный день',        desc: 'Завершите 8 Pomodoro за день',          check: s => s._pomoCycles >= 8 },
  { id: 'tasks_three',   cat: 'productivity', icon: '✅', title: 'Три задачи',          desc: 'Выполните 3 задачи',                    check: s => s._tasksDone >= 3 },
  { id: 'tasks_five',    cat: 'productivity', icon: '🎯', title: 'Продуктивный день',   desc: 'Выполните 5 задач',                     check: s => s._tasksDone >= 5 },
  { id: 'energy_high',   cat: 'productivity', icon: '💪', title: 'На подъёме',          desc: 'Уровень энергии 4 или 5',               check: s => s._energyLevel >= 4 },
  // ── Среда ──
  { id: 'env_perfect',   cat: 'environment',  icon: '🌟', title: 'Идеальная среда',     desc: 'Wellness Index > 80 в течение 30 минут', check: s => s._highWellnessMinutes >= 30 },
  { id: 'co2_low',       cat: 'environment',  icon: '🌱', title: 'Чистый воздух',      desc: 'CO₂ < 600 ppm (отличный воздух)',        check: s => s._bestCO2 !== null && s._bestCO2 < 600 },
  { id: 'pressure_ok',   cat: 'environment',  icon: '🌤️', title: 'Хорошая погода',     desc: 'Атм. давление 1010–1025 hPa',           check: s => s._pressureOk },
  { id: 'humidity_ok',   cat: 'environment',  icon: '💧', title: 'Комфортная влажность', desc: '40–60% влажность 1 час',               check: s => s._humOkMinutes >= 60 },
  // ── Стабильность ──
  { id: 'streak_2',      cat: 'streak',       icon: '📅', title: '2 дня подряд',        desc: 'Зайдите 2 дня подряд',                  check: s => s._streakDays >= 2 },
  { id: 'streak_7',      cat: 'streak',       icon: '🗓️', title: 'Неделя активности',  desc: 'Зайдите 7 дней подряд',                 check: s => s._streakDays >= 7 },
  { id: 'day_score_80',  cat: 'streak',       icon: '🏅', title: 'Отличный день',       desc: 'Получите Day Score ≥ 80',               check: s => s._bestDayScore >= 80 },
  { id: 'day_score_95',  cat: 'streak',       icon: '🏆', title: 'Совершенный день',    desc: 'Получите Day Score ≥ 95',               check: s => s._bestDayScore >= 95 },
];

// ── Ежедневные достижения (сбрасываются каждый день) ──
const ACH_DAILY = [
  { id: 'daily_pomo_goal',  icon: '🍅', title: 'Цель дня выполнена',   desc: 'Достичь дневной цели Pomodoro',         check: s => s._pomoCycles >= (parseInt(localStorage.getItem('nexis-pomo-goal') || '8')) },
  { id: 'daily_all_tasks',  icon: '✅', title: 'Все задачи закрыты',   desc: 'Выполнить все задачи дня',              check: s => s._tasksDone > 0 && s._allTasksDone },
  { id: 'daily_clean_air',  icon: '🌿', title: 'Чистый воздух весь день', desc: 'CO₂ < 1000 ppm весь день',          check: s => s._co2OverLimit === false },
  { id: 'daily_no_alerts',  icon: '🛡️', title: 'Без критических алертов', desc: 'Ни одного опасного алерта за день', check: s => s._noDangerAlerts },
  { id: 'daily_hydration',  icon: '💧', title: 'Водный баланс',         desc: 'Выпить 8 стаканов воды за день',       check: s => s._waterCups >= 8 },
];

// ── Недельные достижения (сбрасываются каждую неделю) ──
const ACH_WEEKLY = [
  { id: 'weekly_5days',     icon: '📆', title: '5 дней активности',    desc: '5+ активных дней за неделю',           check: s => s._weekActiveDays >= 5 },
  { id: 'weekly_20pomo',    icon: '🔥', title: '20 помидоров',          desc: '20+ Pomodoro за неделю',               check: s => s._weekPomodoros >= 20 },
  { id: 'weekly_40pomo',    icon: '⚡', title: 'Турбо-неделя',         desc: '40+ Pomodoro за неделю',               check: s => s._weekPomodoros >= 40 },
  { id: 'weekly_avg_wi',    icon: '🌡️', title: 'Здоровая неделя',      desc: 'Средний Wellness Index > 70 за неделю', check: s => s._weekAvgWI >= 70 },
  { id: 'weekly_streak',    icon: '🏅', title: 'Идеальная неделя',      desc: '7 дней активности подряд',             check: s => s._streakDays >= 7 },
];

const achievements = (() => {
  const LS_KEY      = 'nexis-achievements';
  const LS_STATS    = 'nexis-ach-stats';
  const LS_STREAK   = 'nexis-ach-streak';
  const LS_BEST_DAY = 'nexis-ach-best-day-score';
  const LS_DAILY    = 'nexis-ach-daily';
  const LS_WEEKLY   = 'nexis-ach-weekly';

  function getWeekNum(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  }

  function loadDailyData() {
    const today = new Date().toDateString();
    const def = { date: today, earned: [], co2OverLimit: false, noDangerAlerts: true, allTasksDone: false, waterCups: 0 };
    try {
      const d = JSON.parse(localStorage.getItem(LS_DAILY) || '{}');
      if (d.date !== today) { localStorage.setItem(LS_DAILY, JSON.stringify(def)); return def; }
      return Object.assign(def, d);
    } catch { return def; }
  }

  function saveDailyData(d) { localStorage.setItem(LS_DAILY, JSON.stringify(d)); }

  function loadWeeklyData() {
    const now = new Date();
    const week = getWeekNum(now), year = now.getFullYear();
    const def = { week, year, earned: [], activeDayDates: [], totalPomodoros: 0, wiSum: 0, wiCount: 0 };
    try {
      const d = JSON.parse(localStorage.getItem(LS_WEEKLY) || '{}');
      if (d.week !== week || d.year !== year) { localStorage.setItem(LS_WEEKLY, JSON.stringify(def)); return def; }
      return Object.assign(def, d);
    } catch { return def; }
  }

  function saveWeeklyData(d) { localStorage.setItem(LS_WEEKLY, JSON.stringify(d)); }

  // ── Загрузить разблокированные ──
  function loadUnlocked() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
    catch { return []; }
  }

  function saveUnlocked(arr) {
    localStorage.setItem(LS_KEY, JSON.stringify(arr));
  }

  // ── Загрузить накопительную статистику ──
  function loadStats() {
    const def = {
      _co2OkMinutes: 0, _tempOkMinutes: 0, _lightOkMinutes: 0,
      _quietMinutes: 0, _humOkMinutes: 0, _highWellnessMinutes: 0,
      _pomoCycles: 0, _tasksDone: 0, _energyLevel: 0,
      _stretchDone: false, _pressureOk: false,
      _bestCO2: null, _streakDays: 0, _bestDayScore: 0,
      _lastDate: null,
    };
    try {
      const stored = JSON.parse(localStorage.getItem(LS_STATS) || '{}');
      return Object.assign(def, stored);
    } catch { return def; }
  }

  function saveStats(s) {
    localStorage.setItem(LS_STATS, JSON.stringify(s));
  }

  // ── Стрик (серия дней) ──
  function updateStreak() {
    const today = new Date().toDateString();
    const data = JSON.parse(localStorage.getItem(LS_STREAK) || '{"last":null,"days":0}');
    if (data.last === today) return data.days;
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    const days = data.last === yesterday ? data.days + 1 : 1;
    localStorage.setItem(LS_STREAK, JSON.stringify({ last: today, days }));
    return days;
  }

  // ── Показать тост при разблокировке ──
  function showUnlockToast(def) {
    const toast = document.getElementById('ach-unlock-toast');
    const icon  = document.getElementById('ach-unlock-icon');
    const name  = document.getElementById('ach-unlock-name');
    if (!toast) return;
    if (icon) icon.textContent = def.icon;
    if (name) name.textContent = def.title;
    toast.style.display = 'flex';
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => { toast.style.display = 'none'; }, 400);
    }, 3200);

    if (typeof nexisSound !== 'undefined') nexisSound.achievement();
    if (typeof logger !== 'undefined') {
      logger.add('system', 'Достижение получено: ' + def.title);
    }
    if (typeof toast_show === 'undefined' && typeof toast !== 'undefined' && toast.show) {
      // already logged
    }
  }

  // ── Проверить и разблокировать ──
  function check(statsOverride) {
    const unlocked = loadUnlocked();
    const stats = statsOverride || loadStats();
    let changed = false;

    ACH_DEFS.forEach(def => {
      if (unlocked.includes(def.id)) return;
      try {
        if (def.check(stats)) {
          unlocked.push(def.id);
          changed = true;
          showUnlockToast(def);
        }
      } catch {}
    });

    if (changed) {
      saveUnlocked(unlocked);
      updateBadge(unlocked.length);
      if (state.currentPage === 'achievements') render();
    }
    return unlocked;
  }

  // ── Проверить ежедневные достижения ──
  function checkDaily(stats) {
    const daily = loadDailyData();
    let changed = false;
    ACH_DAILY.forEach(def => {
      if (daily.earned.includes(def.id)) return;
      try {
        const s = Object.assign({}, stats, {
          _co2OverLimit: daily.co2OverLimit,
          _noDangerAlerts: daily.noDangerAlerts,
          _allTasksDone: daily.allTasksDone,
          _waterCups: daily.waterCups,
        });
        if (def.check(s)) {
          daily.earned.push(def.id);
          changed = true;
          showUnlockToast(def);
        }
      } catch {}
    });
    if (changed) { saveDailyData(daily); if (state.currentPage === 'achievements') render(); }
  }

  // ── Проверить недельные достижения ──
  function checkWeekly(stats) {
    const weekly = loadWeeklyData();
    let changed = false;
    const activeDays = (weekly.activeDayDates || []).length;
    const avgWI = weekly.wiCount > 0 ? weekly.wiSum / weekly.wiCount : 0;
    ACH_WEEKLY.forEach(def => {
      if (weekly.earned.includes(def.id)) return;
      try {
        const s = Object.assign({}, stats, {
          _weekActiveDays: activeDays,
          _weekPomodoros: weekly.totalPomodoros || 0,
          _weekAvgWI: avgWI,
        });
        if (def.check(s)) {
          weekly.earned.push(def.id);
          changed = true;
          showUnlockToast(def);
        }
      } catch {}
    });
    if (changed) { saveWeeklyData(weekly); if (state.currentPage === 'achievements') render(); }
  }

  // ── Обновить бейдж в навигации ──
  function updateBadge(count) {
    const nb = document.getElementById('nb-ach');
    if (!nb) return;
    if (count > 0) {
      nb.textContent = count;
      nb.style.display = '';
    } else {
      nb.style.display = 'none';
    }
  }

  // ── Отрисовать страницу достижений ──
  function render() {
    const unlocked = loadUnlocked();
    const total = ACH_DEFS.length;
    const gotCount = unlocked.length;
    const pct = total > 0 ? Math.round(gotCount / total * 100) : 0;

    // Общий прогресс
    const elNum = document.getElementById('ach-total-unlocked');
    if (elNum) elNum.textContent = gotCount;
    const elTotal = document.getElementById('ach-total-count');
    if (elTotal) elTotal.textContent = total;
    const elBar = document.getElementById('ach-overview-bar');
    if (elBar) elBar.style.width = pct + '%';
    const elPct = document.getElementById('ach-overview-pct');
    if (elPct) elPct.textContent = pct + '%';
    const elStreak = document.getElementById('ach-streak-days');
    if (elStreak) {
      const streak = JSON.parse(localStorage.getItem('nexis-ach-streak') || '{"days":0}');
      elStreak.textContent = streak.days || 0;
    }

    // По категориям
    const cats = { health: 'ach-list-health', productivity: 'ach-list-productivity', environment: 'ach-list-environment', streak: 'ach-list-streak' };
    Object.entries(cats).forEach(([cat, elId]) => {
      const container = document.getElementById(elId);
      if (!container) return;
      container.textContent = '';
      const defs = ACH_DEFS.filter(d => d.cat === cat);
      defs.forEach(def => {
        const isUnlocked = unlocked.includes(def.id);
        container.appendChild(buildAchItem(def, isUnlocked));
      });
    });

    // ── Ежедневные ──
    const dailyEl = document.getElementById('ach-list-daily');
    if (dailyEl) {
      const daily = loadDailyData();
      dailyEl.textContent = '';
      // Прогресс-строка
      const prog = document.createElement('div');
      prog.className = 'ach-timed-progress';
      const progBar = document.createElement('div');
      progBar.className = 'ach-timed-bar';
      const progFill = document.createElement('div');
      progFill.className = 'ach-timed-fill';
      progFill.style.width = Math.round(daily.earned.length / ACH_DAILY.length * 100) + '%';
      progBar.appendChild(progFill);
      const progLbl = document.createElement('span');
      progLbl.className = 'ach-timed-lbl';
      progLbl.textContent = daily.earned.length + ' / ' + ACH_DAILY.length + ' сегодня';
      prog.appendChild(progBar);
      prog.appendChild(progLbl);
      dailyEl.appendChild(prog);
      // Счётчик воды
      const wrapW = document.createElement('div');
      wrapW.className = 'ach-water-row';
      const wLbl = document.createElement('span');
      wLbl.className = 'ach-water-label';
      wLbl.textContent = '💧 Стаканы воды:';
      const wCount = document.createElement('span');
      wCount.className = 'ach-water-count';
      wCount.id = 'ach-water-cups-num';
      wCount.textContent = daily.waterCups;
      const wPlus = document.createElement('button');
      wPlus.className = 'ach-water-btn';
      wPlus.textContent = '+';
      wPlus.onclick = () => {
        const d = loadDailyData();
        d.waterCups = (d.waterCups || 0) + 1;
        saveDailyData(d);
        wCount.textContent = d.waterCups;
        checkDaily(loadStats());
      };
      const wMinus = document.createElement('button');
      wMinus.className = 'ach-water-btn ach-water-btn-minus';
      wMinus.textContent = '−';
      wMinus.onclick = () => {
        const d = loadDailyData();
        d.waterCups = Math.max(0, (d.waterCups || 0) - 1);
        saveDailyData(d);
        wCount.textContent = d.waterCups;
      };
      wrapW.appendChild(wLbl);
      wrapW.appendChild(wMinus);
      wrapW.appendChild(wCount);
      wrapW.appendChild(wPlus);
      dailyEl.appendChild(wrapW);
      // Элементы достижений
      ACH_DAILY.forEach(def => {
        dailyEl.appendChild(buildTimedAchItem(def, daily.earned.includes(def.id), 'Сегодня'));
      });
    }

    // ── Недельные ──
    const weeklyEl = document.getElementById('ach-list-weekly');
    if (weeklyEl) {
      const weekly = loadWeeklyData();
      weeklyEl.textContent = '';
      const activeDays = (weekly.activeDayDates || []).length;
      const prog = document.createElement('div');
      prog.className = 'ach-timed-progress';
      const progBar = document.createElement('div');
      progBar.className = 'ach-timed-bar';
      const progFill = document.createElement('div');
      progFill.className = 'ach-timed-fill ach-timed-fill-week';
      progFill.style.width = Math.round(weekly.earned.length / ACH_WEEKLY.length * 100) + '%';
      progBar.appendChild(progFill);
      const progLbl = document.createElement('span');
      progLbl.className = 'ach-timed-lbl';
      progLbl.textContent = weekly.earned.length + ' / ' + ACH_WEEKLY.length + ' на этой неделе  •  ' + activeDays + ' дн. активности  •  ' + (weekly.totalPomodoros || 0) + ' 🍅';
      prog.appendChild(progBar);
      prog.appendChild(progLbl);
      weeklyEl.appendChild(prog);
      ACH_WEEKLY.forEach(def => {
        weeklyEl.appendChild(buildTimedAchItem(def, weekly.earned.includes(def.id), 'Эта неделя'));
      });
    }

    // Недавно полученные
    const recentEl = document.getElementById('ach-recent-list');
    if (recentEl) {
      recentEl.textContent = '';
      const recent = ACH_DEFS.filter(d => unlocked.includes(d.id)).slice(-5).reverse();
      if (!recent.length) {
        const empty = document.createElement('div');
        empty.className = 'no-alerts';
        empty.textContent = 'Получите первое достижение!';
        recentEl.appendChild(empty);
      } else {
        recent.forEach(def => {
          const row = document.createElement('div');
          row.className = 'ach-recent-item';
          const ico = document.createElement('span');
          ico.className = 'ach-recent-icon';
          ico.textContent = def.icon;
          const txt = document.createElement('div');
          txt.className = 'ach-recent-text';
          const title = document.createElement('div');
          title.className = 'ach-recent-title';
          title.textContent = def.title;
          const sub = document.createElement('div');
          sub.className = 'ach-recent-desc';
          sub.textContent = def.desc;
          txt.appendChild(title);
          txt.appendChild(sub);
          row.appendChild(ico);
          row.appendChild(txt);
          recentEl.appendChild(row);
        });
      }
    }

    updateBadge(gotCount);
  }

  function buildAchItem(def, isUnlocked) {
    const item = document.createElement('div');
    item.className = 'ach-item' + (isUnlocked ? ' unlocked' : ' locked');

    const ico = document.createElement('div');
    ico.className = 'ach-icon';
    ico.textContent = def.icon;

    const info = document.createElement('div');
    info.className = 'ach-info';

    const title = document.createElement('div');
    title.className = 'ach-title';
    title.textContent = def.title;

    const desc = document.createElement('div');
    desc.className = 'ach-desc';
    desc.textContent = def.desc;

    const badge = document.createElement('div');
    badge.className = 'ach-status-badge';
    badge.textContent = isUnlocked ? '✓' : '—';

    info.appendChild(title);
    info.appendChild(desc);
    item.appendChild(ico);
    item.appendChild(info);
    item.appendChild(badge);
    return item;
  }

  function buildTimedAchItem(def, isEarned, periodLabel) {
    const item = document.createElement('div');
    item.className = 'ach-item' + (isEarned ? ' unlocked' : ' locked');

    const ico = document.createElement('div');
    ico.className = 'ach-icon';
    ico.textContent = def.icon;

    const info = document.createElement('div');
    info.className = 'ach-info';

    const title = document.createElement('div');
    title.className = 'ach-title';
    title.textContent = def.title;

    const desc = document.createElement('div');
    desc.className = 'ach-desc';
    desc.textContent = def.desc;

    info.appendChild(title);
    info.appendChild(desc);

    const badge = document.createElement('div');
    badge.className = 'ach-period-badge' + (isEarned ? ' ach-period-earned' : '');
    badge.textContent = isEarned ? ('✓ ' + periodLabel) : periodLabel;

    item.appendChild(ico);
    item.appendChild(info);
    item.appendChild(badge);
    return item;
  }

  // ── Day Score (Здоровый день, 0–100) ──
  function calcDayScore() {
    // Компонент 1: Среда (40%) — берём текущий Wellness Index
    const wiEl = document.getElementById('wellness-index');
    const envScore = wiEl ? Math.min(100, Math.max(0, parseFloat(wiEl.textContent) || 0)) : 0;

    // Компонент 2: Pomodoro (35%) — выполненные / цель
    const cycles  = parseInt(localStorage.getItem('nexis-pomo-cycles') || '0', 10);
    const goal    = parseInt(localStorage.getItem('nexis-pomo-goal') || '8', 10);
    const pomoScore = Math.min(100, Math.round(cycles / goal * 100));

    // Компонент 3: Фокус (25%) — задачи + энергия
    const taskFill = document.getElementById('task-progress-fill');
    const taskPct = taskFill ? parseFloat(taskFill.style.width) || 0 : 0;
    const energyLevel = parseInt(localStorage.getItem('nexis-energy-level') || '0', 10);
    const energyPct = energyLevel * 20;
    const focusScore = Math.round(taskPct * 0.6 + energyPct * 0.4);

    const total = Math.round(envScore * 0.4 + pomoScore * 0.35 + focusScore * 0.25);

    return { total, envScore, pomoScore, focusScore };
  }

  function updateDayScore() {
    const { total, envScore, pomoScore, focusScore } = calcDayScore();

    const numEl = document.getElementById('day-score-num');
    if (numEl) numEl.textContent = total;

    const gradeEl = document.getElementById('day-score-grade');
    if (gradeEl) {
      let grade, cls;
      if (total >= 90)      { grade = 'Отлично'; cls = 'grade-a'; }
      else if (total >= 75) { grade = 'Хорошо';  cls = 'grade-b'; }
      else if (total >= 55) { grade = 'Норм';    cls = 'grade-c'; }
      else                  { grade = 'Низкий';  cls = 'grade-d'; }
      gradeEl.textContent = grade;
      gradeEl.className = 'day-score-grade ' + cls;
    }

    const envFill = document.getElementById('dsb-env');
    if (envFill) envFill.style.width = envScore + '%';
    const envVal = document.getElementById('dsb-env-val');
    if (envVal) envVal.textContent = envScore + '%';

    const pomoFill = document.getElementById('dsb-pomo');
    if (pomoFill) pomoFill.style.width = pomoScore + '%';
    const pomoVal = document.getElementById('dsb-pomo-val');
    if (pomoVal) pomoVal.textContent = pomoScore + '%';

    const focusFill = document.getElementById('dsb-focus');
    if (focusFill) focusFill.style.width = focusScore + '%';
    const focusVal = document.getElementById('dsb-focus-val');
    if (focusVal) focusVal.textContent = focusScore + '%';

    // Сохранить лучший результат дня
    const best = parseInt(localStorage.getItem(LS_BEST_DAY) || '0', 10);
    if (total > best) {
      localStorage.setItem(LS_BEST_DAY, total);
      const stats = loadStats();
      stats._bestDayScore = total;
      saveStats(stats);
    }
  }

  // ── Хук на обновление датчиков ──
  function onSensorUpdate(s) {
    if (!s) return;
    const stats = loadStats();

    // CO₂
    if (s.co2 != null) {
      if (s.co2 < 800) stats._co2OkMinutes = (stats._co2OkMinutes || 0) + 0.5;
      else stats._co2OkMinutes = 0;
      if (stats._bestCO2 === null || s.co2 < stats._bestCO2) stats._bestCO2 = s.co2;
    }
    // Температура
    if (s.temperature != null) {
      if (s.temperature >= 20 && s.temperature <= 24) stats._tempOkMinutes = (stats._tempOkMinutes || 0) + 0.5;
      else stats._tempOkMinutes = 0;
    }
    // Освещённость
    if (s.light != null) {
      if (s.light >= 300) stats._lightOkMinutes = (stats._lightOkMinutes || 0) + 0.5;
      else stats._lightOkMinutes = 0;
    }
    // Шум
    if (s.noise != null) {
      if (s.noise < 55) stats._quietMinutes = (stats._quietMinutes || 0) + 0.5;
      else stats._quietMinutes = 0;
    }
    // Влажность
    if (s.humidity != null) {
      if (s.humidity >= 40 && s.humidity <= 60) stats._humOkMinutes = (stats._humOkMinutes || 0) + 0.5;
      else stats._humOkMinutes = 0;
    }
    // Wellness Index
    const wiEl = document.getElementById('wellness-index');
    const wi = wiEl ? parseFloat(wiEl.textContent) : 0;
    if (wi >= 80) stats._highWellnessMinutes = (stats._highWellnessMinutes || 0) + 0.5;
    else stats._highWellnessMinutes = 0;
    // Давление
    if (s.pressure != null) {
      stats._pressureOk = s.pressure >= 1010 && s.pressure <= 1025;
    }
    // Pomodoro
    stats._pomoCycles = parseInt(localStorage.getItem('nexis-pomo-cycles') || '0', 10);
    // Задачи
    const taskLabel = document.getElementById('task-progress-label');
    if (taskLabel) {
      const m = taskLabel.textContent.match(/(\d+)\s*\/\s*\d+/);
      if (m) stats._tasksDone = parseInt(m[1], 10);
    }
    // Энергия
    stats._energyLevel = parseInt(localStorage.getItem('nexis-energy-level') || '0', 10);
    // Разминка
    stats._stretchDone = localStorage.getItem('nexis-stretch-done-today') === 'true';
    // Стрик
    stats._streakDays = updateStreak();

    saveStats(stats);
    check(stats);
    updateDayScore();

    // ── Обновить ежедневные данные ──
    const daily = loadDailyData();
    if (s.co2 != null && s.co2 >= 1000) daily.co2OverLimit = true;
    // Проверить задачи — все выполнены?
    const taskLabelD = document.getElementById('task-progress-label');
    if (taskLabelD) {
      const mD = taskLabelD.textContent.match(/(\d+)\s*\/\s*(\d+)/);
      if (mD) daily.allTasksDone = parseInt(mD[1], 10) > 0 && parseInt(mD[1], 10) >= parseInt(mD[2], 10);
    }
    // Данные воды уже обновляются кнопкой — не трогаем
    saveDailyData(daily);
    checkDaily(stats);

    // ── Обновить недельные данные ──
    const weekly = loadWeeklyData();
    const todayStr = new Date().toDateString();
    if (!weekly.activeDayDates) weekly.activeDayDates = [];
    if (!weekly.activeDayDates.includes(todayStr)) {
      weekly.activeDayDates.push(todayStr);
    }
    // Pomodoro: берём максимум за сегодня, не накапливаем при каждом вызове
    const todayPomoKey = 'nexis-weekly-pomo-today-' + todayStr;
    const prevPomo = parseInt(localStorage.getItem(todayPomoKey) || '0', 10);
    const curPomo = stats._pomoCycles || 0;
    if (curPomo > prevPomo) {
      weekly.totalPomodoros = (weekly.totalPomodoros || 0) + (curPomo - prevPomo);
      localStorage.setItem(todayPomoKey, curPomo);
    }
    // Накапливаем WI для среднего (раз в 30 вызовов, ~15 мин при 30-сек интервале)
    const wiEl2 = document.getElementById('wellness-index');
    const wi2 = wiEl2 ? parseFloat(wiEl2.textContent) : 0;
    if (wi2 > 0) {
      weekly.wiSum = (weekly.wiSum || 0) + wi2;
      weekly.wiCount = (weekly.wiCount || 0) + 1;
    }
    saveWeeklyData(weekly);
    checkWeekly(stats);
  }

  // ── Инициализация при загрузке ──
  function init() {
    updateStreak();
    const unlocked = loadUnlocked();
    updateBadge(unlocked.length);
    updateDayScore();
    setInterval(updateDayScore, 30000);

    // Отметить сегодня как активный день
    const weekly = loadWeeklyData();
    if (!weekly.activeDayDates) weekly.activeDayDates = [];
    const todayStr = new Date().toDateString();
    if (!weekly.activeDayDates.includes(todayStr)) {
      weekly.activeDayDates.push(todayStr);
      saveWeeklyData(weekly);
    }
    // Обнулить co2OverLimit если новый день (уже обрабатывается loadDailyData)
    loadDailyData();
  }

  return { init, render, check, onSensorUpdate, updateDayScore, calcDayScore, loadDailyData, loadWeeklyData };
})();

window.achievements = achievements;
