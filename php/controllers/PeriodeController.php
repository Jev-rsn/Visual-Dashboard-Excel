<?php
// php/controllers/PeriodeController.php

declare(strict_types=1);

require_once __DIR__ . '/../Database.php';
require_once __DIR__ . '/../Auth.php';
require_once __DIR__ . '/../BusinessLogic.php';

class PeriodeController {
    public static function list(array $user): array {
        Auth::requireRoles($user, ['Owner', 'Admin Keuangan']);
        $db = Database::getConnection();

        $periods = $db->query('SELECT * FROM periode_akuntansi ORDER BY tahun DESC, bulan DESC')->fetchAll();
        $stmtSnap = $db->prepare('SELECT * FROM snapshot_periode WHERE periode_id = ?');

        $result = [];
        foreach ($periods as $p) {
            $stmtSnap->execute([$p['id']]);
            $p['snapshots'] = $stmtSnap->fetchAll();
            $result[] = $p;
        }

        return $result;
    }

    public static function tutup(array $body, array $user): array {
        Auth::requireRoles($user, ['Owner']);
        $bulan = (int)($body['bulan'] ?? 0);
        $tahun = (int)($body['tahun'] ?? 0);

        if (!$bulan || !$tahun) {
            http_response_code(400);
            return ['error' => 'Bulan dan tahun wajib diisi.'];
        }

        try {
            return BusinessLogic::closeAccountingPeriod($bulan, $tahun, $user);
        } catch (\Throwable $e) {
            http_response_code(400);
            return ['error' => $e->getMessage()];
        }
    }

    public static function buka(array $body, array $user): array {
        Auth::requireRoles($user, ['Owner']);
        $bulan = (int)($body['bulan'] ?? 0);
        $tahun = (int)($body['tahun'] ?? 0);
        $alasan = trim($body['alasan'] ?? '');

        if (!$bulan || !$tahun || !$alasan) {
            http_response_code(400);
            return ['error' => 'Bulan, tahun, dan alasan pembukaan wajib diisi.'];
        }

        try {
            return BusinessLogic::reopenAccountingPeriod($bulan, $tahun, $alasan, $user);
        } catch (\Throwable $e) {
            http_response_code(400);
            return ['error' => $e->getMessage()];
        }
    }
}
