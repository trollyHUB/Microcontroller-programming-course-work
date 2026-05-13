# TEST 03 — LCD 1602 (Дисплей)

**Устройство:** LCD 1602 с I2C-адаптером PCF8574  
**Интерфейс:** I2C — SDA=GPIO21, SCL=GPIO22, адрес 0x27  
**Питание:** 5V  
**Библиотека:** LiquidCrystal I2C (by marcoschwartz)

**Что проверяет:**
- Инициализация LCD
- Вывод текста на обе строки
- Циклический показ разных экранов
- Вывод счётчика и динамических данных

---

```cpp
/*
 * NEXIS TEST — LCD 1602 I2C
 * 16 символов × 2 строки
 * I2C: SDA=21, SCL=22, адрес 0x27
 * Питание: 5V (через VIN или отдельный источник)
 *
 * Библиотека: LiquidCrystal I2C by marcoschwartz
 *
 * Если дисплей пустой — покрути потенциометр контраста
 * на I2C-адаптере (маленький синий прямоугольник).
 */

#include <Wire.h>
#include <LiquidCrystal_I2C.h>

#define I2C_SDA   21
#define I2C_SCL   22
#define LCD_ADDR  0x27  // Стандарт PCF8574. Если не работает — попробуй 0x3F

LiquidCrystal_I2C lcd(LCD_ADDR, 16, 2);

// Вспомогательная функция — вывод строки с заполнением пробелами до 16 символов
void lcdRow(uint8_t row, const char *fmt, ...) {
  char buf[17] = {};
  va_list args;
  va_start(args, fmt);
  vsnprintf(buf, 17, fmt, args);
  va_end(args);
  for (int i = strlen(buf); i < 16; i++) buf[i] = ' ';
  lcd.setCursor(0, row);
  lcd.print(buf);
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== NEXIS TEST: LCD 1602 ===");

  Wire.begin(I2C_SDA, I2C_SCL);

  lcd.init();
  lcd.backlight();

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("NEXIS Wellness  ");
  lcd.setCursor(0, 1);
  lcd.print("Station v2.0    ");

  Serial.println("[OK] LCD инициализирован (0x27)");
  Serial.println("     Если дисплей пустой — настрой контраст потенциометром");
  delay(2000);
}

int counter = 0;
uint32_t lastSwitch = 0;
uint8_t page = 0;

void loop() {
  uint32_t now = millis();
  counter++;

  if (now - lastSwitch > 2000) {
    lastSwitch = now;
    page = (page + 1) % 4;

    switch (page) {
      case 0:
        // Экран 1: заголовок + счётчик
        lcdRow(0, "NEXIS TEST LCD  ");
        lcdRow(1, "Count: %8d", counter);
        Serial.printf("[LCD] Страница 0 — счётчик: %d\n", counter);
        break;

      case 1:
        // Экран 2: время работы
        lcdRow(0, "Uptime:         ");
        lcdRow(1, "%lu sec        ", now / 1000);
        Serial.printf("[LCD] Страница 1 — время: %lu сек\n", now / 1000);
        break;

      case 2:
        // Экран 3: демо данные датчиков
        lcdRow(0, "Temp:   23.5 C  ");
        lcdRow(1, "Hum:    48.0 %  ");
        Serial.println("[LCD] Страница 2 — демо данные");
        break;

      case 3:
        // Экран 4: все 16 символов в обеих строках
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("0123456789ABCDEF");
        lcd.setCursor(0, 1);
        lcd.print("abcdefghijklmnop");
        Serial.println("[LCD] Страница 3 — все символы");
        break;
    }
  }

  delay(50);
}
```

---

**Ожидаемый вывод:**
```
=== NEXIS TEST: LCD 1602 ===
[OK] LCD инициализирован (0x27)
     Если дисплей пустой — настрой контраст потенциометром
[LCD] Страница 0 — счётчик: 42
[LCD] Страница 1 — время: 4 сек
[LCD] Страница 2 — демо данные
[LCD] Страница 3 — все символы
```

**Устранение неполадок:**
- Пустой экран с подсветкой → покрути потенциометр контраста (синий квадрат на I2C модуле)
- Нет подсветки → проверь питание 5V на VCC LCD
- Нет реакции → попробуй адрес `0x3F` вместо `0x27`
- Кракозябры → неверная библиотека (нужна именно LiquidCrystal_I2C by marcoschwartz)
