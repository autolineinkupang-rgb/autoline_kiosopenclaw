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

## 7. Jalankan Sistem (lokal / Windows)

```bash
node scripts/startup.js
# atau
npm start
```

Dashboard tersedia di: https://kiossaya.vercel.app

---

## 8. Deploy 24/7 ke VPS Oracle Cloud (Linux)

Bot Telegram pakai **long polling**, jadi tidak perlu domain, port masuk, atau webhook — cukup VM Linux yang menyala terus. Cocok dengan **Oracle Cloud Always Free** (gratis selamanya).

### 8.1 Buat VM
1. Daftar di [cloud.oracle.com](https://cloud.oracle.com) → menu **Compute → Instances → Create Instance**.
2. Image: **Ubuntu 22.04/24.04**. Shape: **Ampere (ARM) Always Free** (mis. VM.Standard.A1.Flex, 1 OCPU / 6 GB) atau **VM.Standard.E2.1.Micro**.
3. Simpan **SSH key** (private key) untuk login.
4. Tidak perlu buka port apa pun di Security List — bot hanya butuh koneksi keluar.

### 8.2 Masuk & ambil kode
```bash
ssh -i kunci-private.key ubuntu@<IP_PUBLIK_VM>

git clone https://github.com/autolineinkupang-rgb/autoline_kiosopenclaw.git
cd autoline_kiosopenclaw
git checkout telegram          # branch dengan transport Telegram
```

### 8.3 Isi `.env`
```bash
cp .env.example .env
nano .env
```
Wajib diisi: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_GROUP_ID`, `TELEGRAM_RECIPIENT`, `TELEGRAM_WHITELIST`, `GROQ_API_KEY`, `GEMINI_API_KEY`.

### 8.4 Setup otomatis (Node 20 + PM2 + dependency)
```bash
bash scripts/vps-setup.sh
```
Skrip ini memasang Node.js 20, Python 3, PM2, lalu menjalankan bot. Di akhir, PM2 mencetak satu perintah `sudo env ...` — **jalankan perintah itu** supaya bot otomatis hidup lagi setelah VM reboot.

### 8.5 Verifikasi & operasional
```bash
npm run signal:setup     # verifikasi token & ambil link undangan grup (sekali)
pm2 status               # cek bot hidup
pm2 logs kios-bot        # lihat log real-time
pm2 restart kios-bot     # restart manual
```

### 8.6 Update kode ke depannya
```bash
cd autoline_kiosopenclaw
git pull
npm install --omit=dev
pm2 reload kios-bot      # restart tanpa downtime berarti
```

> Laporan terjadwal (06:00 / 20:00 dst) sudah ditangani `node-cron` **di dalam** proses bot, jadi tidak perlu cron sistem / Task Scheduler di VPS.
>
> **Dashboard tetap di Vercel** (lihat bagian 3). VPS menulis data ringkas ke Upstash Redis, dashboard Vercel membacanya — keduanya terhubung lewat Redis, bukan akses langsung ke VPS.
