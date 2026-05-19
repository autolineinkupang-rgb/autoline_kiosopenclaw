'use strict';

const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

function getAttachmentPath(att) {
  if (att.localPath && fs.existsSync(att.localPath)) return att.localPath;
  const dirs = [
    path.join(process.env.HOME || '', '.local', 'share', 'signal-cli', 'attachments'),
    path.join(process.env.HOME || '', '.config', 'signal-cli', 'attachments'),
  ];
  for (const dir of dirs) {
    const byId = path.join(dir, String(att.id || ''));
    if (fs.existsSync(byId)) return byId;
    if (att.filename) {
      const byName = path.join(dir, att.filename);
      if (fs.existsSync(byName)) return byName;
    }
  }
  return null;
}

async function kenaliProduk(att) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY tidak diset');

  const imagePath = getAttachmentPath(att);
  if (!imagePath) throw new Error('File gambar tidak ditemukan. Pastikan signal-cli sudah download attachment.');

  const mimeType = att.contentType || 'image/jpeg';
  const imageData = fs.readFileSync(imagePath).toString('base64');

  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `Analisis gambar ini dan identifikasi produk yang ada.
Jika gambar tidak mengandung produk (foto orang, pemandangan, dokumen): balas hanya "BUKAN_PRODUK".
Jika gambar buram/gelap/tidak jelas: balas hanya "TIDAK_JELAS".
Jika ada produk, balas JSON valid tanpa markdown:
{"produk":[{"nama":"nama lengkap","kategori":"sembako/snack/minuman/rokok/obat/umum","merek":"merek atau kosong","varian":"ukuran/warna atau kosong","deskripsi":"1 kalimat singkat","estimasi_harga":0}],"sumber":"Deteksi Gambar"}
Jika lebih dari satu produk berbeda, sertakan semua dalam array.`;

  const result = await model.generateContent([
    prompt,
    { inlineData: { data: imageData, mimeType } },
  ]);
  const teks = result.response.text().trim();

  if (teks === 'BUKAN_PRODUK') return { tipe: 'BUKAN_PRODUK' };
  if (teks === 'TIDAK_JELAS') return { tipe: 'TIDAK_JELAS' };

  try {
    const data = JSON.parse(teks.replace(/```(?:json)?|```/g, '').trim());
    return { tipe: 'OK', produk: data.produk || [], sumber: data.sumber || 'Deteksi Gambar', aiSearched: false };
  } catch {
    return {
      tipe: 'OK',
      produk: [{ nama: teks.slice(0, 80), kategori: 'umum', merek: '', varian: '', deskripsi: '', estimasi_harga: 0 }],
      sumber: 'AI',
      aiSearched: true,
    };
  }
}

module.exports = { kenaliProduk, getAttachmentPath };
