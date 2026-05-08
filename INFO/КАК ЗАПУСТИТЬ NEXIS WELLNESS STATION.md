# 🚀 КАК ЗАПУСТИТЬ NEXIS WELLNESS STATION

## 📁 Структура файлов

```
nexis-dashboard/
├── app.py              ← Python сервер (ЗАПУСКАТЬ ЭТО)
├── requirements.txt    ← библиотеки Python
├── nexis.db            ← база данных (создаётся автоматически)
├── templates/
│   └── index.html      ← страница сайта
├── static/
│   ├── css/style.css   ← стили
│   └── js/dashboard.js ← логика
└── esp32/
    ├── main.cpp        ← прошивка ESP32
    └── platformio.ini  ← конфигурация PlatformIO
```

---

## ⚙️ ШАГ 1: Настроить ESP32

Открой файл `esp32/main.cpp` и измени эти строки:

```cpp
#define WIFI_SSID     "ИМЯ_ТВОЕЙ_СЕТИ"      // ← имя WiFi
#define WIFI_PASSWORD "ПАРОЛЬ_СЕТИ"           // ← пароль WiFi
#define SERVER_URL    "http://192.168.1.100:5000"  // ← IP твоего компьютера
#define BOT_TOKEN     "ТВОЙ_ТОКЕН_БОТА"       // ← токен от @BotFather
#define CHAT_ID       "ТВОЙ_CHAT_ID"          // ← твой ID
```

Как узнать IP компьютера:
- Windows: открой cmd → ipconfig → IPv4 Address
- Mac/Linux: в терминале → ifconfig

---

## ⚙️ ШАГ 2: Установить Python библиотеки

```bash
pip install flask flask-socketio eventlet
```

или через файл:

```bash
pip install -r requirements.txt
```

---

## ▶️ ШАГ 3: Запустить сервер

```bash
python app.py
```

Сервер запустится. В терминале увидишь:
```
  NEXIS Wellness Station — Web Dashboard
  Сайт: http://localhost:5000
  API:  http://localhost:5000/api/status
```

---

## 🌐 ШАГ 4: Открыть сайт

Открой браузер → http://localhost:5000

Сайт запустится в **демо-режиме** (имитация данных) пока ESP32 не подключён.

---

## 📡 ШАГ 5: Прошить ESP32

В VS Code с PlatformIO:
1. Скопируй `esp32/platformio.ini` в корень проекта PlatformIO
2. Скопируй `esp32/main.cpp` → `src/main.cpp`
3. Нажми Upload (→)

Как только ESP32 подключится к WiFi — данные появятся на сайте в реальном времени!

---

## 📱 Telegram команды

| Команда | Что делает |
|---------|------------|
| /status | Текущие показания всех датчиков |
| /pomodoro | Запустить Pomodoro (25 мин) |
| /stop | Остановить Pomodoro |
| /ip | IP адрес и ссылка на dashboard |
| /help | Список команд |

---

## 🔗 API Endpoints (для справки/документации)

| URL | Метод | Описание |
|-----|-------|----------|
| /api/status | GET | Статус сервера |
| /api/sensors | GET | Последние данные |
| /api/history?hours=24 | GET | История за 24ч |
| /api/stats | GET | Статистика дня |
| /api/alerts | GET | Последние алерты |
| /api/data | POST | Принять данные с ESP32 |
| /api/pomodoro | POST | Событие Pomodoro |

---

## 🆘 Частые проблемы

**Сайт не открывается**
→ Убедись что `python app.py` запущен в терминале

**ESP32 не шлёт данные**
→ Проверь что компьютер и ESP32 в одной WiFi сети
→ Проверь IP в SERVER_URL

**Telegram не отвечает**
→ Проверь BOT_TOKEN и CHAT_ID
→ ESP32 должен быть подключён к интернету
