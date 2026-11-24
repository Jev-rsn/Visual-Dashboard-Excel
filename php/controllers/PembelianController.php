<?php
// php/controllers/PembelianController.php

declare(strict_types=1);

require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../Auth.php';
require_once __DIR__ . '/../BusinessLogic.php';

class PembelianController {
    public static function list(array $params, array $user): array {
        Auth::requireRoles($user, ['Owner', 'Admin Purchasing & Gudang', 'Admin Keuangan']);
        $db = Database::getConnection();

        $query = '
            SELECT p.*, s.nama as nama_supplier, a.nama as nama_akun_kas
            FROM pembelian p
            JOIN supplier s ON p.supplier_id = s.id
            LEFT JOIN akun_kas_bank a ON p.akun_kas_id = a.id
            WHERE 1=1
        ';
        $sqlParams = [];

        if (!empty($params['status'])) {
            $query .= ' AND p.status = ?';
            $sqlParams[] = $params['status'];
        }
        if (!empty($params['supplier_id'])) {
            $query .= ' AND p.supplier_id = ?';
            $sqlParams[] = (int)$params['supplier_id'];
        }

        $limit = !empty($params['limit']) ? (int)$params['limit'] : 50;
        $query .= " ORDER BY p.id DESC LIMIT {$limit}";

        $stmt = $db->prepare($query);
        $stmt->execute($sqlParams);
        return $stmt->fetchAll();
    }

    public static function get(int $id, array $user): array {
        Auth::requireRoles($user, ['Owner', 'Admin Purchasing & Gudang', 'Admin Keuangan']);
        $db = Database::getConnection();

        $stmt = $db->prepare('
            SELECT p.*, s.nama as nama_supplier, a.nama as nama_akun_kas
            FROM pembelian p
            JOIN supplier s ON p.supplier_id = s.id
            LEFT JOIN akun_kas_bank a ON p.akun_kas_id = a.id
            WHERE p.id = ?
        ');
        $stmt->execute([$id]);
        $pembelian = $stmt->fetch();
        if (!$pembelian) {
            http_response_code(404);
            return ['error' => 'Pembelian tidak ditemukan.'];
        }

        $stmtItems = $db->prepare('
            SELECT dp.*, v.sku, v.nama_varian, p.nama as nama_produk, v.satuan
            FROM detail_pembelian dp
            JOIN varian_produk v ON dp.varian_id = v.id
            JOIN produk p ON v.produk_id = p.id
            WHERE dp.pembelian_id = ?
            ORDER BY dp.id ASC
        ');
        $stmtItems->execute([$id]);
        $items = $stmtItems->fetchAll();

        $stmtPel = $db->prepare('
            SELECT pu.*, a.nama as nama_akun_kas
            FROM pelunasan_utang pu
            JOIN akun_kas_bank a ON pu.akun_kas_id = a.id
            WHERE pu.pembelian_id = ?
            ORDER BY pu.id ASC
        ');
        $stmtPel->execute([$id]);
        $pelunasan = $stmtPel->fetchAll();

        $pembelian['items'] = $items;
        $pembelian['pelunasan'] = $pelunasan;
        return $pembelian;
    }

    public static function create(array $body, array $user): array {
        Auth::requireRoles($user, ['Owner', 'Admin Purchasing & Gudang']);
        try {
            $body['user'] = $user;
            $res = BusinessLogic::postPembelian($body);
            return array_merge(['success' => true, 'message' => 'Pembelian berhasil diposting dan HPP telah diperbarui.'], $res);
        } catch (\Throwable $e) {
            http_response_code(400);
            return ['error' => $e->getMessage()];
        }
    }

    public static function listUtang(array $user): array {
        Auth::requireRoles($user, ['Owner', 'Admin Keuangan']);
        $db = Database::getConnection();

        $stmt = $db->query("
            SELECT p.id, p.no_faktur, p.tanggal, p.jatuh_tempo, p.total_biaya, p.sisa_utang,
                   s.id as supplier_id, s.nama as nama_supplier, s.telepon
            FROM pembelian p
            JOIN supplier s ON p.supplier_id = s.id
            WHERE p.status = 'Posted' AND p.status_bayar = 'Utang' AND p.sisa_utang > 0
            ORDER BY p.jatuh_tempo ASC
        ");
        $list = $stmt->fetchAll();

        $now = time();
        $enhanced = [];
        foreach ($list as $item) {
            $tglTime = strtotime($item['tanggal']);
            $umurHari = max(0, (int)floor(($now - $tglTime) / (60 * 60 * 24)));

            $statusTempo = 'Belum Jatuh Tempo';
            if (!empty($item['jatuh_tempo'])) {
                $dueTime = strtotime($item['jatuh_tempo']);
                $diffDue = (int)floor(($dueTime - $now) / (60 * 60 * 24));
                if ($diffDue < 0) {
                    $statusTempo = 'Lewat ' . abs($diffDue) . ' hari';
                } else {
                    $statusTempo = "{$diffDue} hari lagi";
                }
            }

            $item['umur_hari'] = $umurHari;
            $item['status_tempo'] = $statusTempo;
            $enhanced[] = $item;
        }

        return $enhanced;
    }

    public static function pelunasanUtang(array $body, array $user): array {
        Auth::requireRoles($user, ['Owner', 'Admin Keuangan']);
        try {
            $body['user'] = $user;
            $res = BusinessLogic::settleUtang($body);
            return array_merge(['success' => true, 'message' => 'Pelunasan utang berhasil dicatat.'], $res);
        } catch (\Throwable $e) {
            http_response_code(400);
            return ['error' => $e->getMessage()];
        }
    }
}
