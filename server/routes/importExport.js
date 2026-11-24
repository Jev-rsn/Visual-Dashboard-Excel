const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const { db } = require('../db');
const { authMiddleware, requireRoles } = require('../auth');
const { createPenjualan, logAudit } = require('../businessLogic');

const upload = multer({ storage: multer.memoryStorage() });

/**
 * Helper to parse uploaded Excel or CSV buffer
 */
function parseSpreadsheet(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(worksheet, { defval: '' });
}

// POST /api/import/marketplace/preview
// Parses file and returns preview with valid rows and errors
router.post('/marketplace/preview', authMiddleware, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Berkas tidak ditemukan.' });

    const platform = req.body.platform || 'shopee'; // 'shopee', 'tokopedia', 'tiktok', 'generic'
    const rows = parseSpreadsheet(req.file.buffer);

    const validRows = [];
    const errorRows = [];
    const seenOrdersInFile = new Set();

    // Map column aliases per platform
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const rowNum = index + 2;

      // Extract fields based on platform or generic header
      const orderNo = String(
        row['No. Pesanan'] || row['Nomor Pesanan'] || row['Order ID'] || row['Order ID (Shopee)'] || row['order_id'] || ''
      ).trim();

      const sku = String(
        row['Nomor Referensi SKU'] || row['SKU Induk'] || row['SKU'] || row['sku'] || row['Kode Produk'] || ''
      ).trim();

      const qty = Number(row['Jumlah'] || row['Qty'] || row['qty'] || row['Kuantitas'] || 1);
      const harga = Number(
        String(row['Harga Awal'] || row['Harga Setelah Diskon'] || row['Harga Jual'] || row['harga'] || 0)
          .replace(/[^0-9.-]+/g, '')
      );
      const potonganAdmin = Number(
        String(row['Biaya Administrasi'] || row['Potongan Admin'] || row['potongan_admin'] || 0)
          .replace(/[^0-9.-]+/g, '')
      );
      const diskon = Number(
        String(row['Total Diskon'] || row['Diskon Produk'] || row['diskon'] || 0)
          .replace(/[^0-9.-]+/g, '')
      );
      const kurir = String(row['Opsi Pengiriman'] || row['Kurir'] || row['kurir'] || '').trim();
      const resi = String(row['No. Resi'] || row['Nomor Resi'] || row['resi'] || '').trim();

      if (!orderNo) {
        errorRows.push({ rowNum, orderNo, sku, reason: 'Nomor pesanan kosong' });
        continue;
      }

      // Check duplicate within file
      const orderKey = `${orderNo}_${sku}`;
      if (seenOrdersInFile.has(orderKey)) {
        errorRows.push({ rowNum, orderNo, sku, reason: 'Duplikat di dalam berkas yang sama' });
        continue;
      }
      seenOrdersInFile.add(orderKey);

      // Check if order already exists in database
      const existingInDb = db.prepare("SELECT id FROM penjualan WHERE no_pesanan = ? AND status != 'Void' AND status != 'Batal'").get(orderNo);
      if (existingInDb) {
        errorRows.push({ rowNum, orderNo, sku, reason: `Nomor pesanan "${orderNo}" sudah pernah diimpor sebelumnya.` });
        continue;
      }

      // Check if SKU exists
      if (!sku) {
        errorRows.push({ rowNum, orderNo, sku, reason: 'SKU kosong' });
        continue;
      }

      const varian = db.prepare('SELECT v.*, p.nama as nama_produk FROM varian_produk v JOIN produk p ON v.produk_id = p.id WHERE v.sku = ?').get(sku);
      if (!varian) {
        errorRows.push({ rowNum, orderNo, sku, reason: `SKU "${sku}" tidak terdaftar di sistem master.` });
        continue;
      }

      validRows.push({
        rowNum,
        orderNo,
        sku,
        nama_produk: `${varian.nama_produk} (${varian.nama_varian})`,
        varian_id: varian.id,
        qty: qty > 0 ? qty : 1,
        harga: harga > 0 ? harga : varian.harga_jual_default,
        diskon,
        potongan_admin: potonganAdmin,
        kurir,
        resi
      });
    }

    res.json({
      totalRows: rows.length,
      validCount: validRows.length,
      errorCount: errorRows.length,
      validRows: validRows.slice(0, 500),
      errorRows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/import/marketplace/commit
// Commits the validated rows into the database as Online Sales with Diproses / Selesai status
router.post('/marketplace/commit', authMiddleware, (req, res) => {
  try {
    const { channel_id, tanggal, status = 'Diproses', orders } = req.body;
    if (!channel_id || !orders || orders.length === 0) {
      return res.status(400).json({ error: 'Channel dan daftar pesanan tidak boleh kosong.' });
    }

    const channel = db.prepare('SELECT * FROM channel_penjualan WHERE id = ?').get(channel_id);
    if (!channel) return res.status(400).json({ error: 'Channel tidak ditemukan.' });

    // Group items by orderNo
    const grouped = {};
    for (const ord of orders) {
      if (!grouped[ord.orderNo]) grouped[ord.orderNo] = [];
      grouped[ord.orderNo].push(ord);
    }

    let successCount = 0;
    let failCount = 0;
    const errors = [];

    const orderKeys = Object.keys(grouped);
    for (const oNo of orderKeys) {
      const items = grouped[oNo];
      const noInvoice = `INV-${channel.tipe.toUpperCase()}-${oNo}`;

      try {
        createPenjualan({
          no_invoice: noInvoice,
          tipe: 'Online',
          channel_id,
          no_pesanan: oNo,
          tanggal: tanggal || new Date().toISOString().split('T')[0],
          nama_pelanggan: `Customer ${channel.nama}`,
          metode_bayar: 'Marketplace',
          akun_kas_id: channel.akun_kas_id,
          status, // 'Diproses' reserves stock; or 'Selesai'
          kurir: items[0].kurir || '',
          no_resi: items[0].resi || '',
          items: items.map(it => ({
            varian_id: it.varian_id,
            qty: it.qty,
            harga: it.harga,
            diskon: it.diskon || 0,
            potongan_admin: it.potongan_admin !== undefined ? it.potongan_admin : -1
          })),
          user: req.user
        });
        successCount++;
      } catch (err) {
        failCount++;
        errors.push({ orderNo: oNo, reason: err.message });
      }
    }

    // Log import batch
    db.prepare(`
      INSERT INTO impor_batch (tanggal, tipe, total_baris, sukses, gagal, file_name, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      new Date().toISOString(),
      `MARKETPLACE_${channel.nama.toUpperCase()}`,
      orderKeys.length,
      successCount,
      failCount,
      `Marketplace Import - ${channel.nama}`,
      req.user.nama
    );

    res.json({
      success: true,
      message: `Impor pesanan selesai: ${successCount} pesanan berhasil diproses, ${failCount} gagal.`,
      successCount,
      failCount,
      errors
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/import/katalog (Mass catalog import from Excel/CSV)
router.post('/katalog', authMiddleware, requireRoles('Owner', 'Admin Purchasing & Gudang'), upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Berkas tidak ditemukan.' });

    const rows = parseSpreadsheet(req.file.buffer);
    let sukses = 0;
    let gagal = 0;
    const errors = [];

    db.exec('BEGIN IMMEDIATE;');
    try {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;

        const namaProduk = String(row['Nama Produk'] || row['nama_produk'] || row['Nama'] || '').trim();
        const kategori = String(row['Kategori'] || row['kategori'] || 'Umum').trim();
        const sku = String(row['SKU'] || row['sku'] || '').trim();
        const namaVarian = String(row['Nama Varian'] || row['Varian'] || sku).trim();
        const hargaJual = Number(row['Harga Jual'] || row['harga_jual'] || 0);
        const stokMin = Number(row['Stok Min'] || row['stok_min'] || 5);
        const satuan = String(row['Satuan'] || row['satuan'] || 'Pcs').trim();
        const barcode = String(row['Barcode'] || row['barcode'] || '').trim();

        if (!namaProduk || !sku) {
          gagal++;
          errors.push({ rowNum, sku, reason: 'Nama Produk dan SKU wajib diisi.' });
          continue;
        }

        // Check if SKU exists
        const existingSku = db.prepare('SELECT id FROM varian_produk WHERE sku = ?').get(sku);
        if (existingSku) {
          gagal++;
          errors.push({ rowNum, sku, reason: `SKU "${sku}" sudah terdaftar.` });
          continue;
        }

        // Find or create product
        let produk = db.prepare('SELECT id FROM produk WHERE nama = ?').get(namaProduk);
        let produkId;
        if (produk) {
          produkId = produk.id;
        } else {
          const resP = db.prepare('INSERT INTO produk (nama, kategori, aktif) VALUES (?, ?, 1)').run(namaProduk, kategori);
          produkId = resP.lastInsertRowid;
        }

        // Insert variant
        db.prepare(`
          INSERT INTO varian_produk (
            produk_id, sku, barcode, nama_varian, satuan, harga_jual_default,
            stok_min, stok_on_hand, stok_reserved, hpp_rata_rata, aktif
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 1)
        `).run(produkId, sku, barcode || null, namaVarian, satuan, hargaJual, stokMin);

        sukses++;
      }

      db.exec('COMMIT;');

      res.json({
        success: true,
        message: `Impor katalog berhasil: ${sukses} SKU berhasil ditambahkan, ${gagal} gagal.`,
        sukses,
        gagal,
        errors
      });
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/export/:tipe (Full data export to Excel / CSV)
router.get('/export/:tipe', authMiddleware, requireRoles('Owner', 'Admin Keuangan'), (req, res) => {
  try {
    const { tipe } = req.params; // 'produk', 'penjualan', 'pembelian', 'kartu-stok', 'semua'

    const wb = XLSX.utils.book_new();

    if (tipe === 'produk' || tipe === 'semua') {
      const varians = db.prepare(`
        SELECT p.nama as Nama_Produk, p.kategori as Kategori, v.sku as SKU,
               v.nama_varian as Varian, v.satuan as Satuan, v.harga_jual_default as Harga_Jual,
               v.stok_min as Stok_Min, v.stok_on_hand as Stok_Fisik,
               (v.stok_on_hand - v.stok_reserved) as Stok_Tersedia,
               v.hpp_rata_rata as HPP_Rata_Rata,
               (v.stok_on_hand * v.hpp_rata_rata) as Nilai_Persediaan
        FROM varian_produk v
        JOIN produk p ON v.produk_id = p.id
      `).all();
      const ws = XLSX.utils.json_to_sheet(varians);
      XLSX.utils.book_append_sheet(wb, ws, 'Master_Produk');
    }

    if (tipe === 'penjualan' || tipe === 'semua') {
      const sales = db.prepare(`
        SELECT pj.no_invoice as No_Invoice, pj.tanggal as Tanggal, pj.tipe as Tipe,
               c.nama as Channel, pj.no_pesanan as No_Pesanan, pj.status as Status,
               pj.omzet_kotor as Omzet_Kotor, pj.diskon_total as Diskon,
               pj.potongan_admin as Potongan_Admin, pj.pendapatan_bersih as Pendapatan_Bersih,
               pj.total_hpp as Total_HPP, pj.laba_kotor as Laba_Kotor
        FROM penjualan pj
        JOIN channel_penjualan c ON pj.channel_id = c.id
      `).all();
      const ws = XLSX.utils.json_to_sheet(sales);
      XLSX.utils.book_append_sheet(wb, ws, 'Penjualan');
    }

    if (tipe === 'pembelian' || tipe === 'semua') {
      const purchases = db.prepare(`
        SELECT p.no_faktur as No_Faktur, p.tanggal as Tanggal, s.nama as Supplier,
               p.status_bayar as Status_Bayar, p.total_subtotal as Subtotal,
               p.ongkir as Ongkir, p.total_biaya as Total_Biaya,
               p.sisa_utang as Sisa_Utang, p.status as Status
        FROM pembelian p
        JOIN supplier s ON p.supplier_id = s.id
      `).all();
      const ws = XLSX.utils.json_to_sheet(purchases);
      XLSX.utils.book_append_sheet(wb, ws, 'Pembelian');
    }

    if (tipe === 'kartu-stok' || tipe === 'semua') {
      const stockMutations = db.prepare(`
        SELECT m.waktu as Waktu, v.sku as SKU, v.nama_varian as Varian,
               m.tipe as Tipe_Mutasi, m.qty_masuk as Masuk, m.qty_keluar as Keluar,
               m.hpp_unit as HPP_Unit, m.saldo_stok_akhir as Saldo_Akhir,
               m.nilai_persediaan_akhir as Nilai_Persediaan_Akhir,
               m.ref_dokumen as Referensi, m.keterangan as Keterangan
        FROM mutasi_stok m
        JOIN varian_produk v ON m.varian_id = v.id
        ORDER BY m.id DESC
      `).all();
      const ws = XLSX.utils.json_to_sheet(stockMutations);
      XLSX.utils.book_append_sheet(wb, ws, 'Buku_Stok');
    }

    const fileBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=MCRW_Export_${tipe}_${Date.now()}.xlsx`);
    res.send(fileBuffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
