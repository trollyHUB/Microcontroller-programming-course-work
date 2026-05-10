# NEXIS: Interrupts + Thesis Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить реализацию прерываний в ESP32, обновить курсовую работу (добавить раздел про прерывания + описание нового дашборда), обновить coursework.html на сайте.

**Architecture:** 3 независимых файла изменяются последовательно: сначала ESP32 firmware (main.cpp) получает interrupt-based обработку кнопок и PIR; затем thesis .md обновляется новым разделом 2.4.6 и обновлённым 2.5; затем coursework.html на сайте синхронизируется с thesis.

**Tech Stack:** C++ (Arduino/ESP32, IRAM_ATTR ISR, attachInterrupt), Markdown (thesis), HTML (coursework page)

---

## Файлы, которые будут изменены

| Файл | Изменение |
|------|-----------|
| `esp32/src/main.cpp` | Добавить volatile ISR-флаги, ISR-обработчики (IRAM_ATTR), attachInterrupt() в setup(), переделать handleButtons() |
| `INFO/КУРСОВАЯ_РАБОТА_NEXIS_WELLNESS_STATION.md` | Добавить раздел 2.4.6 «Прерывания», обновить 2.5 (новый дашборд), обновить Введение задачу 4, обновить Заключение, обновить Приложение В |
| `site/nexis-dashboard-v2/nexis-v2/templates/pages/coursework.html` | Добавить TOC-пункт, раздел 2.4.6 в HTML, обновить описание веб-дашборда |

---

## Task 1: ESP32 — добавить прерывания для кнопок и PIR

**Файл:** `esp32/src/main.cpp`

Изменения минимальные и безопасные: добавляем ISR-флаги и обработчики поверх существующего кода, меняем `handleButtons()` для чтения флагов вместо опроса пинов. Polling-debounce остаётся как механизм защиты от дребезга.

- [ ] **Шаг 1.1: Добавить volatile ISR-флаги после секции таймеров (после строки 104)**

Найти в main.cpp блок:
```cpp
uint32_t lastWifiCheck    = 0;
```

Добавить СРАЗУ ПОСЛЕ него:
```cpp
// ============================================================
//  ISR — ПРЕРЫВАНИЯ (IRAM_ATTR — код в IRAM для быстрого доступа)
// ============================================================

volatile bool isrBtnMode  = false;  // флаг нажатия кнопки MODE
volatile bool isrBtnOK    = false;  // флаг нажатия кнопки OK
volatile bool isrPIR      = false;  // флаг срабатывания PIR

// ISR-обработчик кнопки MODE (вызывается аппаратно по FALLING-edge)
void IRAM_ATTR onBtnMode() { isrBtnMode = true; }

// ISR-обработчик кнопки OK
void IRAM_ATTR onBtnOK()   { isrBtnOK  = true; }

// ISR-обработчик PIR — срабатывает мгновенно при обнаружении движения
void IRAM_ATTR onPIR()     { isrPIR    = true; }
```

- [ ] **Шаг 1.2: Зарегистрировать прерывания в setup() — после `pinMode` блока**

Найти в `setup()` строку:
```cpp
    analogReadResolution(12);   // ADC 12 бит (0–4095)
```

Добавить ПЕРЕД ней:
```cpp
    // Регистрация аппаратных прерываний
    // FALLING — реагируем на спадающий фронт (кнопка нажата = LOW при INPUT_PULLUP)
    attachInterrupt(digitalPinToInterrupt(PIN_BTN_MODE), onBtnMode, FALLING);
    attachInterrupt(digitalPinToInterrupt(PIN_BTN_OK),   onBtnOK,   FALLING);
    // RISING — PIR выдаёт HIGH при обнаружении движения
    attachInterrupt(digitalPinToInterrupt(PIN_PIR),      onPIR,     RISING);
    Serial.println("[OK] Hardware interrupts attached (BTN_MODE, BTN_OK, PIR)");

```

- [ ] **Шаг 1.3: Обновить handleButtons() для использования ISR-флагов**

Заменить всю функцию `handleButtons()` (строки 537–557):

```cpp
void handleButtons() {
    uint32_t now = millis();

    // Кнопка MODE — обработка ISR-флага (прерывание зафиксировало нажатие)
    if (isrBtnMode && now - btnModeLast > DEBOUNCE_MS) {
        isrBtnMode = false;  // сбросить флаг
        btnModeLast = now;
        state.displayPage = (state.displayPage + 1) % SystemState::DISPLAY_PAGES;
        updateDisplay();
        beepOK();
    }

    // Кнопка OK — запуск/остановка Pomodoro через прерывание
    if (isrBtnOK && now - btnOKLast > DEBOUNCE_MS) {
        isrBtnOK = false;  // сбросить флаг
        btnOKLast = now;
        if (state.pomoMode == SystemState::POMO_IDLE) {
            pomoStart();
        } else {
            pomoStop();
        }
    }
}
```

- [ ] **Шаг 1.4: Обновить readPIR() для использования ISR-флага**

Заменить функцию `readPIR()` (строки 331–333):

```cpp
void readPIR() {
    // Приоритет у ISR-флага — мгновенная фиксация движения
    if (isrPIR) {
        sensors.motion = true;
        isrPIR = false;  // сбросить флаг
    } else {
        // Polling как резервный метод для проверки текущего состояния
        sensors.motion = (digitalRead(PIN_PIR) == HIGH);
    }
}
```

- [ ] **Шаг 1.5: Проверить компиляцию**

```bash
cd esp32
pio run
```

Ожидаемый вывод: `SUCCESS` без ошибок. Предупреждения о unused variables допустимы.

---

## Task 2: Обновить thesis .md — раздел прерываний + новый дашборд

**Файл:** `INFO/КУРСОВАЯ_РАБОТА_NEXIS_WELLNESS_STATION.md`

### Шаг 2.1: Обновить задачу 4 во Введении

Найти строку:
```
4. Разработать программное обеспечение для микроконтроллера ESP32 на базе Arduino Framework (C++), включающее модули опроса датчиков, управления дисплеем, Pomodoro-таймером и системой алертов.
```

Заменить на:
```
4. Разработать программное обеспечение для микроконтроллера ESP32 на базе Arduino Framework (C++), включающее модули опроса датчиков, управления дисплеем, Pomodoro-таймером, системой алертов и механизм обработки аппаратных прерываний (ISR) для кнопок управления и датчика движения.
```

### Шаг 2.2: Добавить раздел 2.4.6 «Прерывания в ESP32»

Найти строку в файле:
```
## 2.5 Веб-дашборд на FastAPI
```

Вставить ПЕРЕД ней следующий блок:

```markdown
### 2.4.6 Механизм прерываний в ESP32

**Концепция прерываний.** Прерывание (interrupt) — аппаратный или программный сигнал, вынуждающий процессор приостановить выполнение текущего кода и немедленно выполнить специальную функцию — обработчик прерывания (ISR, Interrupt Service Routine). В отличие от опроса (polling), когда программа периодически проверяет состояние входа в цикле, прерывание гарантирует мгновенную реакцию на событие вне зависимости от того, чем занят процессор в этот момент.

**Прерывания в ESP32.** Микроконтроллер ESP32 поддерживает до 32 источников прерываний. Для GPIO предусмотрены прерывания по уровню и фронту сигнала:

| Режим | Константа Arduino | Описание |
|-------|-------------------|----------|
| По спадающему фронту | `FALLING` | Срабатывает при переходе HIGH→LOW |
| По нарастающему фронту | `RISING` | Срабатывает при переходе LOW→HIGH |
| По любому изменению | `CHANGE` | Любое изменение уровня |
| По низкому уровню | `LOW` | Постоянно, пока сигнал LOW |
| По высокому уровню | `HIGH` | Постоянно, пока сигнал HIGH |

Таблица 2.5 — Режимы GPIO-прерываний ESP32

**Ключевые требования к ISR:**

1. Обработчик должен быть объявлен с атрибутом `IRAM_ATTR` — это размещает код функции в IRAM (Internal RAM) вместо Flash, что обеспечивает мгновенный доступ без задержек кэша.
2. ISR должна быть максимально короткой — никаких `delay()`, операций ввода-вывода, выделения памяти.
3. Общие переменные между ISR и основным кодом должны быть объявлены как `volatile` — это запрещает компилятору кэшировать их значение в регистре.

**Реализация в NEXIS Wellness Station.** В системе прерывания применяются для трёх событий:

```cpp
// Volatile-флаги — атомарно устанавливаются в ISR, читаются в loop()
volatile bool isrBtnMode = false;
volatile bool isrBtnOK   = false;
volatile bool isrPIR     = false;

// Обработчики прерываний — код размещается в IRAM
void IRAM_ATTR onBtnMode() { isrBtnMode = true; }
void IRAM_ATTR onBtnOK()   { isrBtnOK   = true; }
void IRAM_ATTR onPIR()     { isrPIR     = true; }
```

Регистрация прерываний выполняется в `setup()` через `attachInterrupt()`:

```cpp
// Кнопки — FALLING (INPUT_PULLUP: нажатие = HIGH→LOW)
attachInterrupt(digitalPinToInterrupt(PIN_BTN_MODE), onBtnMode, FALLING);
attachInterrupt(digitalPinToInterrupt(PIN_BTN_OK),   onBtnOK,   FALLING);
// PIR — RISING (обнаружение движения = LOW→HIGH)
attachInterrupt(digitalPinToInterrupt(PIN_PIR),      onPIR,     RISING);
```

**Паттерн «флаг + обработка в loop()».** ISR устанавливает флаг, а основной цикл проверяет его и выполняет действие. Это безопасный способ обхода ограничений ISR: все «тяжёлые» операции (обновление дисплея, звуковые сигналы, HTTP-запросы) выполняются в `loop()`, ISR только сигнализирует о событии.

```cpp
void handleButtons() {
    uint32_t now = millis();
    // Проверка ISR-флага вместо digitalRead() в опросе
    if (isrBtnMode && now - btnModeLast > DEBOUNCE_MS) {
        isrBtnMode = false;
        btnModeLast = now;
        state.displayPage = (state.displayPage + 1) % SystemState::DISPLAY_PAGES;
        updateDisplay();
        beepOK();
    }
    if (isrBtnOK && now - btnOKLast > DEBOUNCE_MS) {
        isrBtnOK = false;
        btnOKLast = now;
        if (state.pomoMode == SystemState::POMO_IDLE) pomoStart();
        else pomoStop();
    }
}
```

**Антидребезг (debounce).** При механическом нажатии кнопки контакты несколько миллисекунд вибрируют, генерируя множество ложных переходов. Защита реализована временно́й маской: повторная обработка флага разрешена не ранее чем через `DEBOUNCE_MS` (200 мс) после предыдущей.

**Преимущества перед polling.** Polling-подход проверяет пины каждые 10 мс в основном цикле; при занятости процессора (HTTP-запрос, UART-обмен с ZM106) нажатие кнопки могло быть пропущено. Прерывание фиксирует событие мгновенно в аппаратном стеке, независимо от загруженности основного цикла. Для PIR-датчика это особенно важно: движение длится 0.3–0.5 с, и без прерывания система с 10-секундным интервалом опроса могла бы его пропустить.

```
Polling (старый подход):
  loop() → ... HTTP 42мс ... → handleButtons() → digitalRead() — ПРОПУСК!

Interrupt (новый подход):
  СОБЫТИЕ → ISR (мгновенно) → isrFlag=true → следующий loop() → обработка
```
Рисунок 2.3 — Сравнение polling и interrupt-driven подходов

```

### Шаг 2.3: Обновить раздел 2.5 (Веб-дашборд) — обновить 2.5.5 Frontend SPA

Найти строку:
```
**Страницы дашборда:**
```

Заменить весь список страниц и схему WebSocket до `---` на:

```markdown
**Архитектура Frontend (6 JavaScript-модулей):**

Интерфейс разбит на 6 специализированных файлов для ясного разделения ответственности:

| Файл | Строк | Назначение |
|------|-------|-----------|
| `app.js` | 863 | SPA-ядро: навигация, режимы, тайлы, алерты |
| `state.js` | 245 | Глобальное состояние, логгер, утилиты |
| `analytics.js` | 1182 | Графики, корреляция, тепловая карта, PDF |
| `pomodoro.js` | 407 | Pomodoro-движок, PIR-пауза, история |
| `achievements.js` | 646 | Система достижений (19 условий разблокировки) |
| `sounds.js` | 110 | Web Audio API: звуки, мелодии, уведомления |

Таблица 2.6 — Frontend JavaScript-модули

**10 страниц SPA:**

- `dashboard` — 6 тайлов датчиков со спарклайнами, Wellness Index, рекомендации
- `sensors` — 7 страниц датчиков с историческими графиками (генерируются динамически)
- `analytics` — графики трендов, тепловая карта продуктивности 7×24, корреляционный анализ Pearson, экспорт PDF
- `pomodoro` — браузерный Pomodoro-таймер, PIR-пауза, история сессий, статистика
- `achievements` — система достижений с 4 категориями и 19 условиями разблокировки
- `logs` — журнал событий с фильтрами по типу и уровню
- `tasks` — управление дневными задачами
- `settings` — тема, единицы измерения, уведомления, Telegram
- `about` — информация о проекте и компонентах
- `coursework` — встроенная курсовая работа с интерактивным оглавлением

**Расширенные возможности:**

- **Корреляционный анализ (Pearson r)**: автоматическое вычисление связи между CO₂ и числом завершённых Pomodoro-циклов
- **Тепловая карта продуктивности**: сетка 7 дней × 24 часа с тепловым кодированием интенсивности работы
- **PDF-отчёты**: экспорт дневного/недельного дайджеста через jsPDF
- **Система достижений**: разблокировка за реальные события (7 дней подряд, 100 циклов, идеальный день и др.)
- **Web Audio API**: процедурные звуки без аудиофайлов (пищалки алертов, мелодия Pomodoro, звуки достижений)
- **PIR-пауза Pomodoro**: автоматическая пауза при отсутствии движения >15 с
- **DND-режим**: Do Not Disturb с автоотключением через 25 минут
- **Wellness Index**: 5-компонентный индекс здоровья (CO₂ + температура + влажность + свет + шум)
```

### Шаг 2.4: Обновить Заключение — убрать прерывания из «перспектив»

Найти в Заключении строку:
```
**Перспективы развития** включают: интеграцию алгоритмов машинного обучения для предиктивного анализа качества воздуха; добавление поддержки датчиков PM2.5 и TVOC; разработку мобильного приложения (iOS/Android); реализацию облачного хранения данных; внедрение механизма прерываний ESP32 (ISR, Hardware Timer) для повышения точности таймера и скорости реакции на кнопки.
```

Заменить на:
```
**Перспективы развития** включают: интеграцию алгоритмов машинного обучения для предиктивного анализа качества воздуха; добавление поддержки датчиков PM2.5 и TVOC; разработку мобильного приложения (iOS/Android); реализацию облачного хранения данных; расширение веб-дашборда модулями AI-рекомендаций.
```

Найти строку:
```
4. Разработана прошивка ESP32 (~600 строк C++) с модульной структурой: чтение 7 датчиков, 5-экранный LCD-интерфейс, Pomodoro-таймер, трёхуровневая система алертов с RGB LED и зуммером, HTTP-клиент для отправки данных на сервер.
```

Заменить на:
```
4. Разработана прошивка ESP32 (~750 строк C++) с модульной структурой: чтение 7 датчиков, 5-экранный LCD-интерфейс, Pomodoro-таймер, трёхуровневая система алертов с RGB LED и зуммером, HTTP-клиент для отправки данных на сервер. Реализован механизм аппаратных прерываний (ISR) для кнопок управления (FALLING-edge) и датчика движения PIR (RISING-edge) с паттерном volatile-флаг и debounce-защитой.
```

Найти строку:
```
6. Разработан веб-дашборд: сервер FastAPI + SQLite + Socket.IO (Python), браузерный SPA-интерфейс с 6 страницами, построенный на чистом JavaScript с использованием Chart.js для визуализации графиков. Реализован демо-режим для работы без ESP32.
```

Заменить на:
```
6. Разработан веб-дашборд: сервер FastAPI + SQLite + Socket.IO (Python) с 20+ API-эндпоинтами, браузерный SPA-интерфейс с 10 страницами на 6 JavaScript-модулях (~3000 строк). Реализованы: корреляционный анализ Pearson, тепловая карта продуктивности 7×24, система достижений с 19 условиями, PDF-экспорт, Web Audio API. Демо-режим обеспечивает работу без ESP32.
```

### Шаг 2.5: Обновить Приложение В — добавить пример ISR-кода

Найти в Приложении В строку:
```
### В.2 Функция проверки порогов алертов
```

Вставить ПЕРЕД ней:

```markdown
### В.2 Реализация аппаратных прерываний

```cpp
// Volatile-флаги (атомарная запись из ISR, чтение в loop)
volatile bool isrBtnMode = false;
volatile bool isrBtnOK   = false;
volatile bool isrPIR     = false;

// ISR — код в IRAM для мгновенного выполнения (без задержки Flash-кэша)
void IRAM_ATTR onBtnMode() { isrBtnMode = true; }
void IRAM_ATTR onBtnOK()   { isrBtnOK   = true; }
void IRAM_ATTR onPIR()     { isrPIR     = true; }

// Регистрация в setup()
attachInterrupt(digitalPinToInterrupt(PIN_BTN_MODE), onBtnMode, FALLING);
attachInterrupt(digitalPinToInterrupt(PIN_BTN_OK),   onBtnOK,   FALLING);
attachInterrupt(digitalPinToInterrupt(PIN_PIR),      onPIR,     RISING);

// Обработка в loop() — тяжёлые операции вне ISR
void handleButtons() {
    uint32_t now = millis();
    if (isrBtnMode && now - btnModeLast > DEBOUNCE_MS) {
        isrBtnMode = false;
        btnModeLast = now;
        state.displayPage = (state.displayPage + 1) % SystemState::DISPLAY_PAGES;
        updateDisplay();
        beepOK();
    }
    if (isrBtnOK && now - btnOKLast > DEBOUNCE_MS) {
        isrBtnOK = false;
        btnOKLast = now;
        if (state.pomoMode == SystemState::POMO_IDLE) pomoStart();
        else pomoStop();
    }
}
```

```

Заменить прежний шаг В.2 на В.3:
```
### В.3 Функция проверки порогов алертов
```

---

## Task 3: Обновить coursework.html на сайте

**Файл:** `site/nexis-dashboard-v2/nexis-v2/templates/pages/coursework.html`

### Шаг 3.1: Добавить пункт TOC для прерываний

Найти в TOC:
```html
        <a class="toc-item toc-sub" href="#cw-22">2.2 Программная архитектура</a>
        <a class="toc-item toc-sub" href="#cw-23">2.3 Web-интерфейс</a>
```

Заменить на:
```html
        <a class="toc-item toc-sub" href="#cw-22">2.2 Программная архитектура</a>
        <a class="toc-item toc-sub" href="#cw-23">2.3 Прерывания (ISR)</a>
        <a class="toc-item toc-sub" href="#cw-24">2.4 Web-интерфейс</a>
```

### Шаг 3.2: Добавить раздел 2.3 «Прерывания» и обновить 2.4 «Web-интерфейс»

Найти в coursework.html:
```html
        <h3 class="cw-h3" id="cw-23">2.3 Web-интерфейс</h3>
        <p>Веб-интерфейс — одностраничное приложение (SPA) с боковым меню. Стек: HTML5, CSS3, JavaScript ES6+, Chart.js, Socket.IO. Три режима работы: Отключено, Демо, ESP32 Live.</p>
```

Заменить на:
```html
        <h3 class="cw-h3" id="cw-23">2.3 Прерывания в ESP32 (ISR)</h3>
        <p><strong>Прерывание</strong> — аппаратный сигнал, вынуждающий процессор немедленно выполнить специальную функцию (ISR, Interrupt Service Routine), не дожидаясь следующей итерации основного цикла. В NEXIS Wellness Station прерывания реализованы для кнопок управления и датчика движения PIR.</p>
        <div class="cw-table-wrap">
          <table class="cw-table">
            <thead><tr><th>Источник</th><th>Пин</th><th>Режим</th><th>Назначение</th></tr></thead>
            <tbody>
              <tr><td>Кнопка MODE</td><td>GPIO32</td><td>FALLING</td><td>Смена экрана LCD</td></tr>
              <tr><td>Кнопка OK</td><td>GPIO33</td><td>FALLING</td><td>Запуск/стоп Pomodoro</td></tr>
              <tr><td>PIR HC-SR501</td><td>GPIO27</td><td>RISING</td><td>Мгновенная фиксация движения</td></tr>
            </tbody>
          </table>
        </div>
        <p>Ключевые требования к ISR: атрибут <code>IRAM_ATTR</code> (код в IRAM, без задержки Flash-кэша), минимальная длина (только установка флага), переменные <code>volatile</code>. Антидребезг реализован временно́й маской 200 мс в <code>handleButtons()</code>.</p>
        <div class="cw-code">
<pre><code>volatile bool isrBtnMode = false;
void IRAM_ATTR onBtnMode() { isrBtnMode = true; }

// В setup():
attachInterrupt(digitalPinToInterrupt(PIN_BTN_MODE), onBtnMode, FALLING);

// В loop() — обработка флага (не в ISR!):
if (isrBtnMode &amp;&amp; now - btnModeLast &gt; 200) {
    isrBtnMode = false;
    state.displayPage = (state.displayPage + 1) % 5;
    updateDisplay();
}</code></pre>
        </div>
        <h3 class="cw-h3" id="cw-24">2.4 Web-интерфейс</h3>
        <p>Веб-дашборд — 10-страничное SPA на 6 JavaScript-модулях (~3000 строк). Стек: HTML5, CSS3, JavaScript ES6+, Chart.js, Socket.IO. Три режима: Отключено, Демо, ESP32 Live.</p>
        <div class="cw-table-wrap">
          <table class="cw-table">
            <thead><tr><th>Модуль</th><th>Строк</th><th>Функция</th></tr></thead>
            <tbody>
              <tr><td>app.js</td><td>863</td><td>SPA-ядро, навигация, тайлы, алерты</td></tr>
              <tr><td>analytics.js</td><td>1182</td><td>Корреляция Pearson, тепловая карта 7×24, PDF</td></tr>
              <tr><td>pomodoro.js</td><td>407</td><td>Pomodoro-движок, PIR-пауза</td></tr>
              <tr><td>achievements.js</td><td>646</td><td>19 достижений, система разблокировки</td></tr>
              <tr><td>state.js</td><td>245</td><td>Глобальное состояние, логгер</td></tr>
              <tr><td>sounds.js</td><td>110</td><td>Web Audio API, процедурные звуки</td></tr>
            </tbody>
          </table>
        </div>
```

### Шаг 3.3: Добавить CSS для блока кода если отсутствует

Проверить наличие `.cw-code` в `static/css/style.css`. Если нет — добавить в конец файла:
```css
.cw-code { background: var(--bg-secondary); border-radius: 8px; padding: 1rem; margin: 0.75rem 0; overflow-x: auto; }
.cw-code pre { margin: 0; font-size: 0.8rem; line-height: 1.5; }
.cw-code code { font-family: 'Courier New', monospace; color: var(--text-primary); }
```

### Шаг 3.4: Обновить статусы в TOC

Найти в coursework.html блок `.cw-status`:
```html
      <div class="cw-status">
        <div class="cws-item done">&#10003; Введение</div>
        <div class="cws-item done">&#10003; Глава 1</div>
        <div class="cws-item done">&#10003; Глава 2</div>
        <div class="cws-item done">&#10003; Заключение</div>
        <div class="cws-item done">&#10003; Список литературы</div>
      </div>
```

Заменить на:
```html
      <div class="cw-status">
        <div class="cws-item done">&#10003; Введение</div>
        <div class="cws-item done">&#10003; Глава 1 — Теория</div>
        <div class="cws-item done">&#10003; Глава 2 — Практика</div>
        <div class="cws-item done">&#10003; Глава 3 — Тестирование</div>
        <div class="cws-item done">&#10003; Заключение</div>
        <div class="cws-item done">&#10003; Список литературы (17)</div>
        <div class="cws-item done">&#10003; Прерывания реализованы</div>
      </div>
```

---

## Self-Review

**Spec coverage:**
- ✅ Task 1: ESP32 interrupts — ISR флаги, IRAM_ATTR, attachInterrupt, обновлённый handleButtons и readPIR
- ✅ Task 2: Thesis — раздел 2.4.6 (теория + код прерываний), обновлённый 2.5.5 (новый дашборд), обновлённое Введение, Заключение, Приложение В
- ✅ Task 3: coursework.html — TOC, секция прерываний с таблицей и кодом, обновлённый раздел веб-дашборда, статусы

**Placeholder scan:** Нет TBD, TODO. Все блоки кода конкретные.

**Type consistency:** volatile bool флаги, IRAM_ATTR, attachInterrupt — одинаковые во всех трёх задачах.
