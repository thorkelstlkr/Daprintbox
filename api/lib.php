<?php
/*
 * Funciones comunes de la API de Daprintbox.
 */
declare(strict_types=1);

if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === 'lib.php') {
    http_response_code(404);
    exit;
}

function dpb_config(): array
{
    static $config = null;
    if ($config === null) {
        $file = __DIR__ . '/config.php';
        if (!is_file($file)) {
            dpb_fail(500, 'Falta api/config.php. Copia config.example.php como config.php y rellénalo.');
        }
        $config = require $file;
    }
    return $config;
}

function dpb_db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $c = dpb_config();
        $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $c['db_host'], (int) ($c['db_port'] ?? 3306), $c['db_name']);
        try {
            $pdo = new PDO($dsn, $c['db_user'], $c['db_pass'], [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
        } catch (PDOException $e) {
            dpb_fail(500, 'No se pudo conectar con MySQL. Revisa los datos de api/config.php.');
        }
    }
    return $pdo;
}

/** Crea las tablas si no existen (lo usa setup.php). */
function dpb_install(PDO $db): void
{
    $db->exec("CREATE TABLE IF NOT EXISTS dpb_users (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        created_at DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $db->exec("CREATE TABLE IF NOT EXISTS dpb_state (
        id TINYINT UNSIGNED PRIMARY KEY,
        data LONGTEXT NULL,
        version INT UNSIGNED NOT NULL DEFAULT 0,
        updated_at DATETIME NULL,
        updated_by VARCHAR(50) NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $db->exec("CREATE TABLE IF NOT EXISTS dpb_history (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        version INT UNSIGNED NOT NULL,
        data LONGTEXT NOT NULL,
        saved_at DATETIME NOT NULL,
        saved_by VARCHAR(50) NOT NULL,
        INDEX (version)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $db->exec("CREATE TABLE IF NOT EXISTS dpb_login_attempts (
        ip VARCHAR(45) NOT NULL,
        attempted_at DATETIME NOT NULL,
        INDEX (ip, attempted_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $db->exec("INSERT IGNORE INTO dpb_state (id, data, version) VALUES (1, NULL, 0)");
}

function dpb_json($data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function dpb_fail(int $status, string $message, array $extra = []): void
{
    dpb_json(['ok' => false, 'error' => $message] + $extra, $status);
}

function dpb_is_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
        || ((int) ($_SERVER['SERVER_PORT'] ?? 0) === 443);
}

function dpb_start_session(): void
{
    $days = (int) (dpb_config()['session_days'] ?? 30);
    ini_set('session.gc_maxlifetime', (string) ($days * 86400));
    ini_set('session.use_strict_mode', '1');
    session_name('DPBSESS');
    session_set_cookie_params([
        'lifetime' => $days * 86400,
        'path' => rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? '/'), '/') . '/',
        'secure' => dpb_is_https(),
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    session_start();
}

function dpb_current_user(): ?string
{
    return isset($_SESSION['user']) ? (string) $_SESSION['user'] : null;
}

function dpb_client_ip(): string
{
    return substr((string) ($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45);
}

function dpb_now(): string
{
    return date('Y-m-d H:i:s');
}
