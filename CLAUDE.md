# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**NEXIS Wellness Station** — IoT-станция мониторинга здоровья и продуктивности на рабочем месте.  
Курсовая работа по дисциплине PM3304 «Программирование микроконтроллеров» (ЕНУ им. Л.Н. Гумилёва, защита июнь 2026).

Система состоит из двух частей:
1. **ESP32 firmware** — читает датчики, отображает на LCD, управляет Pomodoro, отправляет данные на сервер
2. **Web Dashboard** — FastAPI сервер + браузерный SPA, принимает данные от ESP32, хранит в SQLite, показывает графики в реальном времени

---

## Структура репозитория

```
NEXIS-Wellness-Complete/
├── esp32/                    — ESP32 PlatformIO проект
│   ├── platformio.ini
│   └── src/                  — исходный код прошивки (C++)
├── site/
│   └── nexis-dashboard-v2/
│       └── nexis-v2/         — веб-дашборд (основная рабочая директория)
│           ├── main.py       — FastAPI + socketio сервер
│           ├── nexis.db      — SQLite БД (создаётся автоматически)
│           ├── static/
│           │   ├── css/style.css
│           │   └── js/app.js — весь frontend JS (~1400 строк, SPA)
│           └── templates/index.html
└── docs/
    ├── NEXIS_Wellness_Station/ — документация проекта
    └── Docs/                   — методические материалы
```

---

## Запуск

### Веб-дашборд

```bash
cd site/nexis-dashboard-v2/nexis-v2
uvicorn main:socket_app --host 0.0.0.0 --port 5000 --reload
```

- Дашборд: http://localhost:5000  
- Swagger API: http://localhost:5000/docs  
- Статус: http://localhost:5000/api/status

### ESP32 прошивка (PlatformIO)

```bash
cd esp32
pio run --target upload        # сборка и загрузка
pio device monitor --baud 115200  # серийный монитор
pio run                        # только сборка без загрузки
```

---

## Аппаратная часть

### Основные датчики

| Датчик | Что измеряет | Интерфейс | GPIO | Питание |
|--------|-------------|-----------|------|---------|
| **BME280** ⭐ | Температура + Влажность + Давление | I2C (0x76) | SDA=21, SCL=22 | 3.3V |
| DHT11 (доп.) | Температура + Влажность | 1-Wire | GPIO4 | 3.3V |
| **Winsen ZM106-VOC** ⭐ | CO₂ / VOC | UART 9600 | RX=16, TX=17 | **5V** |
| MQ-135 (доп.) | CO₂ аналоговый | ADC | GPIO36 | **5V** |
| BH1750 | Освещённость | I2C (0x23) | SDA=21, SCL=22 | 3.3V |
| PIR HC-SR501 | Присутствие | Digital | GPIO27 | **5V** |
| KY-037 | Шум | ADC | GPIO39 | 3.3V |

### Индикация и управление

| Устройство | GPIO | Питание |
|-----------|------|---------|
| **LCD 1602** ⭐ (дисплей) | I2C (0x27), SDA=21, SCL=22 | **5V** |
| RGB LED (R/G/B) | GPIO13/12/14 | 3.3V |
| Зуммер | GPIO25 | 3.3V |
| Кнопки (Mode/OK) | GPIO32/33 | — |

I2C шина (GPIO21/22): BME280 `0x76`, BH1750 `0x23`, LCD 1602 `0x27`

---

## Архитектура веб-дашборда

```
ESP32 → POST /api/data → FastAPI → SQLite
                              ↓
                       WebSocket emit
                              ↓
                         Браузер SPA
```

### Backend (main.py)

- `FastAPI` + `python-socketio` (ASGI), запускается через `socket_app = socketio.ASGIApp(sio, app)`
- SQLite таблицы: `sensor_data`, `pomodoro_log`, `alerts_log`
- Пороги алертов: CO₂ warn/danger 800/1200 ppm, Температура 27/30°C, Влажность 65/75%, Свет 150/50 lux, Шум 55/70 dB

### API endpoints

| Метод | URL | Назначение |
|-------|-----|-----------|
| POST | `/api/data` | Приём данных от ESP32, триггер WebSocket |
| GET | `/api/sensors` | Последнее показание |
| GET | `/api/history?hours=24` | История (макс. 200 точек, до 7 дней) |
| GET | `/api/stats` | Статистика за сегодня |
| GET | `/api/alerts?limit=10` | Последние алерты |
| GET | `/api/status` | Статус сервера |
| POST | `/api/pomodoro` | Лог Pomodoro события |
| GET | `/api/pomodoro/stats` | Pomodoro статистика за день |
| GET | `/api/export/csv?hours=24` | Экспорт CSV (UTF-8 BOM, разделитель `;`) |
| DELETE | `/api/history/clear` | Очистка истории |

### Frontend (static/js/app.js)

Один файл — весь SPA (~1400 строк). Ключевые структуры:

- `CFG` — константы (цвета, пороги, тексты)
- `state` — глобальное состояние: `{ mode, sensors, chartData, activeMetric }`
- `state.mode` — `'off'` / `'demo'` / `'live'`
- Страницы: `dashboard`, `sensors`, `analytics`, `pomodoro`, `settings`, `about`
- `sparkCharts` / `sparkData` — мини-графики в тайлах (Chart.js, последние 20 точек)
- `state.chartData` — кольцевой буфер до 200 точек для главного графика и демо-аналитики
- localStorage: `nexis-theme`, `nexis-temp-unit` (`C`/`F`), `nexis-demo-interval` (мс), `nexis-pomo-cycles`

Demo-режим генерирует реалистичные данные без ESP32. Analytics в demo-режиме читает `state.chartData` (не API).

---

## ESP32 прошивка — структура

```
esp32/src/
├── config.h   — WiFi SSID/password, SERVER_HOST, пины, пороги, интервалы
└── main.cpp   — вся логика: датчики, LCD, WiFi, HTTP POST, Pomodoro
```

**Перед прошивкой** обязательно отредактируйте `config.h`:
- `WIFI_SSID` / `WIFI_PASSWORD` — ваша сеть
- `SERVER_HOST` — IP компьютера с запущенным FastAPI (узнать: `ipconfig`)

## ESP32 библиотеки (platformio.ini)

```
adafruit/Adafruit BME280 Library @ ^2.2.4    (основной датчик T/H/P)
adafruit/Adafruit Unified Sensor @ ^1.1.14   (зависимость BME280)
adafruit/DHT sensor library @ ^1.4.6         (DHT11 — дополнительный)
claws/BH1750 @ ^1.3.0                        (освещённость)
marcoschwartz/LiquidCrystal_I2C @ ^1.1.4     (LCD 1602)
bblanchon/ArduinoJson @ ^7.0.4               (HTTP JSON POST)
```

Upload speed: 921600, Monitor: 115200 baud.

## ZM106-VOC UART протокол

Sensor подключён к **Serial2** (RX=GPIO16, TX=GPIO17, 9600 baud).

- Команда чтения: `FF 01 86 00 00 00 00 00 79` (9 байт)
- Ответ: `FF 86 HIGH LOW 00 00 00 00 CRC` (9 байт)
- Концентрация (ppm) = `(HIGH << 8) | LOW`
- CRC = `(~(сумма байт 1..7)) + 1`
- Таймаут ответа: 500 мс

---

## Важные особенности реализации

- **Chart.js responsive mode**: spark-canvas внутри flex-тайла обязательно оборачивать в `<div class="spark-wrap" style="height:36px; position:relative">` — иначе canvas растягивает родителя до бесконечности.
- **CSV экспорт**: BOM-префикс (`﻿`) + разделитель `;` для совместимости с Excel на русской локали.
- **WebSocket**: при подключении браузера сервер сразу отправляет последние данные из БД.
- **Security hook**: при написании нового JS-кода использовать `createElement` + `textContent` вместо `innerHTML` с template literals.
- **Analytics в demo**: данные берутся из `state.chartData.map(pt => pt.full)`, а не из API.
- **Pomodoro счётчик**: сохраняется в localStorage (`nexis-pomo-cycles`) между сессиями.
