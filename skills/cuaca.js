'use strict';

const axios = require('axios');
const dayjs = require('dayjs');

const BMKG_ADM4 = process.env.BMKG_ADM4 || '53.10.18.2001';
const BMKG_CUACA_URL = `https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=${BMKG_ADM4}`;
const BMKG_MARITIM_URL = 'https://api.bmkg.go.id/publik/maritim';

const LOKASI_MARITIM = 'LAUT SAWU';

function wita(fmt = 'DD/MM/YYYY HH:mm') {
  return dayjs(new Date(Date.now() + (new Date().getTimezoneOffset() + 480) * 60000)).format(fmt);
}

async function fetchCuaca() {
  try {
    const r = await axios.get(BMKG_CUACA_URL, { timeout: 8000 });
    const data = r.data?.data?.[0];
    if (!data) return null;
    const prakiraan = data.cuaca?.flat()?.[0];
    return {
      suhu: prakiraan?.t ?? '-',
      kelembaban: prakiraan?.hu ?? '-',
      kondisi: prakiraan?.weather_desc ?? '-',
      angin_kecepatan: prakiraan?.ws ?? '-',
      angin_arah: prakiraan?.wd ?? '-',
      waktu: prakiraan?.local_datetime ?? '-',
    };
  } catch { return null; }
}

async function fetchGelombang() {
  try {
    const r = await axios.get(BMKG_MARITIM_URL, { timeout: 8000 });
    const areas = r.data?.data || [];
    const rote = areas.find(a =>
      (a.area_name || '').toLowerCase().includes('sawu') ||
      (a.area_name || '').toLowerCase().includes('rote')
    );
    if (!rote) return null;
    const wave = rote.data?.[0];
    return {
      area: rote.area_name,
      tinggi_min: wave?.wave_min ?? '-',
      tinggi_max: wave?.wave_max ?? '-',
      periode: wave?.wave_period ?? '-',
      arah: wave?.wave_direction ?? '-',
      kecepatan_angin: wave?.wind_speed ?? '-',
      arah_angin: wave?.wind_direction ?? '-',
    };
  } catch { return null; }
}

function analisisDampakPasokan(gelombang) {
  if (!gelombang || gelombang.tinggi_max === '-') return null;
  const max = parseFloat(String(gelombang.tinggi_max).replace(/[^0-9.]/g, '')) || 0;
  if (max >= 2.5) {
    return { level: 'BAHAYA', pesan: `Gelombang ${gelombang.tinggi_max}m — kapal dari Kupang kemungkinan terlambat 3-5 hari!`, restock: true };
  }
  if (max >= 1.5) {
    return { level: 'WASPADA', pesan: `Gelombang ${gelombang.tinggi_max}m — risiko keterlambatan kapal 1-2 hari.`, restock: true };
  }
  return { level: 'AMAN', pesan: `Gelombang ${gelombang.tinggi_max}m — kondisi normal.`, restock: false };
}

async function getCuacaLengkap() {
  const [cuaca, gelombang] = await Promise.all([fetchCuaca(), fetchGelombang()]);
  const dampak = analisisDampakPasokan(gelombang);
  return { cuaca, gelombang, dampak, timestamp: wita() };
}

function formatCuacaRingkas(data) {
  const div = '━━━━━━━━━━━━━━━━━━━━━━━';
  const { cuaca, gelombang, dampak } = data;
  let msg = `🌤️ *INFO CUACA ROTE NDAO*\n`;
  msg += `📅 ${wita('dddd, DD/MM/YYYY HH:mm')} WITA\n`;
  msg += div + '\n';

  if (cuaca) {
    msg += `🌡️ Suhu: ${cuaca.suhu}°C | Kelembaban: ${cuaca.kelembaban}%\n`;
    msg += `☁️ Kondisi: ${cuaca.kondisi}\n`;
    msg += `💨 Angin: ${cuaca.angin_kecepatan} km/h dari ${cuaca.angin_arah}\n`;
  }

  if (gelombang) {
    msg += `\n🌊 *Laut Sawu:*\n`;
    msg += `Gelombang: ${gelombang.tinggi_min}–${gelombang.tinggi_max}m\n`;
    msg += `Angin laut: ${gelombang.kecepatan_angin} dari ${gelombang.arah_angin}\n`;
  }

  if (dampak) {
    msg += `\n${div}\n`;
    const icon = { BAHAYA: '🚨', WASPADA: '⚠️', AMAN: '✅' }[dampak.level] || 'ℹ️';
    msg += `${icon} *${dampak.level}:* ${dampak.pesan}\n`;
    if (dampak.restock) {
      msg += `\n📦 *Rekomendasi restock segera:*\n`;
      msg += `  • Air minum (stok 2 minggu)\n`;
      msg += `  • Bahan pokok (gula, minyak, beras)\n`;
      msg += `  • Mie instan\n`;
    }
  }

  if (!cuaca && !gelombang) {
    msg += `Data BMKG tidak tersedia saat ini kak.\nCoba cek lagi nanti ya 🙏`;
  }

  return msg;
}

function formatAlertCuaca(dampak, gelombang) {
  const div = '━━━━━━━━━━━━━━━━━━━━━━━';
  let msg = `🌊 *ALERT CUACA ROTE NDAO*\n`;
  msg += div + '\n';
  msg += `${dampak.pesan}\n`;
  if (gelombang) msg += `Gelombang: ${gelombang.tinggi_min}–${gelombang.tinggi_max}m\n`;
  msg += `\n📦 Rekomendasi restock sekarang:\n`;
  msg += `  • Air minum (2 minggu)\n`;
  msg += `  • Gula, minyak, beras\n`;
  msg += `  • Mie instan\n`;
  msg += `\n🚢 Kapal dari Kupang mungkin terlambat 3-5 hari kak!\n`;
  msg += div + '\n';
  msg += `Mau aku buatkan daftar belanja restock? Ketik *daftar restock*`;
  return msg;
}

module.exports = { getCuacaLengkap, formatCuacaRingkas, formatAlertCuaca, analisisDampakPasokan, fetchGelombang };
