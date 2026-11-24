const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authMiddleware, sanitizeSensitiveFields } = require('../auth');
const { createReturPenjualan } = require('../businessLogic');

// GET /api/retur (List returns)
router.get('/', authMiddleware, (req, res) => {
  const returs = db.prepare(`
    SELECT r.*, pj.no_invoice, a.nama as nama_akun_kas
    FROM retur_penjualan r
    JOIN penjualan pj ON r.penjualan_id = pj.id
    LEFT JOIN akun_kas_bank a ON r.akun_kas_id = a.id
    ORDER BY r.id DESC
  `).all();

  res.json(sanitizeSensitiveFields(returs, req.user));
});

// GET /api/retur/:id
router.get('/:id', authMiddleware, (req, res) => {
  const retur = db.prepare(`
    SELECT r.*, pj.no_invoice, a.nama as nama_akun_kas
    FROM retur_penjualan r
    JOIN penjualan pj ON r.penjualan_id = pj.id
    LEFT JOIN akun_kas_bank a ON r.akun_kas_id = a.id
    WHERE r.id = ?
  `).get(req.params.id);

  if (!retur) return res.status(404).json({ error: 'Data retur tidak ditemukan.' });

  const items = db.prepare(`
    SELECT dr.*, v.sku, v.nama_varian, p.nama as nama_produk
    FROM detail_retur dr
    JOIN varian_produk v ON dr.varian_id = v.id
    JOIN produk p ON v.produk_id = p.id
    WHERE dr.retur_id = ?
  `).all(retur.id);

  res.json(sanitizeSensitiveFields({ ...retur, items }, req.user));
});

// POST /api/retur (Create sales return)
router.post('/', authMiddleware, (req, res) => {
  try {
    const result = createReturPenjualan({
      ...req.body,
      user: req.user
    });
    res.json({ success: true, message: 'Retur penjualan berhasil diproses.', ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
