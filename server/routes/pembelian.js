const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authMiddleware, requireRoles } = require('../auth');
const { postPembelian, settleUtang } = require('../businessLogic');

// GET /api/pembelian (List purchases)
router.get('/', authMiddleware, requireRoles('Owner', 'Admin Purchasing & Gudang', 'Admin Keuangan'), (req, res) => {
  const { status, supplier_id, limit = 50 } = req.query;

  let query = `
    SELECT p.*, s.nama as nama_supplier, a.nama as nama_akun_kas
    FROM pembelian p
    JOIN supplier s ON p.supplier_id = s.id
    LEFT JOIN akun_kas_bank a ON p.akun_kas_id = a.id
    WHERE 1=1
  `;
  const params = [];

  if (status) {
    query += ' AND p.status = ?';
    params.push(status);
  }
  if (supplier_id) {
    query += ' AND p.supplier_id = ?';
    params.push(supplier_id);
  }

  query += ' ORDER BY p.id DESC LIMIT ?';
  params.push(Number(limit));

  const list = db.prepare(query).all(...params);
  res.json(list);
});

// GET /api/pembelian/:id (Detail purchase with items)
router.get('/:id', authMiddleware, requireRoles('Owner', 'Admin Purchasing & Gudang', 'Admin Keuangan'), (req, res) => {
  const pembelian = db.prepare(`
    SELECT p.*, s.nama as nama_supplier, a.nama as nama_akun_kas
    FROM pembelian p
    JOIN supplier s ON p.supplier_id = s.id
    LEFT JOIN akun_kas_bank a ON p.akun_kas_id = a.id
    WHERE p.id = ?
  `).get(req.params.id);

  if (!pembelian) return res.status(404).json({ error: 'Pembelian tidak ditemukan.' });

  const items = db.prepare(`
    SELECT dp.*, v.sku, v.nama_varian, p.nama as nama_produk, v.satuan
    FROM detail_pembelian dp
    JOIN varian_produk v ON dp.varian_id = v.id
    JOIN produk p ON v.produk_id = p.id
    WHERE dp.pembelian_id = ?
    ORDER BY dp.id ASC
  `).all(pembelian.id);

  const pelunasan = db.prepare(`
    SELECT pu.*, a.nama as nama_akun_kas
    FROM pelunasan_utang pu
    JOIN akun_kas_bank a ON pu.akun_kas_id = a.id
    WHERE pu.pembelian_id = ?
    ORDER BY pu.id ASC
  `).all(pembelian.id);

  res.json({ ...pembelian, items, pelunasan });
});

// POST /api/pembelian (Create & Post Purchase)
router.post('/', authMiddleware, requireRoles('Owner', 'Admin Purchasing & Gudang'), (req, res) => {
  try {
    const result = postPembelian({
      ...req.body,
      user: req.user
    });
    res.json({ success: true, message: 'Pembelian berhasil diposting dan HPP telah diperbarui.', ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/pembelian/utang/daftar (List Accounts Payable with aging)
router.get('/utang/daftar', authMiddleware, requireRoles('Owner', 'Admin Keuangan'), (req, res) => {
  const list = db.prepare(`
    SELECT p.id, p.no_faktur, p.tanggal, p.jatuh_tempo, p.total_biaya, p.sisa_utang,
           s.id as supplier_id, s.nama as nama_supplier, s.telepon
    FROM pembelian p
    JOIN supplier s ON p.supplier_id = s.id
    WHERE p.status = 'Posted' AND p.status_bayar = 'Utang' AND p.sisa_utang > 0
    ORDER BY p.jatuh_tempo ASC
  `).all();

  const now = new Date();
  const enhanced = list.map(item => {
    let umurHari = 0;
    if (item.tanggal) {
      const diffMs = now.getTime() - new Date(item.tanggal).getTime();
      umurHari = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    }

    let statusTempo = 'Belum Jatuh Tempo';
    if (item.jatuh_tempo) {
      const diffDue = Math.floor((new Date(item.jatuh_tempo).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDue < 0) statusTempo = `Lewat ${Math.abs(diffDue)} hari`;
      else statusTempo = `${diffDue} hari lagi`;
    }

    return {
      ...item,
      umur_hari: umurHari,
      status_tempo: statusTempo
    };
  });

  res.json(enhanced);
});

// POST /api/pembelian/utang/pelunasan (Settle Accounts Payable)
router.post('/utang/pelunasan', authMiddleware, requireRoles('Owner', 'Admin Keuangan'), (req, res) => {
  try {
    const result = settleUtang({
      ...req.body,
      user: req.user
    });
    res.json({ success: true, message: 'Pelunasan utang berhasil dicatat.', ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
