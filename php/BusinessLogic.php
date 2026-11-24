<?php
// php/BusinessLogic.php

require_once __DIR__ . '/Database.php';

class BusinessLogic {

    public static function logAudit(?array $user, string $entitas, string $entitasId, string $aksi, ?array $sebelum, ?array $sesudah): void {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            INSERT INTO audit_log (waktu, pengguna_id, nama_pengguna, peran, entitas, entitas_id, aksi, nilai_sebelum, nilai_sesudah)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ');
        $stmt->execute([
            gmdate('Y-m-d\TH:i:s\Z'),
            $user['id'] ?? null,
            $user['nama'] ?? 'Sistem',
            $user['peran'] ?? 'System',
            $entitas,
            $entitasId,
            $aksi,
            $sebelum !== null ? json_encode($sebelum, JSON_UNESCAPED_UNICODE) : null,
            $sesudah !== null ? json_encode($sesudah, JSON_UNESCAPED_UNICODE) : null
        ]);
    }

    public static function assertOpenPeriod(string $dateString): void {
        $time = strtotime($dateString);
        $bulan = (int)date('n', $time);
        $tahun = (int)date('Y', $time);

        $db = Database::getConnection();
        $stmt = $db->prepare("SELECT id FROM periode_akuntansi WHERE bulan = ? AND tahun = ? AND status = 'Tutup'");
        $stmt->execute([$bulan, $tahun]);
        if ($stmt->fetch()) {
            throw new Exception("Periode akuntansi {$bulan}/{$tahun} telah ditutup. Transaksi pada tanggal ini tidak dapat dibuat, diubah, atau dibatalkan.");
        }
    }

    public static function getSetting(string $key, string $default = ''): string {
        $db = Database::getConnection();
        $stmt = $db->prepare('SELECT nilai FROM pengaturan_sistem WHERE kunci = ?');
        $stmt->execute([$key]);
        $row = $stmt->fetch();
        return $row ? $row['nilai'] : $default;
    }

    /**
     * Post a purchase and calculate Moving Average HPP (FR-03, FR-07, BR-12)
     */
    public static function postPembelian(array $data, ?array $user = null): array {
        if ($user === null && isset($data['user'])) $user = $data['user'];
        self::assertOpenPeriod($data['tanggal']);

        $db = Database::getConnection();

        // Validate supplier
        $stmt = $db->prepare('SELECT * FROM supplier WHERE id = ?');
        $stmt->execute([$data['supplier_id']]);
        $supplier = $stmt->fetch();
        if (!$supplier) throw new Exception('Supplier tidak ditemukan');

        // Validate unique no_faktur
        $stmt = $db->prepare('SELECT id FROM pembelian WHERE no_faktur = ?');
        $stmt->execute([$data['no_faktur']]);
        if ($stmt->fetch()) throw new Exception("Nomor faktur '{$data['no_faktur']}' sudah digunakan.");

        $items = $data['items'] ?? [];
        if (empty($items)) throw new Exception('Detail item pembelian tidak boleh kosong.');

        $statusBayar = $data['status_bayar'] ?? 'Lunas';
        $akunKasId = $data['akun_kas_id'] ?? null;
        $ongkir = (float)($data['ongkir'] ?? 0);
        $metodeAlokasi = $data['metode_alokasi_ongkir'] ?? 'nilai';

        $akunKas = null;
        if ($statusBayar === 'Lunas') {
            if (!$akunKasId) throw new Exception('Akun kas wajib dipilih untuk pembelian Lunas.');
            $stmt = $db->prepare('SELECT * FROM akun_kas_bank WHERE id = ?');
            $stmt->execute([$akunKasId]);
            $akunKas = $stmt->fetch();
            if (!$akunKas) throw new Exception('Akun kas tidak ditemukan.');
        }

        $totalSubtotal = 0;
        $totalQty = 0;
        foreach ($items as $it) {
            $qty = (float)$it['qty'];
            $hargaBeli = (float)$it['harga_beli'];
            if ($qty <= 0) throw new Exception('Qty item pembelian harus lebih dari 0.');
            if ($hargaBeli < 0) throw new Exception('Harga beli tidak boleh negatif.');
            $totalSubtotal += ($qty * $hargaBeli);
            $totalQty += $qty;
        }

        $totalBiaya = $totalSubtotal + $ongkir;

        if ($statusBayar === 'Lunas' && $akunKas['tipe_akun'] !== 'Rekening Bank') {
            if ($akunKas['saldo_saat_ini'] < $totalBiaya) {
                throw new Exception("Saldo akun '{$akunKas['nama']}' tidak mencukupi.");
            }
        }

        $jatuhTempo = null;
        $sisaUtang = 0;
        if ($statusBayar === 'Utang') {
            $sisaUtang = $totalBiaya;
            $termin = (int)($data['termin_hari'] ?? $supplier['termin_hari'] ?? 30);
            $jatuhTempo = date('Y-m-d', strtotime($data['tanggal'] . " +{$termin} days"));
        }

        $now = gmdate('Y-m-d\TH:i:s\Z');
        $db->beginTransaction();
        try {
            $ins = $db->prepare("
                INSERT INTO pembelian (
                    no_faktur, supplier_id, tanggal, total_subtotal, ongkir, total_biaya,
                    metode_alokasi_ongkir, status_bayar, termin_hari, jatuh_tempo,
                    akun_kas_id, sisa_utang, status, catatan, created_by, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Posted', ?, ?, ?)
            ");
            $ins->execute([
                $data['no_faktur'],
                $data['supplier_id'],
                $data['tanggal'],
                $totalSubtotal,
                $ongkir,
                $totalBiaya,
                $metodeAlokasi,
                $statusBayar,
                $statusBayar === 'Utang' ? (int)($data['termin_hari'] ?? $supplier['termin_hari'] ?? 30) : 0,
                $jatuhTempo,
                $akunKasId,
                $sisaUtang,
                $data['catatan'] ?? '',
                $user['nama'] ?? 'Admin',
                $now
            ]);
            $pembelianId = (int)$db->lastInsertId();

            $insDetail = $db->prepare('
                INSERT INTO detail_pembelian (
                    pembelian_id, varian_id, qty, harga_beli, subtotal,
                    ongkir_alokasi, hpp_beli_per_unit, total_item
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ');

            $insMutasi = $db->prepare("
                INSERT INTO mutasi_stok (
                    waktu, varian_id, tipe, qty_masuk, qty_keluar, hpp_unit,
                    saldo_stok_akhir, nilai_persediaan_akhir, ref_dokumen, keterangan, created_by
                ) VALUES (?, ?, 'MASUK_BELI', ?, 0, ?, ?, ?, ?, ?, ?)
            ");

            $updVarian = $db->prepare('UPDATE varian_produk SET stok_on_hand = ?, hpp_rata_rata = ? WHERE id = ?');

            foreach ($items as $it) {
                $varianId = (int)$it['varian_id'];
                $stmt = $db->prepare('SELECT * FROM varian_produk WHERE id = ?');
                $stmt->execute([$varianId]);
                $varian = $stmt->fetch();
                if (!$varian) throw new Exception("Varian ID {$varianId} tidak ditemukan.");

                $qty = (float)$it['qty'];
                $hargaBeli = (float)$it['harga_beli'];
                $subtotal = $qty * $hargaBeli;

                $alokasiOngkir = 0;
                if ($ongkir > 0) {
                    if ($metodeAlokasi === 'qty' && $totalQty > 0) {
                        $alokasiOngkir = ($qty / $totalQty) * $ongkir;
                    } elseif ($totalSubtotal > 0) {
                        $alokasiOngkir = ($subtotal / $totalSubtotal) * $ongkir;
                    }
                }

                $totalItem = $subtotal + $alokasiOngkir;
                $hppBeliUnit = $totalItem / $qty;

                $insDetail->execute([
                    $pembelianId,
                    $varianId,
                    $qty,
                    $hargaBeli,
                    $subtotal,
                    $alokasiOngkir,
                    $hppBeliUnit,
                    $totalItem
                ]);

                // Recalculate moving average HPP
                $existingOnHand = (float)$varian['stok_on_hand'];
                $existingHpp = (float)$varian['hpp_rata_rata'];
                $newOnHand = $existingOnHand + $qty;

                $newAverageHpp = $hppBeliUnit;
                if ($existingOnHand > 0) {
                    $newAverageHpp = (($existingOnHand * $existingHpp) + ($qty * $hppBeliUnit)) / $newOnHand;
                }

                $nilaiPersediaanAkhir = $newOnHand * $newAverageHpp;

                $insMutasi->execute([
                    $now,
                    $varianId,
                    $qty,
                    $hppBeliUnit,
                    $newOnHand,
                    $nilaiPersediaanAkhir,
                    $data['no_faktur'],
                    "Pembelian dari {$supplier['nama']} ({$data['no_faktur']})",
                    $user['nama'] ?? 'Admin'
                ]);

                $updVarian->execute([$newOnHand, $newAverageHpp, $varianId]);
            }

            // Deduct cash if Lunas (BR-03)
            if ($statusBayar === 'Lunas' && $akunKasId) {
                $updKas = $db->prepare('UPDATE akun_kas_bank SET saldo_saat_ini = saldo_saat_ini - ? WHERE id = ?');
                $updKas->execute([$totalBiaya, $akunKasId]);
            }

            $db->commit();

            self::logAudit($user, 'pembelian', (string)$pembelianId, 'CREATE', null, [
                'no_faktur' => $data['no_faktur'],
                'total_biaya' => $totalBiaya,
                'status_bayar' => $statusBayar
            ]);

            return ['success' => true, 'pembelianId' => $pembelianId, 'no_faktur' => $data['no_faktur']];
        } catch (Exception $e) {
            $db->rollBack();
            throw $e;
        }
    }

    /**
     * Settle Accounts Payable
     */
    public static function settleUtang(array $data, ?array $user = null): array {
        if ($user === null && isset($data['user'])) $user = $data['user'];
        self::assertOpenPeriod($data['tanggal']);

        $db = Database::getConnection();
        $stmt = $db->prepare('SELECT * FROM pembelian WHERE id = ?');
        $stmt->execute([$data['pembelian_id']]);
        $pembelian = $stmt->fetch();
        if (!$pembelian) throw new Exception('Data pembelian tidak ditemukan.');
        if ($pembelian['status'] === 'Void') throw new Exception('Pembelian berstatus Void.');
        if ($pembelian['status_bayar'] !== 'Utang') throw new Exception('Pembelian ini bukan pembelian utang.');
        if ($pembelian['sisa_utang'] <= 0) throw new Exception('Utang untuk faktur ini sudah lunas.');

        $nominal = (float)$data['nominal'];
        if ($nominal <= 0) throw new Exception('Nominal pelunasan harus lebih dari 0.');
        if ($nominal > $pembelian['sisa_utang']) {
            throw new Exception("Nominal pelunasan melebihi sisa utang ({$pembelian['sisa_utang']}).");
        }

        $stmt = $db->prepare('SELECT * FROM akun_kas_bank WHERE id = ?');
        $stmt->execute([$data['akun_kas_id']]);
        $akunKas = $stmt->fetch();
        if (!$akunKas) throw new Exception('Akun kas tidak ditemukan.');

        if ($akunKas['tipe_akun'] !== 'Rekening Bank' && $akunKas['saldo_saat_ini'] < $nominal) {
            throw new Exception("Saldo akun '{$akunKas['nama']}' tidak mencukupi.");
        }

        $noTransaksi = 'PAY-' . strtoupper(dechex(time())) . '-' . rand(100, 999);
        $now = gmdate('Y-m-d\TH:i:s\Z');

        $db->beginTransaction();
        try {
            $ins = $db->prepare('
                INSERT INTO pelunasan_utang (pembelian_id, no_transaksi, tanggal, nominal, akun_kas_id, catatan, created_by, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ');
            $ins->execute([
                $data['pembelian_id'],
                $noTransaksi,
                $data['tanggal'],
                $nominal,
                $data['akun_kas_id'],
                $data['catatan'] ?? '',
                $user['nama'] ?? 'Admin',
                $now
            ]);

            $sisaBaru = $pembelian['sisa_utang'] - $nominal;
            $db->prepare('UPDATE pembelian SET sisa_utang = ? WHERE id = ?')->execute([$sisaBaru, $pembelian['id']]);
            $db->prepare('UPDATE akun_kas_bank SET saldo_saat_ini = saldo_saat_ini - ? WHERE id = ?')->execute([$nominal, $akunKas['id']]);

            $db->commit();

            self::logAudit($user, 'pelunasan_utang', $noTransaksi, 'CREATE', ['sisa_sebelum' => $pembelian['sisa_utang']], ['nominal' => $nominal, 'sisa_sesudah' => $sisaBaru]);

            return ['success' => true, 'noTransaksi' => $noTransaksi, 'sisa_utang' => $sisaBaru];
        } catch (Exception $e) {
            $db->rollBack();
            throw $e;
        }
    }

    /**
     * Post Sales (POS or Online) (FR-04, BR-04, BR-05, BR-10)
     */
    public static function createPenjualan(array $data, ?array $user = null): array {
        if ($user === null && isset($data['user'])) $user = $data['user'];
        self::assertOpenPeriod($data['tanggal']);

        $db = Database::getConnection();

        $stmt = $db->prepare('SELECT * FROM channel_penjualan WHERE id = ?');
        $stmt->execute([$data['channel_id']]);
        $channel = $stmt->fetch();
        if (!$channel) throw new Exception('Channel penjualan tidak ditemukan.');

        $stmt = $db->prepare('SELECT id FROM penjualan WHERE no_invoice = ?');
        $stmt->execute([$data['no_invoice']]);
        if ($stmt->fetch()) throw new Exception("Nomor invoice '{$data['no_invoice']}' sudah terdaftar.");

        $noPesanan = !empty($data['no_pesanan']) ? trim($data['no_pesanan']) : null;
        if ($noPesanan) {
            $stmt = $db->prepare("SELECT id FROM penjualan WHERE no_pesanan = ? AND channel_id = ? AND status != 'Void' AND status != 'Batal'");
            $stmt->execute([$noPesanan, $data['channel_id']]);
            if ($stmt->fetch()) throw new Exception("Nomor pesanan marketplace '{$noPesanan}' sudah pernah diimpor/dibuat.");
        }

        $items = $data['items'] ?? [];
        if (empty($items)) throw new Exception('Keranjang item penjualan tidak boleh kosong.');

        $allowMinus = self::getSetting('izinkan_stok_minus', 'false') === 'true';
        $status = $data['status'] ?? 'Selesai';

        $targetKasId = !empty($data['akun_kas_id']) ? $data['akun_kas_id'] : $channel['akun_kas_id'];
        if ($status === 'Selesai' && !$targetKasId) {
            throw new Exception('Akun kas penerimaan dana belum ditentukan.');
        }

        $omzetKotor = 0;
        $totalPotonganAdmin = 0;
        $totalDiskonItem = 0;

        foreach ($items as $it) {
            $qty = (float)$it['qty'];
            $harga = (float)$it['harga'];
            $diskon = (float)($it['diskon'] ?? 0);
            if ($qty <= 0) throw new Exception('Qty penjualan harus lebih dari 0.');
            if ($harga < 0) throw new Exception('Harga jual tidak boleh negatif.');

            $subtotal = $qty * $harga;
            $omzetKotor += $subtotal;
            $totalDiskonItem += $diskon;

            $potonganAdmin = isset($it['potongan_admin']) && is_numeric($it['potongan_admin']) && $it['potongan_admin'] >= 0
                ? (float)$it['potongan_admin']
                : (($channel['komisi_persen'] / 100) * $subtotal + ($channel['komisi_tetap'] / count($items)));

            $totalPotonganAdmin += $potonganAdmin;
        }

        $diskonFinal = isset($data['diskon_total']) && is_numeric($data['diskon_total']) && $data['diskon_total'] > 0
            ? (float)$data['diskon_total']
            : $totalDiskonItem;

        $pendapatanBersih = $omzetKotor - $diskonFinal - $totalPotonganAdmin;
        $now = gmdate('Y-m-d\TH:i:s\Z');

        $db->beginTransaction();
        try {
            // Check stock availability
            foreach ($items as $it) {
                $stmt = $db->prepare('SELECT * FROM varian_produk WHERE id = ?');
                $stmt->execute([(int)$it['varian_id']]);
                $varian = $stmt->fetch();
                if (!$varian) throw new Exception("Varian ID {$it['varian_id']} tidak ditemukan.");

                $qty = (float)$it['qty'];
                $stokTersedia = (float)$varian['stok_on_hand'] - (float)$varian['stok_reserved'];

                if (!$allowMinus && $stokTersedia < $qty) {
                    throw new Exception("Stok tidak mencukupi untuk SKU '{$varian['sku']}' ({$varian['nama_varian']}). Tersedia: {$stokTersedia}, Diminta: {$qty}.");
                }
            }

            // Insert Penjualan
            $insSale = $db->prepare('
                INSERT INTO penjualan (
                    no_invoice, tipe, channel_id, no_pesanan, tanggal, pelanggan_id, nama_pelanggan,
                    metode_bayar, akun_kas_id, status, omzet_kotor, diskon_total, potongan_admin,
                    pendapatan_bersih, total_hpp, laba_kotor, kurir, no_resi, catatan,
                    created_by, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?)
            ');

            $insSale->execute([
                $data['no_invoice'],
                $data['tipe'] ?? 'POS',
                $data['channel_id'],
                $noPesanan,
                $data['tanggal'],
                $data['pelanggan_id'] ?? null,
                $data['nama_pelanggan'] ?? 'Walk-in',
                $data['metode_bayar'] ?? 'Tunai',
                $targetKasId,
                $status,
                $omzetKotor,
                $diskonFinal,
                $totalPotonganAdmin,
                $pendapatanBersih,
                $data['kurir'] ?? '',
                $data['no_resi'] ?? '',
                $data['catatan'] ?? '',
                $user['nama'] ?? 'Kasir',
                $now
            ]);
            $penjualanId = (int)$db->lastInsertId();

            $totalHpp = 0;
            $insDetail = $db->prepare('
                INSERT INTO detail_penjualan (
                    penjualan_id, varian_id, qty, harga, diskon, potongan_admin,
                    pendapatan_bersih, hpp_snapshot, laba_kotor
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ');

            $insMutasi = $db->prepare("
                INSERT INTO mutasi_stok (
                    waktu, varian_id, tipe, qty_masuk, qty_keluar, hpp_unit,
                    saldo_stok_akhir, nilai_persediaan_akhir, ref_dokumen, keterangan, created_by
                ) VALUES (?, ?, 'KELUAR_JUAL', 0, ?, ?, ?, ?, ?, ?, ?)
            ");

            foreach ($items as $it) {
                $stmt = $db->prepare('SELECT * FROM varian_produk WHERE id = ?');
                $stmt->execute([(int)$it['varian_id']]);
                $varian = $stmt->fetch();

                $qty = (float)$it['qty'];
                $harga = (float)$it['harga'];
                $diskon = (float)($it['diskon'] ?? 0);
                $sub = $qty * $harga;

                $adminCut = isset($it['potongan_admin']) && is_numeric($it['potongan_admin']) && $it['potongan_admin'] >= 0
                    ? (float)$it['potongan_admin']
                    : (($channel['komisi_persen'] / 100) * $sub + ($channel['komisi_tetap'] / count($items)));

                $itemNet = $sub - $diskon - $adminCut;
                $hppSnapshot = 0;
                $itemLabaKotor = 0;

                if ($status === 'Selesai') {
                    // Lock HPP snapshot permanently!
                    $hppSnapshot = (float)$varian['hpp_rata_rata'];
                    $itemHppTotal = $qty * $hppSnapshot;
                    $itemLabaKotor = $itemNet - $itemHppTotal;
                    $totalHpp += $itemHppTotal;

                    $newOnHand = (float)$varian['stok_on_hand'] - $qty;
                    $db->prepare('UPDATE varian_produk SET stok_on_hand = ? WHERE id = ?')->execute([$newOnHand, $varian['id']]);

                    $nilaiAkhir = $newOnHand * $hppSnapshot;
                    $insMutasi->execute([
                        $now,
                        $varian['id'],
                        $qty,
                        $hppSnapshot,
                        $newOnHand,
                        $nilaiAkhir,
                        $data['no_invoice'],
                        "Penjualan {$channel['nama']}",
                        $user['nama'] ?? 'Kasir'
                    ]);
                } elseif ($status === 'Diproses' || $status === 'Dikirim') {
                    // Reserve stock (BR-05)
                    $db->prepare('UPDATE varian_produk SET stok_reserved = stok_reserved + ? WHERE id = ?')->execute([$qty, $varian['id']]);
                }

                $insDetail->execute([
                    $penjualanId,
                    $varian['id'],
                    $qty,
                    $harga,
                    $diskon,
                    $adminCut,
                    $itemNet,
                    $hppSnapshot,
                    $itemLabaKotor
                ]);
            }

            if ($status === 'Selesai') {
                $labaKotorTotal = $pendapatanBersih - $totalHpp;
                $db->prepare('UPDATE penjualan SET total_hpp = ?, laba_kotor = ? WHERE id = ?')->execute([$totalHpp, $labaKotorTotal, $penjualanId]);
                $db->prepare('UPDATE akun_kas_bank SET saldo_saat_ini = saldo_saat_ini + ? WHERE id = ?')->execute([$pendapatanBersih, $targetKasId]);
            }

            $db->commit();

            self::logAudit($user, 'penjualan', $data['no_invoice'], 'CREATE', null, [
                'id' => $penjualanId,
                'status' => $status,
                'omzet' => $omzetKotor,
                'net' => $pendapatanBersih
            ]);

            return [
                'success' => true,
                'penjualanId' => $penjualanId,
                'no_invoice' => $data['no_invoice'],
                'omzetKotor' => $omzetKotor,
                'pendapatanBersih' => $pendapatanBersih,
                'status' => $status
            ];
        } catch (Exception $e) {
            $db->rollBack();
            throw $e;
        }
    }

    /**
     * Update Status Penjualan
     */
    public static function updateStatusPenjualan($penjualanId, string $statusBaru = '', ?array $user = null): array {
        if (is_array($penjualanId)) {
            $data = $penjualanId;
            $penjualanId = (int)($data['penjualan_id'] ?? $data['id']);
            $statusBaru = $data['status_baru'] ?? $data['status'] ?? $statusBaru;
            $user = $data['user'] ?? $user;
        } else {
            $penjualanId = (int)$penjualanId;
        }
        $db = Database::getConnection();
        $stmt = $db->prepare('SELECT * FROM penjualan WHERE id = ?');
        $stmt->execute([$penjualanId]);
        $sale = $stmt->fetch();
        if (!$sale) throw new Exception('Penjualan tidak ditemukan.');

        self::assertOpenPeriod($sale['tanggal']);

        $statusLama = $sale['status'];
        if ($statusLama === $statusBaru) return ['success' => true, 'message' => 'Status tidak berubah.'];
        if ($statusLama === 'Void') throw new Exception('Transaksi berstatus Void tidak dapat diubah.');
        if ($statusLama === 'Batal') throw new Exception('Transaksi berstatus Batal tidak dapat diubah.');
        if ($statusLama === 'Selesai') throw new Exception('Transaksi Selesai tidak dapat dibatalkan langsung. Gunakan Void.');

        $stmt = $db->prepare('SELECT * FROM detail_penjualan WHERE penjualan_id = ?');
        $stmt->execute([$penjualanId]);
        $details = $stmt->fetchAll();

        $stmt = $db->prepare('SELECT * FROM channel_penjualan WHERE id = ?');
        $stmt->execute([$sale['channel_id']]);
        $channel = $stmt->fetch();

        $now = gmdate('Y-m-d\TH:i:s\Z');

        $db->beginTransaction();
        try {
            if (($statusLama === 'Diproses' || $statusLama === 'Dikirim') && $statusBaru === 'Selesai') {
                $totalHpp = 0;

                foreach ($details as $item) {
                    $stmt = $db->prepare('SELECT * FROM varian_produk WHERE id = ?');
                    $stmt->execute([$item['varian_id']]);
                    $varian = $stmt->fetch();

                    $qty = (float)$item['qty'];
                    $newReserved = max(0, (float)$varian['stok_reserved'] - $qty);
                    $newOnHand = (float)$varian['stok_on_hand'] - $qty;

                    $hppSnapshot = (float)$varian['hpp_rata_rata'];
                    $itemHppTotal = $qty * $hppSnapshot;
                    $itemLabaKotor = (float)$item['pendapatan_bersih'] - $itemHppTotal;
                    $totalHpp += $itemHppTotal;

                    $db->prepare('UPDATE detail_penjualan SET hpp_snapshot = ?, laba_kotor = ? WHERE id = ?')->execute([$hppSnapshot, $itemLabaKotor, $item['id']]);
                    $db->prepare('UPDATE varian_produk SET stok_reserved = ?, stok_on_hand = ? WHERE id = ?')->execute([$newReserved, $newOnHand, $varian['id']]);

                    $nilaiAkhir = $newOnHand * $hppSnapshot;
                    $db->prepare("
                        INSERT INTO mutasi_stok (
                            waktu, varian_id, tipe, qty_masuk, qty_keluar, hpp_unit,
                            saldo_stok_akhir, nilai_persediaan_akhir, ref_dokumen, keterangan, created_by
                        ) VALUES (?, ?, 'KELUAR_JUAL', 0, ?, ?, ?, ?, ?, ?, ?)
                    ")->execute([
                        $now,
                        $varian['id'],
                        $qty,
                        $hppSnapshot,
                        $newOnHand,
                        $nilaiAkhir,
                        $sale['no_invoice'],
                        "Pesanan Selesai ({$channel['nama']})",
                        $user['nama'] ?? 'Admin'
                    ]);
                }

                $labaKotorTotal = (float)$sale['pendapatan_bersih'] - $totalHpp;
                $db->prepare("UPDATE penjualan SET status = 'Selesai', total_hpp = ?, laba_kotor = ? WHERE id = ?")->execute([$totalHpp, $labaKotorTotal, $sale['id']]);

                $cashId = $sale['akun_kas_id'] ?: $channel['akun_kas_id'];
                $db->prepare('UPDATE akun_kas_bank SET saldo_saat_ini = saldo_saat_ini + ? WHERE id = ?')->execute([$sale['pendapatan_bersih'], $cashId]);
            } elseif (($statusLama === 'Diproses' || $statusLama === 'Dikirim') && $statusBaru === 'Batal') {
                foreach ($details as $item) {
                    $db->prepare('UPDATE varian_produk SET stok_reserved = MAX(0, stok_reserved - ?) WHERE id = ?')->execute([(float)$item['qty'], $item['varian_id']]);
                }
                $db->prepare("UPDATE penjualan SET status = 'Batal' WHERE id = ?")->execute([$sale['id']]);
            } elseif (($statusLama === 'Diproses' && $statusBaru === 'Dikirim') || ($statusLama === 'Dikirim' && $statusBaru === 'Diproses')) {
                $db->prepare('UPDATE penjualan SET status = ? WHERE id = ?')->execute([$statusBaru, $sale['id']]);
            }

            $db->commit();

            self::logAudit($user, 'penjualan', $sale['no_invoice'], 'UPDATE_STATUS', ['status' => $statusLama], ['status' => $statusBaru]);

            return ['success' => true, 'message' => "Status penjualan diubah ke {$statusBaru}."];
        } catch (Exception $e) {
            $db->rollBack();
            throw $e;
        }
    }

    /**
     * Void Sales (BR-08, UAT-15)
     */
    public static function voidPenjualan($penjualanId, string $alasan = '', ?array $user = null): array {
        if (is_array($penjualanId)) {
            $data = $penjualanId;
            $penjualanId = (int)($data['penjualan_id'] ?? $data['id']);
            $alasan = $data['alasan'] ?? $alasan;
            $user = $data['user'] ?? $user;
        } else {
            $penjualanId = (int)$penjualanId;
        }
        if (!trim($alasan)) throw new Exception('Alasan void wajib diisi.');

        $db = Database::getConnection();
        $stmt = $db->prepare('SELECT * FROM penjualan WHERE id = ?');
        $stmt->execute([$penjualanId]);
        $sale = $stmt->fetch();
        if (!$sale) throw new Exception('Penjualan tidak ditemukan.');

        self::assertOpenPeriod($sale['tanggal']);
        if ($sale['status'] === 'Void') throw new Exception('Transaksi sudah dibatalkan/void.');

        $stmt = $db->prepare('SELECT * FROM detail_penjualan WHERE penjualan_id = ?');
        $stmt->execute([$penjualanId]);
        $details = $stmt->fetchAll();

        $stmt = $db->prepare('SELECT * FROM channel_penjualan WHERE id = ?');
        $stmt->execute([$sale['channel_id']]);
        $channel = $stmt->fetch();

        $now = gmdate('Y-m-d\TH:i:s\Z');

        $db->beginTransaction();
        try {
            if ($sale['status'] === 'Selesai') {
                foreach ($details as $item) {
                    $stmt = $db->prepare('SELECT * FROM varian_produk WHERE id = ?');
                    $stmt->execute([$item['varian_id']]);
                    $varian = $stmt->fetch();

                    $newOnHand = (float)$varian['stok_on_hand'] + (float)$item['qty'];
                    $db->prepare('UPDATE varian_produk SET stok_on_hand = ? WHERE id = ?')->execute([$newOnHand, $varian['id']]);

                    $nilaiAkhir = $newOnHand * (float)$varian['hpp_rata_rata'];
                    $db->prepare("
                        INSERT INTO mutasi_stok (
                            waktu, varian_id, tipe, qty_masuk, qty_keluar, hpp_unit,
                            saldo_stok_akhir, nilai_persediaan_akhir, ref_dokumen, keterangan, created_by
                        ) VALUES (?, ?, 'VOID_PEMBALIK_JUAL', ?, 0, ?, ?, ?, ?, ?, ?)
                    ")->execute([
                        $now,
                        $varian['id'],
                        $item['qty'],
                        $item['hpp_snapshot'],
                        $newOnHand,
                        $nilaiAkhir,
                        $sale['no_invoice'],
                        "Void Penjualan: {$alasan}",
                        $user['nama'] ?? 'Admin'
                    ]);
                }

                $cashId = $sale['akun_kas_id'] ?: $channel['akun_kas_id'];
                $db->prepare('UPDATE akun_kas_bank SET saldo_saat_ini = saldo_saat_ini - ? WHERE id = ?')->execute([$sale['pendapatan_bersih'], $cashId]);
            } elseif ($sale['status'] === 'Diproses' || $sale['status'] === 'Dikirim') {
                foreach ($details as $item) {
                    $db->prepare('UPDATE varian_produk SET stok_reserved = MAX(0, stok_reserved - ?) WHERE id = ?')->execute([(float)$item['qty'], $item['varian_id']]);
                }
            }

            $db->prepare("UPDATE penjualan SET status = 'Void', void_alasan = ? WHERE id = ?")->execute([$alasan, $sale['id']]);

            $db->commit();

            self::logAudit($user, 'penjualan', $sale['no_invoice'], 'VOID', ['status' => $sale['status']], ['status' => 'Void', 'alasan' => $alasan]);

            return ['success' => true, 'message' => "Penjualan {$sale['no_invoice']} berhasil divoid."];
        } catch (Exception $e) {
            $db->rollBack();
            throw $e;
        }
    }

    /**
     * Sales Return (FR-05, BR-07, UAT-04)
     */
    public static function createReturPenjualan(array $data, ?array $user = null): array {
        if ($user === null && isset($data['user'])) $user = $data['user'];
        self::assertOpenPeriod($data['tanggal']);

        $db = Database::getConnection();
        $stmt = $db->prepare('SELECT * FROM penjualan WHERE id = ?');
        $stmt->execute([(int)$data['penjualan_id']]);
        $sale = $stmt->fetch();
        if (!$sale) throw new Exception('Penjualan tidak ditemukan.');
        if ($sale['status'] !== 'Selesai') throw new Exception('Hanya penjualan Selesai yang dapat diretur.');

        $stmt = $db->prepare('SELECT * FROM akun_kas_bank WHERE id = ?');
        $stmt->execute([(int)$data['akun_kas_id']]);
        $akunKas = $stmt->fetch();
        if (!$akunKas) throw new Exception('Akun kas sumber refund tidak ditemukan.');

        $items = $data['items'] ?? [];
        if (empty($items)) throw new Exception('Item yang diretur harus dipilih.');

        $kembaliKeStok = !empty($data['kembali_ke_stok']) ? 1 : 0;
        $noRetur = 'RET-' . strtoupper(dechex(time())) . '-' . rand(100, 999);
        $now = gmdate('Y-m-d\TH:i:s\Z');

        $totalRefund = 0;
        $totalHppRetur = 0;
        $totalKerugianRetur = 0;

        $db->beginTransaction();
        try {
            $insRetur = $db->prepare('
                INSERT INTO retur_penjualan (
                    no_retur, penjualan_id, tanggal, kembali_ke_stok, akun_kas_id,
                    total_refund, total_hpp_retur, kerugian_retur, catatan, created_by, created_at
                ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?)
            ');
            $insRetur->execute([
                $noRetur,
                $sale['id'],
                $data['tanggal'],
                $kembaliKeStok,
                $akunKas['id'],
                $data['catatan'] ?? '',
                $user['nama'] ?? 'Kasir',
                $now
            ]);
            $returId = (int)$db->lastInsertId();

            $insDetailRetur = $db->prepare('
                INSERT INTO detail_retur (
                    retur_id, detail_penjualan_id, varian_id, qty, refund_per_unit, hpp_snapshot
                ) VALUES (?, ?, ?, ?, ?, ?)
            ');

            foreach ($items as $it) {
                $detailId = (int)$it['detail_penjualan_id'];
                $stmt = $db->prepare('SELECT * FROM detail_penjualan WHERE id = ? AND penjualan_id = ?');
                $stmt->execute([$detailId, $sale['id']]);
                $detailSale = $stmt->fetch();
                if (!$detailSale) throw new Exception("Detail penjualan {$detailId} tidak valid.");

                $stmt = $db->prepare('
                    SELECT SUM(dr.qty) as total_retur
                    FROM detail_retur dr
                    JOIN retur_penjualan rp ON dr.retur_id = rp.id
                    WHERE dr.detail_penjualan_id = ?
                ');
                $stmt->execute([$detailSale['id']]);
                $prevRet = (float)($stmt->fetch()['total_retur'] ?? 0);
                $sisaQty = (float)$detailSale['qty'] - $prevRet;
                $returQty = (float)$it['qty'];

                if ($returQty <= 0) throw new Exception('Qty retur harus lebih dari 0.');
                if ($returQty > $sisaQty) throw new Exception("Qty retur ({$returQty}) melebihi sisa terjual ({$sisaQty}).");

                $stmt = $db->prepare('SELECT * FROM varian_produk WHERE id = ?');
                $stmt->execute([$detailSale['varian_id']]);
                $varian = $stmt->fetch();

                $refundUnit = isset($it['refund_per_unit']) ? (float)$it['refund_per_unit'] : ((float)$detailSale['pendapatan_bersih'] / (float)$detailSale['qty']);
                $itemRefund = $returQty * $refundUnit;
                $totalRefund += $itemRefund;

                $itemHppUnit = (float)$detailSale['hpp_snapshot'];

                $insDetailRetur->execute([
                    $returId,
                    $detailSale['id'],
                    $varian['id'],
                    $returQty,
                    $refundUnit,
                    $itemHppUnit
                ]);

                if ($kembaliKeStok === 1) {
                    $newOnHand = (float)$varian['stok_on_hand'] + $returQty;
                    $db->prepare('UPDATE varian_produk SET stok_on_hand = ? WHERE id = ?')->execute([$newOnHand, $varian['id']]);

                    $nilaiAkhir = $newOnHand * (float)$varian['hpp_rata_rata'];
                    $db->prepare("
                        INSERT INTO mutasi_stok (
                            waktu, varian_id, tipe, qty_masuk, qty_keluar, hpp_unit,
                            saldo_stok_akhir, nilai_persediaan_akhir, ref_dokumen, keterangan, created_by
                        ) VALUES (?, ?, 'RETUR_MASUK', ?, 0, ?, ?, ?, ?, ?, ?)
                    ")->execute([
                        $now,
                        $varian['id'],
                        $returQty,
                        $itemHppUnit,
                        $newOnHand,
                        $nilaiAkhir,
                        $noRetur,
                        "Retur Penjualan ({$sale['no_invoice']}) - Layak",
                        $user['nama'] ?? 'Kasir'
                    ]);

                    $totalHppRetur += ($returQty * $itemHppUnit);
                } else {
                    $totalKerugianRetur += ($returQty * $itemHppUnit);
                }
            }

            if ($akunKas['tipe_akun'] !== 'Rekening Bank' && $akunKas['saldo_saat_ini'] < $totalRefund) {
                throw new Exception("Saldo kas '{$akunKas['nama']}' tidak mencukupi untuk refund.");
            }

            $db->prepare('UPDATE akun_kas_bank SET saldo_saat_ini = saldo_saat_ini - ? WHERE id = ?')->execute([$totalRefund, $akunKas['id']]);
            $db->prepare('UPDATE retur_penjualan SET total_refund = ?, total_hpp_retur = ?, kerugian_retur = ? WHERE id = ?')->execute([$totalRefund, $totalHppRetur, $totalKerugianRetur, $returId]);

            $db->commit();

            self::logAudit($user, 'retur_penjualan', $noRetur, 'CREATE', null, [
                'totalRefund' => $totalRefund,
                'kembaliKeStok' => $kembaliKeStok,
                'totalKerugianRetur' => $totalKerugianRetur
            ]);

            return ['success' => true, 'noRetur' => $noRetur, 'totalRefund' => $totalRefund, 'kembali_ke_stok' => $kembaliKeStok];
        } catch (Exception $e) {
            $db->rollBack();
            throw $e;
        }
    }

    /**
     * Operational Expense
     */
    public static function createBiayaOperasional(array $data, ?array $user = null): array {
        if ($user === null && isset($data['user'])) $user = $data['user'];
        self::assertOpenPeriod($data['tanggal']);

        $db = Database::getConnection();
        $nominal = (float)$data['nominal'];
        if ($nominal <= 0) throw new Exception('Nominal biaya harus lebih dari 0.');

        $stmt = $db->prepare('SELECT * FROM kategori_biaya WHERE id = ?');
        $stmt->execute([(int)$data['kategori_id']]);
        $kategori = $stmt->fetch();
        if (!$kategori) throw new Exception('Kategori biaya tidak ditemukan.');

        $stmt = $db->prepare('SELECT * FROM akun_kas_bank WHERE id = ?');
        $stmt->execute([(int)$data['akun_kas_id']]);
        $akunKas = $stmt->fetch();
        if (!$akunKas) throw new Exception('Akun kas tidak ditemukan.');

        if ($akunKas['tipe_akun'] !== 'Rekening Bank' && $akunKas['saldo_saat_ini'] < $nominal) {
            throw new Exception("Saldo akun '{$akunKas['nama']}' tidak mencukupi.");
        }

        $stmt = $db->prepare('SELECT id FROM biaya_operasional WHERE no_bukti = ?');
        $stmt->execute([$data['no_bukti']]);
        if ($stmt->fetch()) throw new Exception("Nomor bukti '{$data['no_bukti']}' sudah digunakan.");

        $now = gmdate('Y-m-d\TH:i:s\Z');
        $db->beginTransaction();
        try {
            $ins = $db->prepare("
                INSERT INTO biaya_operasional (
                    no_bukti, tanggal, kategori_id, channel_id, nominal, akun_kas_id,
                    keterangan, lampiran_bukti, status, created_by, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Posted', ?, ?)
            ");
            $ins->execute([
                $data['no_bukti'],
                $data['tanggal'],
                $data['kategori_id'],
                !empty($data['channel_id']) ? (int)$data['channel_id'] : null,
                $nominal,
                $akunKas['id'],
                $data['keterangan'] ?? '',
                $data['lampiran_bukti'] ?? '',
                $user['nama'] ?? 'Admin',
                $now
            ]);
            $biayaId = (int)$db->lastInsertId();

            $db->prepare('UPDATE akun_kas_bank SET saldo_saat_ini = saldo_saat_ini - ? WHERE id = ?')->execute([$nominal, $akunKas['id']]);

            $db->commit();

            self::logAudit($user, 'biaya_operasional', $data['no_bukti'], 'CREATE', null, ['nominal' => $nominal, 'kategori' => $kategori['nama']]);

            return ['success' => true, 'biayaId' => $biayaId, 'no_bukti' => $data['no_bukti']];
        } catch (Exception $e) {
            $db->rollBack();
            throw $e;
        }
    }

    /**
     * Cash Transfer between Accounts (P&L Neutral)
     */
    public static function createMutasiKas(array $data, ?array $user = null): array {
        if ($user === null && isset($data['user'])) $user = $data['user'];
        self::assertOpenPeriod($data['tanggal']);

        $asalId = (int)$data['akun_asal_id'];
        $tujuanId = (int)$data['akun_tujuan_id'];
        if ($asalId === $tujuanId) throw new Exception('Akun asal dan akun tujuan tidak boleh sama.');

        $nominal = (float)$data['nominal'];
        if ($nominal <= 0) throw new Exception('Nominal mutasi kas harus lebih dari 0.');

        $db = Database::getConnection();
        $stmt = $db->prepare('SELECT * FROM akun_kas_bank WHERE id = ?');
        $stmt->execute([$asalId]);
        $akunAsal = $stmt->fetch();

        $stmt->execute([$tujuanId]);
        $akunTujuan = $stmt->fetch();
        if (!$akunAsal || !$akunTujuan) throw new Exception('Akun kas asal atau tujuan tidak ditemukan.');

        if ($akunAsal['tipe_akun'] !== 'Rekening Bank' && $akunAsal['saldo_saat_ini'] < $nominal) {
            throw new Exception("Saldo akun asal '{$akunAsal['nama']}' tidak mencukupi (Tersedia: Rp " . number_format($akunAsal['saldo_saat_ini'], 0, ',', '.') . ").");
        }

        $stmt = $db->prepare('SELECT id FROM mutasi_kas WHERE no_referensi = ?');
        $stmt->execute([$data['no_referensi']]);
        if ($stmt->fetch()) throw new Exception("Nomor referensi '{$data['no_referensi']}' sudah pernah dicatat.");

        $now = gmdate('Y-m-d\TH:i:s\Z');
        $db->beginTransaction();
        try {
            $ins = $db->prepare("
                INSERT INTO mutasi_kas (
                    no_referensi, tanggal, akun_asal_id, akun_tujuan_id, nominal, keterangan, status, created_by, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, 'Posted', ?, ?)
            ");
            $ins->execute([
                $data['no_referensi'],
                $data['tanggal'],
                $asalId,
                $tujuanId,
                $nominal,
                $data['keterangan'] ?? '',
                $user['nama'] ?? 'Admin',
                $now
            ]);
            $mutasiId = (int)$db->lastInsertId();

            $db->prepare('UPDATE akun_kas_bank SET saldo_saat_ini = saldo_saat_ini - ? WHERE id = ?')->execute([$nominal, $asalId]);
            $db->prepare('UPDATE akun_kas_bank SET saldo_saat_ini = saldo_saat_ini + ? WHERE id = ?')->execute([$nominal, $tujuanId]);

            $db->commit();

            self::logAudit($user, 'mutasi_kas', $data['no_referensi'], 'CREATE', null, ['dari' => $akunAsal['nama'], 'ke' => $akunTujuan['nama'], 'nominal' => $nominal]);

            return ['success' => true, 'mutasiId' => $mutasiId, 'no_referensi' => $data['no_referensi']];
        } catch (Exception $e) {
            $db->rollBack();
            throw $e;
        }
    }

    /**
     * Stock Opname Adjustment
     */
    public static function approveOpnameSession($sesiId, string $alasan = '', ?array $user = null): array {
        if (is_array($sesiId)) {
            $data = $sesiId;
            $sesiId = (int)($data['sesi_id'] ?? $data['id']);
            $alasan = $data['alasan'] ?? $alasan;
            $user = $data['user'] ?? $user;
        } else {
            $sesiId = (int)$sesiId;
        }
        if (($user['peran'] ?? '') !== 'Owner') {
            throw new Exception('Hanya peran Owner yang berhak menyetujui penyesuaian stok opname.');
        }
        if (!trim($alasan)) throw new Exception('Alasan penyesuaian stok wajib diisi.');

        $db = Database::getConnection();
        $stmt = $db->prepare('SELECT * FROM sesi_opname WHERE id = ?');
        $stmt->execute([$sesiId]);
        $sesi = $stmt->fetch();
        if (!$sesi) throw new Exception('Sesi opname tidak ditemukan.');
        if ($sesi['status'] !== 'Draft' && $sesi['status'] !== 'Diajukan') {
            throw new Exception("Sesi opname berstatus '{$sesi['status']}' tidak dapat disetujui lagi.");
        }

        self::assertOpenPeriod($sesi['tanggal']);

        $stmt = $db->prepare('SELECT * FROM detail_sesi_opname WHERE sesi_id = ?');
        $stmt->execute([$sesiId]);
        $details = $stmt->fetchAll();

        $now = gmdate('Y-m-d\TH:i:s\Z');
        $db->beginTransaction();
        try {
            $insMutasi = $db->prepare("
                INSERT INTO mutasi_stok (
                    waktu, varian_id, tipe, qty_masuk, qty_keluar, hpp_unit,
                    saldo_stok_akhir, nilai_persediaan_akhir, ref_dokumen, keterangan, created_by
                ) VALUES (?, ?, 'OPNAME_ADJUST', ?, ?, ?, ?, ?, ?, ?, ?)
            ");

            foreach ($details as $d) {
                if ($d['selisih_qty'] != 0) {
                    $stmt = $db->prepare('SELECT * FROM varian_produk WHERE id = ?');
                    $stmt->execute([$d['varian_id']]);
                    $varian = $stmt->fetch();

                    $newOnHand = (float)$d['qty_fisik'];
                    $db->prepare('UPDATE varian_produk SET stok_on_hand = ? WHERE id = ?')->execute([$newOnHand, $varian['id']]);

                    $qtyMasuk = $d['selisih_qty'] > 0 ? (float)$d['selisih_qty'] : 0;
                    $qtyKeluar = $d['selisih_qty'] < 0 ? abs((float)$d['selisih_qty']) : 0;
                    $nilaiAkhir = $newOnHand * (float)$varian['hpp_rata_rata'];

                    $insMutasi->execute([
                        $now,
                        $varian['id'],
                        $qtyMasuk,
                        $qtyKeluar,
                        $d['hpp_unit'],
                        $newOnHand,
                        $nilaiAkhir,
                        $sesi['no_sesi'],
                        "Penyesuaian Opname: {$alasan}",
                        $user['nama'] ?? 'Owner'
                    ]);
                }
            }

            $db->prepare("UPDATE sesi_opname SET status = 'Disetujui', disetujui_oleh = ?, alasan_penyesuaian = ?, disetujui_pada = ? WHERE id = ?")
               ->execute([$user['nama'] ?? 'Owner', $alasan, $now, $sesi['id']]);

            $db->commit();

            self::logAudit($user, 'sesi_opname', $sesi['no_sesi'], 'APPROVE_OPNAME', ['status_sebelum' => $sesi['status']], ['status' => 'Disetujui', 'alasan' => $alasan]);

            return ['success' => true, 'message' => "Sesi opname {$sesi['no_sesi']} telah disetujui."];
        } catch (Exception $e) {
            $db->rollBack();
            throw $e;
        }
    }

    /**
     * Close Accounting Period (FR-09)
     */
    public static function closeAccountingPeriod($bulan, ?int $tahun = null, ?array $user = null): array {
        if (is_array($bulan)) {
            $data = $bulan;
            $user = $data['user'] ?? $user;
            $tahun = (int)$data['tahun'];
            $bulan = (int)$data['bulan'];
        } else {
            $bulan = (int)$bulan;
            $tahun = (int)$tahun;
        }
        if (($user['peran'] ?? '') !== 'Owner') throw new Exception('Hanya peran Owner yang berhak menutup periode akuntansi.');

        $db = Database::getConnection();
        $stmt = $db->prepare('SELECT * FROM periode_akuntansi WHERE bulan = ? AND tahun = ?');
        $stmt->execute([$bulan, $tahun]);
        $existing = $stmt->fetch();
        if ($existing && $existing['status'] === 'Tutup') {
            throw new Exception("Periode {$bulan}/{$tahun} sudah ditutup.");
        }

        $now = gmdate('Y-m-d\TH:i:s\Z');
        $db->beginTransaction();
        try {
            if ($existing) {
                $db->prepare("UPDATE periode_akuntansi SET status = 'Tutup', ditutup_pada = ?, ditutup_oleh = ? WHERE id = ?")
                   ->execute([$now, $user['nama'] ?? 'Owner', $existing['id']]);
                $periodeId = (int)$existing['id'];
            } else {
                $db->prepare("INSERT INTO periode_akuntansi (bulan, tahun, status, ditutup_pada, ditutup_oleh) VALUES (?, ?, 'Tutup', ?, ?)")
                   ->execute([$bulan, $tahun, $now, $user['nama'] ?? 'Owner']);
                $periodeId = (int)$db->lastInsertId();
            }

            // Snapshot inventory
            $stmt = $db->query('SELECT id, nama_varian, sku, stok_on_hand, hpp_rata_rata FROM varian_produk WHERE aktif = 1');
            $varians = $stmt->fetchAll();
            $insSnap = $db->prepare('INSERT INTO snapshot_periode (periode_id, tipe, ref_id, nama_entitas, nilai, qty) VALUES (?, ?, ?, ?, ?, ?)');
            foreach ($varians as $v) {
                $nilai = (float)$v['stok_on_hand'] * (float)$v['hpp_rata_rata'];
                $insSnap->execute([$periodeId, 'PERSEDIAAN', $v['id'], "{$v['sku']} - {$v['nama_varian']}", $nilai, $v['stok_on_hand']]);
            }

            // Snapshot cash
            $stmt = $db->query('SELECT id, nama, saldo_saat_ini FROM akun_kas_bank WHERE aktif = 1');
            $akuns = $stmt->fetchAll();
            foreach ($akuns as $a) {
                $insSnap->execute([$periodeId, 'KAS', $a['id'], $a['nama'], $a['saldo_saat_ini'], 0]);
            }

            $db->commit();

            self::logAudit($user, 'periode_akuntansi', "{$bulan}/{$tahun}", 'TUTUP_PERIODE', null, ['bulan' => $bulan, 'tahun' => $tahun]);

            return ['success' => true, 'message' => "Periode {$bulan}/{$tahun} berhasil ditutup."];
        } catch (Exception $e) {
            $db->rollBack();
            throw $e;
        }
    }

    /**
     * Reopen Accounting Period
     */
    public static function reopenAccountingPeriod($bulan, ?int $tahun = null, string $alasan = '', ?array $user = null): array {
        if (is_array($bulan)) {
            $data = $bulan;
            $user = $data['user'] ?? $user;
            $alasan = $data['alasan'] ?? $alasan;
            $tahun = (int)$data['tahun'];
            $bulan = (int)$data['bulan'];
        } else {
            $bulan = (int)$bulan;
            $tahun = (int)$tahun;
        }
        if (($user['peran'] ?? '') !== 'Owner') throw new Exception('Hanya peran Owner yang berhak membuka kembali periode akuntansi.');
        if (!trim($alasan)) throw new Exception('Alasan pembukaan kembali periode wajib diisi.');

        $db = Database::getConnection();
        $stmt = $db->prepare('SELECT * FROM periode_akuntansi WHERE bulan = ? AND tahun = ?');
        $stmt->execute([$bulan, $tahun]);
        $periode = $stmt->fetch();
        if (!$periode || $periode['status'] !== 'Tutup') {
            throw new Exception("Periode {$bulan}/{$tahun} tidak dalam status tertutup.");
        }

        $db->prepare("UPDATE periode_akuntansi SET status = 'Buka', catatan_reopen = ? WHERE id = ?")
           ->execute(["Dibuka oleh {$user['nama']}: {$alasan}", $periode['id']]);

        self::logAudit($user, 'periode_akuntansi', "{$bulan}/{$tahun}", 'BUKA_PERIODE', ['status' => 'Tutup'], ['status' => 'Buka', 'alasan' => $alasan]);

        return ['success' => true, 'message' => "Periode {$bulan}/{$tahun} berhasil dibuka kembali."];
    }
}
