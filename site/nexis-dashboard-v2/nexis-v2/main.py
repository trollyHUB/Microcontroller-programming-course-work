"""
NEXIS Wellness Station — Web Dashboard v2
FastAPI + python-socketio + SQLite
Запуск: uvicorn main:socket_app --host 0.0.0.0 --port 5000 --reload
Документация API: http://localhost:5000/docs
"""

from fastapi import FastAPI, Request, Query
from fastapi.responses import StreamingResponse, Response
from contextlib import asynccontextmanager
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from typing import Optional
import socketio
import sqlite3
import csv
import io
import os
from datetime import datetime, timedelta

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

try:
    import httpx
    _HTTPX_AVAILABLE = True
except ImportError:
    _HTTPX_AVAILABLE = False

try:
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    _SCHEDULER_AVAILABLE = True
except ImportError:
    _SCHEDULER_AVAILABLE = False

# ──────────────────────────────────────────
# КОНФИГУРАЦИЯ TELEGRAM
# ──────────────────────────────────────────
TELEGRAM_TOKEN   = os.getenv('NEXIS_TELEGRAM_TOKEN', '')
TELEGRAM_CHAT_ID = os.getenv('NEXIS_TELEGRAM_CHAT_ID', '')

# ──────────────────────────────────────────
# SOCKETIO + FASTAPI SETUP
# ──────────────────────────────────────────

sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    print("=" * 50)
    print("  NEXIS Wellness Station v2 - FastAPI")
    print("=" * 50)
    print("  Site:    http://localhost:5000")
    print("  API:     http://localhost:5000/api/status")
    print("  Swagger: http://localhost:5000/docs")
    print("=" * 50)
    if _SCHEDULER_AVAILABLE:
        scheduler = AsyncIOScheduler()
        scheduler.add_job(daily_summary_job, 'cron', hour=18, minute=0)
        scheduler.start()
        print("  Scheduler: ежедневная сводка в 18:00")
    yield

app = FastAPI(
    title="NEXIS Wellness Station",
    description="IoT dashboard для мониторинга рабочего места на базе ESP32",
    version="2.0.0",
    lifespan=lifespan,
)

app.mount('/static', StaticFiles(directory='static'), name='static')
templates = Jinja2Templates(directory='templates')

# ASGI-приложение для uvicorn (socketio оборачивает FastAPI)
socket_app = socketio.ASGIApp(sio, app)

DB_PATH = 'nexis.db'

# ──────────────────────────────────────────
# PYDANTIC МОДЕЛИ
# ──────────────────────────────────────────

class SensorData(BaseModel):
    temperature:     Optional[float] = None
    humidity:        Optional[float] = None
    co2:             Optional[float] = None
    light:           Optional[float] = None
    noise:           Optional[float] = None
    motion:          Optional[int]   = None
    pressure:        Optional[float] = None
    work_time_today: Optional[int]   = None  # секунды за столом сегодня (PIR)

class PomodoroEvent(BaseModel):
    type:     str = 'work'
    duration: int = 25

# ──────────────────────────────────────────
# БАЗА ДАННЫХ
# ──────────────────────────────────────────

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS sensor_data (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp       TEXT    NOT NULL,
            temperature     REAL,
            humidity        REAL,
            co2             REAL,
            light           REAL,
            noise           REAL,
            motion          INTEGER,
            pressure        REAL,
            work_time_today INTEGER DEFAULT 0
        )
    ''')
    # Добавить поле work_time_today в существующую БД (безопасно — игнорирует если уже есть)
    try:
        c.execute('ALTER TABLE sensor_data ADD COLUMN work_time_today INTEGER DEFAULT 0')
    except Exception:
        pass
    c.execute('''
        CREATE TABLE IF NOT EXISTS pomodoro_log (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            type      TEXT NOT NULL,
            duration  INTEGER NOT NULL
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS alerts_log (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            level     TEXT NOT NULL,
            message   TEXT NOT NULL
        )
    ''')
    conn.commit()
    conn.close()
    print("[OK] База данных инициализирована")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def save_sensor_data(data: SensorData):
    conn = get_db()
    conn.execute('''
        INSERT INTO sensor_data
            (timestamp, temperature, humidity, co2, light, noise, motion, pressure, work_time_today)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        datetime.now().isoformat(),
        data.temperature, data.humidity, data.co2,
        data.light, data.noise, data.motion, data.pressure,
        data.work_time_today,
    ))
    conn.commit()
    conn.close()


def get_latest() -> dict:
    conn = get_db()
    row = conn.execute('SELECT * FROM sensor_data ORDER BY id DESC LIMIT 1').fetchone()
    conn.close()
    return dict(row) if row else {}


def get_history(hours: int = 24) -> list:
    since = (datetime.now() - timedelta(hours=hours)).isoformat()
    conn = get_db()
    rows = conn.execute('''
        SELECT timestamp, temperature, humidity, co2, light, noise, motion, pressure
        FROM sensor_data WHERE timestamp > ? ORDER BY timestamp ASC
    ''', (since,)).fetchall()
    conn.close()
    result = [dict(r) for r in rows]
    if len(result) > 200:
        step = len(result) // 200
        result = result[::step]
    return result


def get_history_full(hours: int = 24) -> list:
    """История без прореживания — для экспорта CSV"""
    since = (datetime.now() - timedelta(hours=hours)).isoformat()
    conn = get_db()
    rows = conn.execute('''
        SELECT timestamp, temperature, humidity, co2, light, noise, motion, pressure
        FROM sensor_data WHERE timestamp > ? ORDER BY timestamp ASC
    ''', (since,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_today_stats() -> dict:
    today = datetime.now().replace(hour=0, minute=0, second=0).isoformat()
    conn = get_db()
    row = conn.execute('''
        SELECT
            AVG(temperature)         as avg_temp,
            MIN(temperature)         as min_temp,
            MAX(temperature)         as max_temp,
            AVG(humidity)            as avg_humidity,
            AVG(co2)                 as avg_co2,
            MAX(co2)                 as max_co2,
            AVG(light)               as avg_light,
            MAX(work_time_today)     as work_time_today,
            COUNT(*)                 as total_readings
        FROM sensor_data WHERE timestamp > ?
    ''', (today,)).fetchone()
    pomo = conn.execute(
        'SELECT COUNT(*) as cnt FROM pomodoro_log WHERE timestamp > ? AND type = "work"',
        (today,)
    ).fetchone()
    conn.close()
    stats = dict(row) if row else {}
    stats['pomodoro_today'] = pomo['cnt'] if pomo else 0
    return stats


def save_alert(level: str, message: str):
    conn = get_db()
    conn.execute(
        'INSERT INTO alerts_log (timestamp, level, message) VALUES (?, ?, ?)',
        (datetime.now().isoformat(), level, message)
    )
    conn.commit()
    conn.close()


def get_recent_alerts(limit: int = 10) -> list:
    conn = get_db()
    rows = conn.execute(
        'SELECT * FROM alerts_log ORDER BY id DESC LIMIT ?', (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ──────────────────────────────────────────
# ПРОВЕРКА ПОРОГОВЫХ ЗНАЧЕНИЙ
# ──────────────────────────────────────────

THRESHOLDS = {
    'co2':         {'warn': 800,  'bad': 1200, 'unit': 'ppm', 'name': 'CO2'},
    'temperature': {'warn': 27,   'bad': 30,   'unit': '°C',  'name': 'Температура'},
    'humidity':    {'warn': 65,   'bad': 75,   'unit': '%',   'name': 'Влажность'},
    'light':       {'warn': 150,  'bad': 50,   'unit': 'lux', 'name': 'Освещённость'},
    'noise':       {'warn': 55,   'bad': 70,   'unit': 'dB',  'name': 'Шум'},
}

def check_thresholds(data: SensorData) -> list:
    alerts = []
    co2 = data.co2 or 0
    if co2 > THRESHOLDS['co2']['bad']:
        alerts.append({'level': 'danger',  'message': f"CO2 критически высокий: {co2:.0f} ppm"})
    elif co2 > THRESHOLDS['co2']['warn']:
        alerts.append({'level': 'warning', 'message': f"CO2 повышен: {co2:.0f} ppm. Проветрите!"})

    light = data.light or 999
    if 0 < light < THRESHOLDS['light']['bad']:
        alerts.append({'level': 'danger',  'message': f"Освещённость очень низкая: {light:.0f} lux"})
    elif 0 < light < THRESHOLDS['light']['warn']:
        alerts.append({'level': 'warning', 'message': f"Освещённость низкая: {light:.0f} lux"})

    temp = data.temperature or 0
    if temp > THRESHOLDS['temperature']['bad']:
        alerts.append({'level': 'danger',  'message': f"Температура высокая: {temp:.1f}°C"})
    elif temp > THRESHOLDS['temperature']['warn']:
        alerts.append({'level': 'warning', 'message': f"Температура повышена: {temp:.1f}°C"})

    noise = data.noise or 0
    if noise > THRESHOLDS['noise']['bad']:
        alerts.append({'level': 'danger',  'message': f"Уровень шума высокий: {noise:.0f} dB"})
    elif noise > THRESHOLDS['noise']['warn']:
        alerts.append({'level': 'warning', 'message': f"Шумно: {noise:.0f} dB"})

    return alerts


# ──────────────────────────────────────────
# TELEGRAM
# ──────────────────────────────────────────

async def send_telegram(message: str):
    if not _HTTPX_AVAILABLE or not TELEGRAM_TOKEN or not TELEGRAM_CHAT_ID:
        return
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            await client.post(url, json={
                'chat_id': TELEGRAM_CHAT_ID,
                'text': f"⚠️ NEXIS Wellness Station\n{message}",
                'parse_mode': 'HTML',
            })
    except Exception:
        pass


# ──────────────────────────────────────────
# APSCHEDULER — ЕЖЕДНЕВНАЯ СВОДКА
# ──────────────────────────────────────────

async def daily_summary_job():
    stats = get_today_stats()
    pomodoros = stats.get('pomodoro_today', 0)
    max_co2   = stats.get('max_co2') or 0
    readings  = stats.get('total_readings', 0)
    work_secs = stats.get('work_time_today') or 0
    work_h    = work_secs // 3600
    work_m    = (work_secs % 3600) // 60
    msg = (
        f"📊 <b>Итоги дня — {datetime.now().strftime('%d.%m.%Y')}</b>\n"
        f"🍅 Pomodoro: {pomodoros} сессий\n"
        f"🖥 За столом: {work_h}ч {work_m}м\n"
        f"🌬 CO₂ макс: {max_co2:.0f} ppm\n"
        f"📈 Измерений: {readings}"
    )
    await send_telegram(msg)


# ──────────────────────────────────────────
# WELLNESS INDEX
# ──────────────────────────────────────────

def calc_wellness(s: dict) -> dict:
    co2   = s.get('co2')   or 400
    temp  = s.get('temperature') or 22
    hum   = s.get('humidity')    or 50
    light = s.get('light')       or 400
    noise = s.get('noise')       or 40

    score_co2   = 100 if co2 < 600   else 80 if co2 < 800   else 50 if co2 < 1000  else 20
    score_temp  = 100 if 20 <= temp <= 25 else 70 if 18 <= temp <= 27 else 30
    score_hum   = 100 if 40 <= hum  <= 60 else 70 if 30 <= hum  <= 70 else 30
    score_light = 100 if 300 <= light <= 700 else 70 if light >= 150 else 30
    score_noise = 100 if noise < 40  else 80 if noise < 55  else 50 if noise < 70  else 20

    index = round((score_co2 + score_temp + score_hum + score_light + score_noise) / 5)
    if index > 80:
        level = 'excellent'
    elif index > 60:
        level = 'good'
    elif index > 40:
        level = 'fair'
    else:
        level = 'poor'
    return {
        'index': index,
        'level': level,
        'components': {
            'air': score_co2, 'temperature': score_temp,
            'humidity': score_hum, 'light': score_light, 'noise': score_noise,
        },
    }


# ──────────────────────────────────────────
# УМНЫЕ РЕКОМЕНДАЦИИ
# ──────────────────────────────────────────

def get_recommendations(s: dict) -> list:
    tips = []
    co2   = s.get('co2')   or 0
    temp  = s.get('temperature') or 22
    hum   = s.get('humidity')    or 50
    light = s.get('light')       or 400
    noise = s.get('noise')       or 40

    if co2 > 1200:
        tips.append({'level': 'danger',  'icon': '🚨', 'text': f'CO₂ критически высокий ({co2:.0f} ppm)! Срочно проветрите!'})
    elif co2 > 1000:
        tips.append({'level': 'warning', 'icon': '🪟', 'text': f'CO₂ повышен ({co2:.0f} ppm) — откройте окно'})
    elif co2 > 800:
        tips.append({'level': 'info',    'icon': '💨', 'text': f'CO₂ немного повышен ({co2:.0f} ppm) — проветрите скоро'})

    if light < 50:
        tips.append({'level': 'warning', 'icon': '💡', 'text': f'Очень темно ({light:.0f} lux) — включите освещение'})
    elif light < 150:
        tips.append({'level': 'info',    'icon': '🔆', 'text': f'Освещённость низкая ({light:.0f} lux) — добавьте свет'})

    if noise > 70:
        tips.append({'level': 'warning', 'icon': '🔇', 'text': f'Очень шумно ({noise:.0f} dB) — наденьте наушники'})
    elif noise > 55:
        tips.append({'level': 'info',    'icon': '🎧', 'text': f'Шумно ({noise:.0f} dB) — наушники помогут сосредоточиться'})

    if temp > 27:
        tips.append({'level': 'warning', 'icon': '🌡', 'text': f'Жарко ({temp:.1f}°C) — включите вентиляцию или кондиционер'})
    elif temp < 18:
        tips.append({'level': 'warning', 'icon': '🧥', 'text': f'Холодно ({temp:.1f}°C) — оденьтесь теплее'})

    if hum < 30:
        tips.append({'level': 'info', 'icon': '💧', 'text': f'Воздух очень сухой ({hum:.0f}%) — используйте увлажнитель'})
    elif hum > 70:
        tips.append({'level': 'info', 'icon': '🚿', 'text': f'Высокая влажность ({hum:.0f}%) — улучшите вентиляцию'})

    if not tips:
        tips.append({'level': 'ok', 'icon': '✅', 'text': 'Условия на рабочем месте отличные!'})

    return tips[:3]  # не более 3 рекомендаций


# ──────────────────────────────────────────
# МАРШРУТЫ — СТРАНИЦЫ
# ──────────────────────────────────────────

@app.get('/favicon.ico', include_in_schema=False)
async def favicon():
    return Response(status_code=204)

@app.get('/', include_in_schema=False)
async def index(request: Request):
    return templates.TemplateResponse(request, 'index.html')


# ──────────────────────────────────────────
# API — ДАННЫЕ ДАТЧИКОВ
# ──────────────────────────────────────────

@app.post('/api/data', summary="Приём данных от ESP32", tags=["ESP32"])
async def receive_data(data: SensorData):
    """ESP32 отправляет сюда JSON с показаниями датчиков каждые 10 секунд."""
    save_sensor_data(data)
    new_alerts = check_thresholds(data)
    for alert in new_alerts:
        save_alert(alert['level'], alert['message'])

    payload = {**data.model_dump(), 'timestamp': datetime.now().isoformat()}
    await sio.emit('sensor_update', payload)

    if new_alerts:
        await sio.emit('new_alerts', new_alerts)
        for alert in new_alerts:
            if alert['level'] == 'danger':
                await send_telegram(f"🚨 {alert['message']}")

    return {'status': 'ok', 'alerts': len(new_alerts)}


@app.get('/api/sensors', summary="Последнее показание датчиков", tags=["Данные"])
async def get_sensors():
    """Возвращает последнюю запись из БД."""
    return get_latest()


@app.get('/api/history', summary="История за N часов", tags=["Данные"])
async def get_history_api(hours: int = Query(default=24, ge=1, le=168)):
    """История показаний для графиков (макс. 200 точек, до 7 дней)."""
    return get_history(hours)


@app.get('/api/stats', summary="Статистика за сегодня", tags=["Данные"])
async def get_stats():
    """Средние значения, максимумы и количество измерений за текущий день."""
    return get_today_stats()


@app.get('/api/alerts', summary="Последние алерты", tags=["Данные"])
async def get_alerts(limit: int = Query(default=10, ge=1, le=100)):
    """Возвращает последние N алертов."""
    return get_recent_alerts(limit)


@app.get('/api/status', summary="Статус сервера", tags=["Система"])
async def server_status():
    """Проверка связи для ESP32 и мониторинга."""
    conn = get_db()
    count = conn.execute('SELECT COUNT(*) FROM sensor_data').fetchone()[0]
    conn.close()
    return {
        'status': 'online',
        'server': 'NEXIS Dashboard v2.0 (FastAPI)',
        'total_readings': count,
        'time': datetime.now().isoformat(),
        'telegram_configured': bool(TELEGRAM_TOKEN and TELEGRAM_CHAT_ID),
    }


# ──────────────────────────────────────────
# API — POMODORO
# ──────────────────────────────────────────

@app.post('/api/pomodoro', summary="Событие Pomodoro", tags=["Pomodoro"])
async def pomodoro_event(event: PomodoroEvent):
    """Логирует завершённый Pomodoro цикл (от ESP32 или браузера)."""
    conn = get_db()
    conn.execute(
        'INSERT INTO pomodoro_log (timestamp, type, duration) VALUES (?, ?, ?)',
        (datetime.now().isoformat(), event.type, event.duration)
    )
    conn.commit()
    conn.close()

    await sio.emit('pomodoro_event', {
        'type': event.type,
        'duration': event.duration,
        'timestamp': datetime.now().isoformat(),
    })
    return {'status': 'ok'}


@app.get('/api/pomodoro/stats', summary="Статистика Pomodoro за сегодня", tags=["Pomodoro"])
async def pomodoro_stats():
    """Сколько рабочих и перерывных сессий сегодня, суммарные минуты."""
    today = datetime.now().date().isoformat()
    conn = get_db()
    rows = conn.execute(
        '''SELECT type, COUNT(*) as count, SUM(duration) as total_mins
           FROM pomodoro_log WHERE timestamp > ? GROUP BY type''',
        (today,)
    ).fetchall()
    conn.close()
    result = {}
    for r in rows:
        result[r['type']] = {'count': r['count'], 'total_mins': r['total_mins']}
    return result


# ──────────────────────────────────────────
# API — TELEGRAM (ручная отправка)
# ──────────────────────────────────────────

class TelegramSendRequest(BaseModel):
    message: str

@app.post('/api/telegram/send', summary="Отправить сообщение в Telegram", tags=["Система"])
async def telegram_send(req: TelegramSendRequest):
    """Отправляет произвольное сообщение через настроенного Telegram-бота."""
    if not TELEGRAM_TOKEN or not TELEGRAM_CHAT_ID:
        return {'status': 'error', 'detail': 'Telegram не настроен'}
    await send_telegram(req.message)
    return {'status': 'ok'}


# ──────────────────────────────────────────
# API — ЭКСПОРТ
# ──────────────────────────────────────────

@app.get('/api/export/csv', summary="Экспорт данных в CSV", tags=["Экспорт"])
async def export_csv(hours: int = Query(default=24, ge=1, le=720)):
    """Скачать показания датчиков в CSV (совместим с Excel на русской локали)."""
    rows = get_history_full(hours)
    # BOM для корректного UTF-8 в Excel + разделитель ";" для русской локали
    output = io.StringIO()
    output.write('﻿')  # UTF-8 BOM
    fieldnames = ['timestamp', 'temperature', 'humidity', 'co2', 'light', 'noise', 'motion', 'pressure']
    headers_ru = ['Дата/Время', 'Температура °C', 'Влажность %', 'CO2 ppm',
                  'Освещённость lux', 'Шум dB', 'Движение', 'Давление hPa']
    writer = csv.writer(output, delimiter=';')
    writer.writerow(headers_ru)
    for row in rows:
        writer.writerow([row.get(f, '') for f in fieldnames])
    output.seek(0)
    filename = f"nexis_data_{hours}h.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type='text/csv; charset=utf-8-sig',
        headers={'Content-Disposition': f'attachment; filename="{filename}"'},
    )


@app.delete('/api/history/clear', summary="Очистить историю датчиков", tags=["Данные"])
async def clear_history():
    """Удалить все записи из таблицы sensor_data."""
    conn = get_db()
    conn.execute('DELETE FROM sensor_data')
    conn.commit()
    conn.close()
    return {'status': 'ok', 'message': 'История очищена'}


# ──────────────────────────────────────────
# API — WELLNESS & РЕКОМЕНДАЦИИ
# ──────────────────────────────────────────

@app.get('/api/wellness', summary="Wellness Index (0–100)", tags=["Здоровье"])
async def get_wellness():
    """Индекс благополучия рабочего места: CO₂, температура, влажность, свет, шум."""
    s = get_latest()
    if not s:
        return {'index': None, 'level': 'unknown', 'components': {}}
    return calc_wellness(s)


@app.get('/api/recommendations', summary="Умные рекомендации", tags=["Здоровье"])
async def get_recs():
    """До 3 актуальных рекомендаций на основе последних данных датчиков."""
    s = get_latest()
    if not s:
        return []
    return get_recommendations(s)


# ──────────────────────────────────────────
# API — НЕДЕЛЬНАЯ СТАТИСТИКА
# ──────────────────────────────────────────

@app.get('/api/stats/week', summary="Статистика по дням за 7 дней", tags=["Данные"])
async def get_week_stats():
    """Средние значения и Pomodoro по каждому дню за последние 7 дней."""
    conn = get_db()
    rows = conn.execute('''
        SELECT
            DATE(timestamp)  AS day,
            AVG(co2)         AS avg_co2,
            AVG(temperature) AS avg_temp,
            AVG(humidity)    AS avg_hum,
            AVG(light)       AS avg_light,
            MAX(work_time_today) AS work_time,
            COUNT(*)         AS readings
        FROM sensor_data
        WHERE timestamp > datetime('now', '-7 days')
        GROUP BY DATE(timestamp)
        ORDER BY day ASC
    ''').fetchall()
    pomo_rows = conn.execute('''
        SELECT DATE(timestamp) AS day, COUNT(*) AS count
        FROM pomodoro_log
        WHERE timestamp > datetime('now', '-7 days') AND type = 'work'
        GROUP BY DATE(timestamp)
    ''').fetchall()
    conn.close()
    pomo_by_day = {r['day']: r['count'] for r in pomo_rows}
    result = []
    for r in rows:
        d = dict(r)
        d['pomodoros'] = pomo_by_day.get(d['day'], 0)
        result.append(d)
    return result


# ──────────────────────────────────────────
# API — HOME ASSISTANT
# ──────────────────────────────────────────

@app.get('/api/ha-sensor', summary="Home Assistant REST sensor format", tags=["Интеграции"])
async def ha_sensor():
    """
    Данные в формате Home Assistant REST sensor.
    Конфиг HA (configuration.yaml):

    sensor:
      - platform: rest
        name: nexis_co2
        resource: http://YOUR_PC_IP:5000/api/ha-sensor
        value_template: '{{ value_json.co2 }}'
        unit_of_measurement: 'ppm'
      - platform: rest
        name: nexis_temp
        resource: http://YOUR_PC_IP:5000/api/ha-sensor
        value_template: '{{ value_json.temperature }}'
        unit_of_measurement: '°C'
    """
    s = get_latest()
    if not s:
        return {'state': 'unavailable'}
    wellness = calc_wellness(s)
    return {
        'state': 'online',
        'temperature':     s.get('temperature'),
        'humidity':        s.get('humidity'),
        'co2':             s.get('co2'),
        'light':           s.get('light'),
        'noise':           s.get('noise'),
        'pressure':        s.get('pressure'),
        'motion':          bool(s.get('motion')),
        'wellness_index':  wellness['index'],
        'wellness_level':  wellness['level'],
        'last_updated':    s.get('timestamp'),
        'attributes': {
            'friendly_name': 'NEXIS Wellness Station',
            'icon': 'mdi:desktop-tower-monitor',
        },
    }


# ──────────────────────────────────────────
# WEBSOCKET СОБЫТИЯ
# ──────────────────────────────────────────

@sio.on('connect')
async def on_connect(sid, environ):
    print(f"[WS] Browser connected: {sid}")
    latest = get_latest()
    if latest:
        await sio.emit('sensor_update', latest, to=sid)

@sio.on('disconnect')
async def on_disconnect(sid):
    print(f"[WS] Browser disconnected: {sid}")


# ──────────────────────────────────────────
# ТОЧКА ВХОДА (для прямого запуска через python main.py)
# ──────────────────────────────────────────

if __name__ == '__main__':
    import uvicorn
    uvicorn.run('main:socket_app', host='0.0.0.0', port=5000, reload=True)
