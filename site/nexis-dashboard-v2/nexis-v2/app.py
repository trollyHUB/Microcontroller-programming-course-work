"""
NEXIS Wellness Station — Web Dashboard
Flask + SocketIO сервер
Принимает данные с ESP32, хранит в SQLite, отдаёт сайт
"""

from flask import Flask, render_template, jsonify, request, Response
from flask_socketio import SocketIO, emit
import sqlite3
import json
from datetime import datetime, timedelta
import os

app = Flask(__name__)
app.config['SECRET_KEY'] = 'nexis-secret-2026'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

DB_PATH = 'nexis.db'

# ──────────────────────────────────────────
# БАЗА ДАННЫХ
# ──────────────────────────────────────────

def init_db():
    """Создать таблицы если не существуют"""
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
    print("✅ База данных инициализирована")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def save_sensor_data(data: dict):
    """Сохранить показания датчиков"""
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        INSERT INTO sensor_data
            (timestamp, temperature, humidity, co2, light, noise, motion, pressure)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        datetime.now().isoformat(),
        data.get('temperature'),
        data.get('humidity'),
        data.get('co2'),
        data.get('light'),
        data.get('noise'),
        data.get('motion', 0),
        data.get('pressure'),
    ))
    conn.commit()
    conn.close()


def get_latest():
    """Последнее показание"""
    conn = get_db()
    c = conn.cursor()
    row = c.execute(
        'SELECT * FROM sensor_data ORDER BY id DESC LIMIT 1'
    ).fetchone()
    conn.close()
    return dict(row) if row else {}


def get_history(hours: int = 24):
    """История за N часов, максимум 200 точек"""
    since = (datetime.now() - timedelta(hours=hours)).isoformat()
    conn = get_db()
    c = conn.cursor()
    rows = c.execute('''
        SELECT timestamp, temperature, humidity, co2, light, noise
        FROM sensor_data
        WHERE timestamp > ?
        ORDER BY timestamp ASC
    ''', (since,)).fetchall()
    conn.close()

    result = [dict(r) for r in rows]

    # Прореживаем если точек слишком много
    if len(result) > 200:
        step = len(result) // 200
        result = result[::step]

    return result


def get_today_stats():
    """Статистика за сегодня"""
    today = datetime.now().replace(hour=0, minute=0, second=0).isoformat()
    conn = get_db()
    c = conn.cursor()
    row = c.execute('''
        SELECT
            AVG(temperature) as avg_temp,
            MIN(temperature) as min_temp,
            MAX(temperature) as max_temp,
            AVG(humidity)    as avg_humidity,
            AVG(co2)         as avg_co2,
            MAX(co2)         as max_co2,
            AVG(light)       as avg_light,
            COUNT(*)         as total_readings
        FROM sensor_data
        WHERE timestamp > ?
    ''', (today,)).fetchone()

    # Pomodoro циклов сегодня
    pomo = c.execute(
        'SELECT COUNT(*) as cnt FROM pomodoro_log WHERE timestamp > ? AND type = "work"',
        (today,)
    ).fetchone()

    conn.close()

    stats = dict(row) if row else {}
    stats['pomodoro_today'] = pomo['cnt'] if pomo else 0
    return stats


def save_alert(level: str, message: str):
    """Сохранить алерт"""
    conn = get_db()
    c = conn.cursor()
    c.execute(
        'INSERT INTO alerts_log (timestamp, level, message) VALUES (?, ?, ?)',
        (datetime.now().isoformat(), level, message)
    )
    conn.commit()
    conn.close()


def get_recent_alerts(limit: int = 10):
    """Последние алерты"""
    conn = get_db()
    c = conn.cursor()
    rows = c.execute(
        'SELECT * FROM alerts_log ORDER BY id DESC LIMIT ?', (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ──────────────────────────────────────────
# ПРОВЕРКА ПОРОГОВЫХ ЗНАЧЕНИЙ
# ──────────────────────────────────────────

THRESHOLDS = {
    'co2':         {'warn': 800,  'bad': 1200, 'unit': 'ppm',  'name': 'CO2'},
    'temperature': {'warn': 27,   'bad': 30,   'unit': '°C',   'name': 'Температура'},
    'humidity':    {'warn': 65,   'bad': 75,   'unit': '%',    'name': 'Влажность'},
    'light':       {'warn': 150,  'bad': 50,   'unit': 'lux',  'name': 'Освещённость'},
    'noise':       {'warn': 55,   'bad': 70,   'unit': 'dB',   'name': 'Шум'},
}

def check_thresholds(data: dict) -> list:
    """Вернуть список алертов если что-то выходит за пороги"""
    alerts = []
    co2 = data.get('co2', 0)
    if co2 and co2 > THRESHOLDS['co2']['bad']:
        alerts.append({'level': 'danger', 'message': f"CO2 критически высокий: {co2:.0f} ppm"})
    elif co2 and co2 > THRESHOLDS['co2']['warn']:
        alerts.append({'level': 'warning', 'message': f"CO2 повышен: {co2:.0f} ppm. Рекомендуется проветрить."})

    light = data.get('light', 999)
    if light and light < THRESHOLDS['light']['bad']:
        alerts.append({'level': 'danger',  'message': f"Освещённость очень низкая: {light:.0f} lux"})
    elif light and light < THRESHOLDS['light']['warn']:
        alerts.append({'level': 'warning', 'message': f"Освещённость низкая: {light:.0f} lux. Включите свет."})

    temp = data.get('temperature', 0)
    if temp and temp > THRESHOLDS['temperature']['bad']:
        alerts.append({'level': 'danger',  'message': f"Температура высокая: {temp:.1f}°C"})
    elif temp and temp > THRESHOLDS['temperature']['warn']:
        alerts.append({'level': 'warning', 'message': f"Температура повышена: {temp:.1f}°C"})

    noise = data.get('noise', 0)
    if noise and noise > THRESHOLDS['noise']['bad']:
        alerts.append({'level': 'danger',  'message': f"Уровень шума высокий: {noise:.0f} dB"})
    elif noise and noise > THRESHOLDS['noise']['warn']:
        alerts.append({'level': 'warning', 'message': f"Шумно: {noise:.0f} dB"})

    return alerts


# ──────────────────────────────────────────
# МАРШРУТЫ — СТРАНИЦЫ
# ──────────────────────────────────────────

@app.route('/favicon.ico')
def favicon():
    return Response(status=204)

@app.route('/')
def index():
    return render_template('index.html')


# ──────────────────────────────────────────
# МАРШРУТЫ — API (для ESP32 и браузера)
# ──────────────────────────────────────────

@app.route('/api/data', methods=['POST'])
def receive_data():
    """ESP32 шлёт сюда данные каждые 10 секунд"""
    try:
        data = request.get_json(force=True)
        if not data:
            return jsonify({'error': 'No JSON'}), 400

        # Сохраняем в БД
        save_sensor_data(data)

        # Проверяем пороги
        new_alerts = check_thresholds(data)
        for alert in new_alerts:
            save_alert(alert['level'], alert['message'])

        # Рассылаем всем браузерам через WebSocket
        payload = {**data, 'timestamp': datetime.now().isoformat()}
        socketio.emit('sensor_update', payload)

        if new_alerts:
            socketio.emit('new_alerts', new_alerts)

        return jsonify({'status': 'ok', 'alerts': len(new_alerts)}), 200

    except Exception as e:
        print(f"❌ Ошибка /api/data: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/sensors', methods=['GET'])
def get_sensors():
    """Последнее показание для браузера"""
    data = get_latest()
    return jsonify(data)


@app.route('/api/history', methods=['GET'])
def get_history_api():
    """История для графиков"""
    hours = int(request.args.get('hours', 24))
    hours = min(hours, 168)  # Максимум 7 дней
    return jsonify(get_history(hours))


@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Статистика за сегодня"""
    return jsonify(get_today_stats())


@app.route('/api/alerts', methods=['GET'])
def get_alerts():
    """Последние алерты"""
    limit = int(request.args.get('limit', 10))
    return jsonify(get_recent_alerts(limit))


@app.route('/api/pomodoro', methods=['POST'])
def pomodoro_event():
    """ESP32 сообщает о событии Pomodoro"""
    data = request.get_json(force=True)
    event_type = data.get('type', 'work')
    duration = data.get('duration', 25)

    conn = get_db()
    conn.execute(
        'INSERT INTO pomodoro_log (timestamp, type, duration) VALUES (?, ?, ?)',
        (datetime.now().isoformat(), event_type, duration)
    )
    conn.commit()
    conn.close()

    socketio.emit('pomodoro_event', {
        'type': event_type,
        'duration': duration,
        'timestamp': datetime.now().isoformat()
    })
    return jsonify({'status': 'ok'})


@app.route('/api/status', methods=['GET'])
def server_status():
    """Статус сервера — для ESP32 чтобы проверить связь"""
    conn = get_db()
    count = conn.execute('SELECT COUNT(*) FROM sensor_data').fetchone()[0]
    conn.close()
    return jsonify({
        'status': 'online',
        'server': 'NEXIS Dashboard v1.0',
        'total_readings': count,
        'time': datetime.now().isoformat()
    })


# ──────────────────────────────────────────
# WEBSOCKET СОБЫТИЯ
# ──────────────────────────────────────────

@socketio.on('connect')
def on_connect():
    print(f"🔌 Браузер подключился")
    # Сразу отправляем последние данные
    latest = get_latest()
    if latest:
        emit('sensor_update', latest)

@socketio.on('disconnect')
def on_disconnect():
    print(f"❌ Браузер отключился")


# ──────────────────────────────────────────
# ЗАПУСК
# ──────────────────────────────────────────

if __name__ == '__main__':
    init_db()
    print("=" * 50)
    print("  NEXIS Wellness Station — Web Dashboard")
    print("=" * 50)
    print(f"  Сайт: http://localhost:5000")
    print(f"  API:  http://localhost:5000/api/status")
    print("=" * 50)
    socketio.run(app, host='0.0.0.0', port=5000, debug=False)
