#!/usr/bin/env node
'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dayjs = require('dayjs');

const LOG_FILE = path.join(__dirname, '..', 'logs', 'blockchain.log');
const CHAIN_FILE = path.join(__dirname, '..', 'memory', 'local-chain.json');

function log(msg) {
  const ts = dayjs().format('YYYY-MM-DD HH:mm:ss');
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function hash(data) {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

function bacaChain() {
  if (!fs.existsSync(CHAIN_FILE)) {
    return [{ index: 0, data: 'genesis', hash: hash('genesis'), prevHash: '0', ts: dayjs().toISOString() }];
  }
  return JSON.parse(fs.readFileSync(CHAIN_FILE, 'utf8'));
}

function tambahBlok(data) {
  const chain = bacaChain();
  const prev = chain[chain.length - 1];
  const blok = {
    index: prev.index + 1,
    ts: dayjs().toISOString(),
    data,
    prevHash: prev.hash,
  };
  blok.hash = hash(blok);
  chain.push(blok);

  // Simpan hanya 1000 blok terakhir (hemat storage)
  const trimmed = chain.length > 1000 ? chain.slice(chain.length - 1000) : chain;
  fs.writeFileSync(CHAIN_FILE, JSON.stringify(trimmed, null, 2));
  return blok;
}

function verifikasiChain() {
  const chain = bacaChain();
  for (let i = 1; i < chain.length; i++) {
    const curr = chain[i];
    const prev = chain[i - 1];
    const expectedHash = hash({ index: curr.index, ts: curr.ts, data: curr.data, prevHash: curr.prevHash });
    if (curr.hash !== expectedHash || curr.prevHash !== prev.hash) {
      return { valid: false, errorAt: i };
    }
  }
  return { valid: true, length: chain.length };
}

module.exports = { tambahBlok, verifikasiChain, bacaChain };

if (require.main === module) {
  log('Blockchain logger dimulai');
  const cek = verifikasiChain();
  if (cek.valid) {
    log(`✅ Chain valid — ${cek.length} blok`);
  } else {
    log(`❌ Chain tidak valid di blok ${cek.errorAt}`);
  }

  if (process.env.BLOCKCHAIN_ENABLED === 'true') {
    // Coba tulis ke blockchain publik (Polygon)
    log('Mode publik: fitur Polygon belum diimplementasi — gunakan local chain');
  }
}
