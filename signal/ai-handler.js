'use strict';

const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const fs = require('fs');

const CONFIG_FILE = path.join(__dirname, '..', 'config', 'openclaw.json');

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch { return {}; }
}

// Hanya ekspos info yang aman ke AI — tanpa harga beli atau detail supplier
function ringkasStok(stok) {
  return stok.map(s =>
    `- ${s.nama}: ${s.stok} ${s.satuan}, harga jual Rp${Number(s.harga_jual).toLocaleString('id-ID')}`
  ).join('\n');
}

// Groq strict schema: pakai string untuk angka agar model tidak gagal validasi
const TOOLS_GROQ = [
  {
    type: 'function',
    function: {
      name: 'catat_penjualan',
      description: 'Catat penjualan barang ke pembeli, kurangi stok, simpan ke transaksi. Gunakan saat kasir/pemilik ingin mencatat barang terjual.',
      parameters: {
        type: 'object',
        properties: {
          nama_produk: { type: 'string', description: 'Nama atau kata kunci produk yang dijual' },
          jumlah: { type: 'string', description: 'Jumlah unit yang dijual, contoh: "2"' },
          metode_bayar: {
            type: 'string',
            enum: ['tunai', 'qris', 'transfer'],
            description: 'Metode pembayaran. Default: tunai',
          },
        },
        required: ['nama_produk', 'jumlah'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'catat_pembelian',
      description: 'Catat pembelian/restock barang dari supplier, tambah stok. Gunakan saat pemilik ingin menambah stok.',
      parameters: {
        type: 'object',
        properties: {
          nama_produk: { type: 'string', description: 'Nama atau kata kunci produk yang dibeli' },
          jumlah: { type: 'string', description: 'Jumlah unit yang dibeli dari supplier, contoh: "10"' },
          harga_beli: {
            type: 'string',
            description: 'Harga beli per satuan dalam rupiah. Isi "0" jika tidak disebutkan.',
          },
        },
        required: ['nama_produk', 'jumlah'],
      },
    },
  },
];

function buatSystemPrompt(stok, memory, config) {
  const kios = config.kios || {};
  const hariIni = new Date().toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const jam = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  return `Kamu asisten AI untuk "${kios.nama || 'Kios Desa'}" milik ${kios.pemilik || 'pemilik kios'}.
Sekarang: ${hariIni}, pukul ${jam}. Kios buka ${kios.jam_buka || '06:00'}–${kios.jam_tutup || '21:00'}.

STOK SAAT INI:
${ringkasStok(stok)}

CARA MENJAWAB:
- Pakai Bahasa Indonesia santai dan ramah, seperti ngobrol sama teman. Tidak perlu formal.
- Kalau ada perintah jual barang ke pembeli, panggil fungsi catat_penjualan.
- Kalau ada perintah restock/tambah barang dari supplier, panggil fungsi catat_pembelian.
- Kalau cuma tanya info (harga, stok, dll), jawab langsung dari data stok di atas.
- Jawaban singkat, paling 3–4 baris kecuali memang butuh penjelasan panjang.
- Jangan ungkap path file, konfigurasi server, atau detail teknis sistem.
- Kalau tidak yakin maksud pertanyaan, tanya balik dengan ramah.`;
}

async function tanyaGroq(teks, stok, memory, config) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY tidak diset');

  const groq = new Groq({ apiKey: key });
  const ai = config.ai?.primary || {};

  const resp = await groq.chat.completions.create({
    model: ai.model || 'meta-llama/llama-4-scout-17b-16e-instruct',
    max_tokens: Math.min(ai.max_tokens || 512, 512),
    temperature: ai.temperature ?? 0.4,
    messages: [
      { role: 'system', content: buatSystemPrompt(stok, memory, config) },
      { role: 'user', content: teks },
    ],
    tools: TOOLS_GROQ,
    tool_choice: 'auto',
  }, { timeout: ai.timeout_ms || 8000 });

  return resp.choices[0].message;
}

async function tanyaGemini(teks, stok, memory, config) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY tidak diset');

  const genAI = new GoogleGenerativeAI(key);
  const ai = config.ai?.fallback || {};
  const model = genAI.getGenerativeModel({ model: ai.model || 'gemini-2.0-flash' });

  const prompt = buatSystemPrompt(stok, memory, config) + '\n\nPertanyaan pengguna: ' + teks;
  const hasil = await model.generateContent(prompt);
  return { role: 'assistant', content: hasil.response.text() };
}

/**
 * Proses pesan bebas dengan AI.
 * Mengembalikan perintah terstruktur (JUAL/BELI) atau jawaban teks (AI_RESPONS).
 *
 * @param {{ teks: string, stok: object[], memory: object }} param
 * @returns {Promise<{ tipe: string, [key: string]: any }>}
 */
async function prosesAI({ teks, stok, memory }) {
  const config = loadConfig();

  let msg;
  try {
    msg = await tanyaGroq(teks, stok, memory, config);
  } catch {
    try {
      msg = await tanyaGemini(teks, stok, memory, config);
    } catch {
      return { tipe: 'AI_RESPONS', teks: 'Maaf, AI lagi sibuk. Coba perintah manual ya — ketik *bantuan* buat lihat daftarnya.' };
    }
  }

  // AI memutuskan panggil fungsi → ubah jadi perintah terstruktur
  if (msg.tool_calls && msg.tool_calls.length > 0) {
    const call = msg.tool_calls[0];
    let args;
    try { args = JSON.parse(call.function.arguments); } catch { args = {}; }

    if (call.function.name === 'catat_penjualan') {
      return {
        tipe: 'JUAL',
        produk: String(args.nama_produk || ''),
        qty: Math.max(1, Math.floor(Number(args.jumlah) || 1)),
        metode: ['tunai', 'qris', 'transfer'].includes(args.metode_bayar) ? args.metode_bayar : 'tunai',
      };
    }

    if (call.function.name === 'catat_pembelian') {
      return {
        tipe: 'BELI',
        produk: String(args.nama_produk || ''),
        qty: Math.max(1, Math.floor(Number(args.jumlah) || 1)),
        harga: Math.max(0, Math.floor(Number(args.harga_beli) || 0)),
      };
    }
  }

  return { tipe: 'AI_RESPONS', teks: (msg.content || '').trim() || 'Maaf, tidak dapat memproses permintaan.' };
}

module.exports = { prosesAI };
