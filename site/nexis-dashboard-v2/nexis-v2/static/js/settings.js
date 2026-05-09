'use strict';
/* NEXIS Wellness Station v2 — Settings */

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


function doExport() {
  const h = document.getElementById('exportHours')?.value || 24;
  window.location.href = `/api/export/csv?hours=${h}`;
}
window.doExport = doExport;


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


function checkTelegramStatus() {
  fetch('/api/status')
    .then(r => r.json())
    .then(d => {
      const dot  = document.querySelector('#telegram-status .int-dot');
      const text = document.getElementById('telegram-status-text');
      const ok = d.telegram_configured === true;
      if (dot)  { dot.className = 'int-dot ' + (ok ? 'ok' : 'err'); }
      if (text) text.textContent = ok
        ? '✅ Telegram настроен — алерты активны'
        : '⚠ Telegram не настроен — задайте NEXIS_TELEGRAM_TOKEN и NEXIS_TELEGRAM_CHAT_ID';
    })
    .catch(() => {});
}


function printReport() {
  const btn = document.getElementById('printReportBtn');
  if (btn) {
    const origText = btn.querySelector('span:last-child').textContent;
    btn.disabled = true;
    btn.querySelector('span:last-child').textContent = 'Подготовка...';
    setTimeout(() => {
      window.print();
      btn.disabled = false;
      btn.querySelector('span:last-child').textContent = origText;
    }, 250);
  } else {
    window.print();
  }
}
window.printReport = printReport;


// ──────────────────────────────────────────────────
// ФИЧА 17: Push Notifications settings
// ──────────────────────────────────────────────────
const NOTIF_DEFAULTS = { co2Alert: true, pomoFinished: true, stretchReminder: true };

function loadNotifSettings() {
  let cfg = NOTIF_DEFAULTS;
  try { cfg = Object.assign({}, NOTIF_DEFAULTS, JSON.parse(localStorage.getItem('nexis-notif-settings') || '{}')); } catch(e) {}
  const ids  = ['notif-co2', 'notif-pomo', 'notif-stretch'];
  const keys = ['co2Alert', 'pomoFinished', 'stretchReminder'];
  ids.forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) el.checked = cfg[keys[i]];
  });
  return cfg;
}

function saveNotifSettings() {
  const cfg = {
    co2Alert:        document.getElementById('notif-co2')?.checked ?? true,
    pomoFinished:    document.getElementById('notif-pomo')?.checked ?? true,
    stretchReminder: document.getElementById('notif-stretch')?.checked ?? true,
  };
  localStorage.setItem('nexis-notif-settings', JSON.stringify(cfg));
  if (typeof showToast === 'function') showToast('Настройки уведомлений сохранены ✓');
}
window.saveNotifSettings = saveNotifSettings;

function getNotifSetting(key) {
  try {
    const cfg = JSON.parse(localStorage.getItem('nexis-notif-settings') || '{}');
    return cfg[key] !== undefined ? cfg[key] : NOTIF_DEFAULTS[key];
  } catch(e) { return NOTIF_DEFAULTS[key]; }
}
window.getNotifSetting = getNotifSetting;

window._pwaPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  window._pwaPrompt = e;
  const btn = document.getElementById('pwaInstallBtn');
  const st  = document.getElementById('pwaStatus');
  if (btn) btn.style.display = 'inline-flex';
  if (st)  st.textContent = 'Приложение можно установить через кнопку выше.';
});
window.addEventListener('appinstalled', () => {
  const st = document.getElementById('pwaStatus');
  if (st) st.textContent = '✅ Приложение установлено!';
  window._pwaPrompt = null;
});
// Если уже запущено как PWA
if (window.matchMedia('(display-mode: standalone)').matches) {
  setTimeout(() => {
    const st = document.getElementById('pwaStatus');
    if (st) st.textContent = '✅ Вы уже используете NEXIS как приложение.';
  }, 500);
}



