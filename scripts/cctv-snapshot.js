#!/usr/bin/env node
'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');

const LOG_FILE = path.join(__dirname, '..', 'logs', 'cctv.log');

function log(msg) {
  const ts = dayjs().format('YYYY-MM-DD HH:mm:ss');
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

async function ambilSnapshot() {
  if (process.env.CCTV_ENABLED !== 'true') {
    log('CCTV disabled — lewati snapshot');
    return null;
  }

  const cctvUrl = process.env.CCTV_URL;
  if (!cctvUrl) {
    log('CCTV_URL tidak dikonfigurasi');
    return null;
  }

  // Simpan ke folder snapshots
  const snapshotDir = path.join(__dirname, '..', 'snapshots');
  if (!fs.existsSync(snapshotDir)) fs.mkdirSync(snapshotDir, { recursive: true });

  const filename = `snapshot_${dayjs().format('YYYY-MM-DD_HH-mm-ss')}.jpg`;
  const filepath = path.join(snapshotDir, filename);

  try {
    // ffmpeg untuk ambil frame dari RTSP stream
    const { execSync } = require('child_process');
    execSync(
      `ffmpeg -i "${cctvUrl}" -vframes 1 -q:v 5 "${filepath}" -y 2>/dev/null`,
      { timeout: 10000 }
    );
    log(`✅ Snapshot disimpan: ${filename}`);
    return filepath;
  } catch (err) {
    log(`❌ Gagal ambil snapshot: ${err.message}`);
    return null;
  }
}

async function main() {
  log('CCTV snapshot dimulai');
  await ambilSnapshot();
  log('CCTV snapshot selesai');
}

main();
