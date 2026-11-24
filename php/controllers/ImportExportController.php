<?php
// php/controllers/ImportExportController.php

declare(strict_types=1);

require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../Auth.php';
require_once __DIR__ . '/../BusinessLogic.php';

class ImportExportController {
    /**
     * Helper to parse CSV file buffer or file path
     */
    public static function parseCsv(string $filePath): array {
        if (!file_exists($filePath)) return [];

        $content = file_get_contents($filePath);
        if ($content === false) return [];

        // Remove UTF-8 BOM if present
        if (substr($content, 0, 3) === "\xEF\xBB\xBF") {
            $content = substr($content, 3);
        }

        $lines = explode("\n", str_replace(["\r\n", "\r"], "\n", $content));
        $lines = array_filter(array_map('trim', $lines));
        if (empty($lines)) return [];

        // Detect delimiter: comma vs semicolon vs tab
        $firstLine = reset($lines);
        $delimiter = ',';
        if (substr_count($firstLine, ';') > substr_count($firstLine, ',')) {
            $delimiter = ';';
        } elseif (substr_count($firstLine, "\t") > substr_count($firstLine, ',')) {
            $delimiter = "\t";
        }

        $headers = str_getcsv($firstLine, $delimiter);
        $headers = array_map(function($h) { return trim(trim($h, '"')); }, $headers);

        $rows = [];
        $headerCount = count($headers);
        $lineKeys = array_keys($lines);
        for ($i = 1; $i < count($lineKeys); $i++) {
            $line = $lines[$lineKeys[$i]];
            if (empty($line)) continue;
            $data = str_getcsv($line, $delimiter);
            $row = [];
            foreach ($headers as $idx => $headerName) {
                $row[$headerName] = isset($data[$idx]) ? trim($data[$idx]) : '';
            }
            $rows[] = $row;
        }

        return $rows;
    }

    public static function previewMarketplace(array $files, array $body, array $user): array {
        $fileInfo = $files['file'] ?? null;
        if (!$fileInfo || empty($fileInfo['tmp_name'])) {
            http_response_code(400);
            return ['error' => 'Berkas tidak ditemukan.'];
        }

        $rows = self::parseCsv($fileInfo['tmp_name']);
        if (empty($rows)) {
            http_response_code(400);
            return ['error' => 'Berkas kosong atau format tidak didukung (gunakan CSV/Excel).'];
        }

        $db = Database::getConnection();
        $validRows = [];
        $errorRows = [];
        $seenOrdersInFile = [];

        $checkDbOrder = $db->prepare("SELECT id FROM penjualan WHERE no_pesanan = ? AND status != 'Void' AND status != 'Batal'");
        $checkSku = $db->prepare('SELECT v.*, p.nama as nama_produk FROM varian_produk v JOIN produk p ON v.produk_id = p.id WHERE v.sku = ?');

        for ($index = 0; $index < count($rows); $index++) {
            $row = $rows[$index];
            $rowNum = $index + 2;

            $orderNo = trim(
                $row['No. Pesanan'] ?? $row['Nomor Pesanan'] ?? $row['Order ID'] ?? $row['Order ID (Shopee)'] ?? $row['order_id'] ?? ''
            );

            $sku = trim(
                $row['Nomor Referensi SKU'] ?? $row['SKU Induk'] ?? $row['SKU'] ?? $row['sku'] ?? $row['Kode Produk'] ?? ''
            );

            $qtyRaw = $row['Jumlah'] ?? $row['Qty'] ?? $row['qty'] ?? $row['Kuantitas'] ?? 1;
            $qty = (float)$qtyRaw;

            $hargaRaw = preg_replace('/[^0-9.-]+/', '', (string)($row['Harga Awal'] ?? $row['Harga Setelah Diskon'] ?? $row['Harga Jual'] ?? $row['harga'] ?? 0));
            $harga = (float)$hargaRaw;

            $potonganRaw = preg_replace('/[^0-9.-]+/', '', (string)($row['Biaya Administrasi'] ?? $row['Potongan Admin'] ?? $row['potongan_admin'] ?? 0));
            $potonganAdmin = (float)$potonganRaw;

            $diskonRaw = preg_replace('/[^0-9.-]+/', '', (string)($row['Total Diskon'] ?? $row['Diskon Produk'] ?? $row['diskon'] ?? 0));
            $diskon = (float)$diskonRaw;

            $kurir = trim($row['Opsi Pengiriman'] ?? $row['Kurir'] ?? $row['kurir'] ?? '');
            $resi = trim($row['No. Resi'] ?? $row['Nomor Resi'] ?? $row['resi'] ?? '');

            if (!$orderNo) {
                $errorRows[] = ['rowNum' => $rowNum, 'orderNo' => $orderNo, 'sku' => $sku, 'reason' => 'Nomor pesanan kosong'];
                continue;
            }

            $orderKey = "{$orderNo}_{$sku}";
            if (isset($seenOrdersInFile[$orderKey])) {
                $errorRows[] = ['rowNum' => $rowNum, 'orderNo' => $orderNo, 'sku' => $sku, 'reason' => 'Duplikat di dalam berkas yang sama'];
                continue;
            }
            $seenOrdersInFile[$orderKey] = true;

            $checkDbOrder->execute([$orderNo]);
            if ($checkDbOrder->fetch()) {
                $errorRows[] = ['rowNum' => $rowNum, 'orderNo' => $orderNo, 'sku' => $sku, 'reason' => "Nomor pesanan '{$orderNo}' sudah pernah diimpor sebelumnya."];
                continue;
            }

            if (!$sku) {
                $errorRows[] = ['rowNum' => $rowNum, 'orderNo' => $orderNo, 'sku' => $sku, 'reason' => 'SKU kosong'];
                continue;
            }

            $checkSku->execute([$sku]);
            $varian = $checkSku->fetch();
            if (!$varian) {
                $errorRows[] = ['rowNum' => $rowNum, 'orderNo' => $orderNo, 'sku' => $sku, 'reason' => "SKU '{$sku}' tidak terdaftar di sistem master."];
                continue;
            }

            $validRows[] = [
                'rowNum' => $rowNum,
                'orderNo' => $orderNo,
                'sku' => $sku,
                'nama_produk' => "{$varian['nama_produk']} ({$varian['nama_varian']})",
                'varian_id' => (int)$varian['id'],
                'qty' => $qty > 0 ? $qty : 1,
                'harga' => $harga > 0 ? $harga : (float)$varian['harga_jual_default'],
                'diskon' => $diskon,
                'potongan_admin' => $potonganAdmin,
                'kurir' => $kurir,
                'resi' => $resi
            ];
        }

        return [
            'totalRows' => count($rows),
            'validCount' => count($validRows),
            'errorCount' => count($errorRows),
            'validRows' => array_slice($validRows, 0, 500),
            'errorRows' => $errorRows
        ];
    }

    public static function commitMarketplace(array $body, array $user): array {
        $channelId = (int)($body['channel_id'] ?? 0);
        $orders = $body['orders'] ?? [];
        $status = $body['status'] ?? 'Diproses';
        $tanggal = !empty($body['tanggal']) ? $body['tanggal'] : gmdate('Y-m-d');

        if (!$channelId || empty($orders)) {
            http_response_code(400);
            return ['error' => 'Channel dan daftar pesanan tidak boleh kosong.'];
        }

        $db = Database::getConnection();
        $stmtC = $db->prepare('SELECT * FROM channel_penjualan WHERE id = ?');
        $stmtC->execute([$channelId]);
        $channel = $stmtC->fetch();
        if (!$channel) {
            http_response_code(400);
            return ['error' => 'Channel tidak ditemukan.'];
        }

        $grouped = [];
        foreach ($orders as $ord) {
            $grouped[$ord['orderNo']][] = $ord;
        }

        $successCount = 0;
        $failCount = 0;
        $errors = [];

        foreach ($grouped as $oNo => $items) {
            $noInvoice = 'INV-' . strtoupper($channel['tipe']) . '-' . $oNo;
            try {
                $saleItems = [];
                foreach ($items as $it) {
                    $saleItems[] = [
                        'varian_id' => (int)$it['varian_id'],
                        'qty' => (float)$it['qty'],
                        'harga' => (float)$it['harga'],
                        'diskon' => (float)($it['diskon'] ?? 0),
                        'potongan_admin' => isset($it['potongan_admin']) ? (float)$it['potongan_admin'] : -1
                    ];
                }

                BusinessLogic::createPenjualan([
                    'no_invoice' => $noInvoice,
                    'tipe' => 'Online',
                    'channel_id' => $channelId,
                    'no_pesanan' => $oNo,
                    'tanggal' => $tanggal,
                    'nama_pelanggan' => "Customer {$channel['nama']}",
                    'metode_bayar' => 'Marketplace',
                    'akun_kas_id' => $channel['akun_kas_id'],
                    'status' => $status,
                    'kurir' => $items[0]['kurir'] ?? '',
                    'no_resi' => $items[0]['resi'] ?? '',
                    'items' => $saleItems,
                    'user' => $user
                ]);
                $successCount++;
            } catch (\Throwable $e) {
                $failCount++;
                $errors[] = ['orderNo' => $oNo, 'reason' => $e->getMessage()];
            }
        }

        $now = gmdate('Y-m-d\TH:i:s\Z');
        $stmtBatch = $db->prepare('
            INSERT INTO impor_batch (tanggal, tipe, total_baris, sukses, gagal, file_name, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ');
        $stmtBatch->execute([
            $now,
            'MARKETPLACE_' . strtoupper($channel['nama']),
            count($grouped),
            $successCount,
            $failCount,
            "Marketplace Import - {$channel['nama']}",
            $user['nama']
        ]);

        return [
            'success' => true,
            'message' => "Impor pesanan selesai: {$successCount} pesanan berhasil diproses, {$failCount} gagal.",
            'successCount' => $successCount,
            'failCount' => $failCount,
            'errors' => $errors
        ];
    }

    public static function importKatalog(array $files, array $user): array {
        Auth::requireRoles($user, ['Owner', 'Admin Purchasing & Gudang']);
        $fileInfo = $files['file'] ?? null;
        if (!$fileInfo || empty($fileInfo['tmp_name'])) {
            http_response_code(400);
            return ['error' => 'Berkas tidak ditemukan.'];
        }

        $rows = self::parseCsv($fileInfo['tmp_name']);
        if (empty($rows)) {
            http_response_code(400);
            return ['error' => 'Berkas kosong atau tidak dapat dibaca.'];
        }

        $db = Database::getConnection();
        $sukses = 0;
        $gagal = 0;
        $errors = [];

        $chkSku = $db->prepare('SELECT id FROM varian_produk WHERE sku = ?');
        $chkProd = $db->prepare('SELECT id FROM produk WHERE nama = ?');
        $insProd = $db->prepare('INSERT INTO produk (nama, kategori, aktif) VALUES (?, ?, 1)');
        $insVar = $db->prepare('
            INSERT INTO varian_produk (
                produk_id, sku, barcode, nama_varian, satuan, harga_jual_default,
                stok_min, stok_on_hand, stok_reserved, hpp_rata_rata, aktif
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 1)
        ');

        $db->beginTransaction();
        try {
            for ($i = 0; $i < count($rows); $i++) {
                $row = $rows[$i];
                $rowNum = $i + 2;

                $namaProduk = trim($row['Nama Produk'] ?? $row['nama_produk'] ?? $row['Nama'] ?? '');
                $kategori = trim($row['Kategori'] ?? $row['kategori'] ?? 'Umum');
                $sku = trim($row['SKU'] ?? $row['sku'] ?? '');
                $namaVarian = trim($row['Nama Varian'] ?? $row['Varian'] ?? $sku);
                $hargaJual = (float)($row['Harga Jual'] ?? $row['harga_jual'] ?? 0);
                $stokMin = (float)($row['Stok Min'] ?? $row['stok_min'] ?? 5);
                $satuan = trim($row['Satuan'] ?? $row['satuan'] ?? 'Pcs');
                $barcode = trim($row['Barcode'] ?? $row['barcode'] ?? '');

                if (!$namaProduk || !$sku) {
                    $gagal++;
                    $errors[] = ['rowNum' => $rowNum, 'sku' => $sku, 'reason' => 'Nama Produk dan SKU wajib diisi.'];
                    continue;
                }

                $chkSku->execute([$sku]);
                if ($chkSku->fetch()) {
                    $gagal++;
                    $errors[] = ['rowNum' => $rowNum, 'sku' => $sku, 'reason' => "SKU '{$sku}' sudah terdaftar."];
                    continue;
                }

                $chkProd->execute([$namaProduk]);
                $prod = $chkProd->fetch();
                if ($prod) {
                    $produkId = (int)$prod['id'];
                } else {
                    $insProd->execute([$namaProduk, $kategori]);
                    $produkId = (int)$db->lastInsertId();
                }

                $insVar->execute([$produkId, $sku, $barcode ?: null, $namaVarian, $satuan ?: 'Pcs', $hargaJual, $stokMin]);
                $sukses++;
            }

            $db->commit();

            return [
                'success' => true,
                'message' => "Impor katalog berhasil: {$sukses} SKU berhasil ditambahkan, {$gagal} gagal.",
                'sukses' => $sukses,
                'gagal' => $gagal,
                'errors' => $errors
            ];
        } catch (\Throwable $e) {
            $db->rollBack();
            http_response_code(500);
            return ['error' => $e->getMessage()];
        }
    }

    public static function exportData(string $tipe, array $user): void {
        Auth::requireRoles($user, ['Owner', 'Admin Keuangan']);
        $db = Database::getConnection();

        $filename = "MCRW_Export_{$tipe}_" . date('Ymd_His') . ".csv";
        header('Content-Type: text/csv; charset=UTF-8');
        header("Content-Disposition: attachment; filename=\"{$filename}\"");

        // UTF-8 BOM for Microsoft Excel
        echo "\xEF\xBB\xBF";
        $out = fopen('php://output', 'w');

        if ($tipe === 'produk' || $tipe === 'semua') {
            fputcsv($out, ['Nama Produk', 'Kategori', 'SKU', 'Varian', 'Satuan', 'Harga Jual', 'Stok Min', 'Stok Fisik', 'Stok Tersedia', 'HPP Rata-Rata', 'Nilai Persediaan']);
            $varians = $db->query('
                SELECT p.nama as nama_produk, p.kategori, v.sku, v.nama_varian, v.satuan,
                       v.harga_jual_default, v.stok_min, v.stok_on_hand,
                       (v.stok_on_hand - v.stok_reserved) as stok_tersedia,
                       v.hpp_rata_rata, (v.stok_on_hand * v.hpp_rata_rata) as nilai_persediaan
                FROM varian_produk v
                JOIN produk p ON v.produk_id = p.id
                ORDER BY p.nama ASC, v.nama_varian ASC
            ')->fetchAll();
            foreach ($varians as $v) {
                fputcsv($out, [
                    $v['nama_produk'], $v['kategori'], $v['sku'], $v['nama_varian'],
                    $v['satuan'], $v['harga_jual_default'], $v['stok_min'], $v['stok_on_hand'],
                    $v['stok_tersedia'], $v['hpp_rata_rata'], $v['nilai_persediaan']
                ]);
            }
        }

        if ($tipe === 'penjualan') {
            fputcsv($out, ['No Invoice', 'Tanggal', 'Tipe', 'Channel', 'No Pesanan', 'Status', 'Omzet Kotor', 'Diskon', 'Potongan Admin', 'Pendapatan Bersih', 'Total HPP', 'Laba Kotor']);
            $sales = $db->query('
                SELECT pj.no_invoice, pj.tanggal, pj.tipe, c.nama as channel, pj.no_pesanan,
                       pj.status, pj.omzet_kotor, pj.diskon_total, pj.potongan_admin,
                       pj.pendapatan_bersih, pj.total_hpp, pj.laba_kotor
                FROM penjualan pj
                JOIN channel_penjualan c ON pj.channel_id = c.id
                ORDER BY pj.id DESC
            ')->fetchAll();
            foreach ($sales as $s) {
                fputcsv($out, [
                    $s['no_invoice'], $s['tanggal'], $s['tipe'], $s['channel'], $s['no_pesanan'],
                    $s['status'], $s['omzet_kotor'], $s['diskon_total'], $s['potongan_admin'],
                    $s['pendapatan_bersih'], $s['total_hpp'], $s['laba_kotor']
                ]);
            }
        }

        if ($tipe === 'pembelian') {
            fputcsv($out, ['No Faktur', 'Tanggal', 'Supplier', 'Status Bayar', 'Subtotal', 'Ongkir', 'Total Biaya', 'Sisa Utang', 'Status']);
            $buys = $db->query('
                SELECT p.no_faktur, p.tanggal, s.nama as supplier, p.status_bayar,
                       p.total_subtotal, p.ongkir, p.total_biaya, p.sisa_utang, p.status
                FROM pembelian p
                JOIN supplier s ON p.supplier_id = s.id
                ORDER BY p.id DESC
            ')->fetchAll();
            foreach ($buys as $b) {
                fputcsv($out, [
                    $b['no_faktur'], $b['tanggal'], $b['supplier'], $b['status_bayar'],
                    $b['total_subtotal'], $b['ongkir'], $b['total_biaya'], $b['sisa_utang'], $b['status']
                ]);
            }
        }

        if ($tipe === 'kartu-stok') {
            fputcsv($out, ['Waktu', 'SKU', 'Varian', 'Tipe Mutasi', 'Masuk', 'Keluar', 'HPP Unit', 'Saldo Akhir', 'Nilai Persediaan Akhir', 'Referensi', 'Keterangan']);
            $mutasi = $db->query('
                SELECT m.waktu, v.sku, v.nama_varian, m.tipe, m.qty_masuk, m.qty_keluar,
                       m.hpp_unit, m.saldo_stok_akhir, m.nilai_persediaan_akhir, m.ref_dokumen, m.keterangan
                FROM mutasi_stok m
                JOIN varian_produk v ON m.varian_id = v.id
                ORDER BY m.id DESC
            ')->fetchAll();
            foreach ($mutasi as $m) {
                fputcsv($out, [
                    $m['waktu'], $m['sku'], $m['nama_varian'], $m['tipe'], $m['qty_masuk'], $m['qty_keluar'],
                    $m['hpp_unit'], $m['saldo_stok_akhir'], $m['nilai_persediaan_akhir'], $m['ref_dokumen'], $m['keterangan']
                ]);
            }
        }

        fclose($out);
        exit(0);
    }
}
