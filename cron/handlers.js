'use strict';

const { callSkill } = require('../signal/bridge');
const Formatter = require('../signal/response-formatter');
const Gudang = require('../skills/gudang');
const Cuaca = require('../skills/cuaca');
const MarketIntel = require('../skills/market-intel');
const Learning = require('../skills/learning-engine');

let _kirimKeGrup, _kirimPesan;

function init(kirimKeGrup, kirimPesan) {
  _kirimKeGrup = kirimKeGrup;
  _kirimPesan = kirimPesan;
}

async function laporanHarian() {
  const r = callSkill('laporan', 'ringkas', {});
  if (r.ok) await _kirimKeGrup(Formatter.laporanRingkas(r.data));
}

async function alertGudangCuaca() {
  const gudangR = Gudang.produkMauHabis();
  const cuacaData = await Cuaca.getCuacaLengkap().catch(() => null);
  const cuacaInfo = cuacaData?.dampak ? cuacaData.dampak.pesan : null;
  if (!gudangR.ok) return;
  await _kirimKeGrup(Gudang.formatAlertGudang(gudangR.kritis, gudangR.rendah, cuacaInfo));
  if (cuacaData?.dampak?.restock) {
    await _kirimPesan(Cuaca.formatAlertCuaca(cuacaData.dampak, cuacaData.gelombang));
  }
}

async function risetHargaTop10() {
  const analisis = await MarketIntel.risetHargaTop(10);
  if (analisis.length) await _kirimPesan(MarketIntel.formatMarketIntel(analisis, 'harian'));
}

async function risetHargaMingguan() {
  const analisis = await MarketIntel.risetHargaTop(15);
  if (analisis.length) await _kirimKeGrup(MarketIntel.formatMarketIntel(analisis, 'mingguan'));
}

async function laporanBelajar() {
  const [learned, unknowns, shortcuts, laporanR] = await Promise.all([
    Learning.getLearnedToday().catch(() => []),
    Learning.getUnknowns().catch(() => []),
    Learning.getAllShortcuts().catch(() => ({})),
    Promise.resolve(callSkill('laporan', 'ringkas', {})),
  ]);
  const lapData = laporanR.ok ? laporanR.data : {};
  const cuacaData = await Cuaca.getCuacaLengkap().catch(() => null);
  const msg = Formatter.laporanBelajar({
    learned, unknowns, shortcuts,
    ...lapData, top: lapData.top3?.[0],
    cuacaInfo: cuacaData?.dampak?.pesan || null,
  });
  await _kirimKeGrup(msg);
}

async function cekGelombangPeriodik() {
  try {
    const g = await Cuaca.fetchGelombang();
    const dampak = Cuaca.analisisDampakPasokan(g);
    if (dampak?.level === 'BAHAYA') {
      const cached = await Learning.getPattern('gelombang_alert_sent').catch(() => null);
      if (!cached || Date.now() - (cached?.ts || 0) > 3 * 3600 * 1000) {
        await _kirimPesan(Cuaca.formatAlertCuaca(dampak, g));
        Learning.savePattern('gelombang_alert_sent', 'INTERNAL', null).catch(() => {});
      }
    }
  } catch {}
}

// 01:30 WITA — kompres queue sebelum sesi belajar
function ringkasQueue() {
  try { callSkill('self-learner', 'ringkas', {}); } catch {}
}

// 02:00 WITA — sesi belajar mandiri (analisis lokal, 0 token kecuali batch AI)
async function selfLearn() {
  try {
    const r = callSkill('self-learner', 'belajar', {});
    if (r.ok && r.data?.status !== 'skip' && r.data?.pelajaran?.length) {
      const pelajaran = r.data.pelajaran.join('\n• ');
      const hemat     = r.data.token_hemat || 0;
      const rate      = r.data.berhasil_rate || 0;
      const msg = `🧠 *Sesi Belajar Bot*\n` +
        `📅 ${r.data.sesi}\n` +
        `✅ Sukses: ${rate}% | Antrian: ${r.data.total_antrian}\n` +
        `• ${pelajaran}\n` +
        `💡 Token hemat: ${hemat} permintaan diproses lokal`;
      await _kirimPesan(msg);
    }
  } catch {}
}

module.exports = {
  init, laporanHarian, alertGudangCuaca, risetHargaTop10,
  risetHargaMingguan, laporanBelajar, cekGelombangPeriodik,
  selfLearn, ringkasQueue,
};
