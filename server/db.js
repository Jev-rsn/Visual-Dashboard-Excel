const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'mcrw.sqlite');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);

// Enable WAL mode and foreign keys for high performance and ACID integrity
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA synchronous = NORMAL;
`);

function initSchema() {
  db.exec(`
    -- 1. Pengguna & RBAC
    CREATE TABLE IF NOT EXISTS pengguna (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nama TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      peran TEXT NOT NULL CHECK(peran IN ('Owner', 'Admin Purchasing & Gudang', 'Kasir & Admin Online', 'Admin Keuangan')),
      aktif INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    -- 2. Audit Log (Immutable append-only)
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      waktu TEXT NOT NULL,
      pengguna_id INTEGER,
      nama_pengguna TEXT NOT NULL,
      peran TEXT NOT NULL,
      entitas TEXT NOT NULL,
      entitas_id TEXT,
      aksi TEXT NOT NULL,
      nilai_sebelum TEXT,
      nilai_sesudah TEXT
    );

    -- 3. Periode Akuntansi & Snapshot
    CREATE TABLE IF NOT EXISTS periode_akuntansi (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bulan INTEGER NOT NULL CHECK(bulan BETWEEN 1 AND 12),
      tahun INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'Buka' CHECK(status IN ('Buka', 'Tutup')),
      ditutup_pada TEXT,
      ditutup_oleh TEXT,
      catatan_reopen TEXT,
      UNIQUE(bulan, tahun)
    );

    CREATE TABLE IF NOT EXISTS snapshot_periode (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      periode_id INTEGER NOT NULL REFERENCES periode_akuntansi(id),
      tipe TEXT NOT NULL CHECK(tipe IN ('PERSEDIAAN', 'KAS')),
      ref_id INTEGER NOT NULL,
      nama_entitas TEXT NOT NULL,
      nilai REAL NOT NULL,
      qty REAL DEFAULT 0
    );

    -- 4. Kategori Biaya & COA
    CREATE TABLE IF NOT EXISTS kategori_biaya (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kode_akun TEXT NOT NULL UNIQUE,
      nama TEXT NOT NULL,
      kelompok_laporan TEXT NOT NULL CHECK(kelompok_laporan IN ('Beban Operasional', 'Beban Pemasaran/Iklan', 'Beban Perlengkapan/Packing', 'Beban Lainnya')),
      aktif INTEGER NOT NULL DEFAULT 1
    );

    -- 5. Akun Kas & Bank
    CREATE TABLE IF NOT EXISTS akun_kas_bank (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nama TEXT NOT NULL,
      tipe_akun TEXT NOT NULL CHECK(tipe_akun IN ('Kas Toko', 'Rekening Bank', 'Saldo Marketplace')),
      saldo_awal REAL NOT NULL DEFAULT 0,
      tanggal_saldo_awal TEXT NOT NULL,
      saldo_saat_ini REAL NOT NULL DEFAULT 0,
      aktif INTEGER NOT NULL DEFAULT 1
    );

    -- 6. Channel Penjualan
    CREATE TABLE IF NOT EXISTS channel_penjualan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nama TEXT NOT NULL,
      tipe TEXT NOT NULL CHECK(tipe IN ('Online', 'Offline')),
      komisi_persen REAL NOT NULL DEFAULT 0,
      komisi_tetap REAL NOT NULL DEFAULT 0,
      akun_kas_id INTEGER REFERENCES akun_kas_bank(id),
      aktif INTEGER NOT NULL DEFAULT 1
    );

    -- 7. Supplier & Pelanggan
    CREATE TABLE IF NOT EXISTS supplier (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nama TEXT NOT NULL,
      kontak TEXT,
      telepon TEXT,
      alamat TEXT,
      termin_hari INTEGER NOT NULL DEFAULT 0,
      aktif INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS pelanggan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nama TEXT NOT NULL,
      telepon TEXT,
      email TEXT,
      alamat TEXT,
      tipe_member TEXT NOT NULL DEFAULT 'Reguler' CHECK(tipe_member IN ('Reguler', 'VIP', 'Grosir')),
      aktif INTEGER NOT NULL DEFAULT 1
    );

    -- 8. Master Produk & Varian SKU
    CREATE TABLE IF NOT EXISTS produk (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nama TEXT NOT NULL,
      kategori TEXT NOT NULL,
      deskripsi TEXT,
      aktif INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS varian_produk (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produk_id INTEGER NOT NULL REFERENCES produk(id),
      sku TEXT NOT NULL UNIQUE,
      barcode TEXT,
      nama_varian TEXT NOT NULL,
      warna TEXT,
      ukuran TEXT,
      satuan TEXT NOT NULL DEFAULT 'Pcs',
      harga_jual_default REAL NOT NULL DEFAULT 0,
      stok_min REAL NOT NULL DEFAULT 5,
      stok_on_hand REAL NOT NULL DEFAULT 0,
      stok_reserved REAL NOT NULL DEFAULT 0,
      hpp_rata_rata REAL NOT NULL DEFAULT 0,
      aktif INTEGER NOT NULL DEFAULT 1
    );

    -- 9. Transaksi Pembelian & Alokasi Ongkir
    CREATE TABLE IF NOT EXISTS pembelian (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      no_faktur TEXT NOT NULL UNIQUE,
      supplier_id INTEGER NOT NULL REFERENCES supplier(id),
      tanggal TEXT NOT NULL,
      total_subtotal REAL NOT NULL DEFAULT 0,
      ongkir REAL NOT NULL DEFAULT 0,
      total_biaya REAL NOT NULL DEFAULT 0,
      metode_alokasi_ongkir TEXT NOT NULL DEFAULT 'nilai' CHECK(metode_alokasi_ongkir IN ('nilai', 'qty')),
      status_bayar TEXT NOT NULL DEFAULT 'Lunas' CHECK(status_bayar IN ('Lunas', 'Utang')),
      termin_hari INTEGER NOT NULL DEFAULT 0,
      jatuh_tempo TEXT,
      akun_kas_id INTEGER REFERENCES akun_kas_bank(id),
      sisa_utang REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Posted' CHECK(status IN ('Posted', 'Void')),
      void_alasan TEXT,
      catatan TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS detail_pembelian (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pembelian_id INTEGER NOT NULL REFERENCES pembelian(id),
      varian_id INTEGER NOT NULL REFERENCES varian_produk(id),
      qty REAL NOT NULL,
      harga_beli REAL NOT NULL,
      subtotal REAL NOT NULL,
      ongkir_alokasi REAL NOT NULL DEFAULT 0,
      hpp_beli_per_unit REAL NOT NULL,
      total_item REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pelunasan_utang (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pembelian_id INTEGER NOT NULL REFERENCES pembelian(id),
      no_transaksi TEXT NOT NULL UNIQUE,
      tanggal TEXT NOT NULL,
      nominal REAL NOT NULL,
      akun_kas_id INTEGER NOT NULL REFERENCES akun_kas_bank(id),
      catatan TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- 10. Penjualan Multi-Channel
    CREATE TABLE IF NOT EXISTS penjualan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      no_invoice TEXT NOT NULL UNIQUE,
      tipe TEXT NOT NULL CHECK(tipe IN ('POS', 'Online')),
      channel_id INTEGER NOT NULL REFERENCES channel_penjualan(id),
      no_pesanan TEXT,
      tanggal TEXT NOT NULL,
      pelanggan_id INTEGER REFERENCES pelanggan(id),
      nama_pelanggan TEXT,
      metode_bayar TEXT NOT NULL DEFAULT 'Tunai',
      akun_kas_id INTEGER REFERENCES akun_kas_bank(id),
      status TEXT NOT NULL DEFAULT 'Selesai' CHECK(status IN ('Diproses', 'Dikirim', 'Selesai', 'Batal', 'Void')),
      omzet_kotor REAL NOT NULL DEFAULT 0,
      diskon_total REAL NOT NULL DEFAULT 0,
      potongan_admin REAL NOT NULL DEFAULT 0,
      pendapatan_bersih REAL NOT NULL DEFAULT 0,
      total_hpp REAL NOT NULL DEFAULT 0,
      laba_kotor REAL NOT NULL DEFAULT 0,
      kurir TEXT,
      no_resi TEXT,
      catatan TEXT,
      void_alasan TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS detail_penjualan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      penjualan_id INTEGER NOT NULL REFERENCES penjualan(id),
      varian_id INTEGER NOT NULL REFERENCES varian_produk(id),
      qty REAL NOT NULL,
      harga REAL NOT NULL,
      diskon REAL NOT NULL DEFAULT 0,
      potongan_admin REAL NOT NULL DEFAULT 0,
      pendapatan_bersih REAL NOT NULL DEFAULT 0,
      hpp_snapshot REAL NOT NULL DEFAULT 0,
      laba_kotor REAL NOT NULL DEFAULT 0
    );

    -- 11. Retur Penjualan
    CREATE TABLE IF NOT EXISTS retur_penjualan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      no_retur TEXT NOT NULL UNIQUE,
      penjualan_id INTEGER NOT NULL REFERENCES penjualan(id),
      tanggal TEXT NOT NULL,
      kembali_ke_stok INTEGER NOT NULL DEFAULT 1, -- 1 = Layak (Kembali ke Stok), 0 = Rusak
      akun_kas_id INTEGER REFERENCES akun_kas_bank(id),
      total_refund REAL NOT NULL DEFAULT 0,
      total_hpp_retur REAL NOT NULL DEFAULT 0,
      kerugian_retur REAL NOT NULL DEFAULT 0,
      catatan TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS detail_retur (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      retur_id INTEGER NOT NULL REFERENCES retur_penjualan(id),
      detail_penjualan_id INTEGER NOT NULL REFERENCES detail_penjualan(id),
      varian_id INTEGER NOT NULL REFERENCES varian_produk(id),
      qty REAL NOT NULL,
      refund_per_unit REAL NOT NULL,
      hpp_snapshot REAL NOT NULL
    );

    -- 12. Biaya Operasional & Mutasi Kas
    CREATE TABLE IF NOT EXISTS biaya_operasional (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      no_bukti TEXT NOT NULL UNIQUE,
      tanggal TEXT NOT NULL,
      kategori_id INTEGER NOT NULL REFERENCES kategori_biaya(id),
      channel_id INTEGER REFERENCES channel_penjualan(id), -- NULL = Umum
      nominal REAL NOT NULL,
      akun_kas_id INTEGER NOT NULL REFERENCES akun_kas_bank(id),
      keterangan TEXT,
      lampiran_bukti TEXT,
      status TEXT NOT NULL DEFAULT 'Posted' CHECK(status IN ('Posted', 'Void')),
      void_alasan TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mutasi_kas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      no_referensi TEXT NOT NULL UNIQUE,
      tanggal TEXT NOT NULL,
      akun_asal_id INTEGER NOT NULL REFERENCES akun_kas_bank(id),
      akun_tujuan_id INTEGER NOT NULL REFERENCES akun_kas_bank(id),
      nominal REAL NOT NULL,
      keterangan TEXT,
      status TEXT NOT NULL DEFAULT 'Posted' CHECK(status IN ('Posted', 'Void')),
      void_alasan TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- 13. Buku Mutasi Stok (Append-only Ledger)
    CREATE TABLE IF NOT EXISTS mutasi_stok (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      waktu TEXT NOT NULL,
      varian_id INTEGER NOT NULL REFERENCES varian_produk(id),
      tipe TEXT NOT NULL, -- 'MASUK_BELI', 'KELUAR_JUAL', 'RETUR_MASUK', 'OPNAME_ADJUST', 'VOID_PEMBALIK_BELI', 'VOID_PEMBALIK_JUAL'
      qty_masuk REAL NOT NULL DEFAULT 0,
      qty_keluar REAL NOT NULL DEFAULT 0,
      hpp_unit REAL NOT NULL DEFAULT 0,
      saldo_stok_akhir REAL NOT NULL DEFAULT 0,
      nilai_persediaan_akhir REAL NOT NULL DEFAULT 0,
      ref_dokumen TEXT NOT NULL,
      keterangan TEXT,
      created_by TEXT NOT NULL
    );

    -- 14. Stok Opname
    CREATE TABLE IF NOT EXISTS sesi_opname (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      no_sesi TEXT NOT NULL UNIQUE,
      tanggal TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft', 'Diajukan', 'Disetujui', 'Ditolak')),
      catatan TEXT,
      diajukan_oleh TEXT,
      disetujui_oleh TEXT,
      alasan_penyesuaian TEXT,
      disetujui_pada TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS detail_sesi_opname (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sesi_id INTEGER NOT NULL REFERENCES sesi_opname(id),
      varian_id INTEGER NOT NULL REFERENCES varian_produk(id),
      qty_sistem REAL NOT NULL,
      qty_fisik REAL NOT NULL,
      selisih_qty REAL NOT NULL,
      hpp_unit REAL NOT NULL,
      selisih_nilai REAL NOT NULL
    );

    -- 15. Pengaturan Sistem
    CREATE TABLE IF NOT EXISTS pengaturan_sistem (
      kunci TEXT PRIMARY KEY,
      nilai TEXT NOT NULL
    );

    -- 16. Impor Batch History
    CREATE TABLE IF NOT EXISTS impor_batch (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tanggal TEXT NOT NULL,
      tipe TEXT NOT NULL,
      total_baris INTEGER NOT NULL,
      sukses INTEGER NOT NULL,
      gagal INTEGER NOT NULL,
      file_name TEXT,
      created_by TEXT NOT NULL
    );
  `);

  seedInitialData();
}

function seedInitialData() {
  const bcrypt = require('bcryptjs');

  // Check if system has settings
  const existingSetting = db.prepare('SELECT nilai FROM pengaturan_sistem WHERE kunci = ?').get('izinkan_stok_minus');
  if (!existingSetting) {
    db.prepare('INSERT INTO pengaturan_sistem (kunci, nilai) VALUES (?, ?)').run('izinkan_stok_minus', 'false');
    db.prepare('INSERT INTO pengaturan_sistem (kunci, nilai) VALUES (?, ?)').run('nama_toko', 'MCRW Reseller Store');
    db.prepare('INSERT INTO pengaturan_sistem (kunci, nilai) VALUES (?, ?)').run('alamat_toko', 'Jl. Niaga Utama No. 88, Jakarta Barat');
    db.prepare('INSERT INTO pengaturan_sistem (kunci, nilai) VALUES (?, ?)').run('telepon_toko', '0812-8899-0011');
  }

  // Check if users exist, seed default roles
  const userCount = db.prepare('SELECT COUNT(*) as count FROM pengguna').get().count;
  if (userCount === 0) {
    const passwordHash = bcrypt.hashSync('password123', 10);
    const now = new Date().toISOString();

    const insertUser = db.prepare(`
      INSERT INTO pengguna (nama, email, password_hash, peran, aktif, created_at)
      VALUES (?, ?, ?, ?, 1, ?)
    `);

    insertUser.run('Budi Santoso (Owner)', 'owner@mcrw.com', passwordHash, 'Owner', now);
    insertUser.run('Agus Gudang', 'gudang@mcrw.com', passwordHash, 'Admin Purchasing & Gudang', now);
    insertUser.run('Siti Kasir', 'kasir@mcrw.com', passwordHash, 'Kasir & Admin Online', now);
    insertUser.run('Dewi Keuangan', 'keuangan@mcrw.com', passwordHash, 'Admin Keuangan', now);

    // Initial Akun Kas & Bank
    const insertAkun = db.prepare(`
      INSERT INTO akun_kas_bank (nama, tipe_akun, saldo_awal, tanggal_saldo_awal, saldo_saat_ini, aktif)
      VALUES (?, ?, ?, ?, ?, 1)
    `);
    insertAkun.run('Kas Toko', 'Kas Toko', 1000000, '2026-01-01', 1000000);
    insertAkun.run('Bank BCA Operasional', 'Rekening Bank', 25000000, '2026-01-01', 25000000);
    insertAkun.run('Saldo Shopee', 'Saldo Marketplace', 0, '2026-01-01', 0);
    insertAkun.run('Saldo Tokopedia', 'Saldo Marketplace', 0, '2026-01-01', 0);
    insertAkun.run('Saldo TikTok Shop', 'Saldo Marketplace', 0, '2026-01-01', 0);

    // Initial Channels
    const insertChannel = db.prepare(`
      INSERT INTO channel_penjualan (nama, tipe, komisi_persen, komisi_tetap, akun_kas_id, aktif)
      VALUES (?, ?, ?, ?, ?, 1)
    `);
    insertChannel.run('Toko Offline (POS)', 'Offline', 0, 0, 1);
    insertChannel.run('Shopee Official', 'Online', 6.5, 1000, 3);
    insertChannel.run('Tokopedia Store', 'Online', 5.0, 1000, 4);
    insertChannel.run('TikTok Shop', 'Online', 6.0, 1000, 5);
    insertChannel.run('WhatsApp Order', 'Online', 0, 0, 2);

    // Initial Kategori Biaya (COA)
    const insertBiayaCat = db.prepare(`
      INSERT INTO kategori_biaya (kode_akun, nama, kelompok_laporan, aktif)
      VALUES (?, ?, ?, 1)
    `);
    insertBiayaCat.run('6101', 'Beban Gaji Karyawan', 'Beban Operasional');
    insertBiayaCat.run('6102', 'Beban Sewa Ruko & Gudang', 'Beban Operasional');
    insertBiayaCat.run('6103', 'Beban Listrik, Air & Internet', 'Beban Operasional');
    insertBiayaCat.run('6201', 'Beban Iklan Shopee Ads', 'Beban Pemasaran/Iklan');
    insertBiayaCat.run('6202', 'Beban Iklan TikTok Ads', 'Beban Pemasaran/Iklan');
    insertBiayaCat.run('6203', 'Beban Iklan Meta / IG Ads', 'Beban Pemasaran/Iklan');
    insertBiayaCat.run('6301', 'Beban Bubble Wrap & Kardus', 'Beban Perlengkapan/Packing');
    insertBiayaCat.run('6302', 'Beban Lakban & Thermal Label', 'Beban Perlengkapan/Packing');
    insertBiayaCat.run('6901', 'Beban Administrasi Bank & Lainnya', 'Beban Lainnya');

    // Initial Supplier & Pelanggan
    const insertSupplier = db.prepare(`
      INSERT INTO supplier (nama, kontak, telepon, alamat, termin_hari, aktif)
      VALUES (?, ?, ?, ?, ?, 1)
    `);
    insertSupplier.run('PT Sumber Busana Jaya', 'Pak Hendra', '081122334455', 'Tanah Abang Blok A Lt. 2 No. 10, Jakarta', 30);
    insertSupplier.run('CV Tekstil Garmen Bandung', 'Bu Rina', '081299887766', 'Cigondewah No. 45, Bandung', 14);

    const insertPelanggan = db.prepare(`
      INSERT INTO pelanggan (nama, telepon, email, alamat, tipe_member, aktif)
      VALUES (?, ?, ?, ?, ?, 1)
    `);
    insertPelanggan.run('Pelanggan Umum (Walk-in)', '-', '-', '-', 'Reguler');
    insertPelanggan.run('Toko Berkah Reseller', '081377889900', 'berkah@gmail.com', 'Surabaya', 'Grosir');

    // Initial Master Produk & Varian
    const insertProduk = db.prepare(`
      INSERT INTO produk (nama, kategori, deskripsi, aktif)
      VALUES (?, ?, ?, 1)
    `);
    const p1 = insertProduk.run('Kaos Polos Cotton Combed 30s', 'Pakaian Pria', 'Bahan 100% Cotton combed adem');
    const p2 = insertProduk.run('Kemeja Flanel Casual Lengan Panjang', 'Pakaian Pria', 'Flanel katun premium');

    const insertVarian = db.prepare(`
      INSERT INTO varian_produk (produk_id, sku, barcode, nama_varian, warna, ukuran, satuan, harga_jual_default, stok_min, stok_on_hand, stok_reserved, hpp_rata_rata, aktif)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    // P1 variants
    const v1 = insertVarian.run(p1.lastInsertRowid, 'TSH-BLK-M', '8991001001', 'Hitam - M', 'Hitam', 'M', 'Pcs', 55000, 10, 0, 0, 0);
    const v2 = insertVarian.run(p1.lastInsertRowid, 'TSH-BLK-L', '8991001002', 'Hitam - L', 'Hitam', 'L', 'Pcs', 55000, 10, 0, 0, 0);
    const v3 = insertVarian.run(p1.lastInsertRowid, 'TSH-WHT-L', '8991001003', 'Putih - L', 'Putih', 'L', 'Pcs', 55000, 10, 0, 0, 0);
    // P2 variants
    const v4 = insertVarian.run(p2.lastInsertRowid, 'FLN-RED-L', '8992002001', 'Merah Kotak - L', 'Merah', 'L', 'Pcs', 125000, 5, 0, 0, 0);
  }
}

initSchema();

module.exports = {
  db,
  initSchema
};
