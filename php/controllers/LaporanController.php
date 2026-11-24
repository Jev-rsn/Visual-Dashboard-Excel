<?php
// php/controllers/LaporanController.php

declare(strict_types=1);

require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../Auth.php';
require_once __DIR__ . '/../BusinessLogic.php';

class LaporanController {
    public static function dashboard(array $params, array $user): array {
        Auth::requireRoles($user, ['Owner', 'Admin Keuangan']);
        $db = Database::getConnection();

        $salesWhere = "status = 'Selesai'";
        $salesParams = [];
        if (!empty($params['channel_id'])) {
            $salesWhere .= ' AND channel_id = ?';
            $salesParams[] = (int)$params['channel_id'];
        }
        if (!empty($params['tgl_mulai'])) {
            $salesWhere .= ' AND tanggal >= ?';
            $salesParams[] = $params['tgl_mulai'];
        }
        if (!empty($params['tgl_selesai'])) {
            $salesWhere .= ' AND tanggal <= ?';
            $salesParams[] = $params['tgl_selesai'];
        }

        $stmtSales = $db->prepare("
            SELECT
                COALESCE(SUM(omzet_kotor), 0) as total_omzet,
                COALESCE(SUM(diskon_total), 0) as total_diskon,
                COALESCE(SUM(potongan_admin), 0) as total_potongan_admin,
                COALESCE(SUM(pendapatan_bersih), 0) as total_pendapatan_bersih,
                COALESCE(SUM(total_hpp), 0) as total_hpp,
                COALESCE(SUM(laba_kotor), 0) as total_laba_kotor,
                COUNT(id) as total_transaksi
            FROM penjualan
            WHERE {$salesWhere}
        ");
        $stmtSales->execute($salesParams);
        $salesSummary = $stmtSales->fetch();

        // Operational expenses totals
        $biayaWhere = "status = 'Posted'";
        $biayaParams = [];
        if (!empty($params['channel_id'])) {
            $biayaWhere .= ' AND (channel_id = ? OR channel_id IS NULL)';
            $biayaParams[] = (int)$params['channel_id'];
        }
        if (!empty($params['tgl_mulai'])) {
            $biayaWhere .= ' AND tanggal >= ?';
            $biayaParams[] = $params['tgl_mulai'];
        }
        if (!empty($params['tgl_selesai'])) {
            $biayaWhere .= ' AND tanggal <= ?';
            $biayaParams[] = $params['tgl_selesai'];
        }

        $stmtBiaya = $db->prepare("
            SELECT COALESCE(SUM(nominal), 0) as total_biaya
            FROM biaya_operasional
            WHERE {$biayaWhere}
        ");
        $stmtBiaya->execute($biayaParams);
        $expenseSummary = $stmtBiaya->fetch();

        // Return losses
        $returSummary = $db->query('
            SELECT
                COALESCE(SUM(total_refund), 0) as total_refund,
                COALESCE(SUM(kerugian_retur), 0) as total_kerugian_retur
            FROM retur_penjualan
        ')->fetch();

        $labaBersih = (float)$salesSummary['total_laba_kotor'] - (float)$expenseSummary['total_biaya'] - (float)$returSummary['total_kerugian_retur'];

        // Total cash in all accounts
        $totalKas = (float)$db->query('SELECT COALESCE(SUM(saldo_saat_ini), 0) as total FROM akun_kas_bank WHERE aktif = 1')->fetch()['total'];

        // Total Accounts Payable (Utang Dagang)
        $totalUtang = (float)$db->query("SELECT COALESCE(SUM(sisa_utang), 0) as total FROM pembelian WHERE status = 'Posted' AND status_bayar = 'Utang'")->fetch()['total'];

        // SKU alerts
        $skuCounts = $db->query('
            SELECT
                COUNT(CASE WHEN (stok_on_hand - stok_reserved) <= 0 THEN 1 END) as count_habis,
                COUNT(CASE WHEN (stok_on_hand - stok_reserved) > 0 AND (stok_on_hand - stok_reserved) <= stok_min THEN 1 END) as count_restock,
                COUNT(CASE WHEN (stok_on_hand - stok_reserved) > stok_min THEN 1 END) as count_aman
            FROM varian_produk
            WHERE aktif = 1
        ')->fetch();

        // Daily trend
        $dailyTrend = $db->query("
            SELECT
                tanggal,
                COALESCE(SUM(pendapatan_bersih), 0) as omzet_bersih,
                COALESCE(SUM(laba_kotor), 0) as laba_kotor,
                COUNT(id) as transaksi_count
            FROM penjualan
            WHERE status = 'Selesai'
            GROUP BY tanggal
            ORDER BY tanggal DESC
            LIMIT 14
        ")->fetchAll();
        $dailyTrend = array_reverse($dailyTrend);

        return [
            'kpi' => [
                'total_omzet' => (float)$salesSummary['total_omzet'],
                'pendapatan_bersih' => (float)$salesSummary['total_pendapatan_bersih'],
                'total_hpp' => (float)$salesSummary['total_hpp'],
                'laba_kotor' => (float)$salesSummary['total_laba_kotor'],
                'total_biaya_operasional' => (float)$expenseSummary['total_biaya'],
                'total_kerugian_retur' => (float)$returSummary['total_kerugian_retur'],
                'laba_bersih' => $labaBersih,
                'total_kas' => $totalKas,
                'total_utang' => $totalUtang,
                'count_habis' => (int)$skuCounts['count_habis'],
                'count_restock' => (int)$skuCounts['count_restock'],
                'count_aman' => (int)$skuCounts['count_aman'],
                'total_transaksi' => (int)$salesSummary['total_transaksi']
            ],
            'dailyTrend' => $dailyTrend
        ];
    }

    public static function labaRugi(array $params, array $user): array {
        Auth::requireRoles($user, ['Owner', 'Admin Keuangan']);
        $db = Database::getConnection();

        $bulan = $params['bulan'] ?? null;
        $tahun = $params['tahun'] ?? null;
        $tglMulai = $params['tgl_mulai'] ?? null;
        $tglSelesai = $params['tgl_selesai'] ?? null;

        $salesCondition = "status = 'Selesai'";
        $expenseCondition = "status = 'Posted'";
        $sParams = [];
        $eParams = [];

        if ($bulan && $tahun) {
            $padBulan = str_pad((string)$bulan, 2, '0', STR_PAD_LEFT);
            $salesCondition .= " AND strftime('%Y-%m', tanggal) = ?";
            $sParams[] = "{$tahun}-{$padBulan}";
            $expenseCondition .= " AND strftime('%Y-%m', tanggal) = ?";
            $eParams[] = "{$tahun}-{$padBulan}";
        } else {
            if ($tglMulai) {
                $salesCondition .= ' AND tanggal >= ?';
                $sParams[] = $tglMulai;
                $expenseCondition .= ' AND tanggal >= ?';
                $eParams[] = $tglMulai;
            }
            if ($tglSelesai) {
                $salesCondition .= ' AND tanggal <= ?';
                $sParams[] = $tglSelesai;
                $expenseCondition .= ' AND tanggal <= ?';
                $eParams[] = $tglSelesai;
            }
        }

        $stmtSales = $db->prepare("
            SELECT
                COALESCE(SUM(omzet_kotor), 0) as omzet_kotor,
                COALESCE(SUM(diskon_total), 0) as diskon_penjualan,
                COALESCE(SUM(potongan_admin), 0) as potongan_admin,
                COALESCE(SUM(pendapatan_bersih), 0) as pendapatan_bersih,
                COALESCE(SUM(total_hpp), 0) as total_hpp,
                COALESCE(SUM(laba_kotor), 0) as laba_kotor
            FROM penjualan
            WHERE {$salesCondition}
        ");
        $stmtSales->execute($sParams);
        $salesData = $stmtSales->fetch();

        // Return losses
        $returData = $db->query('
            SELECT
                COALESCE(SUM(total_refund), 0) as refund_retur,
                COALESCE(SUM(kerugian_retur), 0) as rugi_retur_rusak
            FROM retur_penjualan
        ')->fetch();

        $stmtExp = $db->prepare("
            SELECT
                k.kelompok_laporan,
                k.nama as nama_kategori,
                k.kode_akun,
                COALESCE(SUM(b.nominal), 0) as subtotal
            FROM biaya_operasional b
            JOIN kategori_biaya k ON b.kategori_id = k.id
            WHERE {$expenseCondition}
            GROUP BY k.id
            ORDER BY k.kelompok_laporan ASC, k.kode_akun ASC
        ");
        $stmtExp->execute($eParams);
        $expenseRows = $stmtExp->fetchAll();

        $bebanByKelompok = [];
        $totalBeban = 0;

        foreach ($expenseRows as $row) {
            $kelompok = $row['kelompok_laporan'];
            if (!isset($bebanByKelompok[$kelompok])) {
                $bebanByKelompok[$kelompok] = [
                    'kelompok' => $kelompok,
                    'total' => 0,
                    'items' => []
                ];
            }
            $subtotal = (float)$row['subtotal'];
            $bebanByKelompok[$kelompok]['total'] += $subtotal;
            $bebanByKelompok[$kelompok]['items'][] = $row;
            $totalBeban += $subtotal;
        }

        $labaOperasional = (float)$salesData['laba_kotor'] - $totalBeban - (float)$returData['rugi_retur_rusak'];

        return [
            'periode' => ['bulan' => $bulan, 'tahun' => $tahun, 'tgl_mulai' => $tglMulai, 'tgl_selesai' => $tglSelesai],
            'pendapatan' => [
                'omzet_kotor' => (float)$salesData['omzet_kotor'],
                'diskon_penjualan' => (float)$salesData['diskon_penjualan'],
                'potongan_admin' => (float)$salesData['potongan_admin'],
                'pendapatan_bersih' => (float)$salesData['pendapatan_bersih']
            ],
            'hpp' => (float)$salesData['total_hpp'],
            'laba_kotor' => (float)$salesData['laba_kotor'],
            'rugi_retur_rusak' => (float)$returData['rugi_retur_rusak'],
            'beban_operasional' => array_values($bebanByKelompok),
            'total_beban_operasional' => $totalBeban,
            'laba_bersih' => $labaOperasional
        ];
    }

    public static function profitabilitasChannel(array $params, array $user): array {
        Auth::requireRoles($user, ['Owner', 'Admin Keuangan']);
        $db = Database::getConnection();

        $tglMulai = $params['tgl_mulai'] ?? null;
        $tglSelesai = $params['tgl_selesai'] ?? null;

        $salesCondition = "pj.status = 'Selesai'";
        $expenseCondition = "b.status = 'Posted'";
        $sParams = [];
        $eParams = [];

        if ($tglMulai) {
            $salesCondition .= ' AND pj.tanggal >= ?';
            $sParams[] = $tglMulai;
            $expenseCondition .= ' AND b.tanggal >= ?';
            $eParams[] = $tglMulai;
        }
        if ($tglSelesai) {
            $salesCondition .= ' AND pj.tanggal <= ?';
            $sParams[] = $tglSelesai;
            $expenseCondition .= ' AND b.tanggal <= ?';
            $eParams[] = $tglSelesai;
        }

        $channels = $db->query('SELECT id, nama, tipe FROM channel_penjualan ORDER BY id ASC')->fetchAll();

        $stmtSale = $db->prepare("
            SELECT
                COALESCE(SUM(pj.omzet_kotor), 0) as omzet_kotor,
                COALESCE(SUM(pj.diskon_total), 0) as diskon_total,
                COALESCE(SUM(pj.potongan_admin), 0) as potongan_admin,
                COALESCE(SUM(pj.pendapatan_bersih), 0) as pendapatan_bersih,
                COALESCE(SUM(pj.total_hpp), 0) as total_hpp,
                COALESCE(SUM(pj.laba_kotor), 0) as laba_kotor,
                COUNT(pj.id) as transaksi_count
            FROM penjualan pj
            WHERE pj.channel_id = ? AND {$salesCondition}
        ");

        $stmtExp = $db->prepare("
            SELECT COALESCE(SUM(b.nominal), 0) as biaya_channel
            FROM biaya_operasional b
            WHERE b.channel_id = ? AND {$expenseCondition}
        ");

        $report = [];
        foreach ($channels as $ch) {
            $stmtSale->execute(array_merge([$ch['id']], $sParams));
            $saleRow = $stmtSale->fetch();

            $stmtExp->execute(array_merge([$ch['id']], $eParams));
            $expRow = $stmtExp->fetch();

            $biayaChannel = (float)$expRow['biaya_channel'];
            $labaKotor = (float)$saleRow['laba_kotor'];
            $labaKontribusi = $labaKotor - $biayaChannel;
            $pendapatanBersih = (float)$saleRow['pendapatan_bersih'];
            $marginKontribusi = $pendapatanBersih > 0 ? (($labaKontribusi / $pendapatanBersih) * 100) : 0;

            $report[] = [
                'channel_id' => (int)$ch['id'],
                'nama_channel' => $ch['nama'],
                'tipe' => $ch['tipe'],
                'omzet_kotor' => (float)$saleRow['omzet_kotor'],
                'potongan_admin' => (float)$saleRow['potongan_admin'],
                'diskon' => (float)$saleRow['diskon_total'],
                'pendapatan_bersih' => $pendapatanBersih,
                'hpp' => (float)$saleRow['total_hpp'],
                'laba_kotor' => $labaKotor,
                'biaya_channel' => $biayaChannel,
                'laba_kontribusi' => $labaKontribusi,
                'margin_persen' => round($marginKontribusi, 2),
                'transaksi_count' => (int)$saleRow['transaksi_count']
            ];
        }

        $stmtUmum = $db->prepare("
            SELECT COALESCE(SUM(b.nominal), 0) as biaya_umum
            FROM biaya_operasional b
            WHERE b.channel_id IS NULL AND {$expenseCondition}
        ");
        $stmtUmum->execute($eParams);
        $biayaUmum = (float)$stmtUmum->fetch()['biaya_umum'];

        return [
            'channels' => $report,
            'biaya_umum' => $biayaUmum
        ];
    }

    public static function profitProduk(array $params, array $user): array {
        Auth::requireRoles($user, ['Owner', 'Admin Keuangan']);
        $db = Database::getConnection();

        $tglMulai = $params['tgl_mulai'] ?? null;
        $tglSelesai = $params['tgl_selesai'] ?? null;
        $kategori = $params['kategori'] ?? null;

        $condition = "pj.status = 'Selesai'";
        $sqlParams = [];

        if ($tglMulai) {
            $condition .= ' AND pj.tanggal >= ?';
            $sqlParams[] = $tglMulai;
        }
        if ($tglSelesai) {
            $condition .= ' AND pj.tanggal <= ?';
            $sqlParams[] = $tglSelesai;
        }

        $stmt = $db->prepare("
            SELECT
                v.id as varian_id,
                v.sku,
                v.nama_varian,
                v.satuan,
                v.stok_on_hand,
                v.hpp_rata_rata,
                p.nama as nama_produk,
                p.kategori,
                COALESCE(SUM(dp.qty), 0) as qty_terjual,
                COALESCE(SUM(dp.qty * dp.harga), 0) as total_omzet,
                COALESCE(SUM(dp.pendapatan_bersih), 0) as pendapatan_bersih,
                COALESCE(SUM(dp.qty * dp.hpp_snapshot), 0) as total_hpp,
                COALESCE(SUM(dp.laba_kotor), 0) as laba_kotor
            FROM varian_produk v
            JOIN produk p ON v.produk_id = p.id
            LEFT JOIN detail_penjualan dp ON dp.varian_id = v.id
            LEFT JOIN penjualan pj ON dp.penjualan_id = pj.id AND {$condition}
            WHERE v.aktif = 1
            GROUP BY v.id
            ORDER BY qty_terjual DESC, laba_kotor DESC
        ");
        $stmt->execute($sqlParams);
        $rows = $stmt->fetchAll();

        $evaluated = [];
        foreach ($rows as $r) {
            $pendapatanBersih = (float)$r['pendapatan_bersih'];
            $labaKotor = (float)$r['laba_kotor'];
            $marginPersen = $pendapatanBersih > 0 ? ($labaKotor / $pendapatanBersih) * 100 : 0;
            $stokOnHand = (float)$r['stok_on_hand'];
            $qtyTerjual = (float)$r['qty_terjual'];
            $isSlowMoving = $stokOnHand > 5 && $qtyTerjual === 0.0;

            $r['margin_persen'] = round($marginPersen, 2);
            $r['is_slow_moving'] = $isSlowMoving;
            $evaluated[] = $r;
        }

        if ($kategori) {
            $evaluated = array_values(array_filter($evaluated, function($r) use ($kategori) {
                return $r['kategori'] === $kategori;
            }));
        }

        return $evaluated;
    }

    public static function nilaiPersediaan(array $user): array {
        Auth::requireRoles($user, ['Owner', 'Admin Keuangan']);
        $db = Database::getConnection();

        $varians = $db->query('
            SELECT
                v.id, v.sku, v.nama_varian, v.satuan, v.stok_on_hand, v.hpp_rata_rata,
                (v.stok_on_hand * v.hpp_rata_rata) as total_nilai,
                p.nama as nama_produk, p.kategori
            FROM varian_produk v
            JOIN produk p ON v.produk_id = p.id
            WHERE v.aktif = 1 AND p.aktif = 1
            ORDER BY p.kategori ASC, p.nama ASC, v.nama_varian ASC
        ')->fetchAll();

        $grandTotal = 0;
        $totalQty = 0;
        foreach ($varians as $v) {
            $grandTotal += (float)$v['total_nilai'];
            $totalQty += (float)$v['stok_on_hand'];
        }

        return [
            'varians' => $varians,
            'grandTotalNilai' => $grandTotal,
            'grandTotalQty' => $totalQty
        ];
    }

    public static function posisiKas(array $params, array $user): array {
        Auth::requireRoles($user, ['Owner', 'Admin Keuangan']);
        $db = Database::getConnection();

        $tglMulai = $params['tgl_mulai'] ?? null;
        $tglSelesai = $params['tgl_selesai'] ?? null;

        $akuns = $db->query('SELECT * FROM akun_kas_bank WHERE aktif = 1 ORDER BY id ASC')->fetchAll();

        $report = [];
        foreach ($akuns as $akun) {
            $akunId = (int)$akun['id'];

            // Sales inflows
            $salesWhere = "status = 'Selesai' AND akun_kas_id = ?";
            $sParams = [$akunId];
            if ($tglMulai) { $salesWhere .= ' AND tanggal >= ?'; $sParams[] = $tglMulai; }
            if ($tglSelesai) { $salesWhere .= ' AND tanggal <= ?'; $sParams[] = $tglSelesai; }
            $stSales = $db->prepare("SELECT COALESCE(SUM(pendapatan_bersih), 0) as total FROM penjualan WHERE {$salesWhere}");
            $stSales->execute($sParams);
            $salesInflow = (float)$stSales->fetch()['total'];

            // Purchase outflows
            $buyWhere = "status = 'Posted' AND status_bayar = 'Lunas' AND akun_kas_id = ?";
            $bParams = [$akunId];
            if ($tglMulai) { $buyWhere .= ' AND tanggal >= ?'; $bParams[] = $tglMulai; }
            if ($tglSelesai) { $buyWhere .= ' AND tanggal <= ?'; $bParams[] = $tglSelesai; }
            $stBuy = $db->prepare("SELECT COALESCE(SUM(total_biaya), 0) as total FROM pembelian WHERE {$buyWhere}");
            $stBuy->execute($bParams);
            $buyOutflow = (float)$stBuy->fetch()['total'];

            // Debt settlements
            $debtWhere = "akun_kas_id = ?";
            $dParams = [$akunId];
            if ($tglMulai) { $debtWhere .= ' AND tanggal >= ?'; $dParams[] = $tglMulai; }
            if ($tglSelesai) { $debtWhere .= ' AND tanggal <= ?'; $dParams[] = $tglSelesai; }
            $stDebt = $db->prepare("SELECT COALESCE(SUM(nominal), 0) as total FROM pelunasan_utang WHERE {$debtWhere}");
            $stDebt->execute($dParams);
            $debtOutflow = (float)$stDebt->fetch()['total'];

            // Operational expenses
            $expWhere = "status = 'Posted' AND akun_kas_id = ?";
            $eParams = [$akunId];
            if ($tglMulai) { $expWhere .= ' AND tanggal >= ?'; $eParams[] = $tglMulai; }
            if ($tglSelesai) { $expWhere .= ' AND tanggal <= ?'; $eParams[] = $tglSelesai; }
            $stExp = $db->prepare("SELECT COALESCE(SUM(nominal), 0) as total FROM biaya_operasional WHERE {$expWhere}");
            $stExp->execute($eParams);
            $expOutflow = (float)$stExp->fetch()['total'];

            // Refund outflows
            $retWhere = "akun_kas_id = ?";
            $rParams = [$akunId];
            if ($tglMulai) { $retWhere .= ' AND tanggal >= ?'; $rParams[] = $tglMulai; }
            if ($tglSelesai) { $retWhere .= ' AND tanggal <= ?'; $rParams[] = $tglSelesai; }
            $stRet = $db->prepare("SELECT COALESCE(SUM(total_refund), 0) as total FROM retur_penjualan WHERE {$retWhere}");
            $stRet->execute($rParams);
            $refundOutflow = (float)$stRet->fetch()['total'];

            // Mutation inflows
            $mutInWhere = "status = 'Posted' AND akun_tujuan_id = ?";
            $miParams = [$akunId];
            if ($tglMulai) { $mutInWhere .= ' AND tanggal >= ?'; $miParams[] = $tglMulai; }
            if ($tglSelesai) { $mutInWhere .= ' AND tanggal <= ?'; $miParams[] = $tglSelesai; }
            $stMutIn = $db->prepare("SELECT COALESCE(SUM(nominal), 0) as total FROM mutasi_kas WHERE {$mutInWhere}");
            $stMutIn->execute($miParams);
            $mutasiMasuk = (float)$stMutIn->fetch()['total'];

            // Mutation outflows
            $mutOutWhere = "status = 'Posted' AND akun_asal_id = ?";
            $moParams = [$akunId];
            if ($tglMulai) { $mutOutWhere .= ' AND tanggal >= ?'; $moParams[] = $tglMulai; }
            if ($tglSelesai) { $mutOutWhere .= ' AND tanggal <= ?'; $moParams[] = $tglSelesai; }
            $stMutOut = $db->prepare("SELECT COALESCE(SUM(nominal), 0) as total FROM mutasi_kas WHERE {$mutOutWhere}");
            $stMutOut->execute($moParams);
            $mutasiKeluar = (float)$stMutOut->fetch()['total'];

            $totalPenerimaan = $salesInflow + $mutasiMasuk;
            $totalPengeluaran = $buyOutflow + $debtOutflow + $expOutflow + $refundOutflow + $mutasiKeluar;

            $report[] = [
                'akun_id' => $akunId,
                'nama_akun' => $akun['nama'],
                'tipe_akun' => $akun['tipe_akun'],
                'saldo_awal' => (float)$akun['saldo_awal'],
                'penerimaan' => $totalPenerimaan,
                'pengeluaran' => $totalPengeluaran,
                'saldo_akhir' => (float)$akun['saldo_saat_ini']
            ];
        }

        $grandSaldo = 0;
        foreach ($report as $a) {
            $grandSaldo += $a['saldo_akhir'];
        }

        return [
            'akuns' => $report,
            'grandTotalKas' => $grandSaldo
        ];
    }
}
