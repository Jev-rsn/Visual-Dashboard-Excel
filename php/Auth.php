<?php
// php/Auth.php

require_once __DIR__ . '/Database.php';

class Auth {
    // In-memory or file-backed session storage for PHP
    private static string $sessionFile = __DIR__ . '/../data/sessions.json';

    private static function loadSessions(): array {
        if (file_exists(self::$sessionFile)) {
            $data = json_decode(file_get_contents(self::$sessionFile), true);
            return is_array($data) ? $data : [];
        }
        return [];
    }

    private static function saveSessions(array $sessions): void {
        file_put_contents(self::$sessionFile, json_encode($sessions, JSON_PRETTY_PRINT));
    }

    public static function createSession(array $user, bool $isPosMode = false): array {
        $token = bin2hex(random_bytes(32));
        $duration = $isPosMode ? 8 * 3600 : 1800; // 30 mins non-pos, 8 hrs pos
        $expiresAt = time() + $duration;

        $sessionData = [
            'user' => [
                'id' => (int)$user['id'],
                'nama' => $user['nama'],
                'email' => $user['email'],
                'peran' => $user['peran']
            ],
            'expiresAt' => $expiresAt,
            'isPosMode' => $isPosMode
        ];

        $sessions = self::loadSessions();
        $sessions[$token] = $sessionData;
        self::saveSessions($sessions);

        return [
            'token' => $token,
            'user' => $sessionData['user'],
            'expiresAt' => $expiresAt * 1000
        ];
    }

    public static function authenticate(?string $token = null): ?array {
        if ($token === null) {
            $headers = function_exists('getallheaders') ? getallheaders() : (function_exists('apache_request_headers') ? apache_request_headers() : []);

            // Check Authorization header
            foreach ($headers as $k => $v) {
                if (strtolower($k) === 'authorization') {
                    if (preg_match('/Bearer\s+(\S+)/i', $v, $matches)) {
                        $token = $matches[1];
                    }
                    break;
                }
            }

            if (!$token && isset($_SERVER['HTTP_AUTHORIZATION'])) {
                if (preg_match('/Bearer\s+(\S+)/i', $_SERVER['HTTP_AUTHORIZATION'], $matches)) {
                    $token = $matches[1];
                }
            }
            if (!$token && isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
                if (preg_match('/Bearer\s+(\S+)/i', $_SERVER['REDIRECT_HTTP_AUTHORIZATION'], $matches)) {
                    $token = $matches[1];
                }
            }

            if (!$token && isset($_GET['token'])) {
                $token = $_GET['token'];
            }
        }

        if (!$token) {
            return null;
        }

        $sessions = self::loadSessions();
        if (!isset($sessions[$token])) {
            return null;
        }

        $sess = $sessions[$token];
        if (time() > $sess['expiresAt']) {
            unset($sessions[$token]);
            self::saveSessions($sessions);
            return null;
        }

        // Sliding expiration on activity
        if (!$sess['isPosMode']) {
            $sess['expiresAt'] = time() + 1800;
            $sessions[$token] = $sess;
            self::saveSessions($sessions);
        }

        return $sess['user'];
    }

    public static function requireAuth(?string $token = null): array {
        $user = self::authenticate($token);
        if (!$user) {
            http_response_code(401);
            throw new Exception('Akses ditolak: Sesi tidak valid atau telah berakhir.');
        }
        return $user;
    }

    public static function requireRoles(array $user, ...$allowedRoles): void {
        if (($user['peran'] ?? '') === 'Owner') {
            return;
        }

        $flattened = [];
        foreach ($allowedRoles as $r) {
            if (is_array($r)) {
                $flattened = array_merge($flattened, $r);
            } else {
                $flattened[] = (string)$r;
            }
        }

        if (!in_array($user['peran'] ?? '', $flattened, true)) {
            http_response_code(403);
            throw new Exception('Akses ditolak: Peran "' . ($user['peran'] ?? '') . '" tidak memiliki wewenang untuk tindakan ini.');
        }
    }

    public static function sanitizeSensitiveFields(mixed $data, ?array $user): mixed {
        if (!$user || $user['peran'] !== 'Kasir & Admin Online') {
            return $data;
        }

        if (is_array($data)) {
            $isAssoc = array_keys($data) !== range(0, count($data) - 1);
            if ($isAssoc) {
                unset($data['hpp_snapshot']);
                unset($data['total_hpp']);
                unset($data['laba_kotor']);
                unset($data['hpp_rata_rata']);
                unset($data['nilai_persediaan']);
                unset($data['total_biaya_hpp']);
                unset($data['laba_bersih']);
                unset($data['laba_kontribusi']);
                unset($data['margin_persen']);

                foreach ($data as $k => $v) {
                    if (is_array($v)) {
                        $data[$k] = self::sanitizeSensitiveFields($v, $user);
                    }
                }
            } else {
                foreach ($data as $k => $v) {
                    $data[$k] = self::sanitizeSensitiveFields($v, $user);
                }
            }
        }

        return $data;
    }
}
