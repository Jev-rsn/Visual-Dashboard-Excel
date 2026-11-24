const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authMiddleware, requireRoles, sanitizeSensitiveFields } = require('../auth');
const { logAudit } = require('../businessLogic');

// --- PRODUK & VARIAN ---

// GET /api/master/produk (Returns products with variants)
router.get('/produk', authMiddleware, (req, res) => {
  const produkList = db.prepare('SELECT * FROM produk ORDER BY id DESC').all();
  const varianList = db.prepare(`
    SELECT v.*, p.nama as nama_produk, p.kategori
    FROM varian_produk v
    JOIN produk p ON v.produk_id = p.id
    ORDER BY v.id ASC
  `).all();

  const varianByProduk = {};
  for (const v of varianList) {
    if (!varianByProduk[v.produk_id]) varianByProduk[v.produk_id] = [];
    varianByProduk[v.produk_id].push(v);
  }

  const result = produkList.map(p => ({
    ...p,
    varians: varianByProduk[p.id] || []
  }));

  res.json(sanitizeSensitiveFields(result, req.user));
});

// GET /api/master/varians (Flat list of active variants for POS & search)
router.get('/varians', authMiddleware, (req, res) => {
  const varians = db.prepare(`
    SELECT v.*, p.nama as nama_produk, p.kategori,
           (v.stok_on_hand - v.stok_reserved) as stok_tersedia
    FROM varian_produk v
    JOIN produk p ON v.produk_id = p.id
    WHERE v.aktif = 1 AND p.aktif = 1
    ORDER BY p.nama ASC, v.nama_varian ASC
  `).all();

  res.json(sanitizeSensitiveFields(varians, req.user));
});

// POST /api/master/produk (Create product with variants)
router.post('/produk', authMiddleware, requireRoles('Owner', 'Admin Purchasing & Gudang'), (req, res) => {
  const { nama, kategori, deskripsi, varians } = req.body;
  if (!nama || !kategori) {
    return res.status(400).json({ error: 'Nama produk dan kategori wajib diisi.' });
  }
  if (!varians || varians.length === 0) {
    return res.status(400).json({ error: 'Minimal harus memiliki satu varian SKU.' });
  }

  // Check unique SKU
  for (const v of varians) {
    if (!v.sku || !v.sku.trim()) return res.status(400).json({ error: 'Setiap varian wajib memiliki SKU unik.' });
    const existing = db.prepare('SELECT id FROM varian_produk WHERE sku = ?').get(v.sku.trim());
    if (existing) {
      return res.status(400).json({ error: `SKU "${v.sku}" sudah terdaftar pada produk lain.` });
    }
  }

  db.exec('BEGIN IMMEDIATE;');
  try {
    const resProduk = db.prepare(`
      INSERT INTO produk (nama, kategori, deskripsi, aktif)
      VALUES (?, ?, ?, 1)
    `).run(nama, kategori, deskripsi || '');

    const produkId = resProduk.lastInsertRowid;

    const insertVarian = db.prepare(`
      INSERT INTO varian_produk (
        produk_id, sku, barcode, nama_varian, warna, ukuran, satuan,
        harga_jual_default, stok_min, stok_on_hand, stok_reserved, hpp_rata_rata, aktif
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 1)
    `);

    for (const v of varians) {
      insertVarian.run(
        produkId,
        v.sku.trim(),
        v.barcode || null,
        v.nama_varian || v.sku,
        v.warna || null,
        v.ukuran || null,
        v.satuan || 'Pcs',
        Number(v.harga_jual_default) || 0,
        Number(v.stok_min) || 5
      );
    }

    db.exec('COMMIT;');

    logAudit(req.user, 'produk', produkId, 'CREATE_PRODUK', null, { nama, kategori, varianCount: varians.length });

    res.json({ success: true, message: 'Produk berhasil disimpan.', produkId });
  } catch (err) {
    db.exec('ROLLBACK;');
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/master/produk/:id
router.put('/produk/:id', authMiddleware, requireRoles('Owner', 'Admin Purchasing & Gudang'), (req, res) => {
  const { nama, kategori, deskripsi, aktif } = req.body;
  const produk = db.prepare('SELECT * FROM produk WHERE id = ?').get(req.params.id);
  if (!produk) return res.status(404).json({ error: 'Produk tidak ditemukan.' });

  db.prepare(`
    UPDATE produk
    SET nama = ?, kategori = ?, deskripsi = ?, aktif = ?
    WHERE id = ?
  `).run(nama || produk.nama, kategori || produk.kategori, deskripsi !== undefined ? deskripsi : produk.deskripsi, aktif !== undefined ? aktif : produk.aktif, produk.id);

  logAudit(req.user, 'produk', produk.id, 'UPDATE_PRODUK', { nama: produk.nama }, { nama, kategori, aktif });

  res.json({ success: true, message: 'Data produk berhasil diperbarui.' });
});

// PUT /api/master/varian/:id
router.put('/varian/:id', authMiddleware, requireRoles('Owner', 'Admin Purchasing & Gudang'), (req, res) => {
  const { nama_varian, barcode, warna, ukuran, satuan, harga_jual_default, stok_min, aktif } = req.body;
  const varian = db.prepare('SELECT * FROM varian_produk WHERE id = ?').get(req.params.id);
  if (!varian) return res.status(404).json({ error: 'Varian SKU tidak ditemukan.' });

  db.prepare(`
    UPDATE varian_produk
    SET nama_varian = ?, barcode = ?, warna = ?, ukuran = ?, satuan = ?,
        harga_jual_default = ?, stok_min = ?, aktif = ?
    WHERE id = ?
  `).run(
    nama_varian || varian.nama_varian,
    barcode !== undefined ? barcode : varian.barcode,
    warna !== undefined ? warna : varian.warna,
    ukuran !== undefined ? ukuran : varian.ukuran,
    satuan || varian.satuan,
    harga_jual_default !== undefined ? Number(harga_jual_default) : varian.harga_jual_default,
    stok_min !== undefined ? Number(stok_min) : varian.stok_min,
    aktif !== undefined ? aktif : varian.aktif,
    varian.id
  );

  logAudit(req.user, 'varian_produk', varian.id, 'UPDATE_VARIAN', { sku: varian.sku }, { nama_varian, harga_jual_default, stok_min, aktif });

  res.json({ success: true, message: 'Data varian SKU berhasil diperbarui.' });
});

// --- CHANNELS ---

// GET /api/master/channel
router.get('/channel', authMiddleware, (req, res) => {
  const channels = db.prepare(`
    SELECT c.*, a.nama as nama_akun_kas
    FROM channel_penjualan c
    LEFT JOIN akun_kas_bank a ON c.akun_kas_id = a.id
    ORDER BY c.id ASC
  `).all();
  res.json(channels);
});

// POST /api/master/channel
router.post('/channel', authMiddleware, requireRoles('Owner', 'Admin Keuangan'), (req, res) => {
  const { nama, tipe, komisi_persen, komisi_tetap, akun_kas_id } = req.body;
  if (!nama || !tipe) return res.status(400).json({ error: 'Nama dan tipe channel wajib diisi.' });

  const resChannel = db.prepare(`
    INSERT INTO channel_penjualan (nama, tipe, komisi_persen, komisi_tetap, akun_kas_id, aktif)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(nama, tipe, Number(komisi_persen) || 0, Number(komisi_tetap) || 0, akun_kas_id || null);

  logAudit(req.user, 'channel_penjualan', resChannel.lastInsertRowid, 'CREATE_CHANNEL', null, { nama, tipe, komisi_persen });

  res.json({ success: true, message: 'Channel penjualan berhasil ditambahkan.' });
});

// PUT /api/master/channel/:id
router.put('/channel/:id', authMiddleware, requireRoles('Owner', 'Admin Keuangan'), (req, res) => {
  const { nama, tipe, komisi_persen, komisi_tetap, akun_kas_id, aktif } = req.body;
  const channel = db.prepare('SELECT * FROM channel_penjualan WHERE id = ?').get(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Channel tidak ditemukan.' });

  db.prepare(`
    UPDATE channel_penjualan
    SET nama = ?, tipe = ?, komisi_persen = ?, komisi_tetap = ?, akun_kas_id = ?, aktif = ?
    WHERE id = ?
  `).run(
    nama || channel.nama,
    tipe || channel.tipe,
    komisi_persen !== undefined ? Number(komisi_persen) : channel.komisi_persen,
    komisi_tetap !== undefined ? Number(komisi_tetap) : channel.komisi_tetap,
    akun_kas_id !== undefined ? akun_kas_id : channel.akun_kas_id,
    aktif !== undefined ? aktif : channel.aktif,
    channel.id
  );

  logAudit(req.user, 'channel_penjualan', channel.id, 'UPDATE_CHANNEL', { nama: channel.nama }, { nama, komisi_persen, aktif });

  res.json({ success: true, message: 'Data channel berhasil diperbarui.' });
});

// --- AKUN KAS & BANK ---

// GET /api/master/akun-kas
router.get('/akun-kas', authMiddleware, (req, res) => {
  const akuns = db.prepare('SELECT * FROM akun_kas_bank ORDER BY id ASC').all();
  res.json(akuns);
});

// POST /api/master/akun-kas
router.post('/akun-kas', authMiddleware, requireRoles('Owner', 'Admin Keuangan'), (req, res) => {
  const { nama, tipe_akun, saldo_awal, tanggal_saldo_awal } = req.body;
  if (!nama || !tipe_akun) return res.status(400).json({ error: 'Nama dan tipe akun wajib diisi.' });

  const sAwal = Number(saldo_awal) || 0;
  const tglAwal = tanggal_saldo_awal || new Date().toISOString().split('T')[0];

  const resAkun = db.prepare(`
    INSERT INTO akun_kas_bank (nama, tipe_akun, saldo_awal, tanggal_saldo_awal, saldo_saat_ini, aktif)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(nama, tipe_akun, sAwal, tglAwal, sAwal);

  logAudit(req.user, 'akun_kas_bank', resAkun.lastInsertRowid, 'CREATE_AKUN', null, { nama, tipe_akun, saldo_awal: sAwal });

  res.json({ success: true, message: 'Akun kas/bank berhasil dibuat.' });
});

// PUT /api/master/akun-kas/:id
router.put('/akun-kas/:id', authMiddleware, requireRoles('Owner', 'Admin Keuangan'), (req, res) => {
  const { nama, tipe_akun, aktif } = req.body;
  const akun = db.prepare('SELECT * FROM akun_kas_bank WHERE id = ?').get(req.params.id);
  if (!akun) return res.status(404).json({ error: 'Akun kas/bank tidak ditemukan.' });

  db.prepare(`
    UPDATE akun_kas_bank
    SET nama = ?, tipe_akun = ?, aktif = ?
    WHERE id = ?
  `).run(nama || akun.nama, tipe_akun || akun.tipe_akun, aktif !== undefined ? aktif : akun.aktif, akun.id);

  logAudit(req.user, 'akun_kas_bank', akun.id, 'UPDATE_AKUN', { nama: akun.nama }, { nama, tipe_akun, aktif });

  res.json({ success: true, message: 'Data akun kas berhasil diperbarui.' });
});

// --- SUPPLIER & PELANGGAN ---

// GET /api/master/supplier
router.get('/supplier', authMiddleware, (req, res) => {
  const suppliers = db.prepare('SELECT * FROM supplier ORDER BY nama ASC').all();
  res.json(suppliers);
});

// POST /api/master/supplier
router.post('/supplier', authMiddleware, requireRoles('Owner', 'Admin Purchasing & Gudang'), (req, res) => {
  const { nama, kontak, telepon, alamat, termin_hari } = req.body;
  if (!nama) return res.status(400).json({ error: 'Nama supplier wajib diisi.' });

  const resSup = db.prepare(`
    INSERT INTO supplier (nama, kontak, telepon, alamat, termin_hari, aktif)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(nama, kontak || null, telepon || null, alamat || null, Number(termin_hari) || 0);

  logAudit(req.user, 'supplier', resSup.lastInsertRowid, 'CREATE_SUPPLIER', null, { nama, termin_hari });

  res.json({ success: true, message: 'Supplier berhasil disimpan.' });
});

// GET /api/master/pelanggan
router.get('/pelanggan', authMiddleware, (req, res) => {
  const pelangganList = db.prepare('SELECT * FROM pelanggan ORDER BY nama ASC').all();
  res.json(pelangganList);
});

// POST /api/master/pelanggan
router.post('/pelanggan', authMiddleware, (req, res) => {
  const { nama, telepon, email, alamat, tipe_member } = req.body;
  if (!nama) return res.status(400).json({ error: 'Nama pelanggan wajib diisi.' });

  const resPel = db.prepare(`
    INSERT INTO pelanggan (nama, telepon, email, alamat, tipe_member, aktif)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(nama, telepon || null, email || null, alamat || null, tipe_member || 'Reguler');

  logAudit(req.user, 'pelanggan', resPel.lastInsertRowid, 'CREATE_PELANGGAN', null, { nama, tipe_member });

  res.json({ success: true, message: 'Pelanggan berhasil disimpan.', pelangganId: resPel.lastInsertRowid });
});

// --- KATEGORI BIAYA (COA) ---

// GET /api/master/kategori-biaya
router.get('/kategori-biaya', authMiddleware, (req, res) => {
  const categories = db.prepare('SELECT * FROM kategori_biaya ORDER BY kode_akun ASC').all();
  res.json(categories);
});

// POST /api/master/kategori-biaya
router.post('/kategori-biaya', authMiddleware, requireRoles('Owner', 'Admin Keuangan'), (req, res) => {
  const { kode_akun, nama, kelompok_laporan } = req.body;
  if (!kode_akun || !nama || !kelompok_laporan) {
    return res.status(400).json({ error: 'Kode akun, nama, dan kelompok laporan wajib diisi.' });
  }

  const existing = db.prepare('SELECT id FROM kategori_biaya WHERE kode_akun = ?').get(kode_akun);
  if (existing) return res.status(400).json({ error: 'Kode akun sudah terdaftar.' });

  const resCat = db.prepare(`
    INSERT INTO kategori_biaya (kode_akun, nama, kelompok_laporan, aktif)
    VALUES (?, ?, ?, 1)
  `).run(kode_akun, nama, kelompok_laporan);

  logAudit(req.user, 'kategori_biaya', resCat.lastInsertRowid, 'CREATE_COA', null, { kode_akun, nama, kelompok_laporan });

  res.json({ success: true, message: 'Kategori biaya berhasil disimpan.' });
});

// --- PENGATURAN SISTEM ---

// GET /api/master/pengaturan
router.get('/pengaturan', authMiddleware, (req, res) => {
  const settings = db.prepare('SELECT * FROM pengaturan_sistem').all();
  const obj = {};
  for (const s of settings) obj[s.kunci] = s.nilai;
  res.json(obj);
});

// PUT /api/master/pengaturan
router.put('/pengaturan', authMiddleware, requireRoles('Owner'), (req, res) => {
  const updates = req.body;
  for (const [key, value] of Object.entries(updates)) {
    db.prepare(`
      INSERT INTO pengaturan_sistem (kunci, nilai)
      VALUES (?, ?)
      ON CONFLICT(kunci) DO UPDATE SET nilai = excluded.nilai
    `).run(key, String(value));
  }

  logAudit(req.user, 'pengaturan_sistem', 'ALL', 'UPDATE_SETTINGS', null, updates);

  res.json({ success: true, message: 'Pengaturan sistem berhasil diperbarui.' });
});

module.exports = router;
