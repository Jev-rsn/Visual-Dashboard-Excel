<?php
// php/controllers/BiayaKasController.php

declare(strict_types=1);

require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../Auth.php';
require_once __DIR__ . '/../BusinessLogic.php';

class BiayaKasController {
    // --- BIAYA OPERASIONAL ---

    public static function listBiaya(array $params, array $user): array {
        Auth::requireRoles($user, ['Owner', 'Admin Keuangan']);
        $db = Database::getConnection();

        $query = '
            SELECT b.*, k.nama as nama_kategori, k.kode_akun, k.kelompok_laporan,
                   c.nama as nama_channel, a.nama as nama_akun_kas
            FROM biaya_operasional b
            JOIN kategori_biaya k ON b.kategori_id = k.id
            LEFT JOIN channel_penjualan c ON b.channel_id = c.id
            JOIN akun_kas_bank a ON b.akun_kas_id = a.id
            WHERE 1=1
        ';
        $sqlParams = [];

        if (isset($params['channel_id']) && $params['channel_id'] !== '') {
            if ($params['channel_id'] === 'null' || $params['channel_id'] === 'umum') {
                $query .= ' AND b.channel_id IS NULL';
            } else {
                $query .= ' AND b.channel_id = ?';
                $sqlParams[] = (int)$params['channel_id'];
            }
        }
        if (!empty($params['kategori_id'])) {
            $query .= ' AND b.kategori_id = ?';
            $sqlParams[] = (int)$params['kategori_id'];
        }
        if (!empty($params['tgl_mulai'])) {
            $query .= ' AND b.tanggal >= ?';
            $sqlParams[] = $params['tgl_mulai'];
        }
        if (!empty($params['tgl_selesai'])) {
            $query .= ' AND b.tanggal <= ?';
            $sqlParams[] = $params['tgl_selesai'];
        }

        $query .= ' ORDER BY b.id DESC';
        $stmt = $db->prepare($query);
        $stmt->execute($sqlParams);
        return $stmt->fetchAll();
    }

    public static function createBiaya(array $body, array $user): array {
        Auth::requireRoles($user, ['Owner', 'Admin Keuangan']);
        try {
            $body['user'] = $user;
            $res = BusinessLogic::createBiayaOperasional($body);
            return array_merge(['success' => true, 'message' => 'Biaya operasional berhasil dicatat.'], $res);
        } catch (\Throwable $e) {
            http_response_code(400);
            return ['error' => $e->getMessage()];
        }
    }

    // --- MUTASI KAS ---

    public static function listMutasi(array $user): array {
        Auth::requireRoles($user, ['Owner', 'Admin Keuangan']);
        $db = Database::getConnection();

        return $db->query('
            SELECT m.*, asal.nama as nama_akun_asal, tujuan.nama as nama_akun_tujuan
            FROM mutasi_kas m
            JOIN akun_kas_bank asal ON m.akun_asal_id = asal.id
            JOIN akun_kas_bank tujuan ON m.akun_tujuan_id = tujuan.id
            ORDER BY m.id DESC
        ')->fetchAll();
    }

    public static function createMutasi(array $body, array $user): array {
        Auth::requireRoles($user, ['Owner', 'Admin Keuangan']);
        try {
            $body['user'] = $user;
            $res = BusinessLogic::createMutasiKas($body);
            return array_merge(['success' => true, 'message' => 'Mutasi kas berhasil diproses.'], $res);
        } catch (\Throwable $e) {
            http_response_code(400);
            return ['error' => $e->getMessage()];
        }
    }
}
