# Instruksi Deploy Kios Openclaw

## 1. Isi API Keys di `.env`

```
GROQ_API_KEY=gsk_...   # dari console.groq.com (GRATIS)
GEMINI_API_KEY=AIza...  # dari aistudio.google.com (GRATIS)
```

## 2. Test Lokal

```bash
npm run cek-stok       # Cek stok
npm run test:laporan   # Test laporan
node signal/bot-handler.js  # Test bot
```

## 3. Deploy Dashboard ke Vercel

```bash
cd dashboard
npm install
npx vercel login
npx vercel --prod
# Ikuti instruksi, pilih nama: kiossaya
```

## 4. Setup Vercel KV (Redis)

Di Vercel Dashboard:
- Masuk ke project > Storage > Create KV Database
- Copy env vars ke `.env` lokal dan Vercel dashboard

## 5. Setup Windows Task Scheduler

Buka PowerShell sebagai Admin, jalankan:

```powershell
# Laporan Pagi 06:00
schtasks /create /tn "KiosLaporanPagi" /tr "node C:\path\kios-openclaw\scripts\laporan-harian.js" /sc daily /st 06:00

# Laporan Siang 12:00
schtasks /create /tn "KiosLaporanSiang" /tr "node C:\path\kios-openclaw\scripts\laporan-harian.js" /sc daily /st 12:00

# Laporan Malam 20:00
schtasks /create /tn "KiosLaporanMalam" /tr "node C:\path\kios-openclaw\scripts\laporan-harian.js" /sc daily /st 20:00

# Cek Stok setiap 3 jam
schtasks /create /tn "KiosCekStok" /tr "node C:\path\kios-openclaw\scripts\cek-stok.js" /sc hourly /mo 3

# Backup harian 22:00
schtasks /create /tn "KiosBackup" /tr "node C:\path\kios-openclaw\scripts\backup.js" /sc daily /st 22:00
```

## 6. Setup Bot Telegram

1. Buka [@BotFather](https://t.me/BotFather) di Telegram → `/newbot` → ikuti instruksi → salin **bot token**.
2. Buat grup, tambahkan bot ke grup, lalu **jadikan bot admin** (perlu untuk link undangan & kelola member).
3. Dapatkan `TELEGRAM_GROUP_ID`: tambahkan [@RawDataBot](https://t.me/RawDataBot) sementara ke grup, atau cek `logs/signal.log` saat ada pesan grup masuk (chat id grup biasanya angka negatif `-100...`).
4. Isi `.env`:
   ```
   TELEGRAM_BOT_TOKEN=123456:ABC-...
   TELEGRAM_GROUP_ID=-1001234567890
   TELEGRAM_RECIPIENT=123456789        # user id owner
   TELEGRAM_WHITELIST=123456789        # user id yang boleh kirim perintah (pisah koma)
   ```
5. Verifikasi & ambil link undangan grup:
   ```
   npm run signal:setup
   ```

## 7. Jalankan Sistem

```bash
node scripts/startup.js
# atau
npm start
```

Dashboard tersedia di: https://kiossaya.vercel.app
