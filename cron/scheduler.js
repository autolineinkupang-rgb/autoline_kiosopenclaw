'use strict';

const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const dayjs = require('dayjs');

const WITA_TZ = 'Asia/Makassar';

function log(msg) {
  const ts = dayjs(new Date(Date.now() + (new Date().getTimezoneOffset() + 480) * 60000)).format('YYYY-MM-DD HH:mm:ss');
  const line = `[${ts} WITA] [cron] ${msg}`;
  console.log(line);
  try {
    const logPath = path.join(__dirname, '..', 'logs', 'signal.log');
    fs.appendFileSync(logPath, line + '\n');
  } catch {}
}

/**
 * handlers: {
 *   risetHargaTop10:     async fn
 *   alertGudangCuaca:    async fn
 *   risetHargaMingguan:  async fn
 *   laporanHarian:       async fn (20:00)
 *   laporanBelajar:      async fn (23:00)
 *   cekGelombangPeriodik: async fn
 * }
 */
function initCron(handlers) {
  const wrap = (name, fn) => () => {
    if (!fn) return;
    log(`Menjalankan: ${name}`);
    Promise.resolve().then(fn).catch(e => log(`Error ${name}: ${e.message}`));
  };

  // 06:00 WITA — cek & bandingkan harga top 10 produk
  if (handlers.risetHargaTop10) {
    cron.schedule('0 6 * * *', wrap('risetHargaTop10', handlers.risetHargaTop10), { timezone: WITA_TZ });
    log('Cron aktif: risetHargaTop10 @ 06:00 WITA');
  }

  // 07:00 WITA — alert gudang + cuaca
  if (handlers.alertGudangCuaca) {
    cron.schedule('0 7 * * *', wrap('alertGudangCuaca', handlers.alertGudangCuaca), { timezone: WITA_TZ });
    log('Cron aktif: alertGudangCuaca @ 07:00 WITA');
  }

  // 08:00 WITA setiap Senin — riset harga pasar mingguan
  if (handlers.risetHargaMingguan) {
    cron.schedule('0 8 * * 1', wrap('risetHargaMingguan', handlers.risetHargaMingguan), { timezone: WITA_TZ });
    log('Cron aktif: risetHargaMingguan @ Senin 08:00 WITA');
  }

  // 20:00 WITA — laporan harian
  if (handlers.laporanHarian) {
    cron.schedule('0 20 * * *', wrap('laporanHarian', handlers.laporanHarian), { timezone: WITA_TZ });
    log('Cron aktif: laporanHarian @ 20:00 WITA');
  }

  // 23:00 WITA — laporan belajar + self-improvement
  if (handlers.laporanBelajar) {
    cron.schedule('0 23 * * *', wrap('laporanBelajar', handlers.laporanBelajar), { timezone: WITA_TZ });
    log('Cron aktif: laporanBelajar @ 23:00 WITA');
  }

  // Tiap 30 menit — cek gelombang jika musim angin (april–november)
  if (handlers.cekGelombangPeriodik) {
    cron.schedule('*/30 * * * *', wrap('cekGelombangPeriodik', handlers.cekGelombangPeriodik), { timezone: WITA_TZ });
    log('Cron aktif: cekGelombangPeriodik @ setiap 30 menit');
  }

  // 02:00 WITA — sesi belajar mandiri bot (jam belajar, hemat token)
  if (handlers.selfLearn) {
    cron.schedule('0 2 * * *', wrap('selfLearn', handlers.selfLearn), { timezone: WITA_TZ });
    log('Cron aktif: selfLearn @ 02:00 WITA');
  }

  // 01:30 WITA — kompres queue sebelum sesi belajar
  if (handlers.ringkasQueue) {
    cron.schedule('30 1 * * *', wrap('ringkasQueue', handlers.ringkasQueue), { timezone: WITA_TZ });
    log('Cron aktif: ringkasQueue @ 01:30 WITA');
  }
}

module.exports = { initCron };
