# 🤖 НАСТРОЙКА TELEGRAM BOT

## NEXIS Wellness Station — Telegram интеграция

**Дата:** 31 января 2026 г.

---

# 📋 СОДЕРЖАНИЕ

1. [Создание бота](#1-создание-бота)
2. [Получение токена](#2-получение-токена)
3. [Получение Chat ID](#3-получение-chat-id)
4. [Команды бота](#4-команды-бота)
5. [Примеры сообщений](#5-примеры-сообщений)
6. [Конфигурация в коде](#6-конфигурация-в-коде)

---

# 1. СОЗДАНИЕ БОТА

## Шаг 1: Откройте @BotFather

1. Откройте Telegram
2. В поиске найдите `@BotFather`
3. Нажмите **Start**

```
┌─────────────────────────────────────┐
│           @BotFather                │
│                                     │
│  BotFather is the one bot to       │
│  rule them all. Use it to          │
│  create new bot accounts.          │
│                                     │
│         [Start]                     │
└─────────────────────────────────────┘
```

## Шаг 2: Создайте нового бота

Отправьте команду:
```
/newbot
```

BotFather спросит имя бота:
```
Alright, a new bot. How are we going to call it? 
Please choose a name for your bot.
```

Введите имя (для отображения):
```
NEXIS Wellness Station
```

BotFather спросит username:
```
Good. Now let's choose a username for your bot.
It must end in `bot`. Like this, for example: TetrisBot
```

Введите username (уникальный, заканчивается на bot):
```
nexis_wellness_bot
```

---

# 2. ПОЛУЧЕНИЕ ТОКЕНА

После создания BotFather выдаст токен:

```
Done! Congratulations on your new bot. You will find it at 
t.me/nexis_wellness_bot. 

You can now add a description, about section and profile 
picture for your bot, see /help for a list of commands.

Use this token to access the HTTP API:
7123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw

Keep your token secure and store it safely.
```

## ⚠️ ВАЖНО!

```
╔═══════════════════════════════════════════════════════════╗
║  НИКОМУ НЕ ПОКАЗЫВАЙТЕ ТОКЕН!                             ║
║  Это как пароль к боту.                                   ║
║                                                           ║
║  Пример токена (НЕ НАСТОЯЩИЙ):                           ║
║  7123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw           ║
╚═══════════════════════════════════════════════════════════╝
```

## Сохраните токен:

```cpp
// config.h
#define BOT_TOKEN "7123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw"
```

---

# 3. ПОЛУЧЕНИЕ CHAT ID

Chat ID — это ваш уникальный идентификатор для получения сообщений.

## Способ 1: Через @userinfobot

1. Найдите в Telegram: `@userinfobot`
2. Нажмите **Start**
3. Бот покажет ваш Chat ID:

```
Your user ID: 123456789
Your username: @your_username
```

## Способ 2: Через API

1. Напишите что-нибудь своему боту в Telegram
2. Откройте в браузере:

```
https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates
```

3. Найдите в ответе `"chat":{"id":123456789}`

```json
{
  "ok": true,
  "result": [{
    "message": {
      "chat": {
        "id": 123456789,  // <-- ВАШ CHAT ID
        "first_name": "Your Name"
      }
    }
  }]
}
```

## Сохраните Chat ID:

```cpp
// config.h
#define CHAT_ID "123456789"
```

---

# 4. КОМАНДЫ БОТА

## Список всех команд:

| Команда | Описание |
|---------|----------|
| `/start` | Приветствие и регистрация |
| `/help` | Справка по командам |
| `/status` | Текущие показатели |
| `/pomodoro` | Запуск Pomodoro таймера |
| `/stop` | Остановка таймера |
| `/stats` | Статистика за сегодня |
| `/week` | Статистика за неделю |
| `/settings` | Настройки устройства |
| `/alerts` | Вкл/выкл уведомления |

## Настройка команд в BotFather:

Отправьте @BotFather:
```
/setcommands
```

Выберите вашего бота, затем отправьте список:
```
start - Запуск бота
help - Справка по командам
status - Текущие показатели
pomodoro - Запуск Pomodoro
stop - Остановка таймера
stats - Статистика за сегодня
week - Статистика за неделю
settings - Настройки
alerts - Вкл/выкл уведомления
```

---

# 5. ПРИМЕРЫ СООБЩЕНИЙ

## /start — Приветствие:

```
🏠 NEXIS Wellness Station

Привет! Я твой персональный помощник 
продуктивности и здоровья.

📊 Я отслеживаю:
• Температуру и влажность
• Качество воздуха (CO2)
• Освещённость
• Время сидения

🍅 А также помогаю с Pomodoro!

Используй /help для списка команд.
```

## /status — Текущие показатели:

```
📊 ТЕКУЩИЕ ПОКАЗАТЕЛИ

🌡 Температура: 24.5°C ✅
💧 Влажность: 45% ✅
🌬 Воздух (CO2): 650 ppm ✅
💡 Освещение: 450 lux ✅
🔊 Шум: Тихо ✅
🪑 Сидите: 45 мин

Всё в норме! 👍
```

## Превышение порога (Alert):

```
⚠️ ВНИМАНИЕ!

🌬 CO2 повышен: 1250 ppm

Рекомендация: Проветрите помещение!

Это важно для:
• Концентрации
• Самочувствия
• Продуктивности
```

## /pomodoro — Запуск таймера:

```
🍅 POMODORO ЗАПУЩЕН

⏱ Время работы: 25:00

Сконцентрируйтесь на задаче!
Я сообщу, когда придёт время отдыха.

[⏹ Остановить]
```

## Конец рабочего периода:

```
🎉 POMODORO ЗАВЕРШЁН!

Отличная работа! Время отдохнуть.

⏱ Перерыв: 5:00

Встаньте, разомнитесь, выпейте воды!

[▶️ Следующий] [⏹ Закончить]
```

## /stats — Дневная статистика:

```
📈 СТАТИСТИКА ЗА СЕГОДНЯ

🍅 Pomodoro: 6 циклов (2.5 часа)
🪑 Сидение: 5.5 часов
🚶 Перерывов: 8

📊 Средние показатели:
🌡 Температура: 23.8°C
💧 Влажность: 48%
🌬 CO2: 720 ppm
💡 Освещение: 380 lux

⚠️ Алертов: 3
• CO2 превышен: 2 раза
• Долгое сидение: 1 раз

Продуктивный день! 💪
```

## /week — Недельная статистика:

```
📊 СТАТИСТИКА ЗА НЕДЕЛЮ

        Пн  Вт  Ср  Чт  Пт  Сб  Вс
🍅 Pom:  6   8   5   7   4   -   -
⏱ Часы: 2.5 3.3 2.1 2.9 1.7 -   -

📈 Итого за неделю:
• Рабочих часов: 12.5
• Pomodoro циклов: 30
• Перерывов: 42
• Алертов: 15

🏆 Лучший день: Вторник (8 🍅)

Так держать! 🚀
```

## /settings — Настройки:

```
⚙️ НАСТРОЙКИ

🌬 Порог CO2: 1000 ppm
💡 Порог света: 300 lux
🪑 Напоминание: каждые 2 часа
🍅 Pomodoro: 25/5 мин
🔔 Звук: Вкл
📱 Алерты: Вкл

Выберите для изменения:
[CO2] [Свет] [Сидение]
[Pomodoro] [Звук] [Алерты]
```

---

# 6. КОНФИГУРАЦИЯ В КОДЕ

## config.h:

```cpp
#ifndef CONFIG_H
#define CONFIG_H

// ============== WiFi ==============
#define WIFI_SSID "Your_WiFi_Name"
#define WIFI_PASSWORD "Your_WiFi_Password"

// ============== Telegram ==============
#define BOT_TOKEN "7123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw"
#define CHAT_ID "123456789"

// Интервал проверки сообщений (мс)
#define BOT_MTBS 5000  // 5 секунд

// ============== Пороги алертов ==============
#define CO2_THRESHOLD 1000      // ppm
#define LIGHT_THRESHOLD 300     // lux
#define SITTING_THRESHOLD 120   // минут

// ============== Pomodoro ==============
#define POMODORO_WORK 25        // минут
#define POMODORO_BREAK 5        // минут
#define POMODORO_LONG_BREAK 15  // минут (после 4 циклов)

#endif
```

## Пример кода Telegram Bot:

```cpp
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <UniversalTelegramBot.h>
#include <ArduinoJson.h>
#include "config.h"

WiFiClientSecure client;
UniversalTelegramBot bot(BOT_TOKEN, client);

unsigned long lastTimeBotRan;

void handleNewMessages(int numNewMessages) {
    for (int i = 0; i < numNewMessages; i++) {
        String chat_id = String(bot.messages[i].chat_id);
        String text = bot.messages[i].text;
        String from_name = bot.messages[i].from_name;
        
        // Проверка авторизации
        if (chat_id != CHAT_ID) {
            bot.sendMessage(chat_id, "⛔ Доступ запрещён", "");
            continue;
        }
        
        // Обработка команд
        if (text == "/start") {
            String welcome = "🏠 *NEXIS Wellness Station*\n\n";
            welcome += "Привет, " + from_name + "!\n";
            welcome += "Используй /help для справки.";
            bot.sendMessage(chat_id, welcome, "Markdown");
        }
        
        else if (text == "/status") {
            String status = "📊 *ТЕКУЩИЕ ПОКАЗАТЕЛИ*\n\n";
            status += "🌡 Температура: " + String(temperature) + "°C\n";
            status += "💧 Влажность: " + String(humidity) + "%\n";
            status += "🌬 CO2: " + String(co2) + " ppm\n";
            status += "💡 Свет: " + String(light) + " lux\n";
            bot.sendMessage(chat_id, status, "Markdown");
        }
        
        else if (text == "/pomodoro") {
            startPomodoro();
            bot.sendMessage(chat_id, "🍅 Pomodoro запущен! 25 минут работы.", "");
        }
        
        else if (text == "/stop") {
            stopPomodoro();
            bot.sendMessage(chat_id, "⏹ Pomodoro остановлен.", "");
        }
        
        else if (text == "/help") {
            String help = "📋 *КОМАНДЫ*\n\n";
            help += "/status - показатели\n";
            help += "/pomodoro - старт таймера\n";
            help += "/stop - стоп таймера\n";
            help += "/stats - статистика\n";
            help += "/settings - настройки";
            bot.sendMessage(chat_id, help, "Markdown");
        }
    }
}

void checkTelegramMessages() {
    if (millis() - lastTimeBotRan > BOT_MTBS) {
        int numNewMessages = bot.getUpdates(bot.last_message_received + 1);
        while (numNewMessages) {
            handleNewMessages(numNewMessages);
            numNewMessages = bot.getUpdates(bot.last_message_received + 1);
        }
        lastTimeBotRan = millis();
    }
}

void sendAlert(String message) {
    bot.sendMessage(CHAT_ID, message, "Markdown");
}

void setup() {
    // WiFi подключение
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
    }
    
    // Для HTTPS
    client.setCACert(TELEGRAM_CERTIFICATE_ROOT);
    
    // Приветствие при запуске
    bot.sendMessage(CHAT_ID, "✅ NEXIS Wellness Station запущена!", "");
}

void loop() {
    checkTelegramMessages();
    // ... остальной код
}
```

---

# 🔐 БЕЗОПАСНОСТЬ

## Рекомендации:

1. **Не публикуйте токен** в GitHub!
2. **Проверяйте Chat ID** — отвечайте только своему ID
3. **Используйте HTTPS** — client.setCACert()

## Хранение секретов:

```cpp
// Создайте отдельный файл secrets.h (добавьте в .gitignore!)

// secrets.h
#define BOT_TOKEN "ваш_токен"
#define CHAT_ID "ваш_chat_id"
#define WIFI_SSID "ваш_wifi"
#define WIFI_PASSWORD "ваш_пароль"
```

```
// .gitignore
secrets.h
```

---

# ✅ ЧЕК-ЛИСТ НАСТРОЙКИ

- [ ] Создан бот через @BotFather
- [ ] Получен токен бота
- [ ] Получен Chat ID
- [ ] Настроены команды в BotFather
- [ ] Токен добавлен в config.h
- [ ] Chat ID добавлен в config.h
- [ ] WiFi данные указаны
- [ ] Секреты НЕ в публичном репозитории

---

**Дата:** 31 января 2026 г.
