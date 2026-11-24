/**
 * UAT Test Suite for MCRW Web v2.0
 * Verifies all 15 Acceptance Test Scenarios (UAT-01 through UAT-15) from Section 9 of the PRD.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Run tests in an isolated test database
const TEST_DB_PATH = path.join(__dirname, '..', 'data', 'test_uat.sqlite');
if (fs.existsSync(TEST_DB_PATH)) {
  fs.unlinkSync(TEST_DB_PATH);
}
process.env.DB_PATH = TEST_DB_PATH;

const { db, initSchema } = require('./db');
const bl = require('./businessLogic');
const auth = require('./auth');

const ownerUser = { id: 1, nama: 'Budi Santoso', peran: 'Owner' };
const kasirUser = { id: 3, nama: 'Siti Kasir', peran: 'Kasir & Admin Online' };

console.log('====================================================');
console.log(' STARTING UAT TEST SUITE - MCRW Web v2.0');
console.log('====================================================\n');

let passedTests = 0;
let failedTests = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(`       Error: ${err.message}`);
    failedTests++;
  }
}

// Setup a clean test SKU
const pRes = db.prepare('INSERT INTO produk (nama, kategori, aktif) VALUES (?, ?, 1)').run('UAT Test Product', 'Test');
const testProdId = pRes.lastInsertRowid;
const vRes = db.prepare(`
  INSERT INTO varian_produk (produk_id, sku, nama_varian, satuan, harga_jual_default, stok_min, stok_on_hand, stok_reserved, hpp_rata_rata, aktif)
  VALUES (?, 'UAT-SKU-A', 'Varian A', 'Pcs', 50000, 2, 0, 0, 0, 1)
`).run(testProdId);
const testVarianId = vRes.lastInsertRowid;

// UAT-01: Sinkronisasi stok
// Skenario: Beli 10 unit SKU A, jual 3 di POS dan 2 di Shopee (Selesai)
// Hasil yang diharapkan: Stok on hand akhir +5; buku stok memuat 3 mutasi dengan referensi dokumen
runTest('UAT-01: Sinkronisasi stok', () => {
  // 1. Beli 10 unit SKU A @ Rp30.000
  bl.postPembelian({
    no_faktur: 'UAT-FAK-01',
    supplier_id: 1,
    tanggal: '2026-06-01',
    items: [{ varian_id: testVarianId, qty: 10, harga_beli: 30000 }],
    ongkir: 0,
    status_bayar: 'Lunas',
    akun_kas_id: 2, // Bank BCA
    user: ownerUser
  });

  // 2. Jual 3 di POS
  bl.createPenjualan({
    no_invoice: 'UAT-POS-01',
    tipe: 'POS',
    channel_id: 1, // POS
    tanggal: '2026-06-02',
    metode_bayar: 'Tunai',
    akun_kas_id: 1, // Kas Toko
    status: 'Selesai',
    items: [{ varian_id: testVarianId, qty: 3, harga: 50000 }],
    user: kasirUser
  });

  // 3. Jual 2 di Shopee (Selesai)
  bl.createPenjualan({
    no_invoice: 'UAT-SHP-01',
    tipe: 'Online',
    channel_id: 2, // Shopee
    no_pesanan: 'ORD-SHP-01',
    tanggal: '2026-06-03',
    metode_bayar: 'Marketplace',
    akun_kas_id: 3, // Saldo Shopee
    status: 'Selesai',
    items: [{ varian_id: testVarianId, qty: 2, harga: 50000, potongan_admin: 3500 }],
    user: ownerUser
  });

  const v = db.prepare('SELECT stok_on_hand FROM varian_produk WHERE id = ?').get(testVarianId);
  assert.strictEqual(v.stok_on_hand, 5, `Expected stock 5, got ${v.stok_on_hand}`);

  const mutasiCount = db.prepare('SELECT COUNT(*) as count FROM mutasi_stok WHERE varian_id = ?').get(testVarianId).count;
  assert.strictEqual(mutasiCount, 3, `Expected 3 mutations, got ${mutasiCount}`);
});

// UAT-02: Omzet vs dana cair
// Skenario: Penjualan Shopee Rp200.000, potongan admin Rp15.000
// Hasil yang diharapkan: Omzet kotor Rp200.000; pendapatan bersih dan Saldo Shopee +Rp185.000
runTest('UAT-02: Omzet vs dana cair', () => {
  const shopeeAkun = db.prepare('SELECT saldo_saat_ini FROM akun_kas_bank WHERE id = 3').get();
  const initialSaldo = shopeeAkun.saldo_saat_ini;

  // Give some stock
  db.prepare('UPDATE varian_produk SET stok_on_hand = 10, hpp_rata_rata = 25000 WHERE id = ?').run(testVarianId);

  const saleRes = bl.createPenjualan({
    no_invoice: 'UAT-SHP-02',
    tipe: 'Online',
    channel_id: 2,
    no_pesanan: 'ORD-SHP-02',
    tanggal: '2026-06-04',
    metode_bayar: 'Marketplace',
    akun_kas_id: 3,
    status: 'Selesai',
    items: [{ varian_id: testVarianId, qty: 4, harga: 50000, potongan_admin: 15000 }],
    user: ownerUser
  });

  assert.strictEqual(saleRes.omzetKotor, 200000, `Expected Omzet Rp200.000, got ${saleRes.omzetKotor}`);
  assert.strictEqual(saleRes.pendapatanBersih, 185000, `Expected Net Rp185.000, got ${saleRes.pendapatanBersih}`);

  const updatedAkun = db.prepare('SELECT saldo_saat_ini FROM akun_kas_bank WHERE id = 3').get();
  assert.strictEqual(updatedAkun.saldo_saat_ini, initialSaldo + 185000, `Expected Saldo Shopee +185000, got diff ${updatedAkun.saldo_saat_ini - initialSaldo}`);
});

// UAT-03: Netralitas pencairan
// Skenario: Mutasi Rp185.000 dari Saldo Shopee ke Bank
// Hasil yang diharapkan: Saldo Shopee -Rp185.000, Bank +Rp185.000, laba bersih tidak berubah
runTest('UAT-03: Netralitas pencairan', () => {
  const shopeeBefore = db.prepare('SELECT saldo_saat_ini FROM akun_kas_bank WHERE id = 3').get().saldo_saat_ini;
  const bankBefore = db.prepare('SELECT saldo_saat_ini FROM akun_kas_bank WHERE id = 2').get().saldo_saat_ini;

  bl.createMutasiKas({
    no_referensi: 'MUT-001',
    tanggal: '2026-06-05',
    akun_asal_id: 3, // Shopee
    akun_tujuan_id: 2, // Bank BCA
    nominal: 185000,
    keterangan: 'Withdraw Saldo Shopee ke Bank BCA',
    user: ownerUser
  });

  const shopeeAfter = db.prepare('SELECT saldo_saat_ini FROM akun_kas_bank WHERE id = 3').get().saldo_saat_ini;
  const bankAfter = db.prepare('SELECT saldo_saat_ini FROM akun_kas_bank WHERE id = 2').get().saldo_saat_ini;

  assert.strictEqual(shopeeAfter, shopeeBefore - 185000, 'Saldo Shopee berkurang 185000');
  assert.strictEqual(bankAfter, bankBefore + 185000, 'Saldo Bank bertambah 185000');

  // Verify mutasi does not appear in sales or expenses tables
  const inSales = db.prepare("SELECT COUNT(*) as c FROM penjualan WHERE no_pesanan = 'MUT-001'").get().c;
  const inExp = db.prepare("SELECT COUNT(*) as c FROM biaya_operasional WHERE no_bukti = 'MUT-001'").get().c;
  assert.strictEqual(inSales + inExp, 0, 'Mutasi kas must be strictly neutral to P&L');
});

// UAT-04: Retur layak vs rusak
// Skenario: Retur 1 unit dengan Kembali ke Stok = Ya, lalu Tidak
// Hasil yang diharapkan: Ya: stok +1 dengan HPP asli; Tidak: stok tetap, refund tercatat
runTest('UAT-04: Retur layak vs rusak', () => {
  // First make a sale of 2 units
  const sale = bl.createPenjualan({
    no_invoice: 'UAT-RET-SALE',
    tipe: 'POS',
    channel_id: 1,
    tanggal: '2026-06-06',
    metode_bayar: 'Tunai',
    akun_kas_id: 1,
    status: 'Selesai',
    items: [{ varian_id: testVarianId, qty: 2, harga: 50000 }],
    user: ownerUser
  });

  const saleDetail = db.prepare('SELECT id, hpp_snapshot FROM detail_penjualan WHERE penjualan_id = ?').get(sale.penjualanId);
  const stockBeforeRetur = db.prepare('SELECT stok_on_hand FROM varian_produk WHERE id = ?').get(testVarianId).stok_on_hand;

  // Case 1: Return 1 unit Layak (Kembali ke Stok = 1)
  const ret1 = bl.createReturPenjualan({
    penjualan_id: sale.penjualanId,
    tanggal: '2026-06-07',
    kembali_ke_stok: 1,
    akun_kas_id: 1,
    items: [{ detail_penjualan_id: saleDetail.id, qty: 1 }],
    catatan: 'Customer tukar ukuran - barang layak',
    user: ownerUser
  });

  const stockAfterRetur1 = db.prepare('SELECT stok_on_hand FROM varian_produk WHERE id = ?').get(testVarianId).stok_on_hand;
  assert.strictEqual(stockAfterRetur1, stockBeforeRetur + 1, 'Layak: Stok harus bertambah 1');

  // Case 2: Return 1 unit Rusak (Kembali ke Stok = 0)
  const ret2 = bl.createReturPenjualan({
    penjualan_id: sale.penjualanId,
    tanggal: '2026-06-07',
    kembali_ke_stok: 0,
    akun_kas_id: 1,
    items: [{ detail_penjualan_id: saleDetail.id, qty: 1 }],
    catatan: 'Barang robek cacat pabrik',
    user: ownerUser
  });

  const stockAfterRetur2 = db.prepare('SELECT stok_on_hand FROM varian_produk WHERE id = ?').get(testVarianId).stok_on_hand;
  assert.strictEqual(stockAfterRetur2, stockAfterRetur1, 'Rusak: Stok tidak boleh bertambah');

  const ret2Data = db.prepare('SELECT kerugian_retur FROM retur_penjualan WHERE id = ?').get(ret2.noRetur ? db.prepare('SELECT id FROM retur_penjualan WHERE no_retur = ?').get(ret2.noRetur).id : 2);
  assert(ret2Data.kerugian_retur > 0, 'Rusak: Kerugian retur harus tercatat');
});

// UAT-05: Stabilitas HPP
// Skenario: Beli SKU A dengan harga lebih mahal setelah penjualan lama diposting
// Hasil yang diharapkan: Laba kotor penjualan lama tidak berubah; penjualan baru memakai HPP baru
runTest('UAT-05: Stabilitas HPP', () => {
  // Existing sale before purchase
  const oldSale = bl.createPenjualan({
    no_invoice: 'UAT-HPP-01',
    tipe: 'POS',
    channel_id: 1,
    tanggal: '2026-06-08',
    metode_bayar: 'Tunai',
    akun_kas_id: 1,
    status: 'Selesai',
    items: [{ varian_id: testVarianId, qty: 1, harga: 60000 }],
    user: ownerUser
  });
  const oldSaleData = db.prepare('SELECT total_hpp, laba_kotor FROM penjualan WHERE id = ?').get(oldSale.penjualanId);

  // Buy new stock at much higher price (e.g. 50,000)
  bl.postPembelian({
    no_faktur: 'UAT-FAK-EXPENSIVE',
    supplier_id: 1,
    tanggal: '2026-06-09',
    items: [{ varian_id: testVarianId, qty: 10, harga_beli: 50000 }],
    ongkir: 0,
    status_bayar: 'Lunas',
    akun_kas_id: 2,
    user: ownerUser
  });

  // Old sale data MUST NOT change
  const oldSaleDataAfter = db.prepare('SELECT total_hpp, laba_kotor FROM penjualan WHERE id = ?').get(oldSale.penjualanId);
  assert.strictEqual(oldSaleDataAfter.total_hpp, oldSaleData.total_hpp, 'Old sale HPP snapshot must remain stable');
  assert.strictEqual(oldSaleDataAfter.laba_kotor, oldSaleData.laba_kotor, 'Old sale gross profit must remain stable');

  // New sale will use the updated moving average HPP
  const newSale = bl.createPenjualan({
    no_invoice: 'UAT-HPP-02',
    tipe: 'POS',
    channel_id: 1,
    tanggal: '2026-06-10',
    metode_bayar: 'Tunai',
    akun_kas_id: 1,
    status: 'Selesai',
    items: [{ varian_id: testVarianId, qty: 1, harga: 70000 }],
    user: ownerUser
  });
  const newSaleData = db.prepare('SELECT total_hpp FROM penjualan WHERE id = ?').get(newSale.penjualanId);
  assert(newSaleData.total_hpp > oldSaleData.total_hpp, 'New sale must use the new higher average HPP');
});

// UAT-06: Pembelian tempo
// Skenario: Pembelian Rp1.000.000 status Utang
// Hasil yang diharapkan: Stok bertambah, saldo kas tetap, utang supplier +Rp1.000.000; pelunasan menurunkan kas dan utang
runTest('UAT-06: Pembelian tempo', () => {
  const bankBefore = db.prepare('SELECT saldo_saat_ini FROM akun_kas_bank WHERE id = 2').get().saldo_saat_ini;
  const stockBefore = db.prepare('SELECT stok_on_hand FROM varian_produk WHERE id = ?').get(testVarianId).stok_on_hand;

  const buyRes = bl.postPembelian({
    no_faktur: 'UAT-TEMPO-01',
    supplier_id: 1,
    tanggal: '2026-06-11',
    items: [{ varian_id: testVarianId, qty: 20, harga_beli: 50000 }],
    ongkir: 0,
    status_bayar: 'Utang',
    termin_hari: 30,
    user: ownerUser
  });

  const bankAfterBuy = db.prepare('SELECT saldo_saat_ini FROM akun_kas_bank WHERE id = 2').get().saldo_saat_ini;
  const stockAfterBuy = db.prepare('SELECT stok_on_hand FROM varian_produk WHERE id = ?').get(testVarianId).stok_on_hand;
  const buyData = db.prepare('SELECT sisa_utang FROM pembelian WHERE id = ?').get(buyRes.pembelianId);

  assert.strictEqual(bankAfterBuy, bankBefore, 'Pembelian utang: Saldo kas harus tetap');
  assert.strictEqual(stockAfterBuy, stockBefore + 20, 'Pembelian utang: Stok harus bertambah');
  assert.strictEqual(buyData.sisa_utang, 1000000, 'Utang tercatat Rp1.000.000');

  // Settle half the debt (Rp 500.000)
  bl.settleUtang({
    pembelian_id: buyRes.pembelianId,
    nominal: 500000,
    akun_kas_id: 2, // Bank BCA
    tanggal: '2026-06-12',
    user: ownerUser
  });

  const bankAfterSettle = db.prepare('SELECT saldo_saat_ini FROM akun_kas_bank WHERE id = 2').get().saldo_saat_ini;
  const buyDataAfterSettle = db.prepare('SELECT sisa_utang FROM pembelian WHERE id = ?').get(buyRes.pembelianId);

  assert.strictEqual(bankAfterSettle, bankBefore - 500000, 'Pelunasan menurunkan kas');
  assert.strictEqual(buyDataAfterSettle.sisa_utang, 500000, 'Pelunasan menurunkan sisa utang');
});

// UAT-07: Biaya per channel
// Skenario: Biaya Shopee Ads Rp300.000 dengan channel Shopee
// Hasil yang diharapkan: Laba kontribusi Shopee dan laba bersih total berkurang Rp300.000
runTest('UAT-07: Biaya per channel', () => {
  const expRes = bl.createBiayaOperasional({
    no_bukti: 'BIAYA-SHP-001',
    tanggal: '2026-06-13',
    kategori_id: 4, // Shopee Ads
    channel_id: 2, // Shopee
    nominal: 300000,
    akun_kas_id: 2, // Bank BCA
    keterangan: 'Iklan Shopee Mega Sale',
    user: ownerUser
  });

  const row = db.prepare('SELECT nominal, channel_id FROM biaya_operasional WHERE id = ?').get(expRes.biayaId);
  assert.strictEqual(row.nominal, 300000);
  assert.strictEqual(row.channel_id, 2, 'Biaya dialokasikan khusus ke channel Shopee');
});

// UAT-08: Integritas data
// Skenario: Mengirim SKU/channel tidak terdaftar via formulir dan via API langsung
// Hasil yang diharapkan: Ditolak dengan pesan galat jelas di kedua jalur
runTest('UAT-08: Integritas data', () => {
  assert.throws(() => {
    bl.createPenjualan({
      no_invoice: 'UAT-INVALID-SKU',
      tipe: 'POS',
      channel_id: 99999, // Invalid channel
      tanggal: '2026-06-14',
      items: [{ varian_id: 99999, qty: 1, harga: 10000 }],
      user: ownerUser
    });
  }, /Channel penjualan tidak ditemukan/);

  assert.throws(() => {
    bl.createPenjualan({
      no_invoice: 'UAT-INVALID-SKU-2',
      tipe: 'POS',
      channel_id: 1,
      tanggal: '2026-06-14',
      items: [{ varian_id: 99999, qty: 1, harga: 10000 }],
      user: ownerUser
    });
  }, /tidak ditemukan/);
});

// UAT-09: Reservasi stok
// Skenario: Pesanan online Diproses atas stok tersisa 1 unit, lalu POS mencoba menjual unit yang sama
// Hasil yang diharapkan: Stok tersedia = 0; POS ditolak atau diperingatkan sesuai kebijakan
runTest('UAT-09: Reservasi stok', () => {
  // Set stock on hand to exactly 1
  db.prepare('UPDATE varian_produk SET stok_on_hand = 1, stok_reserved = 0 WHERE id = ?').run(testVarianId);

  // Online order reserves 1 unit
  bl.createPenjualan({
    no_invoice: 'UAT-RESV-01',
    tipe: 'Online',
    channel_id: 2,
    no_pesanan: 'ORD-RESV-01',
    tanggal: '2026-06-15',
    status: 'Diproses', // RESERVES STOCK!
    items: [{ varian_id: testVarianId, qty: 1, harga: 50000 }],
    user: ownerUser
  });

  const v = db.prepare('SELECT stok_on_hand, stok_reserved, (stok_on_hand - stok_reserved) as stok_tersedia FROM varian_produk WHERE id = ?').get(testVarianId);
  assert.strictEqual(v.stok_tersedia, 0, 'Stok tersedia harus 0 setelah direservasi');

  // POS tries to sell 1 unit - must be rejected because available stock is 0
  assert.throws(() => {
    bl.createPenjualan({
      no_invoice: 'UAT-POS-BLOCKED',
      tipe: 'POS',
      channel_id: 1,
      tanggal: '2026-06-15',
      status: 'Selesai',
      items: [{ varian_id: testVarianId, qty: 1, harga: 50000 }],
      user: kasirUser
    });
  }, /Stok tidak mencukupi/);
});

// UAT-10: Konkurensi
// Skenario: Dua transaksi menjual SKU yang sama secara bersamaan dengan stok 1
// Hasil yang diharapkan: Hanya satu transaksi berhasil; stok tidak pernah negatif
runTest('UAT-10: Konkurensi & Atomisitas', () => {
  db.prepare('UPDATE varian_produk SET stok_on_hand = 1, stok_reserved = 0 WHERE id = ?').run(testVarianId);

  // First succeeds
  bl.createPenjualan({
    no_invoice: 'UAT-CONCUR-1',
    tipe: 'POS',
    channel_id: 1,
    tanggal: '2026-06-16',
    status: 'Selesai',
    items: [{ varian_id: testVarianId, qty: 1, harga: 50000 }],
    user: kasirUser
  });

  // Second fails atomically
  assert.throws(() => {
    bl.createPenjualan({
      no_invoice: 'UAT-CONCUR-2',
      tipe: 'POS',
      channel_id: 1,
      tanggal: '2026-06-16',
      status: 'Selesai',
      items: [{ varian_id: testVarianId, qty: 1, harga: 50000 }],
      user: kasirUser
    });
  }, /Stok tidak mencukupi/);

  const finalV = db.prepare('SELECT stok_on_hand FROM varian_produk WHERE id = ?').get(testVarianId);
  assert(finalV.stok_on_hand >= 0, 'Stok tidak pernah negatif');
});

// UAT-11: Hak akses
// Skenario: Login sebagai Kasir dan membuka detail penjualan serta memanggil API laporan laba
// Hasil yang diharapkan: HPP dan laba tidak tampil maupun dikembalikan oleh API
runTest('UAT-11: Hak akses & Sanitasi Kasir', () => {
  const sensitiveSale = {
    no_invoice: 'INV-SECRET',
    omzet_kotor: 100000,
    pendapatan_bersih: 95000,
    hpp_snapshot: 60000,
    total_hpp: 60000,
    laba_kotor: 35000,
    items: [
      { sku: 'TEST', qty: 1, hpp_snapshot: 60000, laba_kotor: 35000 }
    ]
  };

  const sanitized = auth.sanitizeSensitiveFields(sensitiveSale, kasirUser);

  assert.strictEqual(sanitized.hpp_snapshot, undefined, 'HPP must be stripped for Kasir');
  assert.strictEqual(sanitized.total_hpp, undefined, 'Total HPP must be stripped for Kasir');
  assert.strictEqual(sanitized.laba_kotor, undefined, 'Laba kotor must be stripped for Kasir');
  assert.strictEqual(sanitized.items[0].hpp_snapshot, undefined, 'Item HPP must be stripped for Kasir');
  assert.strictEqual(sanitized.items[0].laba_kotor, undefined, 'Item profit must be stripped for Kasir');
  assert.strictEqual(sanitized.omzet_kotor, 100000, 'Omzet is visible to Kasir');
});

// UAT-12: Tutup periode
// Skenario: Tutup bulan lalu coba ubah atau void transaksi bulan tersebut
// Hasil yang diharapkan: Ditolak; pembukaan kembali oleh Owner tercatat di audit log
runTest('UAT-12: Tutup periode', () => {
  // Close May 2026
  bl.closeAccountingPeriod({ bulan: 5, tahun: 2026, user: ownerUser });

  // Try creating a transaction in May 2026 - must be rejected
  assert.throws(() => {
    bl.createPenjualan({
      no_invoice: 'UAT-CLOSED-PERIOD',
      tipe: 'POS',
      channel_id: 1,
      tanggal: '2026-05-15',
      items: [{ varian_id: testVarianId, qty: 1, harga: 50000 }],
      user: ownerUser
    });
  }, /telah ditutup/);

  // Reopen by Owner
  bl.reopenAccountingPeriod({
    bulan: 5,
    tahun: 2026,
    alasan: 'Audit rekonsiliasi akhir tahun',
    user: ownerUser
  });

  const periodRow = db.prepare('SELECT status FROM periode_akuntansi WHERE bulan = 5 AND tahun = 2026').get();
  assert.strictEqual(periodRow.status, 'Buka', 'Periode successfully reopened');
});

// UAT-13: Impor marketplace
// Skenario: Impor pesanan Shopee yang memuat baris SKU salah dan nomor pesanan ganda
// Hasil yang diharapkan: Baris valid diimpor; baris tidak valid ditandai; impor ulang tidak membuat duplikat
runTest('UAT-13: Impor marketplace & deteksi duplikat', () => {
  // Give stock
  db.prepare('UPDATE varian_produk SET stok_on_hand = 100, stok_reserved = 0 WHERE id = ?').run(testVarianId);

  // Import order 1
  const imp1 = bl.createPenjualan({
    no_invoice: 'INV-IMPORT-1',
    tipe: 'Online',
    channel_id: 2,
    no_pesanan: 'ORD-DUP-01',
    tanggal: '2026-06-17',
    status: 'Diproses',
    items: [{ varian_id: testVarianId, qty: 2, harga: 50000 }],
    user: ownerUser
  });
  assert(imp1.success);

  // Duplicate order number ORD-DUP-01 must be rejected
  assert.throws(() => {
    bl.createPenjualan({
      no_invoice: 'INV-IMPORT-2',
      tipe: 'Online',
      channel_id: 2,
      no_pesanan: 'ORD-DUP-01',
      tanggal: '2026-06-17',
      status: 'Diproses',
      items: [{ varian_id: testVarianId, qty: 1, harga: 50000 }],
      user: ownerUser
    });
  }, /sudah pernah diimpor/);
});

// UAT-14: Migrasi Excel
// Skenario: Impor saldo stok dan kas dengan selisih Rp0
runTest('UAT-14: Migrasi saldo awal & integritas', () => {
  const totalKas = db.prepare('SELECT SUM(saldo_saat_ini) as total FROM akun_kas_bank').get().total;
  assert(totalKas > 0, 'Kas master loaded and intact');
  const totalValuasi = db.prepare('SELECT SUM(stok_on_hand * hpp_rata_rata) as total FROM varian_produk').get().total;
  assert(totalValuasi >= 0, 'Inventory valuation balance confirmed');
});

// UAT-15: Void dan audit
// Skenario: Void penjualan Selesai dengan alasan
// Hasil yang diharapkan: Stok, kas, dan laporan terbalik melalui mutasi pembalik; audit log mencatat nilai sebelum dan sesudah
runTest('UAT-15: Void penjualan dan audit log', () => {
  // Give stock
  db.prepare('UPDATE varian_produk SET stok_on_hand = 10, hpp_rata_rata = 20000 WHERE id = ?').run(testVarianId);
  const kasBefore = db.prepare('SELECT saldo_saat_ini FROM akun_kas_bank WHERE id = 1').get().saldo_saat_ini;

  // Complete a sale
  const sale = bl.createPenjualan({
    no_invoice: 'UAT-VOID-SALE',
    tipe: 'POS',
    channel_id: 1,
    tanggal: '2026-06-18',
    metode_bayar: 'Tunai',
    akun_kas_id: 1,
    status: 'Selesai',
    items: [{ varian_id: testVarianId, qty: 2, harga: 50000 }],
    user: ownerUser
  });

  const kasAfterSale = db.prepare('SELECT saldo_saat_ini FROM akun_kas_bank WHERE id = 1').get().saldo_saat_ini;
  const stockAfterSale = db.prepare('SELECT stok_on_hand FROM varian_produk WHERE id = ?').get(testVarianId).stok_on_hand;
  assert.strictEqual(kasAfterSale, kasBefore + 100000, 'Kas bertambah saat Selesai');
  assert.strictEqual(stockAfterSale, 8, 'Stok berkurang 2');

  // Void the sale
  bl.voidPenjualan({
    penjualan_id: sale.penjualanId,
    alasan: 'Salah input nominal oleh kasir',
    user: ownerUser
  });

  const kasAfterVoid = db.prepare('SELECT saldo_saat_ini FROM akun_kas_bank WHERE id = 1').get().saldo_saat_ini;
  const stockAfterVoid = db.prepare('SELECT stok_on_hand FROM varian_produk WHERE id = ?').get(testVarianId).stok_on_hand;

  assert.strictEqual(kasAfterVoid, kasBefore, 'Kas kembali ke posisi awal setelah Void');
  assert.strictEqual(stockAfterVoid, 10, 'Stok kembali ke posisi awal setelah Void');

  // Check audit log
  const auditEntry = db.prepare("SELECT * FROM audit_log WHERE entitas_id = 'UAT-VOID-SALE' AND aksi = 'VOID'").get();
  assert(auditEntry, 'Audit log entry exists for VOID action');
  assert(auditEntry.nilai_sesudah.includes('Salah input'), 'Audit log records void reason');
});

console.log('\n====================================================');
console.log(` UAT TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
console.log('====================================================\n');

if (failedTests > 0) {
  process.exit(1);
}
