<?php
// php/controllers/ReturController.php

declare(strict_types=1);

require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../Auth.php';
require_once __DIR__ . '/../BusinessLogic.php';

class ReturController {
    public static function list(array $user): array {
        $db = Database::getConnection();
        $returs = $db->query('
            SELECT r.*, pj.no_invoice, a.nama as nama_akun_kas
            FROM retur_penjualan r
            JOIN penjualan pj ON r.penjualan_id = pj.id
            LEFT JOIN akun_kas_bank a ON r.akun_kas_id = a.id
            ORDER BY r.id DESC
        ')->fetchAll();

        return Auth::sanitizeSensitiveFields($returs, $user);
    }

    public static function get(int $id, array $user): array {
        $db = Database::getConnection();
        $stmt = $db->prepare('
            SELECT r.*, pj.no_invoice, a.nama as nama_akun_kas
            FROM retur_penjualan r
            JOIN penjualan pj ON r.penjualan_id = pj.id
            LEFT JOIN akun_kas_bank a ON r.akun_kas_id = a.id
            WHERE r.id = ?
        ');
        $stmt->execute([$id]);
        $retur = $stmt->fetch();
        if (!$retur) {
            http_response_code(404);
            return ['error' => 'Data retur tidak ditemukan.'];
        }

        $stmtItems = $db->prepare('
            SELECT dr.*, v.sku, v.nama_varian, p.nama as nama_produk
            FROM detail_retur dr
            JOIN varian_produk v ON dr.varian_id = v.id
            JOIN produk p ON v.produk_id = p.id
            WHERE dr.retur_id = ?
        ');
        $stmtItems->execute([$id]);
        $retur['items'] = $stmtItems->fetchAll();

        return Auth::sanitizeSensitiveFields($retur, $user);
    }

    public static function create(array $body, array $user): array {
        try {
            $body['user'] = $user;
            $res = BusinessLogic::createReturPenjualan($body);
            return array_merge(['success' => true, 'message' => 'Retur penjualan berhasil diproses.'], $res);
        } catch (\Throwable $e) {
            http_response_code(400);
            return ['error' => $e->getMessage()];
        }
    }
}
