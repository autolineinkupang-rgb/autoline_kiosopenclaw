'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const SKILLS_DIR = path.join(__dirname, '..', 'skills');
const PYTHON = process.env.PYTHON_BIN || 'python3';

/**
 * Panggil Python skill dan kembalikan hasilnya.
 * @param {string} skill  - nama file tanpa .py (stok, laporan, harga, notif)
 * @param {string} action - nama aksi dalam skill tersebut
 * @param {object} params - parameter aksi
 * @returns {{ ok: boolean, data?: any, error?: string }}
 */
function callSkill(skill, action, params = {}) {
  const scriptPath = path.join(SKILLS_DIR, `${skill}.py`);
  const input = JSON.stringify({ action, params });

  const result = spawnSync(PYTHON, [scriptPath], {
    input,
    encoding: 'utf8',
    timeout: 15000,
  });

  if (result.error) {
    throw new Error(`Bridge error [${skill}/${action}]: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const detail = result.stderr?.trim() || 'Python script gagal';
    throw new Error(`[${skill}/${action}] ${detail}`);
  }

  const output = (result.stdout || '').trim();
  if (!output) {
    throw new Error(`Tidak ada output dari skill ${skill}`);
  }

  return JSON.parse(output);
}

module.exports = { callSkill };
