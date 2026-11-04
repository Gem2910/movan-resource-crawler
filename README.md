# 🎁 Movan Resource Crawler (Vercel Serverless + Cron)

Hệ thống tự động quét tài nguyên miễn phí (Thiết kế đồ họa, Prompt AI, Free API Keys, Khóa học), tự động lọc bỏ link chết (Dead-link validator) và ghi vào Google Sheet mỗi ngày một lần thông qua Vercel Cron.

---

### ⚙️ Các Biến Môi Trường Cần Thêm Trên Vercel (Environment Variables)

Vào Vercel Project -> **Settings** -> **Environment Variables** và thêm các biến sau:

| Tên Biến (Variable Name) | Giá Trị / Ý Nghĩa |
| :--- | :--- |
| `RESOURCE_SPREADSHEET_ID` | `1jDLncM9bgA7ofvtUbaAkU3SDP60dFtO4dPxAowB7azw` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Dán toàn bộ nội dung file `google-service-account.json` (dạng chuỗi 1 dòng hoặc JSON) |
| `TELEGRAM_BOT_TOKEN` | Token Bot Telegram nhận thông báo |
| `TELEGRAM_ADMIN_CHAT_ID` | ID Chat Telegram người nhận |

---

### ⏰ Lịch Chạy Cron (vercel.json)
- Lịch đặt: `0 5 * * *` (UTC) = **12:00 trưa hàng ngày theo giờ Việt Nam (UTC+7)**.
- Khi đến 12:00 trưa, Vercel tự động kích hoạt `/api/cron` để quét và cập nhật tài nguyên.
