# Security Policy / Политика безопасности

## Supported Versions

This is a coursework/educational project. Only the latest version in `main` branch is maintained.

| Version | Supported |
|---------|-----------|
| latest (main) | :white_check_mark: |
| older commits | :x: |

---

## Important Security Notes / Важные замечания

### Before flashing ESP32 firmware

- **Never commit real credentials.** The file `esp32/src/config.h` contains `WIFI_SSID`, `WIFI_PASSWORD`, and `SERVER_HOST` — these are placeholders. Fill them in locally and **never push a config.h with real passwords**.
- If you accidentally commit credentials, rotate them immediately (change your Wi-Fi password).

### Web Dashboard

- The FastAPI server is designed for **local network use only** (`0.0.0.0:5000`). Do not expose it to the public internet without adding authentication.
- SQLite database (`nexis.db`) is excluded from the repository via `.gitignore`. It may contain sensor history — keep it local.
- `DELETE /api/history/clear` has no authentication — restrict access to trusted LAN clients only.

---

## Reporting a Vulnerability

This is a student project — there is no formal security disclosure process.

If you find a security issue, please open a GitHub Issue with the label `security` or contact the author directly:

- **GitHub:** [@trollyHUB](https://github.com/trollyHUB)
- **Email:** tolegen.manasov05@gmail.com

Please describe:
1. The affected component (ESP32 firmware / web server / frontend)
2. Steps to reproduce
3. Potential impact

We'll respond as soon as possible and credit you in the fix commit.
