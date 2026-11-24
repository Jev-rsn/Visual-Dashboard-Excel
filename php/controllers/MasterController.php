<?php
// php/controllers/MasterController.php

declare(strict_types=1);

require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../Auth.php';
require_once __DIR__ . '/../BusinessLogic.php';

class MasterController {
    // --- PRODUK & VARIAN ---

    public static function getProduk(array $user): array {
        $db = Database::getConnection();
        $produkList = $db->query('SELECT * FROM produk ORDER BY id DESC')->fetchAll();
        $varianList = $db->query('
            SELECT v.*, p.nama as nama_produk, p.kategori
            FROM varian_produk v
            JOIN produk p ON v.produk_id = p.id
            ORDER BY v.id ASC
        ')->fetchAll();

        $varianByProduk = [];
        foreach ($varianList as $v) {
            $varianByProduk[$v['produk_id']][] = $v;
        }

        $result = [];
        foreach ($produkList as $p) {
            $p['varians'] = $varianByProduk[$p['id']] ?? [];
            $result[] = $p;
        }

        return Auth::sanitizeSensitiveFields($result, $user);
    }

    public static function getVarians(array $user): array {
        $db = Database::getConnection();
        $varians = $db->query('
            SELECT v.*, p.nama as nama_produk, p.kategori,
                   (v.stok_on_hand - v.stok_reserved) as stok_tersedia
            FROM varian_produk v
            JOIN produk p ON v.produk_id = p.id
            WHERE v.aktif = 1 AND p.aktif = 1
            ORDER BY p.nama ASC, v.nama_varian ASC
        ')->fetchAll();

        return Auth::sanitizeSensitiveFields($varians, $user);
    }

    public static function createProduk(array $body, array $user): array {
        Auth::requireRoles($user, ['Owner', 'Admin Purchasing & Gudang']);
        $nama = trim($body['nama'] ?? '');
        $kategori = trim($body['kategori'] ?? '');
        $deskripsi = trim($body['deskripsi'] ?? '');
        $varians = $body['varians'] ?? [];

        if (!$nama || !$kategori) {
            http_response_code(400);
            return ['error' => 'Nama produk dan kategori wajib diisi.'];
        }
        if (empty($varians)) {
            http_response_code(400);
            return ['error' => 'Minimal harus memiliki satu varian SKU.'];
        }

        $db = Database::getConnection();

        // Check unique SKU
        $checkSku = $db->prepare('SELECT id FROM varian_produk WHERE sku = ?');
        foreach ($varians as $v) {
            $sku = trim($v['sku'] ?? '');
            if (!$sku) {
                http_response_code(400);
                return ['error' => 'Setiap varian wajib memiliki SKU unik.'];
            }
            $checkSku->execute([$sku]);
            if ($checkSku->fetch()) {
                http_response_code(400);
                return ['error' => "SKU '{$sku}' sudah terdaftar pada produk lain."];
            }
        }

        $db->beginTransaction();
        try {
            $stmt = $db->prepare('INSERT INTO produk (nama, kategori, deskripsi, aktif) VALUES (?, ?, ?, 1)');
            $stmt->execute([$nama, $kategori, $deskripsi]);
            $produkId = (int)$db->lastInsertId();

            $insV = $db->prepare('
                INSERT INTO varian_produk (
                    produk_id, sku, barcode, nama_varian, warna, ukuran, satuan,
                    harga_jual_default, stok_min, stok_on_hand, stok_reserved, hpp_rata_rata, aktif
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 1)
            ');

            foreach ($varians as $v) {
                $insV->execute([
                    $produkId,
                    trim($v['sku']),
                    !empty($v['barcode']) ? trim($v['barcode']) : null,
                    !empty($v['nama_varian']) ? trim($v['nama_varian']) : trim($v['sku']),
                    !empty($v['warna']) ? trim($v['warna']) : null,
                    !empty($v['ukuran']) ? trim($v['ukuran']) : null,
                    !empty($v['satuan']) ? trim($v['satuan']) : 'Pcs',
                    (float)($v['harga_jual_default'] ?? 0),
                    (float)($v['stok_min'] ?? 5)
                ]);
            }

            $db->commit();

            BusinessLogic::logAudit($user, 'produk', (string)$produkId, 'CREATE_PRODUK', null, ['nama' => $nama, 'kategori' => $kategori, 'varianCount' => count($varians)]);

            return ['success' => true, 'message' => 'Produk berhasil disimpan.', 'produkId' => $produkId];
        } catch (\Throwable $e) {
            $db->rollBack();
            http_response_code(500);
            return ['error' => $e->getMessage()];
        }
    }

    public static function updateProduk(int $id, array $body, array $user): array {
        Auth::requireRoles($user, ['Owner', 'Admin Purchasing & Gudang']);
        $db = Database::getConnection();
        $stmt = $db->prepare('SELECT * FROM produk WHERE id = ?');
        $stmt->execute([$id]);
        $produk = $stmt->fetch();
        if (!$produk) {
            http_response_code(404);
            return ['error' => 'Produk tidak ditemukan.'];
        }

        $nama = !empty($body['nama']) ? trim($body['nama']) : $produk['nama'];
        $kategori = !empty($body['kategori']) ? trim($body['kategori']) : $produk['kategori'];
        $deskripsi = isset($body['deskripsi']) ? trim($body['deskripsi']) : $produk['deskripsi'];
        $aktif = isset($body['aktif']) ? (int)$body['aktif'] : (int)$produk['aktif'];

        $upd = $db->prepare('UPDATE produk SET nama = ?, kategori = ?, deskripsi = ?, aktif = ? WHERE id = ?');
        $upd->execute([$nama, $kategori, $deskripsi, $aktif, $id]);

        BusinessLogic::logAudit($user, 'produk', (string)$id, 'UPDATE_PRODUK', ['nama' => $produk['nama']], ['nama' => $nama, 'kategori' => $kategori, 'aktif' => $aktif]);

        return ['success' => true, 'message' => 'Data produk berhasil diperbarui.'];
    }

    public static function updateVarian(int $id, array $body, array $user): array {
        Auth::requireRoles($user, ['Owner', 'Admin Purchasing & Gudang']);
        $db = Database::getConnection();
        $stmt = $db->prepare('SELECT * FROM varian_produk WHERE id = ?');
        $stmt->execute([$id]);
        $varian = $stmt->fetch();
        if (!$varian) {
            http_response_code(404);
            return ['error' => 'Varian SKU tidak ditemukan.'];
        }

        $namaVarian = !empty($body['nama_varian']) ? trim($body['nama_varian']) : $varian['nama_varian'];
        $barcode = isset($body['barcode']) ? trim($body['barcode']) : $varian['barcode'];
        $warna = isset($body['warna']) ? trim($body['warna']) : $varian['warna'];
        $ukuran = isset($body['ukuran']) ? trim($body['ukuran']) : $varian['ukuran'];
        $satuan = !empty($body['satuan']) ? trim($body['satuan']) : $varian['satuan'];
        $hargaJual = isset($body['harga_jual_default']) ? (float)$body['harga_jual_default'] : (float)$varian['harga_jual_default'];
        $stokMin = isset($body['stok_min']) ? (float)$body['stok_min'] : (float)$varian['stok_min'];
        $aktif = isset($body['aktif']) ? (int)$body['aktif'] : (int)$varian['aktif'];

        $upd = $db->prepare('
            UPDATE varian_produk
            SET nama_varian = ?, barcode = ?, warna = ?, ukuran = ?, satuan = ?,
                harga_jual_default = ?, stok_min = ?, aktif = ?
            WHERE id = ?
        ');
        $upd->execute([$namaVarian, $barcode ?: null, $warna ?: null, $ukuran ?: null, $satuan, $hargaJual, $stokMin, $aktif, $id]);

        BusinessLogic::logAudit($user, 'varian_produk', (string)$id, 'UPDATE_VARIAN', ['sku' => $varian['sku']], ['nama_varian' => $namaVarian, 'harga_jual' => $hargaJual, 'stok_min' => $stokMin, 'aktif' => $aktif]);

        return ['success' => true, 'message' => 'Data varian SKU berhasil diperbarui.'];
    }

    // --- CHANNELS ---

    public static function getChannels(): array {
        $db = Database::getConnection();
        return $db->query('
            SELECT c.*, a.nama as nama_akun_kas
            FROM channel_penjualan c
            LEFT JOIN akun_kas_bank a ON c.akun_kas_id = a.id
            ORDER BY c.id ASC
        ')->fetchAll();
    }

    public static function createChannel(array $body, array $user): array {
        Auth::requireRoles($user, ['Owner', 'Admin Keuangan']);
        $nama = trim($body['nama'] ?? '');
        $tipe = trim($body['tipe'] ?? '');
        $komisiPersen = (float)($body['komisi_persen'] ?? 0);
        $komisiTetap = (float)($body['komisi_tetap'] ?? 0);
        $akunKasId = !empty($body['akun_kas_id']) ? (int)$body['akun_kas_id'] : null;

        if (!$nama || !$tipe) {
            http_response_code(400);
            return ['error' => 'Nama dan tipe channel wajib diisi.'];
        }

        $db = Database::getConnection();
        $stmt = $db->prepare('INSERT INTO channel_penjualan (nama, tipe, komisi_persen, komisi_tetap, akun_kas_id, aktif) VALUES (?, ?, ?, ?, ?, 1)');
        $stmt->execute([$nama, $tipe, $komisiPersen, $komisiTetap, $akunKasId]);
        $channelId = (int)$db->lastInsertId();

        BusinessLogic::logAudit($user, 'channel_penjualan', (string)$channelId, 'CREATE_CHANNEL', null, ['nama' => $nama, 'tipe' => $tipe, 'komisi_persen' => $komisiPersen]);

        return ['success' => true, 'message' => 'Channel penjualan berhasil ditambahkan.'];
    }

    public static function updateChannel(int $id, array $body, array $user): array {
        Auth::requireRoles($user, ['Owner', 'Admin Keuangan']);
        $db = Database::getConnection();
        $stmt = $db->prepare('SELECT * FROM channel_penjualan WHERE id = ?');
        $stmt->execute([$id]);
        $channel = $stmt->fetch();
        if (!$channel) {
            http_response_code(404);
            return ['error' => 'Channel tidak ditemukan.'];
        }

        $nama = !empty($body['nama']) ? trim($body['nama']) : $channel['nama'];
        $tipe = !empty($body['tipe']) ? trim($body['tipe']) : $channel['tipe'];
        $komisiPersen = isset($body['komisi_persen']) ? (float)$body['komisi_persen'] : (float)$channel['komisi_persen'];
        $komisiTetap = isset($body['komisi_tetap']) ? (float)$body['komisi_tetap'] : (float)$channel['komisi_tetap'];
        $akunKasId = isset($body['akun_kas_id']) ? ($body['akun_kas_id'] ? (int)$body['akun_kas_id'] : null) : $channel['akun_kas_id'];
        $aktif = isset($body['aktif']) ? (int)$body['aktif'] : (int)$channel['aktif'];

        $upd = $db->prepare('UPDATE channel_penjualan SET nama = ?, tipe = ?, komisi_persen = ?, komisi_tetap = ?, akun_kas_id = ?, aktif = ? WHERE id = ?');
        $upd->execute([$nama, $tipe, $komisiPersen, $komisiTetap, $akunKasId, $aktif, $id]);

        BusinessLogic::logAudit($user, 'channel_penjualan', (string)$id, 'UPDATE_CHANNEL', ['nama' => $channel['nama']], ['nama' => $nama, 'komisi_persen' => $komisiPersen, 'aktif' => $aktif]);

        return ['success' => true, 'message' => 'Data channel berhasil diperbarui.'];
    }

    // --- AKUN KAS & BANK ---

    public static function getAkunKas(): array {
        $db = Database::getConnection();
        return $db->query('SELECT * FROM akun_kas_bank ORDER BY id ASC')->fetchAll();
    }

    public static function createAkunKas(array $body, array $user): array {
        Auth::requireRoles($user, ['Owner', 'Admin Keuangan']);
        $nama = trim($body['nama'] ?? '');
        $tipeAkun = trim($body['tipe_akun'] ?? '');
        $saldoAwal = (float)($body['saldo_awal'] ?? 0);
        $tglAwal = !empty($body['tanggal_saldo_awal']) ? $body['tanggal_saldo_awal'] : gmdate('Y-m-d');

        if (!$nama || !$tipeAkun) {
            http_response_code(400);
            return ['error' => 'Nama dan tipe akun wajib diisi.'];
        }

        $db = Database::getConnection();
        $stmt = $db->prepare('INSERT INTO akun_kas_bank (nama, tipe_akun, saldo_awal, tanggal_saldo_awal, saldo_saat_ini, aktif) VALUES (?, ?, ?, ?, ?, 1)');
        $stmt->execute([$nama, $tipeAkun, $saldoAwal, $tglAwal, $saldoAwal]);
        $akunId = (int)$db->lastInsertId();

        BusinessLogic::logAudit($user, 'akun_kas_bank', (string)$akunId, 'CREATE_AKUN', null, ['nama' => $nama, 'tipe_akun' => $tipeAkun, 'saldo_awal' => $saldoAwal]);

        return ['success' => true, 'message' => 'Akun kas/bank berhasil dibuat.'];
    }

    public static function updateAkunKas(int $id, array $body, array $user): array {
        Auth::requireRoles($user, ['Owner', 'Admin Keuangan']);
        $db = Database::getConnection();
        $stmt = $db->prepare('SELECT * FROM akun_kas_bank WHERE id = ?');
        $stmt->execute([$id]);
        $akun = $stmt->fetch();
        if (!$akun) {
            http_response_code(404);
            return ['error' => 'Akun kas/bank tidak ditemukan.'];
        }

        $nama = !empty($body['nama']) ? trim($body['nama']) : $akun['nama'];
        $tipeAkun = !empty($body['tipe_akun']) ? trim($body['tipe_akun']) : $akun['tipe_akun'];
        $aktif = isset($body['aktif']) ? (int)$body['aktif'] : (int)$akun['aktif'];

        $upd = $db->prepare('UPDATE akun_kas_bank SET nama = ?, tipe_akun = ?, aktif = ? WHERE id = ?');
        $upd->execute([$nama, $tipeAkun, $aktif, $id]);

        BusinessLogic::logAudit($user, 'akun_kas_bank', (string)$id, 'UPDATE_AKUN', ['nama' => $akun['nama']], ['nama' => $nama, 'tipe_akun' => $tipeAkun, 'aktif' => $aktif]);

        return ['success' => true, 'message' => 'Data akun kas berhasil diperbarui.'];
    }

    // --- SUPPLIER & PELANGGAN ---

    public static function getSuppliers(): array {
        $db = Database::getConnection();
        return $db->query('SELECT * FROM supplier ORDER BY nama ASC')->fetchAll();
    }

    public static function createSupplier(array $body, array $user): array {
        Auth::requireRoles($user, ['Owner', 'Admin Purchasing & Gudang']);
        $nama = trim($body['nama'] ?? '');
        if (!$nama) {
            http_response_code(400);
            return ['error' => 'Nama supplier wajib diisi.'];
        }

        $kontak = !empty($body['kontak']) ? trim($body['kontak']) : null;
        $telepon = !empty($body['telepon']) ? trim($body['telepon']) : null;
        $alamat = !empty($body['alamat']) ? trim($body['alamat']) : null;
        $terminHari = (int)($body['termin_hari'] ?? 0);

        $db = Database::getConnection();
        $stmt = $db->prepare('INSERT INTO supplier (nama, kontak, telepon, alamat, termin_hari, aktif) VALUES (?, ?, ?, ?, ?, 1)');
        $stmt->execute([$nama, $kontak, $telepon, $alamat, $terminHari]);
        $supId = (int)$db->lastInsertId();

        BusinessLogic::logAudit($user, 'supplier', (string)$supId, 'CREATE_SUPPLIER', null, ['nama' => $nama, 'termin_hari' => $terminHari]);

        return ['success' => true, 'message' => 'Supplier berhasil disimpan.'];
    }

    public static function getPelanggan(): array {
        $db = Database::getConnection();
        return $db->query('SELECT * FROM pelanggan ORDER BY nama ASC')->fetchAll();
    }

    public static function createPelanggan(array $body, array $user): array {
        $nama = trim($body['nama'] ?? '');
        if (!$nama) {
            http_response_code(400);
            return ['error' => 'Nama pelanggan wajib diisi.'];
        }

        $telepon = !empty($body['telepon']) ? trim($body['telepon']) : null;
        $email = !empty($body['email']) ? trim($body['email']) : null;
        $alamat = !empty($body['alamat']) ? trim($body['alamat']) : null;
        $tipeMember = !empty($body['tipe_member']) ? trim($body['tipe_member']) : 'Reguler';

        $db = Database::getConnection();
        $stmt = $db->prepare('INSERT INTO pelanggan (nama, telepon, email, alamat, tipe_member, aktif) VALUES (?, ?, ?, ?, ?, 1)');
        $stmt->execute([$nama, $telepon, $email, $alamat, $tipeMember]);
        $pelId = (int)$db->lastInsertId();

        BusinessLogic::logAudit($user, 'pelanggan', (string)$pelId, 'CREATE_PELANGGAN', null, ['nama' => $nama, 'tipe_member' => $tipeMember]);

        return ['success' => true, 'message' => 'Pelanggan berhasil disimpan.', 'pelangganId' => $pelId];
    }

    // --- KATEGORI BIAYA (COA) ---

    public static function getKategoriBiaya(): array {
        $db = Database::getConnection();
        return $db->query('SELECT * FROM kategori_biaya ORDER BY kode_akun ASC')->fetchAll();
    }

    public static function createKategoriBiaya(array $body, array $user): array {
        Auth::requireRoles($user, ['Owner', 'Admin Keuangan']);
        $kodeAkun = trim($body['kode_akun'] ?? '');
        $nama = trim($body['nama'] ?? '');
        $kelompok = trim($body['kelompok_laporan'] ?? '');

        if (!$kodeAkun || !$nama || !$kelompok) {
            http_response_code(400);
            return ['error' => 'Kode akun, nama, dan kelompok laporan wajib diisi.'];
        }

        $db = Database::getConnection();
        $chk = $db->prepare('SELECT id FROM kategori_biaya WHERE kode_akun = ?');
        $chk->execute([$kodeAkun]);
        if ($chk->fetch()) {
            http_response_code(400);
            return ['error' => 'Kode akun sudah terdaftar.'];
        }

        $stmt = $db->prepare('INSERT INTO kategori_biaya (kode_akun, nama, kelompok_laporan, aktif) VALUES (?, ?, ?, 1)');
        $stmt->execute([$kodeAkun, $nama, $kelompok]);
        $catId = (int)$db->lastInsertId();

        BusinessLogic::logAudit($user, 'kategori_biaya', (string)$catId, 'CREATE_COA', null, ['kode_akun' => $kodeAkun, 'nama' => $nama, 'kelompok_laporan' => $kelompok]);

        return ['success' => true, 'message' => 'Kategori biaya berhasil disimpan.'];
    }

    // --- PENGATURAN SISTEM ---

    public static function getPengaturan(): array {
        $db = Database::getConnection();
        $rows = $db->query('SELECT * FROM pengaturan_sistem')->fetchAll();
        $obj = [];
        foreach ($rows as $r) {
            $obj[$r['kunci']] = $r['nilai'];
        }
        return $obj;
    }

    public static function updatePengaturan(array $body, array $user): array {
        Auth::requireRoles($user, ['Owner']);
        $db = Database::getConnection();
        $stmt = $db->prepare('
            INSERT INTO pengaturan_sistem (kunci, nilai) VALUES (?, ?)
            ON CONFLICT(kunci) DO UPDATE SET nilai = excluded.nilai
        ');

        foreach ($body as $k => $v) {
            $stmt->execute([$k, (string)$v]);
        }

        BusinessLogic::logAudit($user, 'pengaturan_sistem', 'ALL', 'UPDATE_SETTINGS', null, $body);

        return ['success' => true, 'message' => 'Pengaturan sistem berhasil diperbarui.'];
    }
}
