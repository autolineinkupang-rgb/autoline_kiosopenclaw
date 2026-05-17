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

## 6. Install Signal CLI (untuk bot)

1. Download dari: https://github.com/AsamK/signal-cli/releases
2. Ekstrak ke `C:\signal-cli\`
3. Daftarkan nomor HP:
   ```
   signal-cli -u +62XXXXXXXXXX register
   signal-cli -u +62XXXXXXXXXX verify KODE_SMS
   ```
4. Update `SIGNAL_PHONE_NUMBER` dan `SIGNAL_CLI_PATH` di `.env`

## 7. Jalankan Sistem

```bash
node scripts/startup.js
# atau
npm start
```

Dashboard tersedia di: https://kiossaya.vercel.app
