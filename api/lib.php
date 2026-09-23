<?php
/*
 * Funciones comunes de la API de Daprintbox.
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

/** Crea las tablas si no existen (lo usa setup.php). */
function dpb_install($db)
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
        updated_by VARCHAR(100) NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $db->exec("CREATE TABLE IF NOT EXISTS dpb_history (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        version INT UNSIGNED NOT NULL,
        data LONGTEXT NOT NULL,
        saved_at DATETIME NOT NULL,
        saved_by VARCHAR(100) NOT NULL,
        INDEX (version)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $db->exec("CREATE TABLE IF NOT EXISTS dpb_login_attempts (
        ip VARCHAR(45) NOT NULL,
        attempted_at DATETIME NOT NULL,
        INDEX (ip, attempted_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    // Instalaciones anteriores: nombres de usuario más largos (correos de Google)
    $db->exec("ALTER TABLE dpb_state MODIFY updated_by VARCHAR(100) NULL");
    $db->exec("ALTER TABLE dpb_history MODIFY saved_by VARCHAR(100) NOT NULL");
    $db->exec("INSERT IGNORE INTO dpb_state (id, data, version) VALUES (1, NULL, 0)");
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
