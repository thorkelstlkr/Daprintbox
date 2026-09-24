<?php
/*
 * Funciones comunes de la API de Libreta Maker.
 * Compatible con PHP 5.6 y superiores.
 */

if (basename(isset($_SERVER['SCRIPT_FILENAME']) ? $_SERVER['SCRIPT_FILENAME'] : '') === 'lib.php') {
    http_response_code(404);
    exit;
}

define('DPB_GOOGLE_CERTS_URL', 'https://www.googleapis.com/oauth2/v1/certs');

/** Valor de un array con valor por defecto (equivale a $a[$k] ?? $default). */
function dpb_get($array, $key, $default = null)
{
    return (is_array($array) && isset($array[$key])) ? $array[$key] : $default;
}

function dpb_config()
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

function dpb_login_methods()
{
    $methods = dpb_get(dpb_config(), 'login_methods', array('password'));
    return is_array($methods) ? $methods : array($methods);
}

function dpb_db()
{
    static $pdo = null;
    if ($pdo === null) {
        $c = dpb_config();
        $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', dpb_get($c, 'db_host', 'localhost'), (int) dpb_get($c, 'db_port', 3306), dpb_get($c, 'db_name', ''));
        try {
            $pdo = new PDO($dsn, dpb_get($c, 'db_user', ''), dpb_get($c, 'db_pass', ''), array(
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ));
        } catch (PDOException $e) {
            dpb_fail(500, 'No se pudo conectar con MySQL. Revisa los datos de api/config.php.');
        }
    }
    return $pdo;
}

function dpb_table_exists($db, $table)
{
    $q = $db->prepare('SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?');
    $q->execute(array($table));
    return (int) $q->fetchColumn() > 0;
}

function dpb_column_exists($db, $table, $column)
{
    $q = $db->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?');
    $q->execute(array($table, $column));
    return (int) $q->fetchColumn() > 0;
}

function dpb_index_exists($db, $table, $index)
{
    $q = $db->prepare('SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?');
    $q->execute(array($table, $index));
    return (int) $q->fetchColumn() > 0;
}

/**
 * Crea las tablas si no existen y actualiza las de versiones anteriores (lo usa setup.php).
 * Cada usuario tiene su propia libreta: una fila en dpb_user_state y su historial en dpb_history.
 */
function dpb_install($db)
{
    $opts = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    $db->exec("CREATE TABLE IF NOT EXISTS dpb_users (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NULL,
        email VARCHAR(190) NULL,
        display_name VARCHAR(100) NULL,
        created_at DATETIME NOT NULL,
        last_login_at DATETIME NULL
    ) $opts");
    $db->exec("CREATE TABLE IF NOT EXISTS dpb_user_state (
        user_id INT UNSIGNED PRIMARY KEY,
        data LONGTEXT NULL,
        version INT UNSIGNED NOT NULL DEFAULT 0,
        updated_at DATETIME NULL,
        updated_by VARCHAR(100) NULL
    ) $opts");
    $db->exec("CREATE TABLE IF NOT EXISTS dpb_history (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNSIGNED NULL,
        version INT UNSIGNED NOT NULL,
        data LONGTEXT NOT NULL,
        saved_at DATETIME NOT NULL,
        saved_by VARCHAR(100) NOT NULL,
        INDEX dpb_history_user (user_id, version)
    ) $opts");
    $db->exec("CREATE TABLE IF NOT EXISTS dpb_login_attempts (
        ip VARCHAR(45) NOT NULL,
        attempted_at DATETIME NOT NULL,
        INDEX (ip, attempted_at)
    ) $opts");
    $db->exec("CREATE TABLE IF NOT EXISTS dpb_signups (
        ip VARCHAR(45) NOT NULL,
        created_at DATETIME NOT NULL,
        INDEX (ip, created_at)
    ) $opts");

    // Actualización desde versiones anteriores (una sola libreta compartida)
    $db->exec("ALTER TABLE dpb_users MODIFY username VARCHAR(100) NOT NULL");
    $db->exec("ALTER TABLE dpb_users MODIFY password_hash VARCHAR(255) NULL");
    foreach (array('email' => 'VARCHAR(190) NULL', 'display_name' => 'VARCHAR(100) NULL', 'last_login_at' => 'DATETIME NULL') as $col => $type) {
        if (!dpb_column_exists($db, 'dpb_users', $col)) {
            $db->exec("ALTER TABLE dpb_users ADD $col $type");
        }
    }
    if (!dpb_index_exists($db, 'dpb_users', 'dpb_users_email')) {
        $db->exec("ALTER TABLE dpb_users ADD UNIQUE INDEX dpb_users_email (email)");
    }
    $db->exec("ALTER TABLE dpb_history MODIFY saved_by VARCHAR(100) NOT NULL");
    if (!dpb_column_exists($db, 'dpb_history', 'user_id')) {
        $db->exec("ALTER TABLE dpb_history ADD user_id INT UNSIGNED NULL AFTER id");
    }
    if (!dpb_index_exists($db, 'dpb_history', 'dpb_history_user')) {
        $db->exec("ALTER TABLE dpb_history ADD INDEX dpb_history_user (user_id, version)");
    }
}

/** Datos de la libreta compartida de versiones anteriores que aún no se han asignado a un usuario. */
function dpb_legacy_state($db)
{
    if (!dpb_table_exists($db, 'dpb_state')) {
        return null;
    }
    $row = $db->query('SELECT data, version, updated_at, updated_by FROM dpb_state WHERE id = 1')->fetch();
    return ($row && $row['data'] !== null) ? $row : null;
}

/** Pasa la libreta compartida antigua (y su historial) a un usuario sin datos. Devuelve true o el motivo del error. */
function dpb_assign_legacy_state($db, $userId)
{
    $legacy = dpb_legacy_state($db);
    if (!$legacy) {
        return 'No hay datos antiguos que asignar.';
    }
    $q = $db->prepare('SELECT data FROM dpb_user_state WHERE user_id = ?');
    $q->execute(array($userId));
    $current = $q->fetch();
    if ($current && $current['data'] !== null) {
        return 'Ese usuario ya tiene datos en su libreta. Elige uno sin datos (o crea uno nuevo).';
    }
    $db->beginTransaction();
    $db->prepare('INSERT INTO dpb_user_state (user_id, data, version, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE data = VALUES(data), version = GREATEST(version, VALUES(version)) + 1, updated_at = VALUES(updated_at), updated_by = VALUES(updated_by)')
        ->execute(array($userId, $legacy['data'], (int) $legacy['version'], $legacy['updated_at'], $legacy['updated_by']));
    $db->prepare('UPDATE dpb_history SET user_id = ? WHERE user_id IS NULL')->execute(array($userId));
    $db->exec('UPDATE dpb_state SET data = NULL WHERE id = 1');
    $db->commit();
    return true;
}

/** Nombre de usuario válido: 2–50 letras, números, puntos, guiones o guiones bajos. */
function dpb_valid_username($username)
{
    return preg_match('/^[\p{L}\p{N}._-]{2,50}$/u', $username) === 1;
}

function dpb_mb_cut($text, $length)
{
    return function_exists('mb_substr') ? mb_substr($text, 0, $length, 'UTF-8') : substr($text, 0, $length);
}

function dpb_json($data, $status = 200)
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function dpb_fail($status, $message, $extra = array())
{
    if (defined('DPB_HTML_ERRORS')) {
        http_response_code($status);
        header('Content-Type: text/html; charset=utf-8');
        echo '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
            . '<title>Instalación de Libreta Maker</title></head><body style="font:16px/1.5 system-ui,sans-serif;max-width:620px;margin:40px auto;padding:0 16px">'
            . '<h1 style="font-size:1.3rem">Instalación de Libreta Maker</h1><p style="color:#c62828">⚠ ' . htmlspecialchars($message, ENT_QUOTES, 'UTF-8') . '</p>'
            . '<p><a href="">Volver a intentarlo</a></p></body></html>';
        exit;
    }
    dpb_json(array('ok' => false, 'error' => $message) + $extra, $status);
}

function dpb_is_https()
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (dpb_get($_SERVER, 'HTTP_X_FORWARDED_PROTO') === 'https')
        || ((int) dpb_get($_SERVER, 'SERVER_PORT', 0) === 443);
}

function dpb_start_session()
{
    $lifetime = (int) dpb_get(dpb_config(), 'session_days', 30) * 86400;
    ini_set('session.gc_maxlifetime', (string) $lifetime);
    ini_set('session.use_strict_mode', '1');
    session_name('DPBSESS');
    $path = rtrim(dirname(dpb_get($_SERVER, 'SCRIPT_NAME', '/')), '/\\') . '/';
    if (PHP_VERSION_ID >= 70300) {
        session_set_cookie_params(array(
            'lifetime' => $lifetime, 'path' => $path, 'secure' => dpb_is_https(), 'httponly' => true, 'samesite' => 'Strict',
        ));
    } else {
        // PHP < 7.3 no admite SameSite como opción: se añade a la ruta de la cookie
        session_set_cookie_params($lifetime, $path . '; samesite=Strict', null, dpb_is_https(), true);
    }
    session_start();
}

/** Id del usuario con sesión iniciada (null si no hay sesión). */
function dpb_current_uid()
{
    return isset($_SESSION['uid']) ? (int) $_SESSION['uid'] : null;
}

function dpb_current_user()
{
    return isset($_SESSION['user']) ? (string) $_SESSION['user'] : null;
}

function dpb_client_ip()
{
    return substr((string) dpb_get($_SERVER, 'REMOTE_ADDR', ''), 0, 45);
}

function dpb_now()
{
    return date('Y-m-d H:i:s');
}

/* ------------------------------------------------------------------ Google */

function dpb_http_get($url)
{
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, array(CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10, CURLOPT_FOLLOWLOCATION => true));
        $body = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        return ($body !== false && $code === 200) ? $body : null;
    }
    if (ini_get('allow_url_fopen')) {
        $ctx = stream_context_create(array('http' => array('timeout' => 10)));
        $body = @file_get_contents($url, false, $ctx);
        return $body === false ? null : $body;
    }
    return null;
}

/** Certificados públicos con los que Google firma los tokens (en caché 1 hora). */
function dpb_google_certs($refresh = false)
{
    $url = dpb_get(dpb_config(), 'google_certs_url', DPB_GOOGLE_CERTS_URL);
    $cache = rtrim(sys_get_temp_dir(), '/\\') . '/dpb_google_certs_' . md5($url) . '.json';
    if (!$refresh && is_file($cache) && filemtime($cache) > time() - 3600) {
        $certs = json_decode((string) file_get_contents($cache), true);
        if (is_array($certs)) {
            return $certs;
        }
    }
    $body = dpb_http_get($url);
    $certs = $body === null ? null : json_decode($body, true);
    if (!is_array($certs)) {
        return array();
    }
    @file_put_contents($cache, $body);
    return $certs;
}

function dpb_b64url_decode($s)
{
    $s = strtr($s, '-_', '+/');
    $pad = strlen($s) % 4;
    if ($pad) {
        $s .= str_repeat('=', 4 - $pad);
    }
    return base64_decode($s, true);
}

/**
 * Comprueba un token de "Iniciar sesión con Google" (JWT firmado RS256).
 * Devuelve los datos del usuario o un texto con el motivo del rechazo.
 */
function dpb_verify_google_token($jwt, $clientId)
{
    $parts = explode('.', (string) $jwt);
    if (count($parts) !== 3) {
        return 'Token no válido.';
    }
    $header = json_decode((string) dpb_b64url_decode($parts[0]), true);
    $payload = json_decode((string) dpb_b64url_decode($parts[1]), true);
    $signature = dpb_b64url_decode($parts[2]);
    if (!is_array($header) || !is_array($payload) || $signature === false || dpb_get($header, 'alg') !== 'RS256') {
        return 'Token no válido.';
    }
    $kid = (string) dpb_get($header, 'kid', '');
    $certs = dpb_google_certs();
    if (!isset($certs[$kid])) {
        $certs = dpb_google_certs(true); // Google rota sus claves: se vuelven a descargar
    }
    if (!isset($certs[$kid])) {
        return $certs ? 'Token firmado con una clave desconocida.' : 'El servidor no pudo descargar las claves de Google (revisa que pueda conectarse a internet).';
    }
    if (openssl_verify($parts[0] . '.' . $parts[1], $signature, $certs[$kid], OPENSSL_ALGO_SHA256) !== 1) {
        return 'La firma del token no es válida.';
    }
    $now = time();
    if (!in_array(dpb_get($payload, 'iss'), array('accounts.google.com', 'https://accounts.google.com'), true)) {
        return 'El token no es de Google.';
    }
    if (dpb_get($payload, 'aud') !== $clientId) {
        return 'El token es para otra aplicación (revisa google_client_id).';
    }
    if ((int) dpb_get($payload, 'exp', 0) < $now - 60) {
        return 'El token ha caducado. Vuelve a intentarlo.';
    }
    $verified = dpb_get($payload, 'email_verified');
    if (!dpb_get($payload, 'email') || !($verified === true || $verified === 'true')) {
        return 'La cuenta de Google no tiene un correo verificado.';
    }
    return $payload;
}

/** ¿Está este correo en la lista de allowed_emails? (admite dominios: '@mitaller.com') */
function dpb_email_allowed($email)
{
    $email = strtolower(trim($email));
    foreach ((array) dpb_get(dpb_config(), 'allowed_emails', array()) as $allowed) {
        $allowed = strtolower(trim($allowed));
        if ($allowed === '') {
            continue;
        }
        if ($allowed[0] === '@' ? substr($email, -strlen($allowed)) === $allowed : $email === $allowed) {
            return true;
        }
    }
    return false;
}
