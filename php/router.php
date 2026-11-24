<?php
// php/router.php
// Front controller for MCRW Web v2.0 (PHP backend)

declare(strict_types=1);

// CORS Headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

// Autoload core files & controllers
require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/Auth.php';
require_once __DIR__ . '/BusinessLogic.php';

require_once __DIR__ . '/controllers/AuthController.php';
require_once __DIR__ . '/controllers/MasterController.php';
require_once __DIR__ . '/controllers/PembelianController.php';
require_once __DIR__ . '/controllers/PenjualanController.php';
require_once __DIR__ . '/controllers/ReturController.php';
require_once __DIR__ . '/controllers/BiayaKasController.php';
require_once __DIR__ . '/controllers/StokController.php';
require_once __DIR__ . '/controllers/PeriodeController.php';
require_once __DIR__ . '/controllers/LaporanController.php';
require_once __DIR__ . '/controllers/ImportExportController.php';

// Request properties
$method = $_SERVER['REQUEST_METHOD'];
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '/';

// 1. Serve static frontend assets from dist/ if requested
$distPath = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'dist';
$requestedFile = $distPath . str_replace('/', DIRECTORY_SEPARATOR, $uri);

if ($uri !== '/' && file_exists($requestedFile) && is_file($requestedFile)) {
    $ext = strtolower(pathinfo($requestedFile, PATHINFO_EXTENSION));
    $mimes = [
        'js' => 'application/javascript; charset=UTF-8',
        'css' => 'text/css; charset=UTF-8',
        'html' => 'text/html; charset=UTF-8',
        'json' => 'application/json; charset=UTF-8',
        'svg' => 'image/svg+xml',
        'png' => 'image/png',
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'ico' => 'image/x-icon',
        'woff' => 'font/woff',
        'woff2' => 'font/woff2',
        'ttf' => 'font/ttf',
        'webmanifest' => 'application/manifest+json'
    ];
    header('Content-Type: ' . ($mimes[$ext] ?? 'application/octet-stream'));
    readfile($requestedFile);
    exit(0);
}

// 2. Parse incoming body
$body = [];
$rawInput = file_get_contents('php://input');
if ($rawInput) {
    $parsed = json_decode($rawInput, true);
    if (is_array($parsed)) {
        $body = $parsed;
    }
}
if (empty($body) && !empty($_POST)) {
    $body = $_POST;
}

// Helper: Extract Authorization Header across all server environments
function getAuthorizationHeader(): string {
    if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
        return $_SERVER['HTTP_AUTHORIZATION'];
    }
    if (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        return $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    }
    if (function_exists('apache_request_headers')) {
        $headers = apache_request_headers();
        if (isset($headers['Authorization'])) return $headers['Authorization'];
        if (isset($headers['authorization'])) return $headers['authorization'];
    }
    if (function_exists('getallheaders')) {
        $headers = getallheaders();
        if (isset($headers['Authorization'])) return $headers['Authorization'];
        if (isset($headers['authorization'])) return $headers['authorization'];
    }
    foreach ($_SERVER as $k => $v) {
        if (strtoupper($k) === 'HTTP_AUTHORIZATION') {
            return (string)$v;
        }
    }
    if (isset($_GET['token'])) {
        return 'Bearer ' . $_GET['token'];
    }
    return '';
}

// Helper: Extract Bearer token & authenticated user
function getAuthUser(): array {
    $authHeader = getAuthorizationHeader();
    $token = '';
    if (preg_match('/Bearer\s+(\S+)/i', $authHeader, $matches)) {
        $token = $matches[1];
    } elseif ($authHeader && strpos($authHeader, 'Bearer ') !== 0) {
        $token = $authHeader;
    }
    if (!$token && isset($_GET['token'])) {
        $token = (string)$_GET['token'];
    }
    return Auth::requireAuth($token);
}

// Helper: JSON response
function jsonResponse($data, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit(0);
}

// 3. API Routes handling
try {
    if (strpos($uri, '/api') === 0) {
        // Health check
        if ($uri === '/api/health') {
            jsonResponse([
                'status' => 'ok',
                'app' => 'Multi-Channel Reseller Web App (MCRW Web) v2.0 (PHP Backend)',
                'version' => '2.0.0-php',
                'php_version' => PHP_VERSION,
                'time' => gmdate('Y-m-d\TH:i:s\Z')
            ]);
        }

        // --- AUTH ---
        if ($uri === '/api/auth/login' && $method === 'POST') {
            $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
            jsonResponse(AuthController::login($body, $ip));
        }
        if ($uri === '/api/auth/me' && $method === 'GET') {
            $user = getAuthUser();
            jsonResponse(AuthController::me($user));
        }
        if ($uri === '/api/auth/logout' && $method === 'POST') {
            $authHeader = getAuthorizationHeader();
            $token = '';
            if (preg_match('/Bearer\s+(\S+)/i', $authHeader, $matches)) $token = $matches[1];
            jsonResponse(AuthController::logout($token));
        }
        if ($uri === '/api/auth/users' && $method === 'GET') {
            $user = getAuthUser();
            jsonResponse(AuthController::getUsers($user));
        }
        if ($uri === '/api/auth/users' && $method === 'POST') {
            $user = getAuthUser();
            jsonResponse(AuthController::createUser($body, $user));
        }
        if (preg_match('#^/api/auth/users/(\d+)$#', $uri, $m) && $method === 'PUT') {
            $user = getAuthUser();
            jsonResponse(AuthController::updateUser((int)$m[1], $body, $user));
        }
        if (($uri === '/api/audit-logs' || $uri === '/api/auth/audit-logs') && $method === 'GET') {
            $user = getAuthUser();
            jsonResponse(AuthController::getAuditLogs($_GET, $user));
        }

        // --- MASTER ---
        if ($uri === '/api/master/produk' && $method === 'GET') {
            $user = getAuthUser();
            jsonResponse(MasterController::getProduk($user));
        }
        if ($uri === '/api/master/varians' && $method === 'GET') {
            $user = getAuthUser();
            jsonResponse(MasterController::getVarians($user));
        }
        if ($uri === '/api/master/produk' && $method === 'POST') {
            $user = getAuthUser();
            jsonResponse(MasterController::createProduk($body, $user));
        }
        if (preg_match('#^/api/master/produk/(\d+)$#', $uri, $m) && $method === 'PUT') {
            $user = getAuthUser();
            jsonResponse(MasterController::updateProduk((int)$m[1], $body, $user));
        }
        if (preg_match('#^/api/master/varian/(\d+)$#', $uri, $m) && $method === 'PUT') {
            $user = getAuthUser();
            jsonResponse(MasterController::updateVarian((int)$m[1], $body, $user));
        }
        if ($uri === '/api/master/channel' && $method === 'GET') {
            getAuthUser();
            jsonResponse(MasterController::getChannels());
        }
        if ($uri === '/api/master/channel' && $method === 'POST') {
            $user = getAuthUser();
            jsonResponse(MasterController::createChannel($body, $user));
        }
        if (preg_match('#^/api/master/channel/(\d+)$#', $uri, $m) && $method === 'PUT') {
            $user = getAuthUser();
            jsonResponse(MasterController::updateChannel((int)$m[1], $body, $user));
        }
        if ($uri === '/api/master/akun-kas' && $method === 'GET') {
            getAuthUser();
            jsonResponse(MasterController::getAkunKas());
        }
        if ($uri === '/api/master/akun-kas' && $method === 'POST') {
            $user = getAuthUser();
            jsonResponse(MasterController::createAkunKas($body, $user));
        }
        if (preg_match('#^/api/master/akun-kas/(\d+)$#', $uri, $m) && $method === 'PUT') {
            $user = getAuthUser();
            jsonResponse(MasterController::updateAkunKas((int)$m[1], $body, $user));
        }
        if ($uri === '/api/master/supplier' && $method === 'GET') {
            getAuthUser();
            jsonResponse(MasterController::getSuppliers());
        }
        if ($uri === '/api/master/supplier' && $method === 'POST') {
            $user = getAuthUser();
            jsonResponse(MasterController::createSupplier($body, $user));
        }
        if ($uri === '/api/master/pelanggan' && $method === 'GET') {
            getAuthUser();
            jsonResponse(MasterController::getPelanggan());
        }
        if ($uri === '/api/master/pelanggan' && $method === 'POST') {
            $user = getAuthUser();
            jsonResponse(MasterController::createPelanggan($body, $user));
        }
        if ($uri === '/api/master/kategori-biaya' && $method === 'GET') {
            getAuthUser();
            jsonResponse(MasterController::getKategoriBiaya());
        }
        if ($uri === '/api/master/kategori-biaya' && $method === 'POST') {
            $user = getAuthUser();
            jsonResponse(MasterController::createKategoriBiaya($body, $user));
        }
        if ($uri === '/api/master/pengaturan' && $method === 'GET') {
            getAuthUser();
            jsonResponse(MasterController::getPengaturan());
        }
        if ($uri === '/api/master/pengaturan' && $method === 'PUT') {
            $user = getAuthUser();
            jsonResponse(MasterController::updatePengaturan($body, $user));
        }

        // --- PEMBELIAN ---
        if ($uri === '/api/pembelian/utang/daftar' && $method === 'GET') {
            $user = getAuthUser();
            jsonResponse(PembelianController::listUtang($user));
        }
        if ($uri === '/api/pembelian/utang/pelunasan' && $method === 'POST') {
            $user = getAuthUser();
            jsonResponse(PembelianController::pelunasanUtang($body, $user));
        }
        if ($uri === '/api/pembelian' && $method === 'GET') {
            $user = getAuthUser();
            jsonResponse(PembelianController::list($_GET, $user));
        }
        if ($uri === '/api/pembelian' && $method === 'POST') {
            $user = getAuthUser();
            jsonResponse(PembelianController::create($body, $user));
        }
        if (preg_match('#^/api/pembelian/(\d+)$#', $uri, $m) && $method === 'GET') {
            $user = getAuthUser();
            jsonResponse(PembelianController::get((int)$m[1], $user));
        }

        // --- PENJUALAN ---
        if (preg_match('#^/api/penjualan/(\d+)/status$#', $uri, $m) && $method === 'PUT') {
            $user = getAuthUser();
            jsonResponse(PenjualanController::updateStatus((int)$m[1], $body, $user));
        }
        if (preg_match('#^/api/penjualan/(\d+)/void$#', $uri, $m) && $method === 'POST') {
            $user = getAuthUser();
            jsonResponse(PenjualanController::void((int)$m[1], $body, $user));
        }
        if ($uri === '/api/penjualan' && $method === 'GET') {
            $user = getAuthUser();
            jsonResponse(PenjualanController::list($_GET, $user));
        }
        if ($uri === '/api/penjualan' && $method === 'POST') {
            $user = getAuthUser();
            jsonResponse(PenjualanController::create($body, $user));
        }
        if (preg_match('#^/api/penjualan/(\d+)$#', $uri, $m) && $method === 'GET') {
            $user = getAuthUser();
            jsonResponse(PenjualanController::get((int)$m[1], $user));
        }

        // --- RETUR ---
        if ($uri === '/api/retur' && $method === 'GET') {
            $user = getAuthUser();
            jsonResponse(ReturController::list($user));
        }
        if ($uri === '/api/retur' && $method === 'POST') {
            $user = getAuthUser();
            jsonResponse(ReturController::create($body, $user));
        }
        if (preg_match('#^/api/retur/(\d+)$#', $uri, $m) && $method === 'GET') {
            $user = getAuthUser();
            jsonResponse(ReturController::get((int)$m[1], $user));
        }

        // --- OPERASIONAL (BIAYA & MUTASI KAS) ---
        if (($uri === '/api/operasional/biaya' || $uri === '/api/biaya') && $method === 'GET') {
            $user = getAuthUser();
            jsonResponse(BiayaKasController::listBiaya($_GET, $user));
        }
        if (($uri === '/api/operasional/biaya' || $uri === '/api/biaya') && $method === 'POST') {
            $user = getAuthUser();
            jsonResponse(BiayaKasController::createBiaya($body, $user));
        }
        if (($uri === '/api/operasional/mutasi-kas' || $uri === '/api/mutasi-kas') && $method === 'GET') {
            $user = getAuthUser();
            jsonResponse(BiayaKasController::listMutasi($user));
        }
        if (($uri === '/api/operasional/mutasi-kas' || $uri === '/api/mutasi-kas') && $method === 'POST') {
            $user = getAuthUser();
            jsonResponse(BiayaKasController::createMutasi($body, $user));
        }

        // --- STOK & OPNAME ---
        if ($uri === '/api/stok/status' && $method === 'GET') {
            $user = getAuthUser();
            jsonResponse(StokController::getStatus($_GET, $user));
        }
        if (preg_match('#^/api/stok/kartu/(\d+)$#', $uri, $m) && $method === 'GET') {
            $user = getAuthUser();
            jsonResponse(StokController::getKartu((int)$m[1], $user));
        }
        if (preg_match('#^/api/stok/opname/(\d+)/ajukan$#', $uri, $m) && $method === 'POST') {
            $user = getAuthUser();
            jsonResponse(StokController::ajukanOpname((int)$m[1], $user));
        }
        if (preg_match('#^/api/stok/opname/(\d+)/setujui$#', $uri, $m) && $method === 'POST') {
            $user = getAuthUser();
            jsonResponse(StokController::setujuiOpname((int)$m[1], $body, $user));
        }
        if (preg_match('#^/api/stok/opname/(\d+)$#', $uri, $m) && $method === 'GET') {
            $user = getAuthUser();
            jsonResponse(StokController::getOpname((int)$m[1], $user));
        }
        if ($uri === '/api/stok/opname' && $method === 'GET') {
            $user = getAuthUser();
            jsonResponse(StokController::listOpname($user));
        }
        if ($uri === '/api/stok/opname' && $method === 'POST') {
            $user = getAuthUser();
            jsonResponse(StokController::createOpname($body, $user));
        }

        // --- PERIODE AKUNTANSI ---
        if ($uri === '/api/periode' && $method === 'GET') {
            $user = getAuthUser();
            jsonResponse(PeriodeController::list($user));
        }
        if ($uri === '/api/periode/tutup' && $method === 'POST') {
            $user = getAuthUser();
            jsonResponse(PeriodeController::tutup($body, $user));
        }
        if ($uri === '/api/periode/buka' && $method === 'POST') {
            $user = getAuthUser();
            jsonResponse(PeriodeController::buka($body, $user));
        }

        // --- LAPORAN ---
        if ($uri === '/api/laporan/dashboard' && $method === 'GET') {
            $user = getAuthUser();
            jsonResponse(LaporanController::dashboard($_GET, $user));
        }
        if ($uri === '/api/laporan/laba-rugi' && $method === 'GET') {
            $user = getAuthUser();
            jsonResponse(LaporanController::labaRugi($_GET, $user));
        }
        if ($uri === '/api/laporan/profitabilitas-channel' && $method === 'GET') {
            $user = getAuthUser();
            jsonResponse(LaporanController::profitabilitasChannel($_GET, $user));
        }
        if ($uri === '/api/laporan/profit-produk' && $method === 'GET') {
            $user = getAuthUser();
            jsonResponse(LaporanController::profitProduk($_GET, $user));
        }
        if ($uri === '/api/laporan/nilai-persediaan' && $method === 'GET') {
            $user = getAuthUser();
            jsonResponse(LaporanController::nilaiPersediaan($user));
        }
        if ($uri === '/api/laporan/posisi-kas' && $method === 'GET') {
            $user = getAuthUser();
            jsonResponse(LaporanController::posisiKas($_GET, $user));
        }

        // --- IMPOR & EKSPOR ---
        if (($uri === '/api/import-export/marketplace/preview' || $uri === '/api/import/marketplace/preview') && $method === 'POST') {
            $user = getAuthUser();
            jsonResponse(ImportExportController::previewMarketplace($_FILES, $body, $user));
        }
        if (($uri === '/api/import-export/marketplace/commit' || $uri === '/api/import/marketplace/commit') && $method === 'POST') {
            $user = getAuthUser();
            jsonResponse(ImportExportController::commitMarketplace($body, $user));
        }
        if (($uri === '/api/import-export/katalog' || $uri === '/api/import/katalog') && $method === 'POST') {
            $user = getAuthUser();
            jsonResponse(ImportExportController::importKatalog($_FILES, $user));
        }
        if (preg_match('#^/api/(?:import-export/)?export/([a-zA-Z0-9_-]+)$#', $uri, $m) && $method === 'GET') {
            $user = getAuthUser();
            ImportExportController::exportData($m[1], $user);
            exit(0);
        }

        // Endpoint not found
        jsonResponse(['error' => "Endpoint API '{$method} {$uri}' tidak ditemukan."], 404);
    }

    // 4. Default: SPA Fallback -> index.html
    $indexHtml = $distPath . DIRECTORY_SEPARATOR . 'index.html';
    if (file_exists($indexHtml)) {
        header('Content-Type: text/html; charset=UTF-8');
        readfile($indexHtml);
        exit(0);
    }

    echo "<h1>MCRW Web v2.0 - PHP Backend Running</h1><p>Frontend static build (dist/index.html) not found.</p>";
} catch (\Throwable $e) {
    $code = http_response_code();
    if ($code < 400) $code = 500;
    jsonResponse(['error' => $e->getMessage()], $code);
}
