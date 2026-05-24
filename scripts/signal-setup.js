#!/usr/bin/env node
'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GROUP_ID = process.env.TELEGRAM_GROUP_ID;
const ENV_FILE = path.join(__dirname, '..', '.env');
const LOG_FILE = path.join(__dirname, '..', 'logs', 'signal-error.log');
const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

function simpanEnvVar(key, value) {
  let content = '';
  try { content = fs.readFileSync(ENV_FILE, 'utf8'); } catch { /* buat baru */ }
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content = content.trimEnd() + `\n${key}=${value}\n`;
  }
  fs.writeFileSync(ENV_FILE, content, 'utf8');
}

async function tg(method, params = {}) {
  const r = await axios.post(`${TG_API}/${method}`, params, { timeout: 15000 });
  if (!r.data || !r.data.ok) throw new Error(r.data?.description || `error [${method}]`);
  return r.data.result;
}

async function main() {
  log('=== TELEGRAM SETUP DIMULAI ===');

  if (!BOT_TOKEN) { log('FATAL: TELEGRAM_BOT_TOKEN tidak diset di .env'); process.exit(1); }
  if (!GROUP_ID)  { log('FATAL: TELEGRAM_GROUP_ID tidak diset di .env'); process.exit(1); }

  // 1. Verifikasi token bot
  let me;
  try {
    me = await tg('getMe');
    log(`Bot terhubung: @${me.username} (id ${me.id})`);
  } catch (e) {
    log(`Token Telegram tidak valid: ${e.message}`);
    log('Buat bot baru via @BotFather, lalu set TELEGRAM_BOT_TOKEN di .env');
    process.exit(1);
  }

  // 2. Verifikasi akses ke grup
  try {
    const chat = await tg('getChat', { chat_id: GROUP_ID });
    log(`Grup terdeteksi: "${chat.title || chat.id}" (${chat.type})`);
  } catch (e) {
    log(`Tidak bisa akses grup ${GROUP_ID}: ${e.message}`);
    log('Pastikan bot sudah ditambahkan ke grup & TELEGRAM_GROUP_ID benar (biasanya angka negatif).');
    process.exit(1);
  }

  // 3. Ambil/buat link undangan grup (bot harus admin) → simpan ke .env
  try {
    const link = await tg('exportChatInviteLink', { chat_id: GROUP_ID });
    if (link) {
      simpanEnvVar('TELEGRAM_GROUP_INVITE_LINK', link);
      log(`Link undangan grup disimpan ke .env: ${link}`);
    }
  } catch (e) {
    log(`Tidak bisa ambil link undangan (bot perlu jadi admin grup): ${e.message}`);
    log('Set manual di .env: TELEGRAM_GROUP_INVITE_LINK=<link undangan grup>');
  }

  // 4. Kirim pesan sambutan ke grup
  const sambutan =
    'Halo kak! 👋 Grup Kios Cerdas udah siap nih!\n' +
    'Aku bakal kirim laporan dan notifikasi di sini ya 📊\n' +
    'Ketik *bantuan* kalau mau lihat perintah yang bisa aku lakukan!';
  try {
    await tg('sendMessage', { chat_id: GROUP_ID, text: sambutan, parse_mode: 'Markdown' });
    log('Pesan sambutan terkirim ke grup!');
  } catch (e) {
    log(`Gagal kirim sambutan: ${e.message}`);
  }

  log('=== SETUP SELESAI ===');
}

main().catch(e => { log(`FATAL: ${e.message}`); process.exit(1); });
