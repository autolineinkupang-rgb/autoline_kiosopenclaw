/**
 * store.js — Data store helper untuk dashboard
 *
 * Sumber data, dengan prioritas:
 *  1. Upstash Redis (kalau UPSTASH_REDIS_REST_URL & _TOKEN diset di env Vercel)
 *  2. File CSV lokal (fallback untuk dev / kalau Redis offline)
 *
 * Bot di VPS push data ke Upstash via scripts/sync-vercel.js
 * (lihat README dashboard untuk arsitektur lengkap).
 */

import { Redis } from '@upstash/redis';
import { parse } from 'csv-parse/sync';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

const _redis = (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

const DATA_DIR = path.join(process.cwd(), '..', 'data');
const MEMORY_FILE = path.join(process.cwd(), '..', 'memory', 'kios-memory.json');

export function isUpstashAktif() {
  return !!_redis;
}

export function isReadOnly() {
  // Dashboard di Vercel tidak bisa write ke filesystem;
  // sumber data resmi adalah bot VPS. Dashboard hanya baca.
  return isUpstashAktif() || process.env.VERCEL === '1';
}

/**
 * Baca data dari Upstash dengan fallback ke file CSV lokal.
 * @param {string} redisKey  — contoh: 'kios:stok'
 * @param {string} csvFile   — nama file di folder data/, contoh: 'stok.csv'
 */
export async function readCsvData(redisKey, csvFile) {
  // 1. Coba dari Upstash
  if (_redis) {
    try {
      const data = await _redis.get(redisKey);
      if (data) return Array.isArray(data) ? data : [];
    } catch (e) {
      console.error(`[store] redis.get ${redisKey} gagal:`, e.message);
    }
  }
  // 2. Fallback file CSV (dev local atau Vercel build snapshot)
  try {
    const filepath = path.join(DATA_DIR, csvFile);
    if (!existsSync(filepath)) return [];
    const content = readFileSync(filepath, 'utf8');
    return parse(content, { columns: true, skip_empty_lines: true });
  } catch {
    return [];
  }
}

export async function readJsonData(redisKey, jsonFile) {
  if (_redis) {
    try {
      const data = await _redis.get(redisKey);
      if (data) return typeof data === 'object' ? data : JSON.parse(data);
    } catch (e) {
      console.error(`[store] redis.get ${redisKey} gagal:`, e.message);
    }
  }
  try {
    const filepath = path.join(DATA_DIR, jsonFile);
    if (!existsSync(filepath)) return null;
    return JSON.parse(readFileSync(filepath, 'utf8'));
  } catch {
    return null;
  }
}

export async function readMemory() {
  if (_redis) {
    try {
      const data = await _redis.get('kios:memory');
      if (data) return typeof data === 'object' ? data : JSON.parse(data);
    } catch (e) {
      console.error('[store] redis.get kios:memory gagal:', e.message);
    }
  }
  try {
    if (!existsSync(MEMORY_FILE)) return {};
    return JSON.parse(readFileSync(MEMORY_FILE, 'utf8'));
  } catch {
    return {};
  }
}

/** Kapan data terakhir di-sync oleh VPS. Berguna untuk badge "Live · 2 menit lalu" */
export async function readSyncTs() {
  if (!_redis) return null;
  try { return await _redis.get('kios:sync_ts'); } catch { return null; }
}

/** Wrap response 405 untuk endpoint write yang dinonaktifkan di Vercel */
export function readOnlyResponse() {
  return new Response(
    JSON.stringify({
      error: 'Dashboard dalam mode read-only. Sumber data: bot Signal di VPS. Untuk edit, kirim perintah ke bot via Signal.',
      hint: 'Contoh: "tambah produk X", "set stok beras 50", "jual gula 2"',
    }),
    { status: 405, headers: { 'Content-Type': 'application/json' } }
  );
}
