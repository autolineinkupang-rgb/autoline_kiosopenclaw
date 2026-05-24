# Panduan Deploy Kios Openclaw ke Oracle Cloud (Gratis)

> Panduan untuk **pemula**. Setiap perintah dijelaskan fungsinya.
> Estimasi total waktu: **2-3 jam** (sekali setup, jalan terus).
> Biaya: **Rp 0** (selamanya, asal akun Oracle Cloud aktif).

---

## DAFTAR ISI

1. [Apa yang akan kita lakukan](#1-apa-yang-akan-kita-lakukan)
2. [Daftar Oracle Cloud (gratis)](#2-daftar-oracle-cloud-gratis)
3. [Buat VPS (Always Free)](#3-buat-vps-always-free)
4. [Connect ke VPS via SSH](#4-connect-ke-vps-via-ssh)
5. [Install software yang dibutuhkan](#5-install-software-yang-dibutuhkan)
6. [Setup signal-cli (untuk bot WhatsApp/Signal)](#6-setup-signal-cli)
7. [Upload project ke VPS](#7-upload-project-ke-vps)
8. [Setup file `.env` (API keys)](#8-setup-file-env-api-keys)
9. [Test bot manual](#9-test-bot-manual)
10. [Jalankan bot otomatis 24/7 (systemd)](#10-jalankan-bot-otomatis-247-systemd)
11. [Setup cron untuk laporan harian](#11-setup-cron-untuk-laporan-harian)
12. [Deploy dashboard ke Vercel (terpisah)](#12-deploy-dashboard-ke-vercel-terpisah)
13. [Troubleshooting (kalau ada error)](#13-troubleshooting-kalau-ada-error)
14. [Maintenance harian](#14-maintenance-harian)

---

## 1. Apa yang akan kita lakukan

Kios Openclaw punya 2 bagian:
- **Bot Signal** (jalan 24/7) → jalankan di VPS
- **Dashboard web** (Next.js) → deploy ke Vercel (gratis, tanpa VPS)

**Diagram:**

```
Owner (HP)                  Oracle VPS                  Vercel
   │                             │                         │
   ├─ Signal app ←──────────►  Bot Signal                   │
   │                            (signal-cli)                │
   │                             │                          │
   └─ Browser ───────────────────┼──────────────────►  Dashboard
                                 │                         (web)
                                 │
                            data/ (CSV, JSON)
```

---

## 2. Daftar Oracle Cloud (gratis)

1. Buka https://www.oracle.com/cloud/free/
2. Klik **"Start for free"**
3. Isi:
   - Email (pakai Gmail OK)
   - Negara: **Indonesia**
   - Verifikasi nomor HP via SMS
4. **Verifikasi kartu kredit/debit** — Oracle butuh ini untuk verifikasi identitas. **TIDAK akan ditagih** kalau Anda pakai resource Always Free saja. Pastikan kartu Anda support pembayaran internasional (Visa/Mastercard).
5. Setelah verifikasi, akun aktif dalam 5-15 menit.
6. Login ke https://cloud.oracle.com — Anda masuk ke **dashboard Oracle Cloud Console**.

### Tips:
- Pilih **home region**: **Singapore (SIN)** — paling cepat ke Indonesia.
- Akun Always Free **bisa terminate** kalau tidak dipakai > 60 hari. Login tiap bulan supaya aman.

---

## 3. Buat VPS (Always Free)

Kita pakai **ARM A1 Flex** — 4 cores, 24 GB RAM, **selalu gratis**.

### Langkah:

1. Di Oracle Cloud Console, klik menu hamburger (☰) → **Compute** → **Instances**
2. Klik **"Create Instance"**
3. Isi form:

   | Field | Isi dengan |
   |---|---|
   | **Name** | `kios-openclaw-vps` |
   | **Image** | Klik *Change image* → **Ubuntu** → **Ubuntu 22.04** |
   | **Shape** | Klik *Change shape* → **Ampere** → **VM.Standard.A1.Flex** |
   | **OCPU** | Geser ke **2** (boleh sampai 4) |
   | **Memory** | Geser ke **12 GB** (boleh sampai 24) |
   | **Networking** | Default (otomatis bikin VCN baru) |
   | **SSH Keys** | **Generate SSH key pair for me** → **Save Private Key** (download file `.key`, simpan baik-baik!) |
   | **Boot volume** | Default 50 GB |

4. Klik **"Create"**.
5. Tunggu 1-3 menit. Status berubah dari `PROVISIONING` → `RUNNING`.
6. Catat **Public IP Address** yang muncul (contoh: `152.67.123.45`).

### Buka port firewall (penting!)

Default Oracle blok semua port kecuali SSH (22). Untuk dashboard kita butuh port 3000 (kalau test lokal). Tapi karena dashboard di Vercel, **kita cukup buka port SSH saja**. SKIP step ini kalau bot saja.

Kalau mau buka port lain:
- Klik **Subnet** di detail instance → **Default Security List** → **Add Ingress Rules**
- Source CIDR: `0.0.0.0/0` (semua IP), Destination Port: `3000`, Protocol: `TCP`

---

## 4. Connect ke VPS via SSH

### Dari Windows (pakai Git Bash atau WSL):

1. Buka folder tempat file `.key` tadi disimpan.
2. Klik kanan → **Git Bash Here** (atau buka WSL).
3. Set permission file private key:
   ```bash
   chmod 600 ssh-key-2026-XX-XX.key
   ```
4. SSH ke server:
   ```bash
   ssh -i ssh-key-2026-XX-XX.key ubuntu@152.67.123.45
   ```
   (Ganti `152.67.123.45` dengan Public IP VPS Anda)
5. Ketik `yes` saat ditanya fingerprint. Anda sekarang di dalam VPS.

### Dari Mac/Linux:

Sama dengan di atas, tanpa Git Bash. Buka Terminal langsung.

### Verifikasi:

```bash
whoami         # harus print: ubuntu
uname -a       # harus print: Linux ... aarch64 (kalau ARM) atau x86_64 (kalau AMD)
free -h        # cek RAM tersedia
df -h          # cek disk
```

---

## 5. Install software yang dibutuhkan

Semua command di bawah jalankan **di dalam VPS** (setelah SSH).

### 5.1 Update sistem
```bash
sudo apt update && sudo apt upgrade -y
```
*Fungsi:* update daftar paket & upgrade ke versi terbaru. Wajib di server baru.

### 5.2 Install Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v        # harus print: v20.x.x
npm -v
```

### 5.3 Install Python 3 + pip

```bash
sudo apt install -y python3 python3-pip
python3 --version    # harus print: Python 3.10+
```

### 5.4 Install Java (untuk signal-cli)

```bash
sudo apt install -y default-jre
java -version    # harus print versi Java
```

### 5.5 Install Git + tools dasar

```bash
sudo apt install -y git curl wget unzip nano
```

### 5.6 (Opsional) Install Redis lokal

Project bisa pakai **Upstash Redis** (gratis, online) ATAU Redis lokal.
Kalau mau Redis lokal di VPS:

```bash
sudo apt install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
redis-cli ping    # harus print: PONG
```

Lalu di `.env` nanti pakai:
```
REDIS_URL=redis://localhost:6379
```

Kalau mau Upstash (lebih mudah), daftar di https://upstash.com (gratis 10rb command/hari) dan ambil URL + token.

---

## 6. Setup signal-cli

`signal-cli` adalah jembatan antara bot dan Signal. Wajib install kalau bot mau respond di Signal.

### 6.1 Download signal-cli

```bash
cd ~
SIGNAL_CLI_VERSION="0.13.10"
wget https://github.com/AsamK/signal-cli/releases/download/v${SIGNAL_CLI_VERSION}/signal-cli-${SIGNAL_CLI_VERSION}.tar.gz
tar xf signal-cli-${SIGNAL_CLI_VERSION}.tar.gz
sudo mv signal-cli-${SIGNAL_CLI_VERSION} /opt/signal-cli
sudo ln -sf /opt/signal-cli/bin/signal-cli /usr/local/bin/signal-cli
signal-cli --version    # harus print versinya
```

### 6.2 Link nomor HP ke signal-cli

**PENTING:** Pakai nomor HP **terpisah** dari nomor Signal pribadi (karena Signal cuma boleh 1 device utama). Solusinya: pakai cara **link** (jadi secondary device).

```bash
signal-cli link -n "Kios Bot VPS"
```

Akan muncul URL panjang `sgnl://linkdevice?uuid=...`. Cara link:
1. Buka aplikasi Signal di HP utama Anda
2. Settings → Linked Devices → Link New Device
3. Scan QR code yang dibuat dari URL tersebut

Cara mudah convert URL ke QR di terminal:
```bash
sudo apt install -y qrencode
echo "sgnl://linkdevice?uuid=PASTE_URL_DI_SINI" | qrencode -t ANSIUTF8
```
Scan QR yang muncul di terminal pakai HP.

Tunggu proses linking selesai (~30 detik). Nomor HP utama Anda sekarang juga bisa diakses dari VPS via signal-cli.

### 6.3 Test signal-cli

```bash
signal-cli -u +62XXXX listAccounts    # ganti dengan nomor HP utama
signal-cli -u +62XXXX receive --json   # cek apakah bisa terima pesan
```

(Ctrl+C untuk keluar dari `receive`.)

---

## 7. Upload project ke VPS

### Cara 1: Pakai Git (recommended)

Kalau project sudah di GitHub:
```bash
cd ~
git clone https://github.com/YOUR_USERNAME/kios-openclaw.git
cd kios-openclaw
npm install --production
```

### Cara 2: Pakai SCP (dari laptop ke VPS)

Dari laptop (di luar VPS, pakai Git Bash/WSL/Terminal):
```bash
# Posisi di folder PARENT dari kios-openclaw
scp -i ssh-key-2026-XX-XX.key -r kios-openclaw ubuntu@152.67.123.45:~/
```

Lalu SSH lagi ke VPS:
```bash
cd ~/kios-openclaw
rm -rf node_modules dashboard/.next package-lock.json  # bersihkan cache lokal
npm install --production
```

### Cara 3: Pakai rsync (tercepat, exclude file besar)

```bash
rsync -avz --exclude='node_modules' --exclude='.next' --exclude='backups' \
  -e "ssh -i ssh-key-2026-XX-XX.key" \
  ./kios-openclaw/ ubuntu@152.67.123.45:~/kios-openclaw/
```

---

## 8. Setup file `.env` (API keys)

```bash
cd ~/kios-openclaw
nano .env
```

Isi dengan (ganti `XXX` dengan key Anda):
```bash
# API keys AI (gratis)
GROQ_API_KEY=gsk_XXX                # dari console.groq.com
GEMINI_API_KEY=AIzaXXX              # dari aistudio.google.com

# Signal config
SIGNAL_NUMBER=+62XXX                # nomor HP utama Anda
SIGNAL_WHITELIST=+62XXX             # nomor owner (boleh banyak, pisah koma)
SIGNAL_CLI_PATH=/usr/local/bin/signal-cli

# Redis (pilih salah satu)
# Pilihan A: Upstash
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=XXX

# Pilihan B: Redis lokal (kalau install di step 5.6)
# REDIS_URL=redis://localhost:6379

# Optional
SIGNAL_GROUP_ID=                    # akan diisi otomatis saat signal-setup
```

Simpan dengan: `Ctrl+O`, Enter, `Ctrl+X`.

**Penting:** Lindungi file `.env`:
```bash
chmod 600 .env
```

---

## 9. Test bot manual

```bash
cd ~/kios-openclaw
node signal/bot-handler.js
```

Anda akan lihat output seperti:
```
[2026-XX-XX 10:00:00] Memulai signal-cli jsonRpc...
[2026-XX-XX 10:00:02] Bot ready
```

Coba kirim pesan dari HP lain ke nomor utama Anda: `stok` — bot harus balas.

Kalau OK, stop dengan `Ctrl+C`. Lanjut ke systemd.

Kalau error → lihat [section 13](#13-troubleshooting-kalau-ada-error).

---

## 10. Jalankan bot otomatis 24/7 (systemd)

`systemd` adalah cara Linux menjalankan service otomatis. Kalau VPS reboot, bot auto-start. Kalau bot crash, auto-restart.

### Buat service file:

```bash
sudo nano /etc/systemd/system/kios-bot.service
```

Isi dengan:
```ini
[Unit]
Description=Kios Openclaw Signal Bot
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/kios-openclaw
EnvironmentFile=/home/ubuntu/kios-openclaw/.env
ExecStart=/usr/bin/node /home/ubuntu/kios-openclaw/signal/bot-handler.js
Restart=always
RestartSec=10
StandardOutput=append:/home/ubuntu/kios-openclaw/logs/bot-systemd.log
StandardError=append:/home/ubuntu/kios-openclaw/logs/bot-systemd-error.log

[Install]
WantedBy=multi-user.target
```

Simpan: `Ctrl+O`, Enter, `Ctrl+X`.

### Aktifkan service:

```bash
sudo systemctl daemon-reload         # baca file service baru
sudo systemctl enable kios-bot       # auto-start saat boot
sudo systemctl start kios-bot        # start sekarang
sudo systemctl status kios-bot       # cek status
```

Anda harus lihat `Active: active (running)`. Kalau merah/failed, cek log:
```bash
sudo journalctl -u kios-bot -n 50    # 50 baris log terakhir
tail -f ~/kios-openclaw/logs/bot-systemd-error.log
```

### Perintah berguna:

```bash
sudo systemctl stop kios-bot         # stop bot
sudo systemctl restart kios-bot      # restart bot
sudo systemctl status kios-bot       # cek status
sudo systemctl disable kios-bot      # nonaktifkan auto-start
```

---

## 11. Setup cron untuk laporan harian

Project punya scripts laporan (06:00, 12:00, 20:00 WITA). Kita pakai cron Linux.

### Tambah ke crontab:

```bash
crontab -e
```

Pilih editor: **nano** (paling mudah).

Tambah baris-baris ini di paling bawah (sesuaikan jam ke UTC karena cron Linux default UTC, WITA = UTC+8):

```cron
# WITA 06:00 = UTC 22:00 hari sebelumnya
0 22 * * * cd /home/ubuntu/kios-openclaw && /usr/bin/node scripts/laporan-harian.js >> logs/cron-laporan.log 2>&1

# WITA 12:00 = UTC 04:00
0 4 * * * cd /home/ubuntu/kios-openclaw && /usr/bin/node scripts/laporan-harian.js >> logs/cron-laporan.log 2>&1

# WITA 20:00 = UTC 12:00
0 12 * * * cd /home/ubuntu/kios-openclaw && /usr/bin/node scripts/laporan-harian.js >> logs/cron-laporan.log 2>&1

# Cek stok tiap 3 jam
0 */3 * * * cd /home/ubuntu/kios-openclaw && /usr/bin/node scripts/cek-stok.js >> logs/cron-stok.log 2>&1

# Backup harian WITA 23:00 = UTC 15:00
0 15 * * * cd /home/ubuntu/kios-openclaw && /usr/bin/node scripts/backup.js >> logs/cron-backup.log 2>&1

# Sync data ke Upstash Redis tiap menit → dashboard Vercel selalu sinkron
* * * * * cd /home/ubuntu/kios-openclaw && /usr/bin/node scripts/sync-vercel.js >> logs/cron-sync.log 2>&1
```

Simpan & exit.

### Cek cron jalan:

```bash
crontab -l                           # lihat daftar cron
sudo systemctl status cron           # service cron aktif?
tail -f logs/cron-laporan.log        # lihat log cron real-time
```

### Atau: pakai timezone WITA di crontab

```bash
# Tambah di paling atas crontab:
TZ=Asia/Makassar
# Sekarang jam di crontab pakai WITA langsung
0 6 * * * cd /home/ubuntu/kios-openclaw && /usr/bin/node scripts/laporan-harian.js >> logs/cron-laporan.log 2>&1
```

---

## 12. Deploy dashboard ke Vercel (terpisah)

Dashboard **TIDAK** dijalankan di VPS (boros RAM). Pakai Vercel (gratis).

Dari laptop Anda (bukan dari VPS):

```bash
cd kios-openclaw/dashboard
npm install
npx vercel login                     # login dengan email
npx vercel --prod                    # deploy
# Ikuti instruksi, pilih nama: kiossaya
```

Selesai. Anda dapat URL: `https://kiossaya.vercel.app`.

### Setup Upstash Redis (jembatan VPS ↔ Vercel)

Vercel **tidak punya** akses filesystem ke CSV di VPS. Tanpa Upstash, dashboard cuma tampilkan snapshot data saat build (tidak real-time).

Solusi: Upstash Redis sebagai jembatan. **Gratis 10.000 command/hari** (cukup banget untuk kios desa).

#### 12.1 Daftar Upstash (5 menit)

1. Buka https://upstash.com → Sign Up (login pakai GitHub paling cepat)
2. Console → **Create Database**
3. Isi:
   - Name: `kios-openclaw`
   - Type: **Regional**
   - Region: **AWS Singapore (ap-southeast-1)** — terdekat ke Indonesia
   - Tier: **Free**
4. Setelah dibuat, di tab **REST API** ada 2 nilai:
   - `UPSTASH_REDIS_REST_URL` (contoh: `https://kios-openclaw-12345.upstash.io`)
   - `UPSTASH_REDIS_REST_TOKEN` (string panjang)
   Catat keduanya.

#### 12.2 Set env vars di VPS

```bash
nano ~/kios-openclaw/.env
```

Tambah/update 2 baris ini:
```bash
UPSTASH_REDIS_REST_URL=https://kios-openclaw-12345.upstash.io
UPSTASH_REDIS_REST_TOKEN=AYAB...token-panjang...
```

Simpan & exit.

#### 12.3 Test sync manual dari VPS

```bash
cd ~/kios-openclaw
node scripts/sync-vercel.js
```

Output yang benar:
```
[2026-XX-XX] [ok] kios:stok: 19 rows
[2026-XX-XX] [ok] kios:transaksi: 12 rows
[2026-XX-XX] [ok] kios:pembelian: 1 rows
[2026-XX-XX] [ok] kios:memory
[2026-XX-XX] Sync selesai: 5/5 berhasil
```

Kalau FAIL → cek URL & token di `.env` benar tidak.

#### 12.4 Set env vars di Vercel

1. https://vercel.com/dashboard → pilih project `autoline-kiosopenclaw`
2. **Settings → Environment Variables → Add**:
   - `UPSTASH_REDIS_REST_URL` = (sama dengan di VPS)
   - `UPSTASH_REDIS_REST_TOKEN` = (sama)
   - (Opsional) `GROQ_API_KEY` & `GEMINI_API_KEY` kalau dashboard butuh AI inline
3. **Redeploy:** Deployments → klik titik 3 di deployment terakhir → **Redeploy** (atau push commit baru ke git)

#### 12.5 Cek hasil sinkron

Buka https://autoline-kiosopenclaw.vercel.app/api/stok di browser → response harus include field `sync_ts` (timestamp sinkron terakhir).

Lakukan transaksi via Signal bot (`jual gula 2`), tunggu max 1 menit (cron sync), refresh dashboard — stok harus update.

### Arsitektur Sinkron Data

```
┌──────────────────┐    cron */1     ┌────────────────┐    HTTP GET    ┌──────────────────┐
│   Bot VPS        │ ──── push ────► │  Upstash Redis │ ◄──── pull ────│  Dashboard       │
│   (CSV files)    │    setiap 1m    │   (5 keys)     │                │  Vercel          │
└──────────────────┘                 └────────────────┘                └──────────────────┘
        ▲                                                                       │
        │                                                                       │
        └──── Owner via Signal (semua write operations) ────────────────────────┘
              (dashboard read-only; POST/PUT/DELETE return 405)
```

**Kenapa read-only di Vercel?**
Vercel serverless tidak punya filesystem persistent. Kalau dashboard tulis CSV → hilang saat function selesai. Solusi: semua **write** via Signal bot di VPS (1 sumber kebenaran). Dashboard cuma **read** dari Upstash.

---

## 13. Troubleshooting (kalau ada error)

### Error: `signal-cli: command not found`
Fix: cek path symlink di step 6.1. Atau pakai full path:
```bash
SIGNAL_CLI_PATH=/opt/signal-cli/bin/signal-cli
```
di file `.env`.

### Error: `EADDRINUSE` / port sudah dipakai
Fix: ada proses lama masih jalan:
```bash
sudo lsof -i :3000                   # cek proses pakai port 3000
sudo kill -9 <PID>                   # matikan
```

### Error: `out of memory`
Fix: VPS RAM kurang. Tambah swap:
```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h                              # cek swap aktif
```

### Bot tidak respond di Signal
Cek:
```bash
sudo systemctl status kios-bot       # service jalan?
tail -50 ~/kios-openclaw/logs/signal.log
tail -50 ~/kios-openclaw/logs/bot-systemd-error.log
```

### signal-cli error "Untrusted identities"
HP utama re-install Signal. Solusi:
```bash
signal-cli -u +62XXX listIdentities
signal-cli -u +62XXX trust +62SENDER -a    # trust ulang
```

### Disk penuh
```bash
df -h                                # cek disk
du -sh ~/kios-openclaw/*             # cari folder besar
# Bersihkan log:
sudo journalctl --vacuum-time=7d     # log systemd > 7 hari hapus
find ~/kios-openclaw/logs -name "*.log" -mtime +30 -delete
```

### Update bot ke versi baru
```bash
cd ~/kios-openclaw
git pull                             # ambil update terbaru
npm install --production             # update deps kalau ada
sudo systemctl restart kios-bot      # restart bot
```

---

## 14. Maintenance harian

### Cek bot masih jalan (1 menit):
```bash
ssh -i ssh-key.key ubuntu@VPS_IP
sudo systemctl status kios-bot
tail -20 ~/kios-openclaw/logs/signal.log
exit
```

### Bulanan:
- Login ke Oracle Cloud Console (cegah akun terminate)
- Update sistem: `sudo apt update && sudo apt upgrade -y`
- Restart VPS: `sudo reboot`

### Backup otomatis:
Sudah ada di cron (step 11). File backup di `~/kios-openclaw/backups/`.
Lebih aman, push backup ke cloud:
```bash
# Install rclone, setup ke Google Drive, lalu di cron tambah:
# 0 16 * * * rclone copy /home/ubuntu/kios-openclaw/backups gdrive:KiosBackup
```

---

## RANGKUMAN

| Langkah | Waktu | Tingkat kesulitan |
|---|---|---|
| 1-2. Daftar Oracle | 30 menit | Mudah |
| 3. Buat VPS | 5 menit | Mudah |
| 4. SSH | 5 menit | Sedang |
| 5. Install software | 15 menit | Mudah (copy-paste) |
| 6. Setup signal-cli | 20 menit | Sedang (perlu HP) |
| 7-8. Upload + .env | 15 menit | Mudah |
| 9. Test | 10 menit | Mudah |
| 10. systemd | 10 menit | Mudah |
| 11. Cron | 10 menit | Mudah |
| 12. Dashboard Vercel | 10 menit | Mudah |
| **TOTAL** | **~2 jam** | |

Setelah ini, bot jalan 24/7 **gratis selamanya**.

---

*Panduan ini ditulis 2026-05-23 untuk Kios Openclaw v5.1.*
*Kalau ada update, baca DOKUMENTASI.md untuk detail komponen.*
