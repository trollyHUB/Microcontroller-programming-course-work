"""
NEXIS Wellness Station — Telegram Bot v2
==========================================
Запуск: python bot.py

Три режима работы:
  ⛔ OFF  — только команды, авто-сообщений нет
  🔶 DEMO — генерирует реалистичные данные (без сервера)
  🟢 LIVE — читает реальные данные с localhost:5000, шлёт алерты

Команды:
  /start      — приветствие + выбор режима
  /mode       — переключить режим
  /status     — текущие показания (с трендом ↑↓→)
  /history    — ASCII-спарклайн CO₂/T/шума за 3 часа
  /forecast   — прогноз CO₂ на 30/60 мин (линейная регрессия)
  /tip        — умный совет на основе данных датчиков
  /pomodoro   — статистика Pomodoro за день
  /digest     — дайджест дня
  /week       — сводка за 7 дней
  /hydration  — трекер воды (8 стаканов в день)
  /alerts     — последние алерты
  /interval   — интервал авторассылки
  /help       — список команд

Авто-функции:
  ☀️  09:00 — утреннее приветствие
  🌙 18:00 — вечерний итог дня
  💧 каждые 45 мин — напоминание о воде (8:00-21:00)
  🪟 кнопка "Проветрить" → таймер 5 мин
"""

import asyncio
import json
import logging
import os
import random
from datetime import datetime, time as dtime, timezone, timedelta
from pathlib import Path

import httpx
from dotenv import load_dotenv
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

# ──────────────────────────────────────────────────
# КОНФИГУРАЦИЯ
# ──────────────────────────────────────────────────
load_dotenv()

BOT_TOKEN  = os.getenv("NEXIS_TELEGRAM_TOKEN", "")
CHAT_ID    = os.getenv("NEXIS_TELEGRAM_CHAT_ID", "")
API_URL    = os.getenv("NEXIS_API_URL", "http://localhost:5000")
STATE_FILE = Path(__file__).parent / "bot_state.json"

# UTC+5 Алматы/Нур-Султан — поменяй на свой часовой пояс
TZ = timezone(timedelta(hours=5))

logging.basicConfig(
    format="%(asctime)s | %(levelname)s | %(message)s",
    level=logging.INFO,
    datefmt="%H:%M:%S",
)
log = logging.getLogger("nexis-bot")

THRESHOLDS = {
    "co2":         {"warn": 800,  "danger": 1200},
    "temperature": {"warn": 27,   "danger": 30},
    "humidity":    {"warn": 65,   "danger": 75},
    "noise":       {"warn": 55,   "danger": 70},
    "light":       {"low_warn": 150, "low_danger": 50},
}

INTERVAL_OPTIONS = [1, 2, 5, 10]  # минуты


# ──────────────────────────────────────────────────
# СОСТОЯНИЕ
# ──────────────────────────────────────────────────
class BotState:
    def __init__(self):
        self.mode: str = "off"
        self.loop_task = None
        self.last_alert_time: dict = {}
        self.demo_tick: int = 0
        self.interval_min: int = 2
        self.hydration_count: int = 0
        self.hydration_goal: int = 8
        self.sensor_history: list = []   # последние 50 показаний для трендов
        self.vent_active: bool = False

state = BotState()


# ──────────────────────────────────────────────────
# ПЕРСИСТЕНТНОСТЬ (сохранение режима между запусками)
# ──────────────────────────────────────────────────
def save_state() -> None:
    try:
        STATE_FILE.write_text(json.dumps({
            "mode":             state.mode,
            "interval_min":     state.interval_min,
            "hydration_count":  state.hydration_count,
        }))
    except Exception:
        pass


def load_state() -> None:
    try:
        if STATE_FILE.exists():
            d = json.loads(STATE_FILE.read_text())
            state.mode            = d.get("mode", "off")
            state.interval_min    = d.get("interval_min", 2)
            state.hydration_count = d.get("hydration_count", 0)
    except Exception:
        pass


# ──────────────────────────────────────────────────
# ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
# ──────────────────────────────────────────────────
def mode_label(m: str) -> str:
    return {"off": "⛔ OFF", "demo": "🔶 DEMO", "live": "🟢 LIVE"}.get(m, m)


def wellness_index(s: dict) -> int:
    co2   = s.get("co2", 400)
    temp  = s.get("temperature", 22)
    hum   = s.get("humidity", 50)
    light = s.get("light", 400)
    noise = s.get("noise", 40)
    sc2 = 100 if co2 < 600  else 80 if co2 < 800  else 50 if co2 < 1000 else 20
    st  = 100 if 20 <= temp <= 25 else 70 if 18 <= temp <= 27 else 30
    sh  = 100 if 40 <= hum  <= 60 else 70 if 30 <= hum  <= 70 else 30
    sl  = 100 if 300 <= light <= 700 else 70 if light >= 150 else 30
    sn  = 100 if noise < 40 else 80 if noise < 55 else 50 if noise < 70 else 20
    return round((sc2 + st + sh + sl + sn) / 5)


def wi_emoji(wi: int) -> str:
    if wi > 80: return "🟢"
    if wi > 60: return "🟡"
    if wi > 40: return "🟠"
    return "🔴"


def alert_level(key: str, val: float) -> str | None:
    th = THRESHOLDS.get(key, {})
    if key == "light":
        if val < th.get("low_danger", 50):  return "danger"
        if val < th.get("low_warn", 150):   return "warn"
        return None
    if "danger" in th and val >= th["danger"]: return "danger"
    if "warn"   in th and val >= th["warn"]:   return "warn"
    return None


def sparkline(values: list) -> str:
    """Список чисел → ASCII блочный спарклайн."""
    if not values:
        return "—"
    blocks = " ▁▂▃▄▅▆▇█"
    mn, mx = min(values), max(values)
    rng = mx - mn or 1
    return "".join(blocks[round((v - mn) / rng * 8)] for v in values[-20:])


def trend_arrow(values: list) -> str:
    """↑ ↓ → на основе последних 3 точек."""
    if len(values) < 3:
        return "→"
    delta = values[-1] - values[-3]
    if delta > 10:  return "↑"
    if delta < -10: return "↓"
    return "→"


def linear_forecast(values: list, steps_ahead: int) -> float | None:
    """Линейная регрессия МНК → прогноз через N шагов."""
    n = len(values)
    if n < 5:
        return None
    xs = list(range(n))
    mx = sum(xs) / n
    my = sum(values) / n
    num = sum((x - mx) * (y - my) for x, y in zip(xs, values))
    den = sum((x - mx) ** 2 for x in xs) or 1
    slope = num / den
    return round(my + slope * (n - 1 + steps_ahead - mx))


def co2_label(v: float) -> str:
    if v < 600:  return "🟢 Отлично"
    if v < 800:  return "🟡 Норма"
    if v < 1200: return "🟠 Повышен"
    return "🔴 Критично"


def format_sensors(s: dict) -> str:
    wi = wellness_index(s)
    ts = s.get("timestamp", "")
    time_str = ""
    if ts:
        try:
            time_str = datetime.fromisoformat(ts).strftime("%H:%M:%S")
        except Exception:
            time_str = ts[:19]

    # Тренд CO₂ из истории
    co2_trend = ""
    if len(state.sensor_history) >= 3:
        co2_vals = [p.get("co2", 0) for p in state.sensor_history if p.get("co2")]
        if co2_vals:
            co2_trend = " " + trend_arrow(co2_vals)

    lines = [
        f"📊 <b>Показания датчиков</b>  {time_str}",
        "",
        f"🌿 CO₂:           <b>{s.get('co2', '--'):.0f} ppm</b>{co2_trend}",
        f"🌡 Температура:   <b>{s.get('temperature', '--'):.1f} °C</b>",
        f"💧 Влажность:     <b>{s.get('humidity', '--'):.0f} %</b>",
        f"☀️  Освещённость:  <b>{s.get('light', '--'):.0f} lux</b>",
        f"🔊 Шум:           <b>{s.get('noise', '--'):.1f} dB</b>",
        f"📈 Давление:      <b>{s.get('pressure', '--'):.0f} hPa</b>",
        f"👁 Присутствие:   <b>{'Да ●' if s.get('motion') else 'Нет ○'}</b>",
        "",
        f"{wi_emoji(wi)} <b>Wellness Index: {wi}/100</b>",
    ]
    return "\n".join(lines)


def generate_demo_data() -> dict:
    hour = datetime.now().hour
    t = state.demo_tick
    state.demo_tick += 1
    temp_base = 19 + (hour - 8) * 0.3 if 8 <= hour <= 18 else 20
    temp = round(temp_base + random.uniform(-0.5, 0.5), 1)
    co2_base = 420 + min(t * 2, 350) + random.uniform(-20, 20)
    co2 = round(max(400, co2_base))
    hum = round(45 + random.uniform(-3, 5))
    light_base = 500 if 9 <= hour <= 17 else (200 if 18 <= hour <= 21 else 30)
    light = round(light_base + random.uniform(-50, 50))
    noise = round(38 + (random.uniform(0, 20) if random.random() > 0.8 else random.uniform(0, 5)), 1)
    pressure = round(1013 + random.uniform(-2, 2), 1)
    motion = 1 if random.random() > 0.15 else 0
    return {
        "temperature": temp, "humidity": hum, "co2": co2,
        "light": light, "noise": noise, "pressure": pressure,
        "motion": motion, "timestamp": datetime.now().isoformat(),
    }


def check_alert_messages(sensors: dict) -> list:
    msgs = []
    now = datetime.now()
    checks = {
        "co2":         ("CO₂",         sensors.get("co2"),         "ppm", "🌿"),
        "temperature": ("Температура",  sensors.get("temperature"), "°C",  "🌡"),
        "humidity":    ("Влажность",    sensors.get("humidity"),    "%",   "💧"),
        "noise":       ("Шум",          sensors.get("noise"),       "dB",  "🔊"),
        "light":       ("Освещённость", sensors.get("light"),       "lux", "☀️"),
    }
    for key, (label, val, unit, icon) in checks.items():
        if val is None:
            continue
        lvl = alert_level(key, val)
        if not lvl:
            state.last_alert_time.pop(key, None)
            continue
        last = state.last_alert_time.get(key)
        if last and (now - last).total_seconds() < 300:  # дебаунс 5 мин
            continue
        state.last_alert_time[key] = now
        prefix = "🚨 КРИТИЧНО" if lvl == "danger" else "⚠️ Внимание"
        msgs.append(f"{prefix} — {icon} <b>{label}: {val:.1f} {unit}</b>")
    return msgs


def get_smart_tip(sensors: dict | None) -> str:
    """Умный совет на основе данных датчиков и времени суток."""
    hour = datetime.now().hour
    generic = [
        "💡 Сделай 5-минутную прогулку — концентрация вырастет на 20%",
        "🧘 Попробуй дыхание 4-7-8: вдох 4с, задержка 7с, выдох 8с",
        "📵 Убери телефон на 25 мин — метод Pomodoro увеличивает продуктивность вдвое",
        "🚶 Встань и потянись — сидячая поза дольше 90 мин снижает метаболизм",
        "🎵 Тихая инструментальная музыка помогает сосредоточиться",
        "👁 Правило 20-20-20: каждые 20 мин смотри 20 сек на точку в 20 футах",
    ]
    if not sensors:
        return random.choice(generic)

    co2   = sensors.get("co2", 400)
    temp  = sensors.get("temperature", 22)
    hum   = sensors.get("humidity", 50)
    light = sensors.get("light", 400)

    if co2 > 1200:
        return "🚨 CO₂ критически высокий! Немедленно открой окно на 5-10 минут."
    if co2 > 800:
        return f"🌿 CO₂ {co2:.0f} ppm — пора проветрить. 5 мин свежего воздуха повысят концентрацию."
    if temp > 27:
        return f"🌡 Температура {temp:.1f}°C — слишком тепло. Проветри или включи вентилятор."
    if hum < 35:
        return f"💧 Влажность {hum:.0f}% — воздух пересушен. Выпей воды и проветри."
    if light < 100:
        return f"☀️ Освещённость {light:.0f} lux — слишком темно. Включи настольную лампу."
    if 9 <= hour <= 11:
        return "🌅 Утренние часы — лучшее время для сложных задач. Займись главным прямо сейчас!"
    if 14 <= hour <= 15:
        return "😴 После обеда — естественный спад. Сделай 10-мин перерыв или лёгкую прогулку."
    if hour >= 21:
        return "🌙 Поздно — заканчивай работу. Синий свет экрана нарушает сон."
    return random.choice(generic)


# ──────────────────────────────────────────────────
# ЗАПРОСЫ К API
# ──────────────────────────────────────────────────
async def fetch_sensors() -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.get(f"{API_URL}/api/sensors")
            return r.json() if r.status_code == 200 else None
    except Exception:
        return None


async def fetch_alerts(limit: int = 10) -> list:
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.get(f"{API_URL}/api/alerts?limit={limit}")
            return r.json() if r.status_code == 200 else []
    except Exception:
        return []


async def fetch_stats() -> dict:
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.get(f"{API_URL}/api/stats")
            return r.json() if r.status_code == 200 else {}
    except Exception:
        return {}


async def fetch_history(hours: int = 3) -> list:
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(f"{API_URL}/api/history?hours={hours}")
            return r.json() if r.status_code == 200 else []
    except Exception:
        return []


async def fetch_pomodoro_stats() -> dict:
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.get(f"{API_URL}/api/pomodoro/stats")
            return r.json() if r.status_code == 200 else {}
    except Exception:
        return {}


async def get_current_sensors() -> dict | None:
    """Получить текущие данные в зависимости от режима."""
    if state.mode == "demo":
        return generate_demo_data()
    if state.mode == "live":
        return await fetch_sensors()
    return None


# ──────────────────────────────────────────────────
# КЛАВИАТУРЫ
# ──────────────────────────────────────────────────
def mode_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton("⛔ OFF",  callback_data="mode_off"),
            InlineKeyboardButton("🔶 DEMO", callback_data="mode_demo"),
            InlineKeyboardButton("🟢 LIVE", callback_data="mode_live"),
        ],
        [
            InlineKeyboardButton("📊 Статус",   callback_data="cmd_status"),
            InlineKeyboardButton("📋 Дайджест", callback_data="cmd_digest"),
            InlineKeyboardButton("💡 Совет",    callback_data="cmd_tip"),
        ],
    ])


def quick_keyboard(show_vent: bool = False) -> InlineKeyboardMarkup:
    row1 = [
        InlineKeyboardButton("🔄 Обновить", callback_data="cmd_status"),
        InlineKeyboardButton("💡 Совет",    callback_data="cmd_tip"),
        InlineKeyboardButton("⚙️ Режим",    callback_data="show_modes"),
    ]
    rows = [row1]
    if show_vent:
        rows.append([InlineKeyboardButton("🪟 Проветрить 5 мин ⏱", callback_data="vent_start")])
    return InlineKeyboardMarkup(rows)


def interval_keyboard() -> InlineKeyboardMarkup:
    btns = []
    for m in INTERVAL_OPTIONS:
        mark = "✅ " if m == state.interval_min else ""
        btns.append(InlineKeyboardButton(f"{mark}{m} мин", callback_data=f"interval_{m}"))
    return InlineKeyboardMarkup([btns, [InlineKeyboardButton("◀️ Назад", callback_data="show_modes")]])


def hydration_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([[
        InlineKeyboardButton("💧 +1 стакан", callback_data="hydration_add"),
        InlineKeyboardButton("🔄 Сброс",     callback_data="hydration_reset"),
    ]])


# ──────────────────────────────────────────────────
# ФОНОВЫЕ ЗАДАЧИ
# ──────────────────────────────────────────────────
async def demo_loop(app: Application) -> None:
    log.info("DEMO loop started (every %d min)", state.interval_min)
    while state.mode == "demo":
        sensors = generate_demo_data()
        state.sensor_history.append(sensors)
        if len(state.sensor_history) > 50:
            state.sensor_history.pop(0)
        alerts  = check_alert_messages(sensors)
        co2_hi  = sensors.get("co2", 0) > 800
        text    = format_sensors(sensors)
        text   += f"\n\n<i>🔶 DEMO · {datetime.now().strftime('%H:%M')} · каждые {state.interval_min} мин</i>"
        try:
            await app.bot.send_message(chat_id=CHAT_ID, text=text, parse_mode="HTML",
                                       reply_markup=quick_keyboard(show_vent=co2_hi))
            for msg in alerts:
                await app.bot.send_message(chat_id=CHAT_ID, text=msg, parse_mode="HTML")
        except Exception as e:
            log.warning("Demo send error: %s", e)
        await asyncio.sleep(state.interval_min * 60)
    log.info("DEMO loop stopped")


async def live_loop(app: Application) -> None:
    log.info("LIVE loop started (every %d min)", state.interval_min)
    tick = 0
    summary_every = max(1, 5 // state.interval_min)
    while state.mode == "live":
        sensors = await fetch_sensors()
        if sensors:
            state.sensor_history.append(sensors)
            if len(state.sensor_history) > 50:
                state.sensor_history.pop(0)
            for msg in check_alert_messages(sensors):
                try:
                    await app.bot.send_message(chat_id=CHAT_ID, text=msg, parse_mode="HTML")
                except Exception as e:
                    log.warning("Live alert error: %s", e)
            if tick % summary_every == 0:
                co2_hi = sensors.get("co2", 0) > 800
                text = format_sensors(sensors)
                text += f"\n\n<i>🟢 LIVE · {datetime.now().strftime('%H:%M')} · каждые {state.interval_min} мин</i>"
                try:
                    await app.bot.send_message(chat_id=CHAT_ID, text=text, parse_mode="HTML",
                                               reply_markup=quick_keyboard(show_vent=co2_hi))
                except Exception as e:
                    log.warning("Live status error: %s", e)
        else:
            if tick % 5 == 0:
                try:
                    await app.bot.send_message(
                        chat_id=CHAT_ID,
                        text="⚠️ <b>NEXIS:</b> Нет связи с сервером (localhost:5000)\n"
                             "Проверь что uvicorn запущен.",
                        parse_mode="HTML",
                    )
                except Exception:
                    pass
        tick += 1
        await asyncio.sleep(state.interval_min * 60)
    log.info("LIVE loop stopped")


async def set_mode(new_mode: str, app: Application) -> str:
    if state.mode == new_mode:
        return f"Режим уже {mode_label(new_mode)}"
    if state.loop_task and not state.loop_task.done():
        state.loop_task.cancel()
        try:
            await state.loop_task
        except asyncio.CancelledError:
            pass
        state.loop_task = None
    state.mode = new_mode
    state.last_alert_time.clear()
    save_state()
    if new_mode == "demo":
        state.loop_task = asyncio.create_task(demo_loop(app))
        return (f"✅ Режим: {mode_label(new_mode)}\n"
                f"Данные каждые {state.interval_min} мин. Без ESP32.")
    if new_mode == "live":
        state.loop_task = asyncio.create_task(live_loop(app))
        return (f"✅ Режим: {mode_label(new_mode)}\n"
                f"Алерты + сводка каждые {state.interval_min} мин.")
    return f"✅ Режим: {mode_label(new_mode)}\nАвто-сообщения отключены."


# ──────────────────────────────────────────────────
# ЗАПЛАНИРОВАННЫЕ ЗАДАЧИ (job_queue)
# ──────────────────────────────────────────────────
async def job_morning(ctx: ContextTypes.DEFAULT_TYPE) -> None:
    sensors = await get_current_sensors()
    wi  = wellness_index(sensors) if sensors else 0
    co2 = f"{sensors.get('co2', '--'):.0f}" if sensors else "--"
    tmp = f"{sensors.get('temperature', '--'):.1f}" if sensors else "--"

    # Сброс воды на новый день
    state.hydration_count = 0
    save_state()

    text = (
        f"☀️ <b>Доброе утро!</b> — {datetime.now(TZ).strftime('%d.%m.%Y')}\n\n"
        f"🏢 <b>Рабочее место:</b>\n"
        f"   🌿 CO₂:          <b>{co2} ppm</b>\n"
        f"   🌡 Температура:  <b>{tmp} °C</b>\n"
        f"   {wi_emoji(wi)} Wellness Index: <b>{wi}/100</b>\n\n"
        f"💪 Хорошего продуктивного дня!\n"
        f"💧 Счётчик воды сброшен — норма 8 стаканов"
    )
    try:
        await ctx.bot.send_message(chat_id=CHAT_ID, text=text, parse_mode="HTML",
                                   reply_markup=hydration_keyboard())
    except Exception as e:
        log.warning("Morning greeting error: %s", e)


async def job_evening(ctx: ContextTypes.DEFAULT_TYPE) -> None:
    stats    = await fetch_stats()
    pomo     = stats.get("pomodoro_today", 0)
    avg_co2  = stats.get("avg_co2")
    work_s   = stats.get("work_time_today") or 0
    work_h, work_m = work_s // 3600, (work_s % 3600) // 60
    sensors  = await get_current_sensors()
    wi       = wellness_index(sensors) if sensors else 0

    if wi > 80:    assessment = "Отличный день! Условия были идеальными. 🏆"
    elif wi > 60:  assessment = "Хороший день — условия в норме. 👍"
    elif wi > 40:  assessment = "Средний день — завтра проветри с утра."
    else:          assessment = "Сложные условия сегодня. Позаботься о вентиляции!"

    text = (
        f"🌙 <b>Итог дня</b> — {datetime.now(TZ).strftime('%d.%m.%Y')}\n"
        "━━━━━━━━━━━━━━━━━━━\n"
        f"🍅 Pomodoro:      <b>{pomo} циклов</b>\n"
        f"⏱ За столом:     <b>{work_h}ч {work_m}м</b>\n"
        f"💧 Воды выпито:  <b>{state.hydration_count} стаканов</b>\n"
    )
    if avg_co2:
        text += f"🌿 CO₂ средний:  <b>{avg_co2:.0f} ppm</b>\n"
    text += (
        "━━━━━━━━━━━━━━━━━━━\n"
        f"{wi_emoji(wi)} WI: <b>{wi}/100</b>\n\n"
        f"💬 {assessment}\n"
        f"<i>🤖 NEXIS Wellness Station</i>"
    )
    try:
        await ctx.bot.send_message(chat_id=CHAT_ID, text=text, parse_mode="HTML",
                                   reply_markup=quick_keyboard())
    except Exception as e:
        log.warning("Evening summary error: %s", e)


async def job_hydration(ctx: ContextTypes.DEFAULT_TYPE) -> None:
    hour = datetime.now(TZ).hour
    if hour < 8 or hour >= 21:
        return  # не беспокоить ночью
    if state.hydration_count >= state.hydration_goal:
        return  # норма уже выполнена
    remaining = state.hydration_goal - state.hydration_count
    text = (
        f"💧 <b>Напоминание о воде</b>\n\n"
        f"Выпито: <b>{state.hydration_count}/{state.hydration_goal} стаканов</b>\n"
        f"Осталось: <b>{remaining}</b>\n\n"
        "Выпей стакан воды прямо сейчас! 🥤"
    )
    try:
        await ctx.bot.send_message(chat_id=CHAT_ID, text=text, parse_mode="HTML",
                                   reply_markup=hydration_keyboard())
    except Exception as e:
        log.warning("Hydration reminder error: %s", e)


async def job_ventilation(ctx: ContextTypes.DEFAULT_TYPE) -> None:
    state.vent_active = False
    try:
        await ctx.bot.send_message(
            chat_id=CHAT_ID,
            text="🪟 <b>Пора закрыть окно!</b>\n\nПрошло 5 минут — воздух обновился. 👍",
            parse_mode="HTML",
            reply_markup=quick_keyboard(),
        )
    except Exception as e:
        log.warning("Ventilation reminder error: %s", e)


async def job_resume_mode(ctx: ContextTypes.DEFAULT_TYPE) -> None:
    """Возобновить режим после перезапуска бота."""
    if state.mode in ("demo", "live"):
        log.info("Resuming %s mode from saved state", state.mode)
        fn = demo_loop if state.mode == "demo" else live_loop
        state.loop_task = asyncio.create_task(fn(ctx.application))


# ──────────────────────────────────────────────────
# ОБРАБОТЧИК ТЕКСТОВЫХ СООБЩЕНИЙ
# ──────────────────────────────────────────────────
ABOUT_TEXT = (
    "🤖 <b>Я — NEXIS Wellness Station Bot</b>\n\n"
    "Помогаю мониторить рабочее место и заботиться о здоровье "
    "с помощью IoT-датчиков ESP32.\n\n"
    "📡 <b>Что я отслеживаю:</b>\n"
    "🌿 CO₂ — норма &lt;800 ppm (влияет на концентрацию!)\n"
    "🌡 Температура — комфорт 20-25°C\n"
    "💧 Влажность — оптимум 40-60%\n"
    "☀️ Освещённость — рекомендуется 300-700 lux\n"
    "🔊 Шум — безопасно до 55 dB\n"
    "📈 Атмосферное давление — hPa\n"
    "👁 Присутствие — PIR датчик HC-SR501\n\n"
    "⚡ <b>Мои возможности:</b>\n"
    "• 3 режима: OFF / DEMO / LIVE\n"
    "• Авто-рассылка с настраиваемым интервалом (1/2/5/10 мин)\n"
    "• Умные алерты с дебаунсом 5 мин\n"
    "• ASCII-спарклайн изменений ▁▂▃▅▇█\n"
    "• Прогноз CO₂ на 30/60 мин (линейная регрессия)\n"
    "• Тренды ↑↓→ прямо в статусе\n"
    "• Умные советы на основе датчиков\n"
    "• Pomodoro статистика и дайджест дня\n"
    "• Сводка за 7 дней с лучшим днём\n"
    "• Трекер воды (8 стаканов, напоминание каждые 45 мин)\n"
    "• Таймер проветривания (5 мин, кнопкой)\n"
    "• ☀️ 09:00 утреннее приветствие\n"
    "• 🌙 18:00 вечерний итог дня\n"
    "• Сохраняю режим между перезапусками\n\n"
    "📋 Все команды: /help\n"
    "🚀 Начать: /start"
)

# Словарь ключевых слов → ответ (None = вызвать /help)
CHAT_KEYWORDS: list[tuple[tuple, str | None]] = [
    (("привет", "hello", "hi", "здравствуй", "хай", "салем", "ку"),
     "👋 <b>Привет!</b>\n\nЯ NEXIS Bot — слежу за твоим рабочим местом: CO₂, температура, "
     "влажность и многое другое.\n\nНапиши /start чтобы начать, или /help для команд!"),

    (("кто ты", "кто вы", "о себе", "расскажи", "что умеешь", "что ты", "what"),
     ABOUT_TEXT),

    (("помощь", "help", "команды", "что делать", "как пользоваться"),
     None),  # → /help

    (("co2", "со2", "углекислый", "воздух", "проветр"),
     "🌿 <b>CO₂ — углекислый газ</b>\n\n"
     "Нормы концентрации:\n"
     "• &lt;600 ppm — идеально 🟢\n"
     "• 600-800 ppm — норма 🟡\n"
     "• 800-1200 ppm — повышен, проветри 🟠\n"
     "• &gt;1200 ppm — критично! 🔴\n\n"
     "Высокий CO₂ снижает концентрацию на 15-50%.\n\n"
     "Текущий уровень: /status"),

    (("pomodoro", "помодоро", "помидор", "таймер", "фокус"),
     "🍅 <b>Pomodoro техника</b>\n\n"
     "NEXIS отслеживает рабочие сессии:\n"
     "• 25 мин работы → 5 мин перерыв\n"
     "• После 4 циклов — длинный перерыв 15-30 мин\n"
     "• Норма: 4-8 помодоро в день\n\n"
     "Статистика: /pomodoro"),

    (("вода", "гидрат", "пить", "стакан", "жажда"),
     "💧 <b>Гидратация</b>\n\n"
     "Рекомендуется 8 стаканов (2 литра) в день.\n"
     "При температуре &gt;26°C или влажности &lt;40% — больше!\n"
     "Напоминаю каждые 45 мин с 8:00 до 21:00.\n\n"
     "Трекер: /hydration"),

    (("прогноз", "forecast", "предсказ", "через", "будет"),
     "🔮 Прогноз CO₂ на 30 и 60 минут вперёд:\n/forecast"),

    (("совет", "tip", "рекоменд", "посоветуй"),
     "💡 Умный совет на основе данных датчиков:\n/tip"),

    (("режим", "mode", "demo", "live", "вкл", "выкл", "переключ"),
     "⚙️ <b>Режимы работы:</b>\n\n"
     "⛔ <b>OFF</b>  — только команды по запросу\n"
     "🔶 <b>DEMO</b> — симуляция без ESP32\n"
     "🟢 <b>LIVE</b> — реальные данные с датчиков\n\n"
     "Переключить: /mode"),

    (("статус", "status", "данные", "показания", "сейчас", "температур", "влажност"),
     "📊 Текущие показания датчиков: /status"),

    (("история", "history", "график", "спарклайн"),
     "📈 ASCII-график изменений за последние часы: /history"),

    (("неделя", "week", "7 дней", "итог", "сводка"),
     "📅 Сводка за 7 дней с лучшим днём недели: /week"),

    (("проветр", "окно", "вентил"),
     "🪟 Кнопка «Проветрить 5 мин» появляется в /status когда CO₂ &gt;800 ppm.\n"
     "Таймер напомнит закрыть окно через 5 минут!"),

    (("давлени", "pressure", "погода", "голов"),
     "📈 Атмосферное давление отображается в /status.\n"
     "Резкое падение &gt;4 hPa/час = предупреждение о метеочувствительности."),

    (("интервал", "частота", "interval", "каждые"),
     f"⏱ Настроить интервал авторассылки (1/2/5/10 мин): /interval\n"
     f"Сейчас: {state.interval_min} мин"),

    (("спасибо", "thanks", "ок", "окей", "ok", "хорошо", "понял", "👍"),
     "😊 Всегда пожалуйста! Если нужна помощь — /help"),

    (("утро", "вечер", "расписани", "schedule", "напоминани"),
     "📅 <b>Запланированные сообщения:</b>\n\n"
     "☀️ 09:00 — утреннее приветствие + состояние рабочего места\n"
     "🌙 18:00 — итог дня (Pomodoro, CO₂, время за столом)\n"
     "💧 каждые 45 мин — напоминание о воде (8:00-21:00)"),
]


async def cmd_chat(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    msg = update.message.text.lower()
    for keywords, response in CHAT_KEYWORDS:
        if any(kw in msg for kw in keywords):
            if response is None:
                await cmd_help(update, ctx)
            else:
                await update.message.reply_text(response, parse_mode="HTML",
                                                reply_markup=quick_keyboard())
            return
    # Не распознано — показать общее описание
    await update.message.reply_text(ABOUT_TEXT, parse_mode="HTML",
                                    reply_markup=mode_keyboard())


# ──────────────────────────────────────────────────
# КОМАНДЫ
# ──────────────────────────────────────────────────
async def cmd_start(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    text = (
        "👋 <b>Привет! Я NEXIS Wellness Station Bot</b>\n\n"
        "Мониторю твоё рабочее место: CO₂, температуру, влажность,\n"
        "освещённость, шум и давление через ESP32-датчики.\n\n"
        f"<b>Текущий режим:</b> {mode_label(state.mode)}\n\n"
        "💬 Просто напиши мне что-нибудь — расскажу о возможностях!\n"
        "📋 Список команд: /help\n\n"
        "Выбери режим работы:"
    )
    await update.message.reply_text(text, parse_mode="HTML", reply_markup=mode_keyboard())


async def cmd_help(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    text = (
        "📖 <b>NEXIS Bot — Команды</b>\n\n"
        "📊 <b>Данные:</b>\n"
        "/status     — показания датчиков с трендом ↑↓\n"
        "/history    — ASCII-спарклайн за 3 часа\n"
        "/forecast   — прогноз CO₂ на 30/60 мин\n"
        "/alerts     — последние алерты\n\n"
        "📈 <b>Аналитика:</b>\n"
        "/digest     — дайджест дня\n"
        "/week       — сводка за 7 дней\n"
        "/pomodoro   — статистика Pomodoro\n\n"
        "🏥 <b>Здоровье:</b>\n"
        "/tip        — умный совет\n"
        "/hydration  — трекер воды\n\n"
        "⚙️ <b>Настройки:</b>\n"
        "/mode       — переключить режим\n"
        "/interval   — интервал авторассылки\n"
        "/start      — главное меню\n"
        "/help       — это сообщение\n\n"
        "<b>Режимы:</b>\n"
        "⛔ OFF · 🔶 DEMO · 🟢 LIVE\n\n"
        "💬 Можно просто написать что-нибудь — отвечу!\n\n"
        f"<i>Сейчас: {mode_label(state.mode)} · интервал {state.interval_min} мин</i>"
    )
    await update.message.reply_text(text, parse_mode="HTML", reply_markup=quick_keyboard())


async def cmd_mode(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    text = (
        f"⚙️ <b>Текущий режим:</b> {mode_label(state.mode)}\n\n"
        "⛔ <b>OFF</b>  — только команды\n"
        "🔶 <b>DEMO</b> — симуляция без ESP32\n"
        "🟢 <b>LIVE</b> — реальные данные + алерты\n\n"
        "Выбери:"
    )
    await update.message.reply_text(text, parse_mode="HTML", reply_markup=mode_keyboard())


async def cmd_status(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    sensors = await get_current_sensors()
    if sensors:
        state.sensor_history.append(sensors)
        if len(state.sensor_history) > 50:
            state.sensor_history.pop(0)
        co2_hi = sensors.get("co2", 0) > 800
        suffix = "\n\n<i>🔶 DEMO-данные</i>" if state.mode == "demo" else "\n\n<i>🟢 Данные с ESP32</i>"
        await update.message.reply_text(
            format_sensors(sensors) + suffix, parse_mode="HTML",
            reply_markup=quick_keyboard(show_vent=co2_hi),
        )
    else:
        await update.message.reply_text(
            "⚠️ <b>Нет данных</b>\n\n"
            "Режим OFF — включи /mode, или убедись что uvicorn запущен:\n"
            "<code>uvicorn main:socket_app --port 5000</code>",
            parse_mode="HTML", reply_markup=mode_keyboard(),
        )


async def cmd_history(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    api_pts = await fetch_history(hours=3)
    pts = api_pts if api_pts else state.sensor_history
    if not pts:
        await update.message.reply_text(
            "📊 Нет данных. Включи DEMO или LIVE режим.", reply_markup=quick_keyboard())
        return

    co2_v  = [p.get("co2", 0)         for p in pts if p.get("co2")]
    tmp_v  = [p.get("temperature", 0) for p in pts if p.get("temperature")]
    noi_v  = [p.get("noise", 0)       for p in pts if p.get("noise")]

    src = "API" if api_pts else "локальная история"
    text = (
        f"📈 <b>История показаний</b>  <i>({src}, {len(pts)} изм.)</i>\n\n"
    )
    if co2_v:
        text += (
            f"🌿 <b>CO₂ (ppm)</b>  {trend_arrow(co2_v)}\n"
            f"<code>{sparkline(co2_v)}</code>\n"
            f"   min {min(co2_v):.0f} · max {max(co2_v):.0f} · сейчас {co2_v[-1]:.0f}\n\n"
        )
    if tmp_v:
        text += (
            f"🌡 <b>Температура (°C)</b>\n"
            f"<code>{sparkline(tmp_v)}</code>\n"
            f"   min {min(tmp_v):.1f} · max {max(tmp_v):.1f}\n\n"
        )
    if noi_v:
        text += (
            f"🔊 <b>Шум (dB)</b>\n"
            f"<code>{sparkline(noi_v)}</code>\n"
            f"   min {min(noi_v):.0f} · max {max(noi_v):.0f}"
        )
    await update.message.reply_text(text, parse_mode="HTML", reply_markup=quick_keyboard())


async def cmd_forecast(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    api_pts = await fetch_history(hours=2)
    pts = api_pts if api_pts else state.sensor_history
    co2_v = [p.get("co2", 0) for p in pts if p.get("co2")]

    if len(co2_v) < 5:
        await update.message.reply_text(
            "🔮 Нужно минимум 5 измерений для прогноза.\n"
            "Включи DEMO или LIVE режим и подожди немного.",
            reply_markup=quick_keyboard(),
        )
        return

    current = co2_v[-1]
    f30 = linear_forecast(co2_v, 6)
    f60 = linear_forecast(co2_v, 12)
    arrow = trend_arrow(co2_v)

    rec = ""
    if f30 and f30 > 1200:
        rec = "\n\n🚨 <b>Срочно:</b> Откройте окно прямо сейчас!"
    elif f30 and f30 > 800:
        rec = "\n\n⚠️ <b>Рекомендация:</b> Проветри сейчас — CO₂ скоро выйдет за норму."

    text = (
        f"🔮 <b>Прогноз CO₂</b>  {arrow}\n\n"
        f"📍 Сейчас:       <b>{current:.0f} ppm</b>  {co2_label(current)}\n"
    )
    if f30:
        text += f"⏱ Через 30 мин:  <b>{f30:.0f} ppm</b>  {co2_label(f30)}\n"
    if f60:
        text += f"⏱ Через 60 мин:  <b>{f60:.0f} ppm</b>  {co2_label(f60)}\n"
    text += f"{rec}\n\n<i>Линейная регрессия по {len(co2_v)} точкам</i>"

    co2_hi = (f30 or 0) > 800
    await update.message.reply_text(text, parse_mode="HTML",
                                    reply_markup=quick_keyboard(show_vent=co2_hi))


async def cmd_tip(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    sensors = await get_current_sensors()
    tip = get_smart_tip(sensors)
    await update.message.reply_text(
        f"💡 <b>Совет NEXIS</b>\n\n{tip}", parse_mode="HTML",
        reply_markup=quick_keyboard(),
    )


async def cmd_pomodoro(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    pomo  = await fetch_pomodoro_stats()
    stats = await fetch_stats()
    done  = pomo.get("completed_today", stats.get("pomodoro_today", 0))
    mins  = pomo.get("total_work_minutes", done * 25)
    brks  = pomo.get("breaks_today", 0)

    if done == 0:    note = "😴 Пока нет помодоро — начни первый!"
    elif done < 4:   note = f"🔥 Хороший старт! Ещё {4 - done} до нормы."
    elif done < 8:   note = "💪 Продуктивный день!"
    else:            note = "🏆 Исключительная продуктивность!"

    text = (
        f"🍅 <b>Pomodoro — сегодня</b>\n"
        "━━━━━━━━━━━━━━━━━━━\n"
        f"✅ Завершено:  <b>{done} циклов</b>\n"
        f"⏱ Работал:    <b>{mins} мин</b>\n"
        f"☕ Перерывов: <b>{brks}</b>\n"
        "━━━━━━━━━━━━━━━━━━━\n"
        f"{note}\n\n"
        f"<i>Норма: 4-8 помодоро = 100-200 мин в день</i>"
    )
    await update.message.reply_text(text, parse_mode="HTML", reply_markup=quick_keyboard())


async def cmd_digest(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    stats  = await fetch_stats()
    now    = datetime.now(TZ)
    pomo   = stats.get("pomodoro_today", 0)
    avg_co2= stats.get("avg_co2")
    max_co2= stats.get("max_co2")
    avg_tmp= stats.get("avg_temp")
    rdgs   = stats.get("total_readings", 0)
    work_s = stats.get("work_time_today") or 0
    wh, wm = work_s // 3600, (work_s % 3600) // 60
    sensors= await get_current_sensors()
    wi     = wellness_index(sensors) if sensors else 0

    text = (
        f"📋 <b>Дайджест дня</b> — {now.strftime('%d.%m.%Y')}\n"
        "━━━━━━━━━━━━━━━━━━━\n"
        f"🍅 Pomodoro:       <b>{pomo} циклов</b>\n"
        f"⏱ За столом:      <b>{wh}ч {wm}м</b>\n"
        f"💧 Воды выпито:   <b>{state.hydration_count}/{state.hydration_goal} стаканов</b>\n"
        f"📈 Измерений:      <b>{rdgs}</b>\n"
        "━━━━━━━━━━━━━━━━━━━\n"
    )
    if avg_co2: text += f"🌿 CO₂ средний:   <b>{avg_co2:.0f} ppm</b>\n"
    if max_co2: text += f"🌿 CO₂ максимум:  <b>{max_co2:.0f} ppm</b>\n"
    if avg_tmp: text += f"🌡 Температура:   <b>{avg_tmp:.1f} °C</b>\n"
    text += (
        "━━━━━━━━━━━━━━━━━━━\n"
        f"{wi_emoji(wi)} WI: <b>{wi}/100</b>\n"
        f"\n<i>🤖 NEXIS Wellness Station</i>"
    )
    await update.message.reply_text(text, parse_mode="HTML", reply_markup=quick_keyboard())


async def cmd_week(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text("⏳ Загружаю данные за 7 дней...", parse_mode="HTML")
    pts = await fetch_history(hours=168)
    if not pts:
        await update.message.reply_text(
            "📊 Нет данных за неделю.\n"
            "В LIVE режиме данные накапливаются постепенно.",
            reply_markup=quick_keyboard(),
        )
        return

    by_day: dict[str, list] = {}
    for p in pts:
        ts = p.get("timestamp", "")
        try:
            day = datetime.fromisoformat(ts).strftime("%d.%m")
            by_day.setdefault(day, []).append(p)
        except Exception:
            pass

    if not by_day:
        await update.message.reply_text("📊 Нет данных.", reply_markup=quick_keyboard())
        return

    lines = ["📅 <b>Сводка за 7 дней</b>\n"]
    best_day, best_wi = None, 0
    for day, day_pts in sorted(by_day.items()):
        co2_avg = sum(p.get("co2", 0) for p in day_pts) / len(day_pts)
        wi_avg  = round(sum(wellness_index(p) for p in day_pts) / len(day_pts))
        lines.append(
            f"{wi_emoji(wi_avg)} <b>{day}</b>  WI:{wi_avg}  "
            f"CO₂:{co2_avg:.0f}ppm  ({len(day_pts)} изм.)"
        )
        if wi_avg > best_wi:
            best_wi, best_day = wi_avg, day

    if best_day:
        lines.append(f"\n🏆 Лучший день: <b>{best_day}</b> — WI {best_wi}/100")

    await update.message.reply_text("\n".join(lines), parse_mode="HTML",
                                    reply_markup=quick_keyboard())


async def cmd_hydration(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    pct = min(100, round(state.hydration_count / state.hydration_goal * 100))
    filled = round(pct / 10)
    bar = "💧" * filled + "○" * (10 - filled)
    remaining = max(0, state.hydration_goal - state.hydration_count)
    note = "✅ Норма выполнена! Отличная работа!" if not remaining else \
           f"Осталось: <b>{remaining} стакана(ов)</b>\nНапоминание каждые 45 мин (8:00-21:00)"
    text = (
        f"💧 <b>Трекер воды</b>\n\n"
        f"{bar}\n"
        f"<b>{state.hydration_count} / {state.hydration_goal} стаканов</b> ({pct}%)\n\n"
        f"{note}"
    )
    await update.message.reply_text(text, parse_mode="HTML", reply_markup=hydration_keyboard())


async def cmd_alerts(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    alerts = await fetch_alerts()
    if not alerts:
        text = "✅ <b>Алертов нет</b> — все показатели в норме!" if state.mode != "demo" else \
               "ℹ️ <b>DEMO:</b> история алертов на сервере.\nЗапусти uvicorn для /alerts в LIVE."
    else:
        lines = ["🔔 <b>Последние алерты:</b>\n"]
        for a in alerts[:8]:
            icon = "🚨" if a.get("level") == "danger" else "⚠️"
            ts = a.get("timestamp", "")[:16].replace("T", " ")
            lines.append(f"{icon} {a.get('message', '?')}\n   <i>{ts}</i>")
        text = "\n".join(lines)
    await update.message.reply_text(text, parse_mode="HTML", reply_markup=quick_keyboard())


async def cmd_interval(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    text = (
        f"⏱ <b>Интервал авторассылки</b>\n\n"
        f"Сейчас: <b>{state.interval_min} мин</b>\n"
        f"Режим: {mode_label(state.mode)}\n\n"
        "Выбери новый интервал:"
    )
    await update.message.reply_text(text, parse_mode="HTML", reply_markup=interval_keyboard())


# ──────────────────────────────────────────────────
# CALLBACK — Inline кнопки
# ──────────────────────────────────────────────────
async def on_callback(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    data  = query.data

    # Переключение режима
    if data.startswith("mode_"):
        new_mode = data[5:]
        result   = await set_mode(new_mode, ctx.application)
        text = (
            f"⚙️ <b>Управление режимом</b>\n\n"
            f"{result}\n\n"
            f"<b>Активный режим:</b> {mode_label(state.mode)}"
        )
        await query.edit_message_text(text, parse_mode="HTML", reply_markup=mode_keyboard())

    # Статус
    elif data == "cmd_status":
        sensors = await get_current_sensors()
        if sensors:
            state.sensor_history.append(sensors)
            if len(state.sensor_history) > 50:
                state.sensor_history.pop(0)
            co2_hi = sensors.get("co2", 0) > 800
            suffix = "\n\n<i>🔶 DEMO</i>" if state.mode == "demo" else "\n\n<i>🟢 ESP32</i>"
            text = format_sensors(sensors) + suffix
            await query.edit_message_text(text, parse_mode="HTML",
                                          reply_markup=quick_keyboard(show_vent=co2_hi))
        else:
            await query.edit_message_text(
                "⚠️ Нет данных — включи режим DEMO или LIVE",
                parse_mode="HTML", reply_markup=mode_keyboard(),
            )

    # Дайджест
    elif data == "cmd_digest":
        stats   = await fetch_stats()
        sensors = await get_current_sensors()
        wi      = wellness_index(sensors) if sensors else 0
        now     = datetime.now(TZ)
        text = (
            f"📋 <b>Дайджест</b> — {now.strftime('%d.%m.%Y %H:%M')}\n"
            f"🍅 Pomodoro:  <b>{stats.get('pomodoro_today', 0)}</b>\n"
            f"💧 Вода:      <b>{state.hydration_count}/{state.hydration_goal}</b>\n"
            f"{wi_emoji(wi)} WI:    <b>{wi}/100</b>\n"
            f"📈 Измерений: <b>{stats.get('total_readings', 0)}</b>"
        )
        await query.edit_message_text(text, parse_mode="HTML", reply_markup=quick_keyboard())

    # Совет
    elif data == "cmd_tip":
        sensors = await get_current_sensors()
        tip = get_smart_tip(sensors)
        await query.edit_message_text(
            f"💡 <b>Совет NEXIS</b>\n\n{tip}", parse_mode="HTML",
            reply_markup=quick_keyboard(),
        )

    # Показать меню режимов
    elif data == "show_modes":
        text = (
            f"⚙️ <b>Режим:</b> {mode_label(state.mode)}\n\n"
            "⛔ OFF · 🔶 DEMO · 🟢 LIVE\n\nВыбери:"
        )
        await query.edit_message_text(text, parse_mode="HTML", reply_markup=mode_keyboard())

    # Интервал
    elif data.startswith("interval_"):
        mins = int(data[9:])
        state.interval_min = mins
        save_state()
        if state.mode != "off":
            await set_mode(state.mode, ctx.application)
        text = (
            f"✅ Интервал: <b>{mins} мин</b>\n"
            f"Режим: {mode_label(state.mode)}"
        )
        await query.edit_message_text(text, parse_mode="HTML", reply_markup=interval_keyboard())

    # Кнопка проветривания
    elif data == "vent_start":
        if state.vent_active:
            await query.answer("⏳ Таймер уже активен!", show_alert=True)
            return
        state.vent_active = True
        ctx.job_queue.run_once(job_ventilation, when=300)
        await query.edit_message_text(
            "🪟 <b>Таймер запущен!</b>\n\n"
            "Открой окно — через <b>5 минут</b> напомню закрыть.\n\n"
            "<i>CO₂ снизится, концентрация вырастет.</i>",
            parse_mode="HTML", reply_markup=quick_keyboard(),
        )

    # Трекер воды: +1 стакан
    elif data == "hydration_add":
        state.hydration_count += 1
        save_state()
        pct = min(100, round(state.hydration_count / state.hydration_goal * 100))
        filled = round(pct / 10)
        bar = "💧" * filled + "○" * (10 - filled)
        remaining = max(0, state.hydration_goal - state.hydration_count)
        note = "✅ Норма выполнена! Молодец! 🎉" if not remaining else \
               f"Осталось: <b>{remaining}</b>"
        text = (
            f"💧 <b>Трекер воды</b>\n\n"
            f"{bar}\n"
            f"<b>{state.hydration_count} / {state.hydration_goal}</b> ({pct}%)\n\n{note}"
        )
        await query.edit_message_text(text, parse_mode="HTML", reply_markup=hydration_keyboard())

    # Трекер воды: сброс
    elif data == "hydration_reset":
        state.hydration_count = 0
        save_state()
        await query.edit_message_text(
            "💧 <b>Трекер сброшен</b>\n\n"
            "○○○○○○○○○○\n<b>0 / 8 стаканов</b>\n\nНачинаем заново! 💪",
            parse_mode="HTML", reply_markup=hydration_keyboard(),
        )


# ──────────────────────────────────────────────────
# ЗАПУСК
# ──────────────────────────────────────────────────
def main() -> None:
    if not BOT_TOKEN:
        print("❌ NEXIS_TELEGRAM_TOKEN не задан в .env!")
        return
    if not CHAT_ID:
        print("❌ NEXIS_TELEGRAM_CHAT_ID не задан в .env!")
        return

    load_state()

    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("  🤖 NEXIS Wellness Station Bot v2")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f"  Токен:    {BOT_TOKEN[:8]}...{BOT_TOKEN[-4:]}")
    print(f"  Chat ID:  {CHAT_ID}")
    print(f"  API:      {API_URL}")
    print(f"  Режим:    {mode_label(state.mode)} (сохранён)")
    print(f"  Интервал: {state.interval_min} мин")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("  Команды: /start /mode /status /history /forecast")
    print("           /tip /pomodoro /digest /week /hydration")
    print("           /alerts /interval /help")
    print("  Остановка: Ctrl+C")
    print()

    app = Application.builder().token(BOT_TOKEN).build()

    # ── Команды ──
    app.add_handler(CommandHandler("start",     cmd_start))
    app.add_handler(CommandHandler("help",      cmd_help))
    app.add_handler(CommandHandler("mode",      cmd_mode))
    app.add_handler(CommandHandler("status",    cmd_status))
    app.add_handler(CommandHandler("history",   cmd_history))
    app.add_handler(CommandHandler("forecast",  cmd_forecast))
    app.add_handler(CommandHandler("tip",       cmd_tip))
    app.add_handler(CommandHandler("pomodoro",  cmd_pomodoro))
    app.add_handler(CommandHandler("digest",    cmd_digest))
    app.add_handler(CommandHandler("week",      cmd_week))
    app.add_handler(CommandHandler("hydration", cmd_hydration))
    app.add_handler(CommandHandler("alerts",    cmd_alerts))
    app.add_handler(CommandHandler("interval",  cmd_interval))
    app.add_handler(CallbackQueryHandler(on_callback))
    # ── Текстовый чат ──
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, cmd_chat))

    # ── Расписание ──
    jq = app.job_queue
    jq.run_daily(job_morning,    time=dtime(9,  0, tzinfo=TZ))
    jq.run_daily(job_evening,    time=dtime(18, 0, tzinfo=TZ))
    jq.run_repeating(job_hydration, interval=45 * 60, first=45 * 60)
    # Возобновить режим после перезапуска
    jq.run_once(job_resume_mode, when=3)

    print("✅ Бот запущен! Напиши /start в Telegram.")
    app.run_polling(allowed_updates=["message", "callback_query"])


if __name__ == "__main__":
    main()
