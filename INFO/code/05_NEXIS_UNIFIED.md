# Вариант 05 — NEXIS UNIFIED (BME280 + MQ-135 + WebServer)

**Датчики:** BME280 (T/H/P) · MQ-135 (CO₂) · BH1750 (свет) · PIR (движение) · KY-037 (шум)  
**Управление:** LCD 1602 · RGB LED · Зуммер · Кнопки MODE/OK (ISR)  
**Сеть:** WiFi → POST на FastAPI сервер · ESP32 WebServer (порт 80)

> **Архитектура связи:**
> ```
> ESP32 → POST /api/data → FastAPI сервер (порт 5000) → бот bot.py → Telegram
>              ↓
>         ESP32 WebServer (порт 80) — собственный дашборд
> ```
> ESP32 отправляет данные на сервер. Telegram-функции (алерты, команды, история) — в `bot.py`.  
> Это самый полный вариант кода для Arduino IDE. Один файл — всё включено.

**Библиотеки (Менеджер библиотек Arduino IDE):**
- `Adafruit BME280 Library` + `Adafruit Unified Sensor`
- `BH1750 by Christopher Laws`
- `LiquidCrystal I2C by marcoschwartz`
- `ArduinoJson by Benoit Blanchon` (версия **7.x**)
- WiFi · WebServer · HTTPClient — встроены в ESP32 Arduino Core

---

```cpp
/*
 * NEXIS Wellness Station — UNIFIED v3.0
 * ─────────────────────────────────────────────────────────────
 * Датчики:    BME280  T/H/P   I2C 0x76   GPIO 21/22
 *             MQ-135  CO₂     ADC1       GPIO 36
 *             BH1750  свет    I2C 0x23   GPIO 21/22
 *             PIR     движ.   Digital    GPIO 27
 *             KY-037  шум     ADC1       GPIO 39
 *
 * Управление: LCD 1602        I2C 0x27   GPIO 21/22
 *             RGB LED         PWM        GPIO 13/12/14
 *             Зуммер          PWM        GPIO 25
 *             Кнопка MODE     ISR        GPIO 32
 *             Кнопка OK       ISR        GPIO 33
 *
 * Сеть:  WiFi → POST /api/data  на FastAPI NEXIS сервер (порт 5000)
 *        ESP32 WebServer порт 80 — встроенный дашборд в браузере
 *
 * Telegram: реализован в bot.py на стороне сервера.
 *           ESP32 только отправляет данные — бот читает их с сервера.
 *
 * Arduino IDE — всё в одном файле, никаких config.h
 * ← ИЗМЕНИТЬ: раздел НАСТРОЙКИ ниже
 */

// ─────────────────────────────────────────────
//  БИБЛИОТЕКИ
// ─────────────────────────────────────────────
#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME280.h>
#include <BH1750.h>
#include <LiquidCrystal_I2C.h>

// ─────────────────────────────────────────────
//  НАСТРОЙКИ — ИЗМЕНИТЬ!
// ─────────────────────────────────────────────

// WiFi
#define WIFI_SSID        "Testardu"          // ← ИЗМЕНИТЬ
#define WIFI_PASSWORD    "12345678"          // ← ИЗМЕНИТЬ

// FastAPI NEXIS сервер (IP вашего ПК → cmd → ipconfig → IPv4)
#define SERVER_HOST      "192.168.1.100"     // ← ИЗМЕНИТЬ
#define SERVER_PORT      5000

// ─────────────────────────────────────────────
//  ПИНЫ
// ─────────────────────────────────────────────
#define I2C_SDA          21
#define I2C_SCL          22
#define ADDR_BME280      0x76
#define ADDR_BH1750      0x23
#define ADDR_LCD         0x27

#define PIN_MQ135        36    // ADC1, Input-only (нет конфликта с WiFi)
#define PIN_PIR          27
#define PIN_NOISE        39    // ADC1, Input-only
#define PIN_LED_R        13
#define PIN_LED_G        12
#define PIN_LED_B        14
#define PIN_BUZZER       25
#define PIN_BTN_MODE     32
#define PIN_BTN_OK       33

// ─────────────────────────────────────────────
//  ИНТЕРВАЛЫ
// ─────────────────────────────────────────────
#define SENSOR_MS        10000   // чтение датчиков + POST на сервер
#define DISPLAY_MS       3000    // смена экрана LCD
#define WIFI_CHECK_MS    15000   // проверка WiFi

// ─────────────────────────────────────────────
//  ПОРОГИ АЛЕРТОВ (по ГОСТ 30494-2011 / ASHRAE 55)
// ─────────────────────────────────────────────
#define THRESH_CO2_WARN     800     // ppm
#define THRESH_CO2_DANGER   1200
#define THRESH_TEMP_WARN    27.0f   // °C
#define THRESH_TEMP_DANGER  30.0f
#define THRESH_HUM_WARN     65.0f   // %
#define THRESH_HUM_DANGER   75.0f
#define THRESH_LIGHT_WARN   150     // lux — ниже = ⚠
#define THRESH_LIGHT_DANGER 50      // lux — ниже = ✗
#define THRESH_NOISE_WARN   55      // дБ
#define THRESH_NOISE_DANGER 70

// Pomodoro
#define POMO_WORK_MIN    25
#define POMO_BREAK_MIN   5

// Шум: линейная аппроксимация ADC → дБ
#define NOISE_DB_MIN     30.0f
#define NOISE_DB_MAX     90.0f

// ─────────────────────────────────────────────
//  HTML ДАШБОРД В FLASH ПАМЯТИ (PROGMEM)
//  Открыть: http://<IP-ESP32>  в любом браузере в той же сети
// ─────────────────────────────────────────────
const char INDEX_HTML[] PROGMEM = R"===(
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>NEXIS — ESP32 Live</title>
<style>
:root{--bg:#0c0e14;--bg2:#13151f;--bg3:#1a1d2a;--border:rgba(255,255,255,0.07);
--text:#dde1ee;--text2:#7a82a0;--text3:#444b66;--green:#20c97a;--amber:#f5a623;
--red:#f04040;--blue:#4d9eff;--r:12px;--mono:'JetBrains Mono',monospace}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{font-size:14px}
body{background:var(--bg);color:var(--text);font-family:system-ui,sans-serif;min-height:100vh;padding:16px}
header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:8px}
.logo{display:flex;align-items:center;gap:10px}
.logo-icon{width:32px;height:32px;border-radius:9px;background:linear-gradient(135deg,var(--green),#0fa85e);
display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;color:#000;flex-shrink:0}
.logo-title{font-size:15px;font-weight:700}.logo-sub{font-size:10px;color:var(--text3)}
.header-meta{text-align:right;font-size:11px;color:var(--text3)}
.header-meta span{color:var(--text2)}
.wellness-bar{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);
padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.wi-label{font-size:12px;color:var(--text2);flex-shrink:0}
.wi-track{flex:1;min-width:120px;height:8px;background:var(--bg3);border-radius:4px;overflow:hidden}
.wi-fill{height:100%;border-radius:4px;transition:width .5s,background .4s;width:0%}
.wi-val{font-family:var(--mono);font-size:14px;font-weight:700;flex-shrink:0}
.wi-badge{font-size:11px;padding:2px 8px;border-radius:4px;font-weight:600;flex-shrink:0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;margin-bottom:16px}
.tile{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);
padding:14px;display:flex;flex-direction:column;gap:6px;position:relative;overflow:hidden}
.tile-icon{font-size:20px;line-height:1}
.tile-label{font-size:11px;color:var(--text3);font-weight:600;letter-spacing:.04em;text-transform:uppercase}
.tile-val{font-family:var(--mono);font-size:24px;font-weight:700;line-height:1}
.tile-unit{font-size:12px;color:var(--text3)}
.tile-hint{font-size:10px;color:var(--text3);margin-top:1px}
.tile-status{font-size:11px;font-weight:600;margin-top:2px}
.tile-status.ok{color:var(--green)}.tile-status.warn{color:var(--amber)}.tile-status.danger{color:var(--red)}
.spark{width:100%;height:32px;margin-top:6px;opacity:.6}
.status-bar{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);
padding:10px 16px;display:flex;align-items:center;gap:10px;font-size:12px;flex-wrap:wrap}
.dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;background:var(--text3)}
.dot.online{background:var(--green);box-shadow:0 0 6px var(--green)}.dot.offline{background:var(--red)}
#status-text{color:var(--text2)}#last-update{color:var(--text3);margin-left:auto}
.tile.level-ok{border-color:rgba(32,201,122,0.2)}.tile.level-warn{border-color:rgba(245,166,35,0.25)}
.tile.level-danger{border-color:rgba(240,64,64,0.3)}.tile.level-danger .tile-val{color:var(--red)}
.tile.level-warn .tile-val{color:var(--amber)}
@media(max-width:400px){.grid{grid-template-columns:repeat(2,1fr)}}
</style>
</head>
<body>
<header>
  <div class="logo">
    <div class="logo-icon">N</div>
    <div><div class="logo-title">NEXIS Wellness</div><div class="logo-sub">ESP32 Live Dashboard</div></div>
  </div>
  <div class="header-meta">
    <div>ESP32: <span id="esp-ip"></span></div>
    <div>Аптайм: <span id="uptime-val">—</span></div>
  </div>
</header>
<div class="wellness-bar">
  <span class="wi-label">Wellness Index</span>
  <div class="wi-track"><div class="wi-fill" id="wi-fill"></div></div>
  <span class="wi-val" id="wi-val">—</span>
  <span class="wi-badge" id="wi-badge">—</span>
</div>
<div class="grid" id="tiles"></div>
<div class="status-bar">
  <div class="dot" id="status-dot"></div>
  <span id="status-text">Подключение...</span>
  <span id="last-update"></span>
</div>
<script>
var TILES = [
  {id:'temp',     icon:'🌡️', label:'Температура', unit:'°C',  key:'temperature', fmt:1, thr:[27,30],   inv:false},
  {id:'hum',      icon:'💧', label:'Влажность',   unit:'%',   key:'humidity',    fmt:0, thr:[65,75],   inv:false},
  {id:'co2',      icon:'🌿', label:'CO₂',         unit:'ppm', key:'co2',         fmt:0, thr:[800,1200],inv:false},
  {id:'light',    icon:'☀️', label:'Освещённость',unit:'lux', key:'light',       fmt:0, thr:[150,50],  inv:true },
  {id:'noise',    icon:'🔊', label:'Шум',         unit:'дБ',  key:'noise',       fmt:1, thr:[55,70],   inv:false},
  {id:'pressure', icon:'🔵', label:'Давление',    unit:'hPa', key:'pressure',    fmt:1, thr:[],        inv:false},
  {id:'motion',   icon:'👤', label:'Присутствие', unit:'',    key:'motion',      fmt:-1,thr:[],        inv:false},
];

var HINTS = {
  temperature: function(v){
    if(v<18) return 'Холодно'; if(v<22) return 'Прохладно';
    if(v<26) return '✓ Комфорт'; if(v<28) return 'Тепло';
    if(v<30) return '⚠ Жарко'; return '✗ ПЕРЕГРЕВ';
  },
  humidity: function(v){
    if(v<30) return '✗ Очень сухо'; if(v<40) return '⚠ Сухо';
    if(v<60) return '✓ Норма'; if(v<70) return '⚠ Влажно'; return '✗ Слишком влажно';
  },
  co2: function(v){
    if(v<500) return '✓ Чистый воздух'; if(v<800) return '✓ Норма';
    if(v<1200) return '⚠ Проветрить'; return '✗ ОПАСНО';
  },
  light: function(v){
    if(v<50) return '✗ Очень темно'; if(v<150) return '⚠ Тускло';
    if(v<300) return 'Уютно'; if(v<600) return '✓ Рабочее'; return 'Яркое';
  },
  noise: function(v){
    if(v<30) return 'Тишина'; if(v<45) return '✓ Тихо';
    if(v<55) return '✓ Норма'; if(v<70) return '⚠ Шумно'; return '✗ ОПАСНО';
  },
  pressure: function(v){
    if(v<995) return 'Низкое (циклон)'; if(v<1010) return 'Ниже нормы';
    if(v<1022) return '✓ Норма'; return 'Высокое';
  },
};

var hist = {};
TILES.forEach(function(t){ hist[t.key] = []; });

function calcWellness(s) {
  if(!s) return {index:0,level:'bad'};
  function norm(v,lo,hi){return Math.max(0,Math.min(1,(v-lo)/(hi-lo)));}
  var air  = s.co2         ? Math.max(0,1-norm(s.co2,400,1600))           : 0.5;
  var temp = s.temperature ? Math.max(0,1-Math.abs(s.temperature-22)/8)   : 0.5;
  var hum  = s.humidity    ? Math.max(0,1-Math.abs(s.humidity-50)/30)     : 0.5;
  var lux  = s.light       ? Math.min(1,s.light/400)                      : 0.5;
  var noise= s.noise       ? Math.max(0,1-norm(s.noise,35,80))            : 0.5;
  var idx  = Math.round((air*0.30+temp*0.25+hum*0.20+lux*0.15+noise*0.10)*100);
  return {index:idx,level:idx>=75?'ok':idx>=45?'warn':'bad'};
}

function sparkPoints(vals){
  if(vals.length<2) return '';
  var W=100,H=32,lo=Math.min.apply(null,vals),hi=Math.max.apply(null,vals),rng=hi-lo||1;
  return vals.map(function(v,i){
    return ((i/(vals.length-1))*W).toFixed(1)+','+((H-((v-lo)/rng)*(H*0.8)-H*0.1)).toFixed(1);
  }).join(' ');
}

function makeSVG(tag,attrs){
  var el=document.createElementNS('http://www.w3.org/2000/svg',tag);
  Object.keys(attrs).forEach(function(k){el.setAttribute(k,attrs[k]);});
  return el;
}

function buildTiles(){
  var grid=document.getElementById('tiles');
  TILES.forEach(function(t){
    var tile=document.createElement('div'); tile.className='tile'; tile.id='tile-'+t.id;
    var icon=document.createElement('span'); icon.className='tile-icon'; icon.textContent=t.icon;
    var label=document.createElement('span'); label.className='tile-label'; label.textContent=t.label;
    var val=document.createElement('span'); val.className='tile-val'; val.id='val-'+t.id; val.textContent='—';
    var unit=document.createElement('span'); unit.className='tile-unit'; unit.textContent=t.unit;
    var hint=document.createElement('span'); hint.className='tile-hint'; hint.id='hint-'+t.id;
    var status=document.createElement('span'); status.className='tile-status'; status.id='st-'+t.id;
    var svg=makeSVG('svg',{class:'spark',viewBox:'0 0 100 32',preserveAspectRatio:'none'});
    var poly=makeSVG('polyline',{fill:'none',stroke:'var(--blue)','stroke-width':'1.5',points:'',id:'line-'+t.id});
    svg.appendChild(poly);
    tile.appendChild(icon); tile.appendChild(label); tile.appendChild(val);
    tile.appendChild(unit); tile.appendChild(hint); tile.appendChild(status); tile.appendChild(svg);
    grid.appendChild(tile);
  });
}

function levelOf(v,thr,inv){
  if(!thr.length) return 'ok';
  if(!inv) return v>=thr[1]?'danger':v>=thr[0]?'warn':'ok';
  return v<=thr[1]?'danger':v<=thr[0]?'warn':'ok';
}
var LTEXT={ok:'✓ Норма',warn:'⚠ Внимание',danger:'✗ Опасно'};
var LCOL={ok:'var(--green)',warn:'var(--amber)',danger:'var(--red)'};

function updateUI(s){
  TILES.forEach(function(t){
    var raw=s[t.key]; if(raw===undefined||raw===null) return;
    var valEl=document.getElementById('val-'+t.id);
    var stEl=document.getElementById('st-'+t.id);
    var hintEl=document.getElementById('hint-'+t.id);
    var tile=document.getElementById('tile-'+t.id);
    var line=document.getElementById('line-'+t.id);

    if(t.fmt===-1){
      valEl.textContent=raw?'Да':'Нет';
      tile.className='tile level-'+(raw?'warn':'ok');
      stEl.className='tile-status '+(raw?'warn':'ok');
      stEl.textContent=raw?'Движение':'Тихо';
      return;
    }
    var v=parseFloat(raw); if(isNaN(v)) return;
    valEl.textContent=t.fmt>0?v.toFixed(t.fmt):Math.round(v);
    var lvl=levelOf(v,t.thr,t.inv);
    tile.className='tile level-'+lvl;
    stEl.className='tile-status '+lvl;
    stEl.textContent=t.thr.length?LTEXT[lvl]:'';
    if(HINTS[t.key]) hintEl.textContent=HINTS[t.key](v);
    hist[t.key].push(v); if(hist[t.key].length>20) hist[t.key].shift();
    line.setAttribute('points',sparkPoints(hist[t.key]));
    line.style.stroke=LCOL[lvl];
  });

  var w=calcWellness(s);
  var col=LCOL[w.level];
  document.getElementById('wi-fill').style.width=w.index+'%';
  document.getElementById('wi-fill').style.background=col;
  document.getElementById('wi-val').textContent=w.index;
  document.getElementById('wi-val').style.color=col;
  var wb=document.getElementById('wi-badge');
  wb.textContent=w.level==='ok'?'Хорошо':w.level==='warn'?'Средне':'Плохо';
  wb.style.background=w.level==='ok'?'rgba(32,201,122,0.15)':w.level==='warn'?'rgba(245,166,35,0.15)':'rgba(240,64,64,0.15)';
  wb.style.color=col;

  if(s.uptime_s){
    var h=Math.floor(s.uptime_s/3600),m=Math.floor((s.uptime_s%3600)/60);
    document.getElementById('uptime-val').textContent=(h>0?h+'ч ':'')+(m>0?m+'м ':'')+s.uptime_s%60+'с';
  }
  document.getElementById('last-update').textContent='Обновлено: '+new Date().toLocaleTimeString('ru-RU');
}

var failCount=0;
function poll(){
  fetch('/api/sensors',{cache:'no-store'})
    .then(function(r){if(!r.ok) throw new Error(r.status); return r.json();})
    .then(function(d){
      failCount=0;
      document.getElementById('status-dot').className='dot online';
      document.getElementById('status-text').textContent='ESP32 онлайн';
      updateUI(d);
    })
    .catch(function(){
      failCount++;
      document.getElementById('status-dot').className='dot offline';
      document.getElementById('status-text').textContent='Нет ответа от ESP32 ('+failCount+')';
    });
}

document.getElementById('esp-ip').textContent=window.location.hostname;
buildTiles();
poll();
setInterval(poll,5000);
</script>
</body>
</html>
)===";

// ─────────────────────────────────────────────
//  ОБЪЕКТЫ
// ─────────────────────────────────────────────
Adafruit_BME280   bme;
BH1750            lightMeter;
LiquidCrystal_I2C lcd(ADDR_LCD, 16, 2);
WebServer         webServer(80);

String API_DATA_URL = "http://" + String(SERVER_HOST) + ":" + SERVER_PORT + "/api/data";
String API_POMO_URL = "http://" + String(SERVER_HOST) + ":" + SERVER_PORT + "/api/pomodoro";

// ─────────────────────────────────────────────
//  ДАННЫЕ ДАТЧИКОВ
// ─────────────────────────────────────────────
float sensorTemp      = NAN;   // °C   (BME280)
float sensorHum       = NAN;   // %    (BME280)
float sensorPressure  = NAN;   // hPa  (BME280)
float sensorDewPoint  = NAN;   // °C   вычисляется из T и H
float sensorHeatIndex = NAN;   // °C   вычисляется при T > 27°C
float sensorCO2       = NAN;   // ppm  (MQ-135, аналог)
float sensorLight     = NAN;   // lux  (BH1750)
float sensorNoise     = NAN;   // дБ   (KY-037)
bool  sensorMotion    = false;

// ─────────────────────────────────────────────
//  СОСТОЯНИЕ СИСТЕМЫ
// ─────────────────────────────────────────────
enum AlertLevel { ALERT_OK, ALERT_WARN, ALERT_DANGER };
AlertLevel alertLevel = ALERT_OK;
String     alertMessage = "";

bool wifiConnected = false;

enum PomoMode { POMO_IDLE, POMO_WORK, POMO_BREAK };
PomoMode pomoMode        = POMO_IDLE;
uint32_t pomoStartTime   = 0;
int      pomoSecondsLeft = 0;
int      pomoCycles      = 0;

uint8_t displayPage = 0;
const uint8_t DISPLAY_PAGES = 6;

uint32_t lastSensorRead    = 0;
uint32_t lastDisplayChange = 0;
uint32_t lastWifiCheck     = 0;

// ─────────────────────────────────────────────
//  ISR — ПРЕРЫВАНИЯ (выполняются в IRAM, не в Flash)
// ─────────────────────────────────────────────
volatile bool isrBtnMode = false;
volatile bool isrBtnOK   = false;
volatile bool isrPIR     = false;

void IRAM_ATTR onBtnMode() { isrBtnMode = true; }
void IRAM_ATTR onBtnOK()   { isrBtnOK   = true; }
void IRAM_ATTR onPIR()     { isrPIR     = true; }

// ─────────────────────────────────────────────
//  RGB LED
// ─────────────────────────────────────────────
void setLED(uint8_t r, uint8_t g, uint8_t b) {
  analogWrite(PIN_LED_R, r);
  analogWrite(PIN_LED_G, g);
  analogWrite(PIN_LED_B, b);
}

void updateLED() {
  if (!wifiConnected) {
    bool blink = (millis() / 500) % 2;
    setLED(0, 0, blink ? 200 : 0);   // Синий мигает — нет WiFi
    return;
  }
  if (pomoMode == POMO_BREAK) { setLED(0, 0, 100);   return; }  // Тёмно-синий — перерыв
  if (pomoMode == POMO_WORK)  { setLED(0, 150, 50);  return; }  // Бирюзовый   — работа
  switch (alertLevel) {
    case ALERT_OK:     setLED(0, 200, 0);   break;  // Зелёный
    case ALERT_WARN:   setLED(200, 150, 0); break;  // Жёлтый
    case ALERT_DANGER: setLED(255, 0, 0);   break;  // Красный
  }
}

// ─────────────────────────────────────────────
//  ЗУММЕР
// ─────────────────────────────────────────────
void beep(int freq, int ms) { tone(PIN_BUZZER, freq, ms); }
void beepOK()     { beep(1000, 100); }
void beepWarn()   { for (int i = 0; i < 3; i++) { beep(800, 150); delay(200); } }
void beepDanger() { for (int i = 0; i < 5; i++) { beep(500, 100); delay(150); } }
void beepPomoDone() {
  int m[] = {1047, 1175, 1319, 1397};
  for (int n : m) { beep(n, 200); delay(220); }
}

// ─────────────────────────────────────────────
//  LCD — ВЫВОД
// ─────────────────────────────────────────────
void lcdPrint(const char *l1, const char *l2) {
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print(l1);
  lcd.setCursor(0, 1); lcd.print(l2);
}

void lcdRow(uint8_t row, const char *fmt, ...) {
  char buf[17] = {};
  va_list args; va_start(args, fmt);
  vsnprintf(buf, 17, fmt, args); va_end(args);
  for (int i = strlen(buf); i < 16; i++) buf[i] = ' ';
  lcd.setCursor(0, row); lcd.print(buf);
}

// Wellness-индекс: 0–100
int computeWellness() {
  int score = 0, cnt = 0;
  if (!isnan(sensorCO2)) {
    score += (int)(max(0.0f, 1.0f - (sensorCO2 - 400) / 1200.0f) * 100) * 30;
    cnt += 30;
  }
  if (!isnan(sensorTemp)) {
    score += (int)(max(0.0f, 1.0f - abs(sensorTemp - 22.0f) / 8.0f) * 100) * 25;
    cnt += 25;
  }
  if (!isnan(sensorHum)) {
    score += (int)(max(0.0f, 1.0f - abs(sensorHum - 50.0f) / 30.0f) * 100) * 20;
    cnt += 20;
  }
  if (!isnan(sensorLight)) {
    score += min(100, (int)(sensorLight / 4.0f)) * 15;
    cnt += 15;
  }
  if (!isnan(sensorNoise)) {
    score += (int)(max(0.0f, 1.0f - (sensorNoise - 35.0f) / 45.0f) * 100) * 10;
    cnt += 10;
  }
  return cnt > 0 ? score / cnt : 50;
}

void updateDisplay() {
  switch (displayPage) {

    case 0:  // Температура + интерпретация
      if (!isnan(sensorTemp)) {
        lcdRow(0, "T:%5.1fC H:%4.0f%%", sensorTemp, sensorHum);
        if      (sensorTemp < 18)  lcdRow(1, "Cold            ");
        else if (sensorTemp < 22)  lcdRow(1, "Cool            ");
        else if (sensorTemp < 26)  lcdRow(1, "Comfort OK      ");
        else if (sensorTemp < 28)  lcdRow(1, "Warm            ");
        else if (sensorTemp < 30)  lcdRow(1, "Hot! Ventilate  ");
        else                       lcdRow(1, "!! OVERHEAT !!  ");
      } else {
        lcdPrint("BME280 ERROR    ", "Check I2C 0x76  ");
      }
      break;

    case 1:  // Давление + точка росы
      if (!isnan(sensorPressure)) {
        lcdRow(0, "P:%6.1fhPa     ", sensorPressure);
        const char* ps =
          sensorPressure < 995  ? "Low. Cyclone    " :
          sensorPressure < 1010 ? "Below normal    " :
          sensorPressure < 1022 ? "Normal OK       " : "High pressure  ";
        lcdRow(1, ps);
      } else {
        lcdPrint("Pressure: N/A   ", "BME280?         ");
      }
      if (!isnan(sensorDewPoint))
        lcdRow(1, "TD:%4.1fC %s", sensorDewPoint,
          sensorPressure < 995 ? "Cycl" : sensorPressure < 1022 ? "Norm" : "High");
      break;

    case 2:  // CO₂ + качество воздуха
      if (!isnan(sensorCO2)) {
        lcdRow(0, "CO2: %5.0f ppm  ", sensorCO2);
        if      (sensorCO2 < 500)  lcdRow(1, "Clean air       ");
        else if (sensorCO2 < 800)  lcdRow(1, "Normal OK       ");
        else if (sensorCO2 < 1000) lcdRow(1, "Ventilate!      ");
        else if (sensorCO2 < 1200) lcdRow(1, "WARN! Open win! ");
        else                       lcdRow(1, "!DANGER! AIR!!! ");
      } else {
        lcdPrint("CO2: N/A        ", "GPIO36 MQ-135   ");
      }
      break;

    case 3:  // Освещённость + Шум
      if (!isnan(sensorLight)) {
        lcdRow(0, "Light:%5.0f lux ", sensorLight);
        const char* ls =
          sensorLight < 50  ? "Very dark X     " :
          sensorLight < 150 ? "Low light!      " :
          sensorLight < 400 ? "Work light OK   " : "Bright          ";
        lcdRow(1, ls);
      } else {
        lcdRow(0, "Light: N/A      ");
      }
      if (!isnan(sensorNoise))
        lcdRow(1, "Noise:%4.0fdB %s", sensorNoise,
          sensorNoise < 45 ? "Quiet" : sensorNoise < 55 ? "Norm " :
          sensorNoise < 70 ? "LOUD " : "DNGR!");
      break;

    case 4:  // Движение + Wellness + WiFi
      lcdRow(0, "Mot:%s W:%3d%%   ",
        sensorMotion ? "YES" : "No ",
        computeWellness());
      if (wifiConnected)
        lcdRow(1, "%-16s", WiFi.localIP().toString().c_str());
      else
        lcdRow(1, "WiFi: NO CONN   ");
      break;

    case 5:  // Pomodoro
      if (pomoMode == POMO_IDLE) {
        lcdPrint("Pomodoro: IDLE  ", "OK - to start   ");
      } else {
        lcdRow(0, "Pomo[%s] #%d     ",
          pomoMode == POMO_WORK ? "WORK" : "REST", pomoCycles + 1);
        lcdRow(1, "Left:  %02d:%02d      ", pomoSecondsLeft / 60, pomoSecondsLeft % 60);
      }
      break;
  }
}

// ─────────────────────────────────────────────
//  ЧТЕНИЕ ДАТЧИКОВ
// ─────────────────────────────────────────────
void readBME280() {
  bme.takeForcedMeasurement();   // MODE_FORCED: считать один раз и уснуть
  float t = bme.readTemperature();
  float h = bme.readHumidity();
  float p = bme.readPressure() / 100.0f;

  // Санитарная проверка диапазонов датчика
  sensorTemp     = (t < -40 || t > 85)    ? NAN : t;
  sensorHum      = (h < 0   || h > 100)   ? NAN : h;
  sensorPressure = (p < 870 || p > 1085)  ? NAN : p;

  if (!isnan(sensorTemp) && !isnan(sensorHum)) {
    // Точка росы — формула Магнуса (NOAA)
    float a = 17.27f, b = 237.7f;
    float alpha = (a * sensorTemp) / (b + sensorTemp) + log(sensorHum / 100.0f);
    sensorDewPoint = (b * alpha) / (a - alpha);

    // Индекс жары (Heat Index) — только при T ≥ 27°C
    if (sensorTemp >= 27.0f) {
      float T = sensorTemp, H = sensorHum;
      sensorHeatIndex = -8.78469475556f
        + 1.61139411f * T + 2.33854883889f * H
        - 0.14611605f * T * H - 0.012308094f * T * T
        - 0.0164248277778f * H * H + 0.002211732f * T * T * H
        + 0.00072546f * T * H * H - 0.000003582f * T * T * H * H;
    } else {
      sensorHeatIndex = NAN;
    }
  }
}

void readBH1750() {
  float lux = lightMeter.readLightLevel();
  if (lux >= 0) sensorLight = lux;
}

void readMQ135() {
  // 10 усреднённых замеров → снижение ADC-шума
  long sum = 0;
  for (int i = 0; i < 10; i++) { sum += analogRead(PIN_MQ135); delay(5); }
  // Линейная аппроксимация: ADC 0–4095 → CO₂ 400–2000 ppm
  // ВНИМАНИЕ: требует 24–48ч прогрева и индивидуальной калибровки
  sensorCO2 = (float)map(sum / 10, 0, 4095, 400, 2000);
}

void readNoise() {
  // Пиковый детектор: максимум из 20 быстрых отсчётов
  int peak = 0;
  for (int i = 0; i < 20; i++) {
    int v = analogRead(PIN_NOISE);
    if (v > peak) peak = v;
    delay(2);
  }
  // Линейная аппроксимация ADC 0–4095 → 30–90 дБ
  sensorNoise = NOISE_DB_MIN + (peak / 4095.0f) * (NOISE_DB_MAX - NOISE_DB_MIN);
}

void readPIR() {
  // ISR устанавливает флаг при импульсе, здесь считываем
  if (isrPIR) { sensorMotion = true; isrPIR = false; }
  else         { sensorMotion = (digitalRead(PIN_PIR) == HIGH); }
}

// ─────────────────────────────────────────────
//  ДЕТАЛЬНЫЙ ВЫВОД В SERIAL MONITOR
// ─────────────────────────────────────────────
void printDetailedSensors() {
  Serial.println("\n╔══════════════════════════════════════╗");
  Serial.println("║      NEXIS — Показания датчиков      ║");
  Serial.println("╚══════════════════════════════════════╝");

  if (!isnan(sensorTemp)) {
    Serial.printf("  Температура:  %6.2f °C  ", sensorTemp);
    if      (sensorTemp < 18)  Serial.println("→ Холодно");
    else if (sensorTemp < 22)  Serial.println("→ Прохладно (комфорт)");
    else if (sensorTemp < 26)  Serial.println("→ Комфортно ✓ (ГОСТ 30494: 22–25°C)");
    else if (sensorTemp < 28)  Serial.println("→ Тепло (верхний комфорт)");
    else if (sensorTemp < 30)  Serial.println("→ Жарко ⚠ WARN");
    else                       Serial.println("→ ПЕРЕГРЕВ ✗ DANGER");

    if (!isnan(sensorHeatIndex))
      Serial.printf("  Индекс жары:  %6.2f °C  (ощущается как)\n", sensorHeatIndex);
  } else {
    Serial.println("  BME280:       ✗ ОШИБКА — проверь I2C 0x76");
  }

  if (!isnan(sensorHum)) {
    Serial.printf("  Влажность:    %6.2f %%   ", sensorHum);
    if      (sensorHum < 30)  Serial.println("→ Очень сухо ✗");
    else if (sensorHum < 40)  Serial.println("→ Сухо ⚠");
    else if (sensorHum < 60)  Serial.println("→ Норма ✓ (ГОСТ: 40–60%)");
    else if (sensorHum < 70)  Serial.println("→ Влажно ⚠");
    else                      Serial.println("→ Слишком влажно ✗");

    if (!isnan(sensorDewPoint))
      Serial.printf("  Точка росы:   %6.2f °C  (конденсат при T ≤ TD!)\n", sensorDewPoint);
  }

  if (!isnan(sensorPressure)) {
    Serial.printf("  Давление:    %7.2f hPa  ", sensorPressure);
    if      (sensorPressure < 995)  Serial.println("→ Низкое (циклон, возможны осадки)");
    else if (sensorPressure < 1010) Serial.println("→ Ниже нормы");
    else if (sensorPressure < 1022) Serial.println("→ Норма ✓ (стандарт 1013.25 hPa)");
    else                            Serial.println("→ Высокое (антициклон)");
  }

  Serial.println("  ─────────────────────────────────────");

  if (!isnan(sensorCO2)) {
    Serial.printf("  CO₂ (MQ-135): %6.0f ppm  ", sensorCO2);
    if      (sensorCO2 < 500)  Serial.println("→ Чистый воздух ✓");
    else if (sensorCO2 < 800)  Serial.println("→ Норма ✓ (рекомендуется < 800)");
    else if (sensorCO2 < 1000) Serial.println("→ Повышенный ⚠ — рекомендуется проветрить");
    else if (sensorCO2 < 1200) Serial.println("→ Высокий ✗ WARN — открыть окна!");
    else                       Serial.println("→ ОПАСНЫЙ ✗ DANGER — срочно проветрить!");
    Serial.println("  ⚠ MQ-135: аналог, нужен прогрев 24–48ч. Данные приблизительны!");
  }

  Serial.println("  ─────────────────────────────────────");

  if (!isnan(sensorLight)) {
    Serial.printf("  Освещённость: %6.1f lux  ", sensorLight);
    if      (sensorLight < 50)   Serial.println("→ Очень тёмно ✗");
    else if (sensorLight < 150)  Serial.println("→ Слабое освещение ⚠");
    else if (sensorLight < 300)  Serial.println("→ Для отдыха/коридора");
    else if (sensorLight < 500)  Serial.println("→ Рабочее место ✓ (ГОСТ: 300–500 lux)");
    else                         Serial.println("→ Яркое ✓");
  } else {
    Serial.println("  BH1750:       ✗ ОШИБКА — проверь I2C 0x23");
  }

  if (!isnan(sensorNoise)) {
    Serial.printf("  Шум (KY-037): %6.1f дБ   ", sensorNoise);
    if      (sensorNoise < 30)   Serial.println("→ Тишина");
    else if (sensorNoise < 45)   Serial.println("→ Тихо ✓");
    else if (sensorNoise < 55)   Serial.println("→ Умеренно ✓ (норма офиса)");
    else if (sensorNoise < 70)   Serial.println("→ Шумно ✗ WARN (ГОСТ: < 55 дБ)");
    else                         Serial.println("→ ОПАСНО ✗✗ DANGER (вред слуху > 75 дБ)");
  }

  Serial.printf("  Движение:     %s\n", sensorMotion ? "● ОБНАРУЖЕНО" : "○ нет");

  Serial.println("  ─────────────────────────────────────");
  int w = computeWellness();
  Serial.printf("  Wellness:     %d/100 ", w);
  if      (w >= 80)  Serial.println("→ Отличные условия ✓✓");
  else if (w >= 65)  Serial.println("→ Хорошие условия ✓");
  else if (w >= 50)  Serial.println("→ Средние условия ⚠");
  else               Serial.println("→ Неудовлетворительно ✗");

  Serial.printf("  WiFi:         %s\n",
    wifiConnected ? WiFi.localIP().toString().c_str() : "нет соединения");
  if (alertLevel != ALERT_OK)
    Serial.printf("  АЛЕРТ [%s]: %s\n",
      alertLevel == ALERT_DANGER ? "DANGER" : "WARN", alertMessage.c_str());
  if (pomoMode != POMO_IDLE)
    Serial.printf("  Pomodoro:     %s — %d:%02d (#%d)\n",
      pomoMode == POMO_WORK ? "РАБОТА" : "ПЕРЕРЫВ",
      pomoSecondsLeft / 60, pomoSecondsLeft % 60, pomoCycles + 1);

  Serial.println("════════════════════════════════════════");
}

// ─────────────────────────────────────────────
//  ПОРОГИ АЛЕРТОВ
// ─────────────────────────────────────────────
AlertLevel checkThresholds() {
  AlertLevel lvl = ALERT_OK;
  alertMessage = "";

  auto upd = [&](AlertLevel nl, const char *msg) {
    if (nl > lvl) { lvl = nl; alertMessage = msg; }
    else if (nl == lvl && alertMessage.isEmpty()) alertMessage = msg;
  };

  if (!isnan(sensorTemp)) {
    if      (sensorTemp > THRESH_TEMP_DANGER) upd(ALERT_DANGER, "TEMP TOO HIGH!");
    else if (sensorTemp > THRESH_TEMP_WARN)   upd(ALERT_WARN,   "Temp elevated");
  }
  if (!isnan(sensorHum)) {
    if      (sensorHum > THRESH_HUM_DANGER)   upd(ALERT_DANGER, "HUMIDITY HIGH!");
    else if (sensorHum > THRESH_HUM_WARN)     upd(ALERT_WARN,   "Humidity high");
  }
  if (!isnan(sensorLight) && sensorLight > 0) {
    if      (sensorLight < THRESH_LIGHT_DANGER) upd(ALERT_DANGER, "LIGHT TOO LOW!");
    else if (sensorLight < THRESH_LIGHT_WARN)   upd(ALERT_WARN,   "Light low");
  }
  if (!isnan(sensorNoise)) {
    if      (sensorNoise > THRESH_NOISE_DANGER) upd(ALERT_DANGER, "NOISE DANGER!");
    else if (sensorNoise > THRESH_NOISE_WARN)   upd(ALERT_WARN,   "Noise elevated");
  }
  if (!isnan(sensorCO2)) {
    if      (sensorCO2 >= THRESH_CO2_DANGER)    upd(ALERT_DANGER, "CO2 DANGER!");
    else if (sensorCO2 >= THRESH_CO2_WARN)      upd(ALERT_WARN,   "CO2 elevated");
  }
  return lvl;
}

// ─────────────────────────────────────────────
//  HTTP POST НА FASTAPI СЕРВЕР
// ─────────────────────────────────────────────
bool postSensorData() {
  if (!wifiConnected) return false;
  HTTPClient http;
  http.begin(API_DATA_URL);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);

  JsonDocument doc;
  if (!isnan(sensorTemp))     doc["temperature"]  = round(sensorTemp * 10) / 10.0;
  if (!isnan(sensorHum))      doc["humidity"]     = round(sensorHum * 10) / 10.0;
  if (!isnan(sensorPressure)) doc["pressure"]     = round(sensorPressure * 10) / 10.0;
  if (!isnan(sensorLight))    doc["light"]        = round(sensorLight);
  if (!isnan(sensorNoise))    doc["noise"]        = round(sensorNoise * 10) / 10.0;
  if (!isnan(sensorCO2))      doc["co2"]          = round(sensorCO2);
  doc["motion"] = sensorMotion ? 1 : 0;

  String body; serializeJson(doc, body);
  int code = http.POST(body);
  http.end();

  if (code == 200) {
    Serial.println("[NEXIS POST] OK → сервер принял данные (бот получит их автоматически)");
    return true;
  }
  Serial.printf("[NEXIS POST] FAILED: HTTP %d — запущен ли uvicorn?\n", code);
  return false;
}

bool postPomodoroEvent(const char *type, int dur) {
  if (!wifiConnected) return false;
  HTTPClient http;
  http.begin(API_POMO_URL);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);
  JsonDocument doc; doc["type"] = type; doc["duration"] = dur;
  String body; serializeJson(doc, body);
  int code = http.POST(body); http.end();
  return (code == 200);
}

// ─────────────────────────────────────────────
//  ESP32 WEBSERVER
// ─────────────────────────────────────────────
void setupWebServer() {
  // Главная страница — встроенный HTML из Flash памяти
  webServer.on("/", HTTP_GET, []() {
    webServer.send_P(200, "text/html", INDEX_HTML);
  });
  webServer.on("/index.html", HTTP_GET, []() {
    webServer.send_P(200, "text/html", INDEX_HTML);
  });

  // Данные датчиков — JSON, совместимый с полями NEXIS сервера
  webServer.on("/api/sensors", HTTP_GET, []() {
    JsonDocument doc;
    if (!isnan(sensorTemp))     doc["temperature"]  = round(sensorTemp * 100) / 100.0;
    if (!isnan(sensorHum))      doc["humidity"]     = round(sensorHum * 100) / 100.0;
    if (!isnan(sensorPressure)) doc["pressure"]     = round(sensorPressure * 10) / 10.0;
    if (!isnan(sensorCO2))      doc["co2"]          = (int)round(sensorCO2);
    if (!isnan(sensorLight))    doc["light"]        = round(sensorLight);
    if (!isnan(sensorNoise))    doc["noise"]        = round(sensorNoise * 10) / 10.0;
    if (!isnan(sensorDewPoint)) doc["dew_point"]    = round(sensorDewPoint * 10) / 10.0;
    doc["motion"]   = sensorMotion ? 1 : 0;
    doc["wellness"] = computeWellness();
    doc["uptime_s"] = (int)(millis() / 1000);
    doc["alert"]    = alertMessage.isEmpty() ? "ok" : alertMessage.c_str();

    String json; serializeJson(doc, json);
    webServer.sendHeader("Access-Control-Allow-Origin", "*");
    webServer.send(200, "application/json", json);
  });

  webServer.on("/api/status", HTTP_GET, []() {
    String j = "{\"status\":\"ok\",\"device\":\"NEXIS-ESP32\",";
    j += "\"ip\":\"" + WiFi.localIP().toString() + "\",";
    j += "\"uptime_s\":" + String((int)(millis() / 1000)) + "}";
    webServer.send(200, "application/json", j);
  });

  webServer.onNotFound([]() {
    webServer.send(404, "text/plain", "Not found");
  });

  webServer.begin();
  Serial.println("[WebServer] Запущен на порту 80");
  Serial.println("[WebServer] http://" + WiFi.localIP().toString());
}

// ─────────────────────────────────────────────
//  WiFi
// ─────────────────────────────────────────────
void wifiConnect() {
  Serial.printf("[WiFi] Подключение к %s ...\n", WIFI_SSID);
  lcdPrint("Connecting WiFi ", WIFI_SSID);
  setLED(0, 0, 200);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  uint32_t t = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t < 15000) {
    delay(500); Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    char ip[17]; WiFi.localIP().toString().toCharArray(ip, 17);
    Serial.println("[WiFi] Подключено! IP: " + WiFi.localIP().toString());
    lcdPrint("WiFi Connected! ", ip);
    setLED(0, 200, 0); beepOK(); delay(1500);
    setupWebServer();
  } else {
    wifiConnected = false;
    Serial.println("[WiFi] ОШИБКА — автономный режим");
    lcdPrint("WiFi FAILED     ", "Offline mode... ");
    delay(2000);
  }
}

// ─────────────────────────────────────────────
//  POMODORO
// ─────────────────────────────────────────────
void pomoStart() {
  pomoMode = POMO_WORK; pomoStartTime = millis(); pomoSecondsLeft = POMO_WORK_MIN * 60;
  lcdPrint("Pomodoro START! ", "Work 25 min!    ");
  beepOK(); delay(1000);
  Serial.printf("[Pomo] Старт — цикл #%d\n", pomoCycles + 1);
}

void pomoStop() {
  pomoMode = POMO_IDLE;
  lcdPrint("Pomodoro STOP   ", "                ");
  beepOK(); delay(800);
}

void updatePomodoro() {
  if (pomoMode == POMO_IDLE) return;
  uint32_t el = (millis() - pomoStartTime) / 1000;

  if (pomoMode == POMO_WORK) {
    int left = POMO_WORK_MIN * 60 - (int)el;
    pomoSecondsLeft = max(0, left);
    if (left <= 0) {
      pomoCycles++;
      postPomodoroEvent("work", POMO_WORK_MIN);  // бот сам отобразит статистику
      beepPomoDone();
      lcdPrint("WORK DONE!      ", "Break 5 min!    ");
      delay(2000);
      pomoMode = POMO_BREAK; pomoStartTime = millis(); pomoSecondsLeft = POMO_BREAK_MIN * 60;
    }
  } else {
    int left = POMO_BREAK_MIN * 60 - (int)el;
    pomoSecondsLeft = max(0, left);
    if (left <= 0) {
      postPomodoroEvent("break", POMO_BREAK_MIN);
      beepOK();
      lcdPrint("Break over!     ", "OK - continue   ");
      pomoMode = POMO_IDLE;
    }
  }
}

// ─────────────────────────────────────────────
//  КНОПКИ (дебаунс через millis — не delay)
// ─────────────────────────────────────────────
uint32_t btnModeLast = 0, btnOKLast = 0;
const uint32_t DEBOUNCE_MS = 200;

void handleButtons() {
  uint32_t now = millis();

  if (isrBtnMode && now - btnModeLast > DEBOUNCE_MS) {
    isrBtnMode = false; btnModeLast = now;
    displayPage = (displayPage + 1) % DISPLAY_PAGES;
    updateDisplay(); beepOK();
  }

  if (isrBtnOK && now - btnOKLast > DEBOUNCE_MS) {
    isrBtnOK = false; btnOKLast = now;
    if (pomoMode == POMO_IDLE) pomoStart(); else pomoStop();
  }
}

// ─────────────────────────────────────────────
//  SETUP
// ─────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n╔═══════════════════════════════════════╗");
  Serial.println("║   NEXIS Wellness Station v3.0 UNIFIED ║");
  Serial.println("║   BME280 + MQ-135 + WebServer         ║");
  Serial.println("║   Telegram: через bot.py на сервере   ║");
  Serial.println("╚═══════════════════════════════════════╝");

  // Пины
  pinMode(PIN_PIR,      INPUT);
  pinMode(PIN_BTN_MODE, INPUT_PULLUP);
  pinMode(PIN_BTN_OK,   INPUT_PULLUP);
  pinMode(PIN_LED_R,    OUTPUT);
  pinMode(PIN_LED_G,    OUTPUT);
  pinMode(PIN_LED_B,    OUTPUT);
  pinMode(PIN_BUZZER,   OUTPUT);
  setLED(0, 0, 50);

  // ISR — прерывания (IRAM_ATTR = в оперативной памяти, мгновенный отклик)
  attachInterrupt(digitalPinToInterrupt(PIN_BTN_MODE), onBtnMode, FALLING);
  attachInterrupt(digitalPinToInterrupt(PIN_BTN_OK),   onBtnOK,   FALLING);
  attachInterrupt(digitalPinToInterrupt(PIN_PIR),      onPIR,     RISING);
  Serial.println("[OK] ISR: BTN_MODE(GPIO32) BTN_OK(GPIO33) PIR(GPIO27)");

  // ADC — 12 бит (0–4095), полный диапазон 0–3.3V
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  // I2C и LCD
  Wire.begin(I2C_SDA, I2C_SCL);
  lcd.init(); lcd.backlight();
  lcdPrint("NEXIS v3.0      ", "Initializing... ");
  delay(500);

  // BME280
  if (!bme.begin(ADDR_BME280, &Wire)) {
    Serial.println("[ERR] BME280 не найден! Проверь I2C 0x76, провода SDA/SCL, питание 3.3V");
    lcdPrint("BME280 ERROR!   ", "Check I2C 0x76  "); delay(2000);
  } else {
    bme.setSampling(Adafruit_BME280::MODE_FORCED,    // спать между измерениями
                    Adafruit_BME280::SAMPLING_X1,
                    Adafruit_BME280::SAMPLING_X1,
                    Adafruit_BME280::SAMPLING_X1,
                    Adafruit_BME280::FILTER_OFF);
    Serial.println("[OK] BME280 (I2C 0x76) — температура / влажность / давление");
    lcdPrint("BME280  OK      ", "                "); delay(500);
  }

  // BH1750
  if (!lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, ADDR_BH1750, &Wire)) {
    Serial.println("[ERR] BH1750 не найден! Проверь I2C 0x23 и питание 3.3V");
    lcdPrint("BH1750 ERROR!   ", "Check I2C 0x23  "); delay(2000);
  } else {
    Serial.println("[OK] BH1750 (I2C 0x23) — освещённость 1–65535 lux");
    lcdPrint("BH1750  OK      ", "                "); delay(500);
  }

  Serial.println("[OK] MQ-135 (GPIO36 ADC1) — CO₂ аналог (прогрев 24–48ч!)");
  lcdPrint("MQ-135  OK      ", "Warm-up needed! "); delay(500);
  Serial.println("[OK] KY-037 (GPIO39 ADC1) — шум");
  Serial.println("[OK] PIR    (GPIO27)       — движение");

  // WiFi + WebServer
  wifiConnect();

  // Первое чтение
  readBME280(); readBH1750(); readMQ135(); readNoise(); readPIR();
  alertLevel = checkThresholds();
  updateLED(); updateDisplay();
  printDetailedSensors();

  Serial.println("\n[OK] Инициализация завершена!");
  Serial.printf("[OK] Дашборд ESP32: http://%s\n",
    wifiConnected ? WiFi.localIP().toString().c_str() : "нет WiFi");
  Serial.printf("[OK] NEXIS сервер:  http://%s:%d\n", SERVER_HOST, SERVER_PORT);
  Serial.println("[OK] Telegram-бот: запусти  python bot.py  на сервере");
}

// ─────────────────────────────────────────────
//  LOOP
// ─────────────────────────────────────────────
void loop() {
  uint32_t now = millis();

  // 1. Обработка веб-запросов (должна вызываться в каждой итерации)
  if (wifiConnected) webServer.handleClient();

  // 2. Чтение датчиков и POST на сервер — каждые 10 секунд
  if (now - lastSensorRead >= SENSOR_MS) {
    lastSensorRead = now;

    readBME280(); readBH1750(); readMQ135(); readNoise(); readPIR();

    AlertLevel prev = alertLevel;
    alertLevel = checkThresholds();

    // Звуковое оповещение при смене уровня
    if (alertLevel == ALERT_DANGER && prev != ALERT_DANGER) beepDanger();
    else if (alertLevel == ALERT_WARN && prev == ALERT_OK)  beepWarn();

    updateLED();
    printDetailedSensors();

    // POST данных → сервер → бот сам читает /api/sensors и отправит алерты в Telegram
    postSensorData();
  }

  // 3. Смена экрана LCD — каждые 3 секунды
  if (now - lastDisplayChange >= DISPLAY_MS) {
    lastDisplayChange = now;
    displayPage = (displayPage + 1) % DISPLAY_PAGES;
    updateDisplay();
  }

  // 4. Pomodoro таймер
  updatePomodoro();

  // 5. Кнопки (ISR флаги)
  handleButtons();

  // 6. Переподключение WiFi — каждые 15 секунд
  if (now - lastWifiCheck >= WIFI_CHECK_MS) {
    lastWifiCheck = now;
    if (WiFi.status() != WL_CONNECTED) {
      wifiConnected = false;
      Serial.println("[WiFi] Обрыв — переподключение...");
      WiFi.reconnect();
      uint32_t t = millis();
      while (WiFi.status() != WL_CONNECTED && millis() - t < 8000) delay(500);
      if ((wifiConnected = (WiFi.status() == WL_CONNECTED)))
        Serial.println("[WiFi] Reconnected: " + WiFi.localIP().toString());
    } else {
      wifiConnected = true;
    }
  }

  delay(5);
}
```

---

## Архитектура связи

```
┌─────────────────────────────────────────────────────────────┐
│                       ESP32                                 │
│  BME280+MQ135+BH1750+PIR+KY037 → sensors                  │
│          ↓                   ↓                              │
│    LCD + RGB LED        WebServer :80                       │
│    Pomodoro             /api/sensors → JSON                 │
└──────────────┬──────────────────────────────────────────────┘
               │ POST /api/data (каждые 10 сек)
               ▼
┌─────────────────────────────────────────────────────────────┐
│             FastAPI NEXIS сервер :5000                      │
│  /api/data → SQLite → WebSocket → браузер SPA               │
│  /api/sensors → последнее показание                        │
│  /api/history → история за N часов                         │
└──────────────┬──────────────────────────────────────────────┘
               │ GET /api/sensors (каждые N мин)
               ▼
┌─────────────────────────────────────────────────────────────┐
│               bot.py (Telegram Bot)                         │
│  /status /history /forecast /tip /pomodoro /digest /week   │
│  Алерты · Wellness Index · Трекер воды · Прогноз CO₂       │
└─────────────────────────────────────────────────────────────┘
               │
               ▼ Telegram
```

## LCD страницы (6 экранов)

| # | Строка 1 | Строка 2 |
|---|---------|---------|
| 0 | `T: 22.5C H: 48%` | `Комфортно OK` |
| 1 | `P: 1013.2 hPa` | `TD: 11.2C Норм` |
| 2 | `CO2:  650 ppm` | `Норма OK` |
| 3 | `Light:  320 lux` | `Noise: 42дБ Тихо` |
| 4 | `Mot: No  W: 82%` | IP адрес ESP32 |
| 5 | `Pomo [WORK] #2` | `Осталось: 18:30` |

## JSON на FastAPI сервер (поля = модель SensorData в main.py)

```json
{
  "temperature": 22.5,
  "humidity": 48.0,
  "pressure": 1013.2,
  "co2": 650,
  "light": 320,
  "noise": 42.1,
  "motion": 0
}
```

## Встроенный WebServer ESP32 (порт 80)

| URL | Что |
|-----|-----|
| `http://<IP>/` | Дашборд с тайлами, sparkline-графиками, Wellness Index |
| `http://<IP>/api/sensors` | JSON всех датчиков + wellness + uptime_s |
| `http://<IP>/api/status` | Статус устройства |

Telegram-функции полностью в `bot.py` — `/status`, `/history`, `/forecast`, `/tip`, `/pomodoro`, `/digest`, `/week`, `/hydration`, алерты, трекер воды, утренние и вечерние сообщения.
