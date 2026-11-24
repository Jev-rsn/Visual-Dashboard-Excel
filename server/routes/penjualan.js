const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authMiddleware, requireRoles, sanitizeSensitiveFields } = require('../auth');
const { createPenjualan, updateStatusPenjualan, voidPenjualan } = require('../businessLogic');

// GET /api/penjualan (List sales)
router.get('/', authMiddleware, (req, res) => {
  const { tipe, channel_id, status, tgl_mulai, tgl_selesai, limit = 100 } = req.query;

  let query = `
    SELECT pj.*, c.nama as nama_channel, c.tipe as tipe_channel, a.nama as nama_akun_kas
    FROM penjualan pj
    JOIN channel_penjualan c ON pj.channel_id = c.id
    LEFT JOIN akun_kas_bank a ON pj.akun_kas_id = a.id
    WHERE 1=1
  `;
  const params = [];

  if (tipe) {
    query += ' AND pj.tipe = ?';
    params.push(tipe);
  }
  if (channel_id) {
    query += ' AND pj.channel_id = ?';
    params.push(channel_id);
  }
  if (status) {
    query += ' AND pj.status = ?';
    params.push(status);
  }
  if (tgl_mulai) {
    query += ' AND pj.tanggal >= ?';
    params.push(tgl_mulai);
  }
  if (tgl_selesai) {
    query += ' AND pj.tanggal <= ?';
    params.push(tgl_selesai);
  }

  query += ' ORDER BY pj.id DESC LIMIT ?';
  params.push(Number(limit));

  const list = db.prepare(query).all(...params);
  res.json(sanitizeSensitiveFields(list, req.user));
});

// GET /api/penjualan/:id (Detail sale with items)
router.get('/:id', authMiddleware, (req, res) => {
  const sale = db.prepare(`
    SELECT pj.*, c.nama as nama_channel, c.tipe as tipe_channel, a.nama as nama_akun_kas
    FROM penjualan pj
    JOIN channel_penjualan c ON pj.channel_id = c.id
    LEFT JOIN akun_kas_bank a ON pj.akun_kas_id = a.id
    WHERE pj.id = ?
  `).get(req.params.id);

  if (!sale) return res.status(404).json({ error: 'Data penjualan tidak ditemukan.' });

  const items = db.prepare(`
    SELECT dp.*, v.sku, v.nama_varian, p.nama as nama_produk, v.satuan
    FROM detail_penjualan dp
    JOIN varian_produk v ON dp.varian_id = v.id
    JOIN produk p ON v.produk_id = p.id
    WHERE dp.penjualan_id = ?
    ORDER BY dp.id ASC
  `).all(sale.id);

  // Check if returns exist for this invoice
  const returs = db.prepare(`
    SELECT * FROM retur_penjualan WHERE penjualan_id = ?
  `).all(sale.id);

  const result = {
    ...sale,
    items,
    returs
  };

  res.json(sanitizeSensitiveFields(result, req.user));
});

// POST /api/penjualan (Create sale - POS or Online)
router.post('/', authMiddleware, (req, res) => {
  try {
    const result = createPenjualan({
      ...req.body,
      user: req.user
    });
    res.json({ success: true, message: 'Transaksi penjualan berhasil disimpan.', ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/penjualan/:id/status (Change status: Diproses -> Dikirim -> Selesai / Batal)
router.put('/:id/status', authMiddleware, (req, res) => {
  try {
    const { status_baru } = req.body;
    if (!status_baru) return res.status(400).json({ error: 'Status baru wajib diisi.' });

    const result = updateStatusPenjualan({
      penjualan_id: req.params.id,
      status_baru,
      user: req.user
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/penjualan/:id/void (Void transaction with reason)
router.post('/:id/void', authMiddleware, requireRoles('Owner'), (req, res) => {
  try {
    const { alasan } = req.body;
    const result = voidPenjualan({
      penjualan_id: req.params.id,
      alasan,
      user: req.user
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
