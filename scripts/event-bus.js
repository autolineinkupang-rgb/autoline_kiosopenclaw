'use strict';

/**
 * event-bus.js — Koordinasi dua arah antara openclaw dan bot.
 *
 * Node.js skills emit event langsung.
 * Python skills tulis ke data/openclaw-events.json → di-poll bus ini.
 *
 * Event standar:
 *   stok:kritis        { produk, stok, kritis }
 *   stok:habis         { produk }
 *   harga:naik         { produk, lama, baru }
 *   token:threshold    { total, harian, batas }
 *   belajar:selesai    { rate, pelajaran, token_hemat }
 *   bot:pesan          { sender, teks, intent, role }
 *   bot:error          { bugId, pesan, sender }
 *   user:ditambah      { phone, nama, role }
 */

const EventEmitter = require('events');
const fs   = require('fs');
const path = require('path');

const EVENTS_FILE = path.join(__dirname, '..', 'data', 'openclaw-events.json');
const POLL_MS     = 5000; // cek file event Python tiap 5 detik

class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
    this._lastMtime = 0;
    this._pollTimer = null;
  }

  /** Mulai polling event dari Python skills */
  start() {
    if (this._pollTimer) return;
    this._ensureFile();
    this._pollTimer = setInterval(() => this._pollFile(), POLL_MS);
    this._pollTimer.unref(); // jangan tahan proses
  }

  stop() {
    if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
  }

  /**
   * Emit event dan catat ke log ringkas.
   * Gunakan ini sebagai ganti emit() langsung agar semua event tercatat.
   */
  kirim(nama, data = {}) {
    this.emit(nama, { ...data, _ts: Date.now() });
    this.emit('*', nama, { ...data, _ts: Date.now() }); // wildcard listener
  }

  /**
   * Python skills tulis ke data/openclaw-events.json.
   * Format: array of { nama, data, ts }
   * Bus ini drain array tersebut lalu emit tiap event.
   */
  _pollFile() {
    try {
      const stat = fs.statSync(EVENTS_FILE);
      if (stat.mtimeMs <= this._lastMtime) return;
      this._lastMtime = stat.mtimeMs;

      const raw = fs.readFileSync(EVENTS_FILE, 'utf8').trim();
      if (!raw || raw === '[]') return;

      const events = JSON.parse(raw);
      if (!Array.isArray(events) || !events.length) return;

      // Drain: proses lalu kosongkan file
      const tmp = EVENTS_FILE + '.tmp';
      fs.writeFileSync(tmp, '[]');
      fs.renameSync(tmp, EVENTS_FILE);
      this._lastMtime = fs.statSync(EVENTS_FILE).mtimeMs;

      for (const ev of events) {
        if (ev.nama) this.kirim(ev.nama, ev.data || {});
      }
    } catch {}
  }

  _ensureFile() {
    try {
      if (!fs.existsSync(EVENTS_FILE)) {
        fs.writeFileSync(EVENTS_FILE, '[]');
      }
    } catch {}
  }
}

// Singleton
const bus = new EventBus();
module.exports = bus;
