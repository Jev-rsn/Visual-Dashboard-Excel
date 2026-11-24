<?php
// php/controllers/StokController.php

declare(strict_types=1);

require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../Auth.php';
require_once __DIR__ . '/../BusinessLogic.php';

class StokController {
    public static function getStatus(array $params, array $user): array {
        $db = Database::getConnection();

        $query = '
            SELECT v.*, p.nama as nama_produk, p.kategori,
                   (v.stok_on_hand - v.stok_reserved) as stok_tersedia,
                   (v.stok_on_hand * v.hpp_rata_rata) as nilai_persediaan
            FROM varian_produk v
            JOIN produk p ON v.produk_id = p.id
            WHERE v.aktif = 1 AND p.aktif = 1
        ';
        $sqlParams = [];

        if (!empty($params['search'])) {
            $query .= ' AND (v.sku LIKE ? OR v.nama_varian LIKE ? OR p.nama LIKE ? OR v.barcode LIKE ?)';
            $s = '%' . $params['search'] . '%';
            $sqlParams[] = $s;
            $sqlParams[] = $s;
            $sqlParams[] = $s;
            $sqlParams[] = $s;
        }

        $query .= ' ORDER BY p.nama ASC, v.nama_varian ASC';

        $stmt = $db->prepare($query);
        $stmt->execute($sqlParams);
        $rows = $stmt->fetchAll();

        $evaluated = [];
        foreach ($rows as $r) {
            $tersedia = (float)$r['stok_tersedia'];
            $min = (float)$r['stok_min'];

            $statusStok = 'AMAN';
            if ($tersedia <= 0) {
                $statusStok = 'HABIS';
            } elseif ($tersedia <= $min) {
                $statusStok = 'RESTOCK';
            }

            $r['status_stok'] = $statusStok;
            $evaluated[] = $r;
        }

        if (!empty($params['status'])) {
            $filterStatus = $params['status'];
            $evaluated = array_values(array_filter($evaluated, function($r) use ($filterStatus) {
                return $r['status_stok'] === $filterStatus;
            }));
        }

        return Auth::sanitizeSensitiveFields($evaluated, $user);
    }

    public static function getKartu(int $varianId, array $user): array {
        $db = Database::getConnection();

        $stmt = $db->prepare('
            SELECT v.*, p.nama as nama_produk
            FROM varian_produk v
            JOIN produk p ON v.produk_id = p.id
            WHERE v.id = ?
        ');
        $stmt->execute([$varianId]);
        $varian = $stmt->fetch();
        if (!$varian) {
            http_response_code(404);
            return ['error' => 'Varian SKU tidak ditemukan.'];
        }

        $stmtM = $db->prepare('SELECT * FROM mutasi_stok WHERE varian_id = ? ORDER BY id ASC');
        $stmtM->execute([$varianId]);
        $mutasi = $stmtM->fetchAll();

        return Auth::sanitizeSensitiveFields(['varian' => $varian, 'mutasi' => $mutasi], $user);
    }

    public static function listOpname(array $user): array {
        Auth::requireRoles($user, ['Owner', 'Admin Purchasing & Gudang']);
        $db = Database::getConnection();
        return $db->query('SELECT * FROM sesi_opname ORDER BY id DESC')->fetchAll();
    }

    public static function getOpname(int $id, array $user): array {
        Auth::requireRoles($user, ['Owner', 'Admin Purchasing & Gudang']);
        $db = Database::getConnection();

        $stmt = $db->prepare('SELECT * FROM sesi_opname WHERE id = ?');
        $stmt->execute([$id]);
        $sesi = $stmt->fetch();
        if (!$sesi) {
            http_response_code(404);
            return ['error' => 'Sesi opname tidak ditemukan.'];
        }

        $stmtD = $db->prepare('
            SELECT d.*, v.sku, v.nama_varian, p.nama as nama_produk, v.satuan
            FROM detail_sesi_opname d
            JOIN varian_produk v ON d.varian_id = v.id
            JOIN produk p ON v.produk_id = p.id
            WHERE d.sesi_id = ?
            ORDER BY p.nama ASC, v.nama_varian ASC
        ');
        $stmtD->execute([$id]);
        $sesi['details'] = $stmtD->fetchAll();

        return $sesi;
    }

    public static function createOpname(array $body, array $user): array {
        Auth::requireRoles($user, ['Owner', 'Admin Purchasing & Gudang']);
        $tanggal = !empty($body['tanggal']) ? $body['tanggal'] : gmdate('Y-m-d');
        BusinessLogic::assertOpenPeriod($tanggal);

        $items = $body['items'] ?? [];
        if (empty($items)) {
            http_response_code(400);
            return ['error' => 'Daftar item opname tidak boleh kosong.'];
        }

        $noSesi = 'OPN-' . strtoupper(dechex(time())) . '-' . rand(100, 999);
        $now = gmdate('Y-m-d\TH:i:s\Z');

        $db = Database::getConnection();
        $db->beginTransaction();
        try {
            $stmt = $db->prepare("
                INSERT INTO sesi_opname (no_sesi, tanggal, status, catatan, diajukan_oleh, created_at)
                VALUES (?, ?, 'Draft', ?, ?, ?)
            ");
            $stmt->execute([$noSesi, $tanggal, $body['catatan'] ?? '', $user['nama'], $now]);
            $sesiId = (int)$db->lastInsertId();

            $insDetail = $db->prepare('
                INSERT INTO detail_sesi_opname (sesi_id, varian_id, qty_sistem, qty_fisik, selisih_qty, hpp_unit, selisih_nilai)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ');

            $getVar = $db->prepare('SELECT * FROM varian_produk WHERE id = ?');
            foreach ($items as $it) {
                $getVar->execute([(int)$it['varian_id']]);
                $varian = $getVar->fetch();
                if (!$varian) continue;

                $qtySistem = (float)$varian['stok_on_hand'];
                $qtyFisik = (float)$it['qty_fisik'];
                $selisihQty = $qtyFisik - $qtySistem;
                $hppUnit = (float)$varian['hpp_rata_rata'];
                $selisihNilai = $selisihQty * $hppUnit;

                $insDetail->execute([$sesiId, $varian['id'], $qtySistem, $qtyFisik, $selisihQty, $hppUnit, $selisihNilai]);
            }

            $db->commit();

            BusinessLogic::logAudit($user, 'sesi_opname', $noSesi, 'CREATE_OPNAME', null, ['itemCount' => count($items)]);

            return ['success' => true, 'message' => 'Draf stok opname berhasil dibuat.', 'sesiId' => $sesiId, 'noSesi' => $noSesi];
        } catch (\Throwable $e) {
            $db->rollBack();
            http_response_code(400);
            return ['error' => $e->getMessage()];
        }
    }

    public static function ajukanOpname(int $id, array $user): array {
        Auth::requireRoles($user, ['Owner', 'Admin Purchasing & Gudang']);
        $db = Database::getConnection();

        $stmt = $db->prepare('SELECT * FROM sesi_opname WHERE id = ?');
        $stmt->execute([$id]);
        $sesi = $stmt->fetch();
        if (!$sesi) {
            http_response_code(404);
            return ['error' => 'Sesi opname tidak ditemukan.'];
        }
        if ($sesi['status'] !== 'Draft') {
            http_response_code(400);
            return ['error' => 'Hanya draf yang dapat diajukan.'];
        }

        $db->prepare("UPDATE sesi_opname SET status = 'Diajukan', diajukan_oleh = ? WHERE id = ?")->execute([$user['nama'], $id]);

        BusinessLogic::logAudit($user, 'sesi_opname', $sesi['no_sesi'], 'SUBMIT_OPNAME', ['status' => 'Draft'], ['status' => 'Diajukan']);

        return ['success' => true, 'message' => 'Sesi opname telah diajukan ke Owner untuk persetujuan.'];
    }

    public static function setujuiOpname(int $id, array $body, array $user): array {
        Auth::requireRoles($user, ['Owner']);
        $alasan = trim($body['alasan'] ?? '');
        try {
            return BusinessLogic::approveOpnameSession($id, $alasan, $user);
        } catch (\Throwable $e) {
            http_response_code(400);
            return ['error' => $e->getMessage()];
        }
    }
}
