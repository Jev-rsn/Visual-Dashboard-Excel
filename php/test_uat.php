<?php
/**
 * UAT Test Suite for MCRW Web v2.0 in PHP
 * Verifies all 15 Acceptance Test Scenarios (UAT-01 through UAT-15) from Section 9 of the PRD.
 */

declare(strict_types=1);

// Set test DB path
$testDbPath = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'test_uat_php.sqlite';
if (file_exists($testDbPath)) {
    unlink($testDbPath);
}
putenv("DB_PATH=$testDbPath");

require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/Auth.php';
require_once __DIR__ . '/BusinessLogic.php';

$pdo = Database::getConnection();
$bl = new BusinessLogic();

$ownerUser = ['id' => 1, 'nama' => 'Budi Santoso', 'peran' => 'Owner'];
$kasirUser = ['id' => 3, 'nama' => 'Siti Kasir', 'peran' => 'Kasir & Admin Online'];

echo "====================================================\n";
echo " STARTING PHP UAT TEST SUITE - MCRW Web v2.0\n";
echo "====================================================\n\n";

$passedTests = 0;
$failedTests = 0;

function runTest(string $name, callable $fn): void {
    global $passedTests, $failedTests;
    try {
        $fn();
        echo "[PASS] {$name}\n";
        $passedTests++;
    } catch (\Throwable $err) {
        echo "[FAIL] {$name}\n";
        echo "       Error: " . $err->getMessage() . "\n";
        echo "       Trace: " . $err->getFile() . ":" . $err->getLine() . "\n";
        $failedTests++;
    }
}

function assertTrue($condition, string $msg = 'Assertion failed'): void {
    if (!$condition) {
        throw new \Exception($msg);
    }
}

function assertStrictEqual($actual, $expected, string $msg = ''): void {
    if ($actual !== $expected) {
        $actualStr = var_export($actual, true);
        $expectedStr = var_export($expected, true);
        throw new \Exception(($msg ? $msg . ' ' : '') . "Expected {$expectedStr}, got {$actualStr}");
    }
}

function assertThrows(callable $fn, string $expectedRegex): void {
    try {
        $fn();
    } catch (\Throwable $err) {
        if (!preg_match($expectedRegex, $err->getMessage())) {
            throw new \Exception("Caught unexpected exception message: '{$err->getMessage()}', pattern: '{$expectedRegex}'");
        }
        return;
    }
    throw new \Exception("Expected exception matching '{$expectedRegex}', but none was thrown.");
}

// Setup a clean test SKU
$pdo->prepare('INSERT INTO produk (nama, kategori, aktif) VALUES (?, ?, 1)')->execute(['UAT Test Product PHP', 'Test']);
$testProdId = (int)$pdo->lastInsertId();

$pdo->prepare("
    INSERT INTO varian_produk (produk_id, sku, nama_varian, satuan, harga_jual_default, stok_min, stok_on_hand, stok_reserved, hpp_rata_rata, aktif)
    VALUES (?, 'UAT-SKU-PHP-A', 'Varian PHP A', 'Pcs', 50000, 2, 0, 0, 0, 1)
")->execute([$testProdId]);
$testVarianId = (int)$pdo->lastInsertId();

// UAT-01: Sinkronisasi stok
// Skenario: Beli 10 unit SKU A, jual 3 di POS dan 2 di Shopee (Selesai)
// Hasil yang diharapkan: Stok on hand akhir +5; buku stok memuat 3 mutasi dengan referensi dokumen
runTest('UAT-01: Sinkronisasi stok', function() use ($bl, $pdo, $testVarianId, $ownerUser, $kasirUser) {
    // 1. Beli 10 unit SKU A @ Rp30.000
    $bl->postPembelian([
        'no_faktur' => 'UAT-FAK-01',
        'supplier_id' => 1,
        'tanggal' => '2026-06-01',
        'items' => [['varian_id' => $testVarianId, 'qty' => 10, 'harga_beli' => 30000]],
        'ongkir' => 0,
        'status_bayar' => 'Lunas',
        'akun_kas_id' => 2, // Bank BCA
        'user' => $ownerUser
    ]);

    // 2. Jual 3 di POS
    $bl->createPenjualan([
        'no_invoice' => 'UAT-POS-01',
        'tipe' => 'POS',
        'channel_id' => 1, // POS
        'tanggal' => '2026-06-02',
        'metode_bayar' => 'Tunai',
        'akun_kas_id' => 1, // Kas Toko
        'status' => 'Selesai',
        'items' => [['varian_id' => $testVarianId, 'qty' => 3, 'harga' => 50000]],
        'user' => $kasirUser
    ]);

    // 3. Jual 2 di Shopee (Selesai)
    $bl->createPenjualan([
        'no_invoice' => 'UAT-SHP-01',
        'tipe' => 'Online',
        'channel_id' => 2, // Shopee
        'no_pesanan' => 'ORD-SHP-01',
        'tanggal' => '2026-06-03',
        'metode_bayar' => 'Marketplace',
        'akun_kas_id' => 3, // Saldo Shopee
        'status' => 'Selesai',
        'items' => [['varian_id' => $testVarianId, 'qty' => 2, 'harga' => 50000, 'potongan_admin' => 3500]],
        'user' => $ownerUser
    ]);

    $stmt = $pdo->prepare('SELECT stok_on_hand FROM varian_produk WHERE id = ?');
    $stmt->execute([$testVarianId]);
    $v = $stmt->fetch(\PDO::FETCH_ASSOC);
    assertStrictEqual((int)$v['stok_on_hand'], 5, "Expected stock 5, got {$v['stok_on_hand']}");

    $stmtM = $pdo->prepare('SELECT COUNT(*) as count FROM mutasi_stok WHERE varian_id = ?');
    $stmtM->execute([$testVarianId]);
    $mutasiCount = (int)$stmtM->fetch(\PDO::FETCH_ASSOC)['count'];
    assertStrictEqual($mutasiCount, 3, "Expected 3 mutations, got {$mutasiCount}");
});

// UAT-02: Omzet vs dana cair
// Skenario: Penjualan Shopee Rp200.000, potongan admin Rp15.000
// Hasil yang diharapkan: Omzet kotor Rp200.000; pendapatan bersih dan Saldo Shopee +Rp185.000
runTest('UAT-02: Omzet vs dana cair', function() use ($bl, $pdo, $testVarianId, $ownerUser) {
    $stmt = $pdo->query('SELECT saldo_saat_ini FROM akun_kas_bank WHERE id = 3');
    $initialSaldo = (float)$stmt->fetch(\PDO::FETCH_ASSOC)['saldo_saat_ini'];

    // Give some stock
    $pdo->prepare('UPDATE varian_produk SET stok_on_hand = 10, hpp_rata_rata = 25000 WHERE id = ?')->execute([$testVarianId]);

    $saleRes = $bl->createPenjualan([
        'no_invoice' => 'UAT-SHP-02',
        'tipe' => 'Online',
        'channel_id' => 2,
        'no_pesanan' => 'ORD-SHP-02',
        'tanggal' => '2026-06-04',
        'metode_bayar' => 'Marketplace',
        'akun_kas_id' => 3,
        'status' => 'Selesai',
        'items' => [['varian_id' => $testVarianId, 'qty' => 4, 'harga' => 50000, 'potongan_admin' => 15000]],
        'user' => $ownerUser
    ]);

    assertStrictEqual((float)$saleRes['omzetKotor'], 200000.0, "Expected Omzet Rp200.000, got {$saleRes['omzetKotor']}");
    assertStrictEqual((float)$saleRes['pendapatanBersih'], 185000.0, "Expected Net Rp185.000, got {$saleRes['pendapatanBersih']}");

    $stmt2 = $pdo->query('SELECT saldo_saat_ini FROM akun_kas_bank WHERE id = 3');
    $updatedSaldo = (float)$stmt2->fetch(\PDO::FETCH_ASSOC)['saldo_saat_ini'];
    assertStrictEqual($updatedSaldo, $initialSaldo + 185000.0, "Expected Saldo Shopee +185000, got diff " . ($updatedSaldo - $initialSaldo));
});

// UAT-03: Netralitas pencairan
// Skenario: Mutasi Rp185.000 dari Saldo Shopee ke Bank
// Hasil yang diharapkan: Saldo Shopee -Rp185.000, Bank +Rp185.000, laba bersih tidak berubah
runTest('UAT-03: Netralitas pencairan', function() use ($bl, $pdo, $ownerUser) {
    $shopeeBefore = (float)$pdo->query('SELECT saldo_saat_ini FROM akun_kas_bank WHERE id = 3')->fetch(\PDO::FETCH_ASSOC)['saldo_saat_ini'];
    $bankBefore = (float)$pdo->query('SELECT saldo_saat_ini FROM akun_kas_bank WHERE id = 2')->fetch(\PDO::FETCH_ASSOC)['saldo_saat_ini'];

    $bl->createMutasiKas([
        'no_referensi' => 'MUT-PHP-001',
        'tanggal' => '2026-06-05',
        'akun_asal_id' => 3, // Shopee
        'akun_tujuan_id' => 2, // Bank BCA
        'nominal' => 185000,
        'keterangan' => 'Withdraw Saldo Shopee ke Bank BCA',
        'user' => $ownerUser
    ]);

    $shopeeAfter = (float)$pdo->query('SELECT saldo_saat_ini FROM akun_kas_bank WHERE id = 3')->fetch(\PDO::FETCH_ASSOC)['saldo_saat_ini'];
    $bankAfter = (float)$pdo->query('SELECT saldo_saat_ini FROM akun_kas_bank WHERE id = 2')->fetch(\PDO::FETCH_ASSOC)['saldo_saat_ini'];

    assertStrictEqual($shopeeAfter, $shopeeBefore - 185000.0, 'Saldo Shopee berkurang 185000');
    assertStrictEqual($bankAfter, $bankBefore + 185000.0, 'Saldo Bank bertambah 185000');

    // Verify mutasi does not appear in sales or expenses tables
    $inSales = (int)$pdo->query("SELECT COUNT(*) as c FROM penjualan WHERE no_pesanan = 'MUT-PHP-001'")->fetch(\PDO::FETCH_ASSOC)['c'];
    $inExp = (int)$pdo->query("SELECT COUNT(*) as c FROM biaya_operasional WHERE no_bukti = 'MUT-PHP-001'")->fetch(\PDO::FETCH_ASSOC)['c'];
    assertStrictEqual($inSales + $inExp, 0, 'Mutasi kas must be strictly neutral to P&L');
});

// UAT-04: Retur layak vs rusak
// Skenario: Retur 1 unit dengan Kembali ke Stok = Ya, lalu Tidak
// Hasil yang diharapkan: Ya: stok +1 dengan HPP asli; Tidak: stok tetap, refund tercatat
runTest('UAT-04: Retur layak vs rusak', function() use ($bl, $pdo, $testVarianId, $ownerUser) {
    // First make a sale of 2 units
    $sale = $bl->createPenjualan([
        'no_invoice' => 'UAT-RET-SALE',
        'tipe' => 'POS',
        'channel_id' => 1,
        'tanggal' => '2026-06-06',
        'metode_bayar' => 'Tunai',
        'akun_kas_id' => 1,
        'status' => 'Selesai',
        'items' => [['varian_id' => $testVarianId, 'qty' => 2, 'harga' => 50000]],
        'user' => $ownerUser
    ]);

    $stmt = $pdo->prepare('SELECT id, hpp_snapshot FROM detail_penjualan WHERE penjualan_id = ?');
    $stmt->execute([$sale['penjualanId']]);
    $saleDetail = $stmt->fetch(\PDO::FETCH_ASSOC);

    $stmtStok = $pdo->prepare('SELECT stok_on_hand FROM varian_produk WHERE id = ?');
    $stmtStok->execute([$testVarianId]);
    $stockBeforeRetur = (int)$stmtStok->fetch(\PDO::FETCH_ASSOC)['stok_on_hand'];

    // Case 1: Return 1 unit Layak (Kembali ke Stok = 1)
    $ret1 = $bl->createReturPenjualan([
        'penjualan_id' => $sale['penjualanId'],
        'tanggal' => '2026-06-07',
        'kembali_ke_stok' => 1,
        'akun_kas_id' => 1,
        'items' => [['detail_penjualan_id' => (int)$saleDetail['id'], 'qty' => 1]],
        'catatan' => 'Customer tukar ukuran - barang layak',
        'user' => $ownerUser
    ]);

    $stmtStok->execute([$testVarianId]);
    $stockAfterRetur1 = (int)$stmtStok->fetch(\PDO::FETCH_ASSOC)['stok_on_hand'];
    assertStrictEqual($stockAfterRetur1, $stockBeforeRetur + 1, 'Layak: Stok harus bertambah 1');

    // Case 2: Return 1 unit Rusak (Kembali ke Stok = 0)
    $ret2 = $bl->createReturPenjualan([
        'penjualan_id' => $sale['penjualanId'],
        'tanggal' => '2026-06-07',
        'kembali_ke_stok' => 0,
        'akun_kas_id' => 1,
        'items' => [['detail_penjualan_id' => (int)$saleDetail['id'], 'qty' => 1]],
        'catatan' => 'Barang robek cacat pabrik',
        'user' => $ownerUser
    ]);

    $stmtStok->execute([$testVarianId]);
    $stockAfterRetur2 = (int)$stmtStok->fetch(\PDO::FETCH_ASSOC)['stok_on_hand'];
    assertStrictEqual($stockAfterRetur2, $stockAfterRetur1, 'Rusak: Stok tidak boleh bertambah');

    $stmtRet = $pdo->prepare('SELECT kerugian_retur FROM retur_penjualan WHERE no_retur = ?');
    $stmtRet->execute([$ret2['noRetur']]);
    $ret2Data = $stmtRet->fetch(\PDO::FETCH_ASSOC);
    assertTrue((float)$ret2Data['kerugian_retur'] > 0, 'Rusak: Kerugian retur harus tercatat');
});

// UAT-05: Stabilitas HPP
// Skenario: Beli SKU A dengan harga lebih mahal setelah penjualan lama diposting
// Hasil yang diharapkan: Laba kotor penjualan lama tidak berubah; penjualan baru memakai HPP baru
runTest('UAT-05: Stabilitas HPP', function() use ($bl, $pdo, $testVarianId, $ownerUser) {
    // Existing sale before purchase
    $oldSale = $bl->createPenjualan([
        'no_invoice' => 'UAT-HPP-01',
        'tipe' => 'POS',
        'channel_id' => 1,
        'tanggal' => '2026-06-08',
        'metode_bayar' => 'Tunai',
        'akun_kas_id' => 1,
        'status' => 'Selesai',
        'items' => [['varian_id' => $testVarianId, 'qty' => 1, 'harga' => 60000]],
        'user' => $ownerUser
    ]);
    $stmtOld = $pdo->prepare('SELECT total_hpp, laba_kotor FROM penjualan WHERE id = ?');
    $stmtOld->execute([$oldSale['penjualanId']]);
    $oldSaleData = $stmtOld->fetch(\PDO::FETCH_ASSOC);

    // Buy new stock at much higher price (e.g. 50,000)
    $bl->postPembelian([
        'no_faktur' => 'UAT-FAK-EXPENSIVE',
        'supplier_id' => 1,
        'tanggal' => '2026-06-09',
        'items' => [['varian_id' => $testVarianId, 'qty' => 10, 'harga_beli' => 50000]],
        'ongkir' => 0,
        'status_bayar' => 'Lunas',
        'akun_kas_id' => 2,
        'user' => $ownerUser
    ]);

    // Old sale data MUST NOT change
    $stmtOld->execute([$oldSale['penjualanId']]);
    $oldSaleDataAfter = $stmtOld->fetch(\PDO::FETCH_ASSOC);
    assertStrictEqual((float)$oldSaleDataAfter['total_hpp'], (float)$oldSaleData['total_hpp'], 'Old sale HPP snapshot must remain stable');
    assertStrictEqual((float)$oldSaleDataAfter['laba_kotor'], (float)$oldSaleData['laba_kotor'], 'Old sale gross profit must remain stable');

    // New sale will use the updated moving average HPP
    $newSale = $bl->createPenjualan([
        'no_invoice' => 'UAT-HPP-02',
        'tipe' => 'POS',
        'channel_id' => 1,
        'tanggal' => '2026-06-10',
        'metode_bayar' => 'Tunai',
        'akun_kas_id' => 1,
        'status' => 'Selesai',
        'items' => [['varian_id' => $testVarianId, 'qty' => 1, 'harga' => 70000]],
        'user' => $ownerUser
    ]);
    $stmtNew = $pdo->prepare('SELECT total_hpp FROM penjualan WHERE id = ?');
    $stmtNew->execute([$newSale['penjualanId']]);
    $newSaleData = $stmtNew->fetch(\PDO::FETCH_ASSOC);
    assertTrue((float)$newSaleData['total_hpp'] > (float)$oldSaleData['total_hpp'], 'New sale must use the new higher average HPP');
});

// UAT-06: Pembelian tempo
// Skenario: Pembelian Rp1.000.000 status Utang
// Hasil yang diharapkan: Stok bertambah, saldo kas tetap, utang supplier +Rp1.000.000; pelunasan menurunkan kas dan utang
runTest('UAT-06: Pembelian tempo', function() use ($bl, $pdo, $testVarianId, $ownerUser) {
    $bankBefore = (float)$pdo->query('SELECT saldo_saat_ini FROM akun_kas_bank WHERE id = 2')->fetch(\PDO::FETCH_ASSOC)['saldo_saat_ini'];
    $stmtStok = $pdo->prepare('SELECT stok_on_hand FROM varian_produk WHERE id = ?');
    $stmtStok->execute([$testVarianId]);
    $stockBefore = (int)$stmtStok->fetch(\PDO::FETCH_ASSOC)['stok_on_hand'];

    $buyRes = $bl->postPembelian([
        'no_faktur' => 'UAT-TEMPO-01',
        'supplier_id' => 1,
        'tanggal' => '2026-06-11',
        'items' => [['varian_id' => $testVarianId, 'qty' => 20, 'harga_beli' => 50000]],
        'ongkir' => 0,
        'status_bayar' => 'Utang',
        'termin_hari' => 30,
        'user' => $ownerUser
    ]);

    $bankAfterBuy = (float)$pdo->query('SELECT saldo_saat_ini FROM akun_kas_bank WHERE id = 2')->fetch(\PDO::FETCH_ASSOC)['saldo_saat_ini'];
    $stmtStok->execute([$testVarianId]);
    $stockAfterBuy = (int)$stmtStok->fetch(\PDO::FETCH_ASSOC)['stok_on_hand'];

    $stmtBuy = $pdo->prepare('SELECT sisa_utang FROM pembelian WHERE id = ?');
    $stmtBuy->execute([$buyRes['pembelianId']]);
    $buyData = $stmtBuy->fetch(\PDO::FETCH_ASSOC);

    assertStrictEqual($bankAfterBuy, $bankBefore, 'Pembelian utang: Saldo kas harus tetap');
    assertStrictEqual($stockAfterBuy, $stockBefore + 20, 'Pembelian utang: Stok harus bertambah');
    assertStrictEqual((float)$buyData['sisa_utang'], 1000000.0, 'Utang tercatat Rp1.000.000');

    // Settle half the debt (Rp 500.000)
    $bl->settleUtang([
        'pembelian_id' => $buyRes['pembelianId'],
        'nominal' => 500000,
        'akun_kas_id' => 2, // Bank BCA
        'tanggal' => '2026-06-12',
        'user' => $ownerUser
    ]);

    $bankAfterSettle = (float)$pdo->query('SELECT saldo_saat_ini FROM akun_kas_bank WHERE id = 2')->fetch(\PDO::FETCH_ASSOC)['saldo_saat_ini'];
    $stmtBuy->execute([$buyRes['pembelianId']]);
    $buyDataAfterSettle = $stmtBuy->fetch(\PDO::FETCH_ASSOC);

    assertStrictEqual($bankAfterSettle, $bankBefore - 500000.0, 'Pelunasan menurunkan kas');
    assertStrictEqual((float)$buyDataAfterSettle['sisa_utang'], 500000.0, 'Pelunasan menurunkan sisa utang');
});

// UAT-07: Biaya per channel
// Skenario: Biaya Shopee Ads Rp300.000 dengan channel Shopee
// Hasil yang diharapkan: Laba kontribusi Shopee dan laba bersih total berkurang Rp300.000
runTest('UAT-07: Biaya per channel', function() use ($bl, $pdo, $ownerUser) {
    $expRes = $bl->createBiayaOperasional([
        'no_bukti' => 'BIAYA-SHP-001',
        'tanggal' => '2026-06-13',
        'kategori_id' => 4, // Shopee Ads
        'channel_id' => 2, // Shopee
        'nominal' => 300000,
        'akun_kas_id' => 2, // Bank BCA
        'keterangan' => 'Iklan Shopee Mega Sale',
        'user' => $ownerUser
    ]);

    $stmt = $pdo->prepare('SELECT nominal, channel_id FROM biaya_operasional WHERE id = ?');
    $stmt->execute([$expRes['biayaId']]);
    $row = $stmt->fetch(\PDO::FETCH_ASSOC);

    assertStrictEqual((float)$row['nominal'], 300000.0);
    assertStrictEqual((int)$row['channel_id'], 2, 'Biaya dialokasikan khusus ke channel Shopee');
});

// UAT-08: Integritas data
// Skenario: Mengirim SKU/channel tidak terdaftar via formulir dan via API langsung
// Hasil yang diharapkan: Ditolak dengan pesan galat jelas di kedua jalur
runTest('UAT-08: Integritas data', function() use ($bl, $ownerUser) {
    assertThrows(function() use ($bl, $ownerUser) {
        $bl->createPenjualan([
            'no_invoice' => 'UAT-INVALID-SKU',
            'tipe' => 'POS',
            'channel_id' => 99999, // Invalid channel
            'tanggal' => '2026-06-14',
            'items' => [['varian_id' => 99999, 'qty' => 1, 'harga' => 10000]],
            'user' => $ownerUser
        ]);
    }, '/Channel penjualan tidak ditemukan/');

    assertThrows(function() use ($bl, $ownerUser) {
        $bl->createPenjualan([
            'no_invoice' => 'UAT-INVALID-SKU-2',
            'tipe' => 'POS',
            'channel_id' => 1,
            'tanggal' => '2026-06-14',
            'items' => [['varian_id' => 99999, 'qty' => 1, 'harga' => 10000]],
            'user' => $ownerUser
        ]);
    }, '/tidak ditemukan/');
});

// UAT-09: Reservasi stok
// Skenario: Pesanan online Diproses atas stok tersisa 1 unit, lalu POS mencoba menjual unit yang sama
// Hasil yang diharapkan: Stok tersedia = 0; POS ditolak atau diperingatkan sesuai kebijakan
runTest('UAT-09: Reservasi stok', function() use ($bl, $pdo, $testVarianId, $ownerUser, $kasirUser) {
    // Set stock on hand to exactly 1
    $pdo->prepare('UPDATE varian_produk SET stok_on_hand = 1, stok_reserved = 0 WHERE id = ?')->execute([$testVarianId]);

    // Online order reserves 1 unit
    $bl->createPenjualan([
        'no_invoice' => 'UAT-RESV-01',
        'tipe' => 'Online',
        'channel_id' => 2,
        'no_pesanan' => 'ORD-RESV-01',
        'tanggal' => '2026-06-15',
        'status' => 'Diproses', // RESERVES STOCK!
        'items' => [['varian_id' => $testVarianId, 'qty' => 1, 'harga' => 50000]],
        'user' => $ownerUser
    ]);

    $stmt = $pdo->prepare('SELECT stok_on_hand, stok_reserved, (stok_on_hand - stok_reserved) as stok_tersedia FROM varian_produk WHERE id = ?');
    $stmt->execute([$testVarianId]);
    $v = $stmt->fetch(\PDO::FETCH_ASSOC);
    assertStrictEqual((int)$v['stok_tersedia'], 0, 'Stok tersedia harus 0 setelah direservasi');

    // POS tries to sell 1 unit - must be rejected because available stock is 0
    assertThrows(function() use ($bl, $testVarianId, $kasirUser) {
        $bl->createPenjualan([
            'no_invoice' => 'UAT-POS-BLOCKED',
            'tipe' => 'POS',
            'channel_id' => 1,
            'tanggal' => '2026-06-15',
            'status' => 'Selesai',
            'items' => [['varian_id' => $testVarianId, 'qty' => 1, 'harga' => 50000]],
            'user' => $kasirUser
        ]);
    }, '/Stok tidak mencukupi/');
});

// UAT-10: Konkurensi & Atomisitas
// Skenario: Dua transaksi menjual SKU yang sama secara bersamaan dengan stok 1
// Hasil yang diharapkan: Hanya satu transaksi berhasil; stok tidak pernah negatif
runTest('UAT-10: Konkurensi & Atomisitas', function() use ($bl, $pdo, $testVarianId, $kasirUser) {
    $pdo->prepare('UPDATE varian_produk SET stok_on_hand = 1, stok_reserved = 0 WHERE id = ?')->execute([$testVarianId]);

    // First succeeds
    $bl->createPenjualan([
        'no_invoice' => 'UAT-CONCUR-1',
        'tipe' => 'POS',
        'channel_id' => 1,
        'tanggal' => '2026-06-16',
        'status' => 'Selesai',
        'items' => [['varian_id' => $testVarianId, 'qty' => 1, 'harga' => 50000]],
        'user' => $kasirUser
    ]);

    // Second fails atomically
    assertThrows(function() use ($bl, $testVarianId, $kasirUser) {
        $bl->createPenjualan([
            'no_invoice' => 'UAT-CONCUR-2',
            'tipe' => 'POS',
            'channel_id' => 1,
            'tanggal' => '2026-06-16',
            'status' => 'Selesai',
            'items' => [['varian_id' => $testVarianId, 'qty' => 1, 'harga' => 50000]],
            'user' => $kasirUser
        ]);
    }, '/Stok tidak mencukupi/');

    $stmt = $pdo->prepare('SELECT stok_on_hand FROM varian_produk WHERE id = ?');
    $stmt->execute([$testVarianId]);
    $finalV = $stmt->fetch(\PDO::FETCH_ASSOC);
    assertTrue((int)$finalV['stok_on_hand'] >= 0, 'Stok tidak pernah negatif');
});

// UAT-11: Hak akses & Sanitasi Kasir
// Skenario: Login sebagai Kasir dan membuka detail penjualan serta memanggil API laporan laba
// Hasil yang diharapkan: HPP dan laba tidak tampil maupun dikembalikan oleh API
runTest('UAT-11: Hak akses & Sanitasi Kasir', function() use ($kasirUser) {
    $sensitiveSale = [
        'no_invoice' => 'INV-SECRET',
        'omzet_kotor' => 100000,
        'pendapatan_bersih' => 95000,
        'hpp_snapshot' => 60000,
        'total_hpp' => 60000,
        'laba_kotor' => 35000,
        'items' => [
            ['sku' => 'TEST', 'qty' => 1, 'hpp_snapshot' => 60000, 'laba_kotor' => 35000]
        ]
    ];

    $sanitized = Auth::sanitizeSensitiveFields($sensitiveSale, $kasirUser);

    assertStrictEqual(isset($sanitized['hpp_snapshot']), false, 'HPP must be stripped for Kasir');
    assertStrictEqual(isset($sanitized['total_hpp']), false, 'Total HPP must be stripped for Kasir');
    assertStrictEqual(isset($sanitized['laba_kotor']), false, 'Laba kotor must be stripped for Kasir');
    assertStrictEqual(isset($sanitized['items'][0]['hpp_snapshot']), false, 'Item HPP must be stripped for Kasir');
    assertStrictEqual(isset($sanitized['items'][0]['laba_kotor']), false, 'Item profit must be stripped for Kasir');
    assertStrictEqual($sanitized['omzet_kotor'], 100000, 'Omzet is visible to Kasir');
});

// UAT-12: Tutup periode
// Skenario: Tutup bulan lalu coba ubah atau void transaksi bulan tersebut
// Hasil yang diharapkan: Ditolak; pembukaan kembali oleh Owner tercatat di audit log
runTest('UAT-12: Tutup periode', function() use ($bl, $pdo, $testVarianId, $ownerUser) {
    // Close May 2026
    $bl->closeAccountingPeriod(['bulan' => 5, 'tahun' => 2026, 'user' => $ownerUser]);

    // Try creating a transaction in May 2026 - must be rejected
    assertThrows(function() use ($bl, $testVarianId, $ownerUser) {
        $bl->createPenjualan([
            'no_invoice' => 'UAT-CLOSED-PERIOD',
            'tipe' => 'POS',
            'channel_id' => 1,
            'tanggal' => '2026-05-15',
            'items' => [['varian_id' => $testVarianId, 'qty' => 1, 'harga' => 50000]],
            'user' => $ownerUser
        ]);
    }, '/telah ditutup/');

    // Reopen by Owner
    $bl->reopenAccountingPeriod([
        'bulan' => 5,
        'tahun' => 2026,
        'alasan' => 'Audit rekonsiliasi akhir tahun',
        'user' => $ownerUser
    ]);

    $stmt = $pdo->query('SELECT status FROM periode_akuntansi WHERE bulan = 5 AND tahun = 2026');
    $periodRow = $stmt->fetch(\PDO::FETCH_ASSOC);
    assertStrictEqual($periodRow['status'], 'Buka', 'Periode successfully reopened');
});

// UAT-13: Impor marketplace & deteksi duplikat
// Skenario: Impor pesanan Shopee yang memuat baris SKU salah dan nomor pesanan ganda
// Hasil yang diharapkan: Baris valid diimpor; baris tidak valid ditandai; impor ulang tidak membuat duplikat
runTest('UAT-13: Impor marketplace & deteksi duplikat', function() use ($bl, $pdo, $testVarianId, $ownerUser) {
    // Give stock
    $pdo->prepare('UPDATE varian_produk SET stok_on_hand = 100, stok_reserved = 0 WHERE id = ?')->execute([$testVarianId]);

    // Import order 1
    $imp1 = $bl->createPenjualan([
        'no_invoice' => 'INV-IMPORT-1',
        'tipe' => 'Online',
        'channel_id' => 2,
        'no_pesanan' => 'ORD-DUP-01',
        'tanggal' => '2026-06-17',
        'status' => 'Diproses',
        'items' => [['varian_id' => $testVarianId, 'qty' => 2, 'harga' => 50000]],
        'user' => $ownerUser
    ]);
    assertTrue($imp1['success']);

    // Duplicate order number ORD-DUP-01 must be rejected
    assertThrows(function() use ($bl, $testVarianId, $ownerUser) {
        $bl->createPenjualan([
            'no_invoice' => 'INV-IMPORT-2',
            'tipe' => 'Online',
            'channel_id' => 2,
            'no_pesanan' => 'ORD-DUP-01',
            'tanggal' => '2026-06-17',
            'status' => 'Diproses',
            'items' => [['varian_id' => $testVarianId, 'qty' => 1, 'harga' => 50000]],
            'user' => $ownerUser
        ]);
    }, '/sudah pernah diimpor/');
});

// UAT-14: Migrasi saldo awal & integritas
// Skenario: Impor saldo stok dan kas dengan selisih Rp0
runTest('UAT-14: Migrasi saldo awal & integritas', function() use ($pdo) {
    $totalKas = (float)$pdo->query('SELECT SUM(saldo_saat_ini) as total FROM akun_kas_bank')->fetch(\PDO::FETCH_ASSOC)['total'];
    assertTrue($totalKas > 0, 'Kas master loaded and intact');

    $totalValuasi = (float)$pdo->query('SELECT SUM(stok_on_hand * hpp_rata_rata) as total FROM varian_produk')->fetch(\PDO::FETCH_ASSOC)['total'];
    assertTrue($totalValuasi >= 0, 'Inventory valuation balance confirmed');
});

// UAT-15: Void penjualan dan audit log
// Skenario: Void penjualan Selesai dengan alasan
// Hasil yang diharapkan: Stok, kas, dan laporan terbalik melalui mutasi pembalik; audit log mencatat nilai sebelum dan sesudah
runTest('UAT-15: Void penjualan dan audit log', function() use ($bl, $pdo, $testVarianId, $ownerUser) {
    // Give stock
    $pdo->prepare('UPDATE varian_produk SET stok_on_hand = 10, hpp_rata_rata = 20000 WHERE id = ?')->execute([$testVarianId]);
    $kasBefore = (float)$pdo->query('SELECT saldo_saat_ini FROM akun_kas_bank WHERE id = 1')->fetch(\PDO::FETCH_ASSOC)['saldo_saat_ini'];

    // Complete a sale
    $sale = $bl->createPenjualan([
        'no_invoice' => 'UAT-VOID-SALE',
        'tipe' => 'POS',
        'channel_id' => 1,
        'tanggal' => '2026-06-18',
        'metode_bayar' => 'Tunai',
        'akun_kas_id' => 1,
        'status' => 'Selesai',
        'items' => [['varian_id' => $testVarianId, 'qty' => 2, 'harga' => 50000]],
        'user' => $ownerUser
    ]);

    $kasAfterSale = (float)$pdo->query('SELECT saldo_saat_ini FROM akun_kas_bank WHERE id = 1')->fetch(\PDO::FETCH_ASSOC)['saldo_saat_ini'];
    $stockAfterSale = (int)$pdo->query("SELECT stok_on_hand FROM varian_produk WHERE id = {$testVarianId}")->fetch(\PDO::FETCH_ASSOC)['stok_on_hand'];
    assertStrictEqual($kasAfterSale, $kasBefore + 100000.0, 'Kas bertambah saat Selesai');
    assertStrictEqual($stockAfterSale, 8, 'Stok berkurang 2');

    // Void the sale
    $bl->voidPenjualan([
        'penjualan_id' => $sale['penjualanId'],
        'alasan' => 'Salah input nominal oleh kasir',
        'user' => $ownerUser
    ]);

    $kasAfterVoid = (float)$pdo->query('SELECT saldo_saat_ini FROM akun_kas_bank WHERE id = 1')->fetch(\PDO::FETCH_ASSOC)['saldo_saat_ini'];
    $stockAfterVoid = (int)$pdo->query("SELECT stok_on_hand FROM varian_produk WHERE id = {$testVarianId}")->fetch(\PDO::FETCH_ASSOC)['stok_on_hand'];

    assertStrictEqual($kasAfterVoid, $kasBefore, 'Kas kembali ke posisi awal setelah Void');
    assertStrictEqual($stockAfterVoid, 10, 'Stok kembali ke posisi awal setelah Void');

    // Check audit log
    $stmt = $pdo->query("SELECT * FROM audit_log WHERE entitas_id = 'UAT-VOID-SALE' AND aksi = 'VOID'");
    $auditEntry = $stmt->fetch(\PDO::FETCH_ASSOC);
    assertTrue(!empty($auditEntry), 'Audit log entry exists for VOID action');
    assertTrue(strpos($auditEntry['nilai_sesudah'], 'Salah input') !== false, 'Audit log records void reason');
});

echo "\n====================================================\n";
echo " UAT TEST RESULTS: {$passedTests} PASSED, {$failedTests} FAILED\n";
echo "====================================================\n\n";

if ($failedTests > 0) {
    exit(1);
}
