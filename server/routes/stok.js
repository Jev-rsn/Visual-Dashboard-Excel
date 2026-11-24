const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authMiddleware, requireRoles, sanitizeSensitiveFields } = require('../auth');
const { approveOpnameSession, logAudit, assertOpenPeriod } = require('../businessLogic');

// GET /api/stok/status (Stock status per SKU with HABIS / RESTOCK / AMAN badges)
router.get('/status', authMiddleware, (req, res) => {
  const { status, search } = req.query;

  let query = `
    SELECT v.*, p.nama as nama_produk, p.kategori,
           (v.stok_on_hand - v.stok_reserved) as stok_tersedia,
           (v.stok_on_hand * v.hpp_rata_rata) as nilai_persediaan
    FROM varian_produk v
    JOIN produk p ON v.produk_id = p.id
    WHERE v.aktif = 1 AND p.aktif = 1
  `;
  const params = [];

  if (search) {
    query += ' AND (v.sku LIKE ? OR v.nama_varian LIKE ? OR p.nama LIKE ? OR v.barcode LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }

  query += ' ORDER BY p.nama ASC, v.nama_varian ASC';

  const rows = db.prepare(query).all(...params);

  // Add stock status flag
  const evaluated = rows.map(r => {
    let statusStok = 'AMAN';
    if (r.stok_tersedia <= 0) {
      statusStok = 'HABIS';
    } else if (r.stok_tersedia <= r.stok_min) {
      statusStok = 'RESTOCK';
    }
    return {
      ...r,
      status_stok: statusStok
    };
  });

  const filtered = status ? evaluated.filter(r => r.status_stok === status) : evaluated;

  res.json(sanitizeSensitiveFields(filtered, req.user));
});

// GET /api/stok/kartu/:varian_id (Stock Ledger / Kartu Stok history)
router.get('/kartu/:varian_id', authMiddleware, (req, res) => {
  const varian = db.prepare(`
    SELECT v.*, p.nama as nama_produk
    FROM varian_produk v
    JOIN produk p ON v.produk_id = p.id
    WHERE v.id = ?
  `).get(req.params.varian_id);

  if (!varian) return res.status(404).json({ error: 'Varian SKU tidak ditemukan.' });

  const mutasi = db.prepare(`
    SELECT * FROM mutasi_stok
    WHERE varian_id = ?
    ORDER BY id ASC
  `).all(varian.id);

  const result = {
    varian,
    mutasi
  };

  res.json(sanitizeSensitiveFields(result, req.user));
});

// GET /api/stok/opname (List opname sessions)
router.get('/opname', authMiddleware, requireRoles('Owner', 'Admin Purchasing & Gudang'), (req, res) => {
  const sessions = db.prepare('SELECT * FROM sesi_opname ORDER BY id DESC').all();
  res.json(sessions);
});

// GET /api/stok/opname/:id (Detail opname session)
router.get('/opname/:id', authMiddleware, requireRoles('Owner', 'Admin Purchasing & Gudang'), (req, res) => {
  const sesi = db.prepare('SELECT * FROM sesi_opname WHERE id = ?').get(req.params.id);
  if (!sesi) return res.status(404).json({ error: 'Sesi opname tidak ditemukan.' });

  const details = db.prepare(`
    SELECT d.*, v.sku, v.nama_varian, p.nama as nama_produk, v.satuan
    FROM detail_sesi_opname d
    JOIN varian_produk v ON d.varian_id = v.id
    JOIN produk p ON v.produk_id = p.id
    WHERE d.sesi_id = ?
    ORDER BY p.nama ASC, v.nama_varian ASC
  `).all(sesi.id);

  res.json({ ...sesi, details });
});

// POST /api/stok/opname (Create new opname draft)
router.post('/opname', authMiddleware, requireRoles('Owner', 'Admin Purchasing & Gudang'), (req, res) => {
  try {
    const { tanggal, catatan, items } = req.body;
    assertOpenPeriod(tanggal || new Date().toISOString().split('T')[0]);

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Daftar item opname tidak boleh kosong.' });
    }

    const noSesi = `OPN-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
    const now = new Date().toISOString();

    db.exec('BEGIN IMMEDIATE;');
    try {
      const resSesi = db.prepare(`
        INSERT INTO sesi_opname (no_sesi, tanggal, status, catatan, diajukan_oleh, created_at)
        VALUES (?, ?, 'Draft', ?, ?, ?)
      `).run(noSesi, tanggal || now.split('T')[0], catatan || '', req.user.nama, now);

      const sesiId = resSesi.lastInsertRowid;

      const insertDetail = db.prepare(`
        INSERT INTO detail_sesi_opname (sesi_id, varian_id, qty_sistem, qty_fisik, selisih_qty, hpp_unit, selisih_nilai)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const it of items) {
        const varian = db.prepare('SELECT * FROM varian_produk WHERE id = ?').get(it.varian_id);
        if (!varian) continue;

        const qtySistem = varian.stok_on_hand;
        const qtyFisik = Number(it.qty_fisik);
        const selisihQty = qtyFisik - qtySistem;
        const hppUnit = varian.hpp_rata_rata;
        const selisihNilai = selisihQty * hppUnit;

        insertDetail.run(sesiId, varian.id, qtySistem, qtyFisik, selisihQty, hppUnit, selisihNilai);
      }

      db.exec('COMMIT;');

      logAudit(req.user, 'sesi_opname', noSesi, 'CREATE_OPNAME', null, { itemCount: items.length });

      res.json({ success: true, message: 'Draf stok opname berhasil dibuat.', sesiId, noSesi });
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/stok/opname/:id/ajukan (Submit opname for approval)
router.post('/opname/:id/ajukan', authMiddleware, requireRoles('Owner', 'Admin Purchasing & Gudang'), (req, res) => {
  const sesi = db.prepare('SELECT * FROM sesi_opname WHERE id = ?').get(req.params.id);
  if (!sesi) return res.status(404).json({ error: 'Sesi opname tidak ditemukan.' });
  if (sesi.status !== 'Draft') return res.status(400).json({ error: 'Hanya draf yang dapat diajukan.' });

  db.prepare("UPDATE sesi_opname SET status = 'Diajukan', diajukan_oleh = ? WHERE id = ?")
    .run(req.user.nama, sesi.id);

  logAudit(req.user, 'sesi_opname', sesi.no_sesi, 'SUBMIT_OPNAME', { status: 'Draft' }, { status: 'Diajukan' });

  res.json({ success: true, message: 'Sesi opname telah diajukan ke Owner untuk persetujuan.' });
});

// POST /api/stok/opname/:id/setujui (Owner approve opname & adjust stock)
router.post('/opname/:id/setujui', authMiddleware, requireRoles('Owner'), (req, res) => {
  try {
    const { alasan } = req.body;
    const result = approveOpnameSession({
      sesi_id: req.params.id,
      alasan,
      user: req.user
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
