const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authMiddleware, requireRoles } = require('../auth');
const { createBiayaOperasional, createMutasiKas } = require('../businessLogic');

// --- BIAYA OPERASIONAL ---

// GET /api/biaya (List operational costs)
router.get('/biaya', authMiddleware, requireRoles('Owner', 'Admin Keuangan'), (req, res) => {
  const { channel_id, kategori_id, tgl_mulai, tgl_selesai } = req.query;

  let query = `
    SELECT b.*, k.nama as nama_kategori, k.kode_akun, k.kelompok_laporan,
           c.nama as nama_channel, a.nama as nama_akun_kas
    FROM biaya_operasional b
    JOIN kategori_biaya k ON b.kategori_id = k.id
    LEFT JOIN channel_penjualan c ON b.channel_id = c.id
    JOIN akun_kas_bank a ON b.akun_kas_id = a.id
    WHERE 1=1
  `;
  const params = [];

  if (channel_id !== undefined && channel_id !== '') {
    if (channel_id === 'null' || channel_id === 'umum') {
      query += ' AND b.channel_id IS NULL';
    } else {
      query += ' AND b.channel_id = ?';
      params.push(channel_id);
    }
  }
  if (kategori_id) {
    query += ' AND b.kategori_id = ?';
    params.push(kategori_id);
  }
  if (tgl_mulai) {
    query += ' AND b.tanggal >= ?';
    params.push(tgl_mulai);
  }
  if (tgl_selesai) {
    query += ' AND b.tanggal <= ?';
    params.push(tgl_selesai);
  }

  query += ' ORDER BY b.id DESC';
  const list = db.prepare(query).all(...params);
  res.json(list);
});

// POST /api/biaya (Record operational cost)
router.post('/biaya', authMiddleware, requireRoles('Owner', 'Admin Keuangan'), (req, res) => {
  try {
    const result = createBiayaOperasional({
      ...req.body,
      user: req.user
    });
    res.json({ success: true, message: 'Biaya operasional berhasil dicatat.', ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- MUTASI KAS ---

// GET /api/mutasi-kas (List cash mutations)
router.get('/mutasi-kas', authMiddleware, requireRoles('Owner', 'Admin Keuangan'), (req, res) => {
  const list = db.prepare(`
    SELECT m.*, asal.nama as nama_akun_asal, tujuan.nama as nama_akun_tujuan
    FROM mutasi_kas m
    JOIN akun_kas_bank asal ON m.akun_asal_id = asal.id
    JOIN akun_kas_bank tujuan ON m.akun_tujuan_id = tujuan.id
    ORDER BY m.id DESC
  `).all();
  res.json(list);
});

// POST /api/mutasi-kas (Create cash mutation)
router.post('/mutasi-kas', authMiddleware, requireRoles('Owner', 'Admin Keuangan'), (req, res) => {
  try {
    const result = createMutasiKas({
      ...req.body,
      user: req.user
    });
    res.json({ success: true, message: 'Mutasi kas berhasil diproses.', ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
