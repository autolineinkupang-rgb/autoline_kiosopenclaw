#!/usr/bin/env bash
#
# vps-setup.sh — Setup sekali jalan untuk deploy Kios Openclaw 24/7 di VPS Linux
# (diuji untuk Oracle Cloud "Always Free", Ubuntu 22.04/24.04).
#
# Cara pakai (jalankan dari ROOT project):
#   bash scripts/vps-setup.sh
#
# Yang dilakukan:
#   1. Install Node.js 20, Python 3, dan PM2 (kalau belum ada)
#   2. npm install dependency produksi
#   3. Cek file .env
#   4. Start bot via PM2 + simpan agar auto-start saat VPS reboot
#
# Bot Telegram pakai long polling → TIDAK perlu buka port masuk / domain.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

log() { echo -e "\033[0;36m[vps-setup]\033[0m $*"; }
warn() { echo -e "\033[0;33m[vps-setup]\033[0m $*"; }

# ── 1. Node.js 20 ─────────────────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" -lt 20 ]; then
  log "Memasang Node.js 20 via NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  log "Node.js sudah ada: $(node -v)"
fi

# ── 2. Python 3 (untuk skill bridge) ──────────────────────────────────────────
if ! command -v python3 >/dev/null 2>&1; then
  log "Memasang Python 3..."
  sudo apt-get update && sudo apt-get install -y python3
else
  log "Python 3 sudah ada: $(python3 --version)"
fi
# Skill Kios hanya pakai stdlib — tidak ada pip install yang dibutuhkan.

# ── 3. PM2 (process manager 24/7) ─────────────────────────────────────────────
if ! command -v pm2 >/dev/null 2>&1; then
  log "Memasang PM2 global..."
  sudo npm install -g pm2
else
  log "PM2 sudah ada: $(pm2 -v)"
fi

# ── 4. Dependency project ─────────────────────────────────────────────────────
log "Memasang dependency project (produksi)..."
npm install --omit=dev

# ── 5. Cek .env ───────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  warn ".env belum ada! Salin dari template lalu isi token:"
  warn "  cp .env.example .env && nano .env"
  warn "Wajib diisi: TELEGRAM_BOT_TOKEN, TELEGRAM_GROUP_ID, TELEGRAM_WHITELIST, GROQ_API_KEY"
  exit 1
fi
if ! grep -q '^TELEGRAM_BOT_TOKEN=.\+' .env; then
  warn "TELEGRAM_BOT_TOKEN belum diisi di .env — bot akan jalan mode demo saja."
fi

# ── 6. Start via PM2 ──────────────────────────────────────────────────────────
mkdir -p logs
log "Menjalankan bot via PM2..."
pm2 start config/ecosystem.config.js
pm2 save

log "Selesai. Agar bot auto-start setelah VPS reboot, jalankan perintah yang dicetak PM2:"
pm2 startup | tail -n 3

log "Cek status : pm2 status"
log "Lihat log  : pm2 logs kios-bot"
