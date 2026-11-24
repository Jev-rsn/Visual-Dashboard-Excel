<?php
// php/controllers/PenjualanController.php

declare(strict_types=1);

require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../Auth.php';
require_once __DIR__ . '/../BusinessLogic.php';

class PenjualanController {
    public static function list(array $params, array $user): array {
        $db = Database::getConnection();

        $query = '
            SELECT pj.*, c.nama as nama_channel, c.tipe as tipe_channel, a.nama as nama_akun_kas
            FROM penjualan pj
            JOIN channel_penjualan c ON pj.channel_id = c.id
            LEFT JOIN akun_kas_bank a ON pj.akun_kas_id = a.id
            WHERE 1=1
        ';
        $sqlParams = [];

        if (!empty($params['tipe'])) {
            $query .= ' AND pj.tipe = ?';
            $sqlParams[] = $params['tipe'];
        }
        if (!empty($params['channel_id'])) {
            $query .= ' AND pj.channel_id = ?';
            $sqlParams[] = (int)$params['channel_id'];
        }
        if (!empty($params['status'])) {
            $query .= ' AND pj.status = ?';
            $sqlParams[] = $params['status'];
        }
        if (!empty($params['tgl_mulai'])) {
            $query .= ' AND pj.tanggal >= ?';
            $sqlParams[] = $params['tgl_mulai'];
        }
        if (!empty($params['tgl_selesai'])) {
            $query .= ' AND pj.tanggal <= ?';
            $sqlParams[] = $params['tgl_selesai'];
        }

        $limit = !empty($params['limit']) ? (int)$params['limit'] : 100;
        $query .= " ORDER BY pj.id DESC LIMIT {$limit}";

        $stmt = $db->prepare($query);
        $stmt->execute($sqlParams);
        $list = $stmt->fetchAll();

        return Auth::sanitizeSensitiveFields($list, $user);
    }

    public static function get(int $id, array $user): array {
        $db = Database::getConnection();

        $stmt = $db->prepare('
            SELECT pj.*, c.nama as nama_channel, c.tipe as tipe_channel, a.nama as nama_akun_kas
            FROM penjualan pj
            JOIN channel_penjualan c ON pj.channel_id = c.id
            LEFT JOIN akun_kas_bank a ON pj.akun_kas_id = a.id
            WHERE pj.id = ?
        ');
        $stmt->execute([$id]);
        $sale = $stmt->fetch();
        if (!$sale) {
            http_response_code(404);
            return ['error' => 'Data penjualan tidak ditemukan.'];
        }

        $stmtItems = $db->prepare('
            SELECT dp.*, v.sku, v.nama_varian, p.nama as nama_produk, v.satuan
            FROM detail_penjualan dp
            JOIN varian_produk v ON dp.varian_id = v.id
            JOIN produk p ON v.produk_id = p.id
            WHERE dp.penjualan_id = ?
            ORDER BY dp.id ASC
        ');
        $stmtItems->execute([$id]);
        $items = $stmtItems->fetchAll();

        $stmtReturs = $db->prepare('SELECT * FROM retur_penjualan WHERE penjualan_id = ?');
        $stmtReturs->execute([$id]);
        $returs = $stmtReturs->fetchAll();

        $sale['items'] = $items;
        $sale['returs'] = $returs;

        return Auth::sanitizeSensitiveFields($sale, $user);
    }

    public static function create(array $body, array $user): array {
        try {
            $body['user'] = $user;
            $res = BusinessLogic::createPenjualan($body);
            return array_merge(['success' => true, 'message' => 'Transaksi penjualan berhasil disimpan.'], $res);
        } catch (\Throwable $e) {
            http_response_code(400);
            return ['error' => $e->getMessage()];
        }
    }

    public static function updateStatus(int $id, array $body, array $user): array {
        $statusBaru = $body['status_baru'] ?? $body['status'] ?? '';
        if (!$statusBaru) {
            http_response_code(400);
            return ['error' => 'Status baru wajib diisi.'];
        }

        try {
            return BusinessLogic::updateStatusPenjualan($id, $statusBaru, $user);
        } catch (\Throwable $e) {
            http_response_code(400);
            return ['error' => $e->getMessage()];
        }
    }

    public static function void(int $id, array $body, array $user): array {
        Auth::requireRoles($user, ['Owner']);
        $alasan = trim($body['alasan'] ?? '');
        try {
            return BusinessLogic::voidPenjualan($id, $alasan, $user);
        } catch (\Throwable $e) {
            http_response_code(400);
            return ['error' => $e->getMessage()];
        }
    }
}
