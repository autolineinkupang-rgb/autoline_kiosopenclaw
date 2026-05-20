'use strict';

const redis = require('../scripts/redis');

const K = {
  PATTERNS: 'kios:learn:patterns',
  ALIASES: 'kios:learn:aliases',
  HABITS: 'kios:learn:habits',
  UNKNOWNS: 'kios:learn:unknowns',
  SHORTCUTS: 'kios:learn:shortcuts',
  PRICE_HIST: 'kios:price:history',
};

async function savePattern(input, intent, target) {
  const all = (await redis.get(K.PATTERNS)) || {};
  const key = input.toLowerCase().trim();
  const existing = all[key] || { intent, target, count: 0 };
  all[key] = { intent, target: target || existing.target, count: existing.count + 1 };
  await redis.set(K.PATTERNS, all);
}

async function getPattern(input) {
  const all = (await redis.get(K.PATTERNS)) || {};
  return all[input.toLowerCase().trim()] || null;
}

async function getAllPatterns() {
  return (await redis.get(K.PATTERNS)) || {};
}

async function saveAlias(alias, target) {
  const all = (await redis.get(K.ALIASES)) || {};
  all[alias.toLowerCase().trim()] = target;
  await redis.set(K.ALIASES, all);
}

async function resolveAlias(input) {
  const all = (await redis.get(K.ALIASES)) || {};
  return all[input.toLowerCase().trim()] || null;
}

async function saveShortcut(shortcutName, items) {
  const all = (await redis.get(K.SHORTCUTS)) || {};
  all[shortcutName.toLowerCase()] = items;
  await redis.set(K.SHORTCUTS, all);
}

async function getShortcut(name) {
  const all = (await redis.get(K.SHORTCUTS)) || {};
  return all[name.toLowerCase()] || null;
}

async function getAllShortcuts() {
  return (await redis.get(K.SHORTCUTS)) || {};
}

async function trackHabit(type, value) {
  const habits = (await redis.get(K.HABITS)) || {
    peak_hours: {}, top_products: {}, report_times: [], restock_patterns: [],
  };
  if (type === 'sale') {
    const jam = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', timeZone: 'Asia/Makassar' });
    habits.peak_hours[jam] = (habits.peak_hours[jam] || 0) + 1;
    habits.top_products[value] = (habits.top_products[value] || 0) + 1;
  }
  if (type === 'report_request') {
    const jam = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', timeZone: 'Asia/Makassar' });
    if (!habits.report_times.includes(jam)) habits.report_times.push(jam);
  }
  await redis.set(K.HABITS, habits);
}

async function getHabits() {
  return (await redis.get(K.HABITS)) || {};
}

async function saveUnknown(cmd) {
  const list = (await redis.get(K.UNKNOWNS)) || [];
  const existing = list.find(x => x.cmd === cmd);
  if (existing) { existing.count = (existing.count || 1) + 1; }
  else { list.push({ cmd, count: 1, ts: Date.now() }); }
  await redis.set(K.UNKNOWNS, list);
}

async function getUnknowns() {
  return (await redis.get(K.UNKNOWNS)) || [];
}

async function resolveUnknown(cmd) {
  const list = (await redis.get(K.UNKNOWNS)) || [];
  return list.filter(x => x.cmd !== cmd);
}

async function savePriceHistory(produk, hargaKita, hargaMarket) {
  const all = (await redis.get(K.PRICE_HIST)) || {};
  const key = produk.toLowerCase();
  if (!all[key]) all[key] = [];
  all[key].push({ ts: Date.now(), kita: hargaKita, market: hargaMarket });
  if (all[key].length > 30) all[key] = all[key].slice(-30);
  await redis.set(K.PRICE_HIST, all);
}

async function getPriceHistory(produk) {
  const all = (await redis.get(K.PRICE_HIST)) || {};
  return all[produk.toLowerCase()] || [];
}

async function saveLearnedToday(items) {
  const key = `kios:learn:daily:${new Date().toISOString().slice(0, 10)}`;
  const existing = (await redis.get(key)) || [];
  const merged = [...existing, ...items];
  await redis.set(key, merged, 86400 * 2);
}

async function getLearnedToday() {
  const key = `kios:learn:daily:${new Date().toISOString().slice(0, 10)}`;
  return (await redis.get(key)) || [];
}

module.exports = {
  savePattern, getPattern, getAllPatterns,
  saveAlias, resolveAlias,
  saveShortcut, getShortcut, getAllShortcuts,
  trackHabit, getHabits,
  saveUnknown, getUnknowns, resolveUnknown,
  savePriceHistory, getPriceHistory,
  saveLearnedToday, getLearnedToday,
};
