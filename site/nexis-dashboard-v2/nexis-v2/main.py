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
from datetime import datetime, timedelta

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
    temperature: Optional[float] = None
    humidity:    Optional[float] = None
    co2:         Optional[float] = None
    light:       Optional[float] = None
    noise:       Optional[float] = None
    motion:      Optional[int]   = None
    pressure:    Optional[float] = None

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
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp   TEXT    NOT NULL,
            temperature REAL,
            humidity    REAL,
            co2         REAL,
            light       REAL,
            noise       REAL,
            motion      INTEGER,
            pressure    REAL
        )
    ''')
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
            (timestamp, temperature, humidity, co2, light, noise, motion, pressure)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        datetime.now().isoformat(),
        data.temperature, data.humidity, data.co2,
        data.light, data.noise, data.motion, data.pressure,
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
            AVG(temperature) as avg_temp,
            MIN(temperature) as min_temp,
            MAX(temperature) as max_temp,
            AVG(humidity)    as avg_humidity,
            AVG(co2)         as avg_co2,
            MAX(co2)         as max_co2,
            AVG(light)       as avg_light,
            COUNT(*)         as total_readings
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
