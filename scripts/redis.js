'use strict';

const axios = require('axios');

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

function headers() {
  return { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' };
}

function tersedia() {
  return !!(REDIS_URL && REDIS_TOKEN);
}

async function get(key) {
  if (!tersedia()) return null;
  try {
    const r = await axios.get(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
      headers: headers(), timeout: 5000,
    });
    const val = r.data?.result;
    if (val === null || val === undefined) return null;
    try { return JSON.parse(val); } catch { return val; }
  } catch { return null; }
}

async function set(key, value, exSeconds = null) {
  if (!tersedia()) return false;
  try {
    const val = typeof value === 'string' ? value : JSON.stringify(value);
    const body = exSeconds
      ? ['set', key, val, 'ex', exSeconds]
      : ['set', key, val];
    await axios.post(`${REDIS_URL}`, body, { headers: headers(), timeout: 5000 });
    return true;
  } catch { return false; }
}

async function del(key) {
  if (!tersedia()) return false;
  try {
    await axios.post(`${REDIS_URL}`, ['del', key], { headers: headers(), timeout: 5000 });
    return true;
  } catch { return false; }
}

async function incr(key) {
  if (!tersedia()) return null;
  try {
    const r = await axios.post(`${REDIS_URL}`, ['incr', key], { headers: headers(), timeout: 5000 });
    return r.data?.result ?? null;
  } catch { return null; }
}

module.exports = { get, set, del, incr, tersedia };
