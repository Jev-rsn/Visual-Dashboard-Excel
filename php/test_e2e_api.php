<?php
/**
 * End-to-End API and Business Verification Script for MCRW Web v2.0
 */

declare(strict_types=1);

require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/Auth.php';
require_once __DIR__ . '/BusinessLogic.php';
require_once __DIR__ . '/controllers/AuthController.php';
require_once __DIR__ . '/controllers/MasterController.php';
require_once __DIR__ . '/controllers/PembelianController.php';
require_once __DIR__ . '/controllers/PenjualanController.php';
require_once __DIR__ . '/controllers/ReturController.php';
require_once __DIR__ . '/controllers/BiayaKasController.php';
require_once __DIR__ . '/controllers/StokController.php';
require_once __DIR__ . '/controllers/PeriodeController.php';
require_once __DIR__ . '/controllers/LaporanController.php';
require_once __DIR__ . '/controllers/ImportExportController.php';

echo "========================================================\n";
echo " RUNNING FULL END-TO-END PHP API & WORKFLOW VERIFICATION\n";
echo "========================================================\n\n";

$testsPassed = 0;
$testsFailed = 0;

function check(string $label, callable $fn): void {
    global $testsPassed, $testsFailed;
    try {
        $fn();
        echo "[SUCCESS] {$label}\n";
        $testsPassed++;
    } catch (\Throwable $e) {
        echo "[ERROR]   {$label}\n";
        echo "          Details: {$e->getMessage()}\n";
        $testsFailed++;
    }
}

// 1. Auth Login as Owner
$ownerSession = null;
$ownerUser = null;
check('1. Login sebagai Owner (owner@mcrw.com)', function() use (&$ownerSession, &$ownerUser) {
    $res = AuthController::login(['email' => 'owner@mcrw.com', 'password' => 'admin123'], '127.0.0.1');
    if (empty($res['token']) || $res['user']['peran'] !== 'Owner') {
        throw new Exception('Login Owner gagal.');
    }
    $ownerSession = $res;
    $ownerUser = $res['user'];
});

// 2. Auth Login as Kasir
$kasirSession = null;
$kasirUser = null;
check('2. Login sebagai Kasir (kasir@mcrw.com)', function() use (&$kasirSession, &$kasirUser) {
    $res = AuthController::login(['email' => 'kasir@mcrw.com', 'password' => 'admin123'], '127.0.0.1');
    if (empty($res['token']) || $res['user']['peran'] !== 'Kasir & Admin Online') {
        throw new Exception('Login Kasir gagal.');
    }
    $kasirSession = $res;
    $kasirUser = $res['user'];
});

// 3. Master Products Fetching
check('3. Ambil Master Produk & Varian', function() use ($ownerUser) {
    $products = MasterController::getProduk($ownerUser);
    if (empty($products)) throw new Exception('Master produk kosong.');
    $varians = MasterController::getVarians($ownerUser);
    if (empty($varians)) throw new Exception('Master varians kosong.');
});

// 4. Create New Product with Variants
$createdProdId = null;
$createdVarianId = null;
check('4. Buat Produk Baru dengan Multi-Varian SKU', function() use ($ownerUser, &$createdProdId, &$createdVarianId) {
    $res = MasterController::createProduk([
        'nama' => 'Sepatu Sneakers Canvas Low',
        'kategori' => 'Alas Kaki',
        'deskripsi' => 'Sneakers kanvas sol karet vulcanized',
        'varians' => [
            [
                'sku' => 'SNK-BLK-40',
                'nama_varian' => 'Hitam - 40',
                'satuan' => 'Pasang',
                'harga_jual_default' => 150000,
                'stok_min' => 4
            ],
            [
                'sku' => 'SNK-BLK-41',
                'nama_varian' => 'Hitam - 41',
                'satuan' => 'Pasang',
                'harga_jual_default' => 150000,
                'stok_min' => 4
            ]
        ]
    ], $ownerUser);
    if (empty($res['success'])) throw new Exception('Gagal menyimpan produk.');
    $createdProdId = $res['produkId'];

    $db = Database::getConnection();
    $stmt = $db->prepare('SELECT id FROM varian_produk WHERE sku = ?');
    $stmt->execute(['SNK-BLK-40']);
    $createdVarianId = (int)$stmt->fetch()['id'];
});

// 5. Post Purchase with Moving Average HPP and Freight-In
check('5. Pembelian Stok Masuk dengan Alokasi Ongkir & Moving Average HPP', function() use ($ownerUser, $createdVarianId) {
    $noFaktur = 'PO-E2E-' . time();
    $res = PembelianController::create([
        'no_faktur' => $noFaktur,
        'supplier_id' => 1,
        'tanggal' => gmdate('Y-m-d'),
        'items' => [
            ['varian_id' => $createdVarianId, 'qty' => 10, 'harga_beli' => 80000]
        ],
        'ongkir' => 20000,
        'metode_alokasi_ongkir' => 'nilai',
        'status_bayar' => 'Lunas',
        'akun_kas_id' => 2 // Bank BCA
    ], $ownerUser);
    if (empty($res['success'])) throw new Exception('Gagal posting pembelian.');

    $db = Database::getConnection();
    $stmt = $db->prepare('SELECT stok_on_hand, hpp_rata_rata FROM varian_produk WHERE id = ?');
    $stmt->execute([$createdVarianId]);
    $v = $stmt->fetch();
    if ((int)$v['stok_on_hand'] !== 10) throw new Exception("Stok fisik harus 10, dapat: {$v['stok_on_hand']}");
    // HPP should be 80.000 + (20.000 / 10) = 82.000
    if ((float)$v['hpp_rata_rata'] !== 82000.0) throw new Exception("HPP harus 82.000, dapat: {$v['hpp_rata_rata']}");
});

// 6. POS Cash Sale
$posSaleId = null;
check('6. Penjualan POS Kasir (Tunai, Cetak Struk 80mm)', function() use ($kasirUser, $createdVarianId, &$posSaleId) {
    $noInvoice = 'POS-E2E-' . time();
    $res = PenjualanController::create([
        'no_invoice' => $noInvoice,
        'tipe' => 'POS',
        'channel_id' => 1, // POS
        'tanggal' => gmdate('Y-m-d'),
        'metode_bayar' => 'Tunai',
        'akun_kas_id' => 1, // Kas Toko
        'status' => 'Selesai',
        'items' => [
            ['varian_id' => $createdVarianId, 'qty' => 2, 'harga' => 150000]
        ]
    ], $kasirUser);
    if (empty($res['success'])) throw new Exception('Gagal posting POS.');
    $posSaleId = $res['penjualanId'];

    $db = Database::getConnection();
    $stmt = $db->prepare('SELECT stok_on_hand FROM varian_produk WHERE id = ?');
    $stmt->execute([$createdVarianId]);
    $v = $stmt->fetch();
    if ((int)$v['stok_on_hand'] !== 8) throw new Exception("Stok fisik harus 8, dapat: {$v['stok_on_hand']}");
});

// 7. Online Order with Reservation and Status Pipeline
$onlineSaleId = null;
check('7. Penjualan Online Shopee: Reservasi Stok -> Selesai', function() use ($ownerUser, $createdVarianId, &$onlineSaleId) {
    $noInvoice = 'SHP-E2E-' . time();
    $res = PenjualanController::create([
        'no_invoice' => $noInvoice,
        'tipe' => 'Online',
        'channel_id' => 2, // Shopee
        'no_pesanan' => 'ORD-E2E-' . time(),
        'tanggal' => gmdate('Y-m-d'),
        'metode_bayar' => 'Marketplace',
        'akun_kas_id' => 3, // Saldo Shopee
        'status' => 'Diproses', // RESERVES STOCK!
        'items' => [
            ['varian_id' => $createdVarianId, 'qty' => 1, 'harga' => 150000, 'potongan_admin' => 10750]
        ]
    ], $ownerUser);
    $onlineSaleId = $res['penjualanId'];

    $db = Database::getConnection();
    $stmt = $db->prepare('SELECT stok_on_hand, stok_reserved, (stok_on_hand - stok_reserved) as stok_tersedia FROM varian_produk WHERE id = ?');
    $stmt->execute([$createdVarianId]);
    $v = $stmt->fetch();
    if ((int)$v['stok_reserved'] !== 1) throw new Exception("Stok reserved harus 1");
    if ((int)$v['stok_tersedia'] !== 7) throw new Exception("Stok tersedia harus 7");

    // Transition to Selesai
    $upd = PenjualanController::updateStatus($onlineSaleId, ['status_baru' => 'Selesai'], $ownerUser);
    if (empty($upd['success'])) throw new Exception('Gagal update status pesanan online ke Selesai.');

    $stmt->execute([$createdVarianId]);
    $vAfter = $stmt->fetch();
    if ((int)$vAfter['stok_on_hand'] !== 7) throw new Exception("Stok fisik harus 7 setelah Selesai");
    if ((int)$vAfter['stok_reserved'] !== 0) throw new Exception("Stok reserved harus 0 setelah Selesai");
});

// 8. Return Sales Layak (Restock with Snapshot HPP)
check('8. Retur Penjualan Produk Layak (Restok otomatis dengan HPP Asli)', function() use ($ownerUser, $posSaleId, $createdVarianId) {
    $db = Database::getConnection();
    $stmt = $db->prepare('SELECT id FROM detail_penjualan WHERE penjualan_id = ?');
    $stmt->execute([$posSaleId]);
    $detId = (int)$stmt->fetch()['id'];

    $res = ReturController::create([
        'penjualan_id' => $posSaleId,
        'tanggal' => gmdate('Y-m-d'),
        'kembali_ke_stok' => 1,
        'akun_kas_id' => 1,
        'items' => [
            ['detail_penjualan_id' => $detId, 'qty' => 1]
        ],
        'catatan' => 'Tukar ukuran - kondisi mulus'
    ], $ownerUser);
    if (empty($res['success'])) throw new Exception('Gagal proses retur layak.');

    $stmtStok = $db->prepare('SELECT stok_on_hand FROM varian_produk WHERE id = ?');
    $stmtStok->execute([$createdVarianId]);
    $v = $stmtStok->fetch();
    if ((int)$v['stok_on_hand'] !== 8) throw new Exception("Stok fisik harus kembali ke 8 setelah retur layak");
});

// 9. Operational Expense & Cash Neutral Transfer
check('9. Pencatatan Biaya Operasional & Transfer Kas Antar-Akun (Netral L/R)', function() use ($ownerUser) {
    // 1. Biaya Iklan Shopee
    $noBukti = 'BY-E2E-' . time();
    $resExp = BiayaKasController::createBiaya([
        'no_bukti' => $noBukti,
        'tanggal' => gmdate('Y-m-d'),
        'kategori_id' => 4, // Shopee Ads
        'channel_id' => 2, // Shopee
        'nominal' => 50000,
        'akun_kas_id' => 2, // Bank BCA
        'keterangan' => 'Topup Saldo Iklan Shopee Ads'
    ], $ownerUser);
    if (empty($resExp['success'])) throw new Exception('Gagal catat biaya operasional.');

    // 2. Mutasi Kas dari Shopee ke Bank BCA
    $noRef = 'MUT-E2E-' . time();
    $resMut = BiayaKasController::createMutasi([
        'no_referensi' => $noRef,
        'tanggal' => gmdate('Y-m-d'),
        'akun_asal_id' => 3, // Shopee
        'akun_tujuan_id' => 2, // Bank BCA
        'nominal' => 100000,
        'keterangan' => 'Penarikan dana Shopee ke Bank BCA'
    ], $ownerUser);
    if (empty($resMut['success'])) throw new Exception('Gagal mutasi kas.');
});

// 10. Financial Reports Validation
check('10. Laporan Keuangan (Dashboard, Laba Rugi, Profitabilitas Channel, Posisi Kas)', function() use ($ownerUser) {
    $dash = LaporanController::dashboard([], $ownerUser);
    if (!isset($dash['kpi']['total_omzet'])) throw new Exception('Dashboard KPI gagal dihitung.');

    $lr = LaporanController::labaRugi([], $ownerUser);
    if (!isset($lr['laba_bersih'])) throw new Exception('Laba Rugi gagal dihitung.');

    $ch = LaporanController::profitabilitasChannel([], $ownerUser);
    if (!isset($ch['channels'])) throw new Exception('Profitabilitas channel gagal.');

    $kas = LaporanController::posisiKas([], $ownerUser);
    if (!isset($kas['akuns'])) throw new Exception('Posisi kas gagal.');
});

// 11. RBAC Kasir Security Sanitization
check('11. RBAC & Sanitasi Kasir: Tidak dapat melihat HPP & diblokir dari Laporan Keuangan', function() use ($kasirUser) {
    // 1. Check list penjualan sanitized
    $sales = PenjualanController::list([], $kasirUser);
    foreach ($sales as $s) {
        if (isset($s['total_hpp']) || isset($s['laba_kotor']) || isset($s['hpp_snapshot'])) {
            throw new Exception('Kebocoran HPP/Laba pada API penjualan Kasir!');
        }
    }

    // 2. Check blocked from Laporan Keuangan
    try {
        LaporanController::labaRugi([], $kasirUser);
        throw new Exception('Kasir seharusnya diblokir (403) dari Laporan Laba Rugi!');
    } catch (\Throwable $err) {
        if (strpos($err->getMessage(), 'Akses ditolak') === false) {
            throw $err;
        }
    }
});

echo "\n========================================================\n";
echo " E2E VERIFICATION RESULTS: {$testsPassed} PASSED, {$testsFailed} FAILED\n";
echo "========================================================\n\n";

if ($testsFailed > 0) exit(1);
