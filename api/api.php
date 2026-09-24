<?php
/*
 * API de Libreta Maker: guarda los datos de la app en MySQL para compartirlos entre varias personas.
 * Compatible con PHP 5.6 y superiores.
 *
 * Acciones (parámetro ?action=):
 *   GET  auth_config          → formas de entrar disponibles (público)
 *   GET  me                   → usuario con sesión iniciada
 *   POST login_google         {credential} (token de "Iniciar sesión con Google")
 *   POST login                {username, password}
 *   POST logout
 *   GET  state[&since=N]      → datos actuales y su versión (si no han cambiado desde N, solo la versión)
 *   POST save                 {data, baseVersion} → 409 si otra persona guardó antes
 *   GET  history              → últimas versiones guardadas
 *   GET  history_get&version=N
 */
require __DIR__ . '/lib.php';

$action = (string) dpb_get($_GET, 'action', '');
$method = (string) dpb_get($_SERVER, 'REQUEST_METHOD', 'GET');

// Las peticiones de la app llevan esta cabecera; un formulario de otra web no puede añadirla.
if (dpb_get($_SERVER, 'HTTP_X_DAPRINTBOX') !== '1') {
    dpb_fail(400, 'Petición no válida.');
}
if ($method === 'POST' && stripos((string) dpb_get($_SERVER, 'CONTENT_TYPE', ''), 'application/json') === false) {
    dpb_fail(415, 'Se esperaba JSON.');
}

dpb_start_session();

function body()
{
    $max = (int) dpb_get(dpb_config(), 'max_payload_mb', 8) * 1024 * 1024;
    $raw = file_get_contents('php://input', false, null, 0, $max + 1);
    if ($raw === false || strlen($raw) > $max) {
        dpb_fail(413, 'Los datos son demasiado grandes.');
    }
    $data = json_decode($raw ? $raw : '{}', true);
    if (!is_array($data)) {
        dpb_fail(400, 'JSON no válido.');
    }
    return $data;
}

function require_user()
{
    $user = dpb_current_user();
    if ($user === null) {
        dpb_fail(401, 'Inicia sesión.');
    }
    return $user;
}

function require_post($method)
{
    if ($method !== 'POST') {
        dpb_fail(405, 'Método no permitido.');
    }
}

function require_method($name)
{
    if (!in_array($name, dpb_login_methods(), true)) {
        dpb_fail(403, 'Esta forma de entrar no está activada.');
    }
}

/** Máximo 10 intentos fallidos por IP cada 15 minutos. */
function check_attempts($db)
{
    $db->prepare('DELETE FROM dpb_login_attempts WHERE attempted_at < ?')->execute(array(date('Y-m-d H:i:s', time() - 900)));
    $q = $db->prepare('SELECT COUNT(*) FROM dpb_login_attempts WHERE ip = ?');
    $q->execute(array(dpb_client_ip()));
    if ((int) $q->fetchColumn() >= 10) {
        dpb_fail(429, 'Demasiados intentos. Espera 15 minutos.');
    }
}

function failed_attempt($db, $message)
{
    $db->prepare('INSERT INTO dpb_login_attempts (ip, attempted_at) VALUES (?, ?)')->execute(array(dpb_client_ip(), dpb_now()));
    usleep(400000);
    dpb_fail(401, $message);
}

function start_user_session($user, $email)
{
    session_regenerate_id(true);
    $_SESSION['user'] = $user;
    $_SESSION['email'] = $email;
    dpb_json(array('ok' => true, 'user' => $user, 'email' => $email));
}

function decode_data($json)
{
    return $json === null ? null : json_decode($json, true);
}

if ($action === 'auth_config') {
    $methods = dpb_login_methods();
    dpb_json(array(
        'ok' => true,
        'methods' => $methods,
        'google_client_id' => in_array('google', $methods, true) ? (string) dpb_get(dpb_config(), 'google_client_id', '') : '',
    ));
}

$db = dpb_db();

switch ($action) {
    case 'me':
        dpb_json(array('ok' => true, 'app' => 'daprintbox', 'user' => require_user(), 'email' => dpb_get($_SESSION, 'email', '')));
        break;

    case 'login_google':
        require_post($method);
        require_method('google');
        check_attempts($db);
        $in = body();
        $result = dpb_verify_google_token(dpb_get($in, 'credential', ''), (string) dpb_get(dpb_config(), 'google_client_id', ''));
        if (!is_array($result)) {
            failed_attempt($db, $result);
        }
        $email = strtolower($result['email']);
        if (!dpb_email_allowed($email)) {
            failed_attempt($db, "La cuenta {$email} no tiene permiso. Pide que la añadan a allowed_emails en api/config.php.");
        }
        $name = trim((string) dpb_get($result, 'name', ''));
        if (function_exists('mb_substr')) {
            $name = mb_substr($name, 0, 100, 'UTF-8');
        }
        start_user_session($name !== '' ? $name : $email, $email);
        break;

    case 'login':
        require_post($method);
        require_method('password');
        check_attempts($db);
        $in = body();
        $username = trim((string) dpb_get($in, 'username', ''));
        $password = (string) dpb_get($in, 'password', '');
        $q = $db->prepare('SELECT username, password_hash FROM dpb_users WHERE username = ?');
        $q->execute(array($username));
        $row = $q->fetch();
        if (!$row || !password_verify($password, $row['password_hash'])) {
            failed_attempt($db, 'Usuario o contraseña incorrectos.');
        }
        if (password_needs_rehash($row['password_hash'], PASSWORD_DEFAULT)) {
            $db->prepare('UPDATE dpb_users SET password_hash = ? WHERE username = ?')
                ->execute(array(password_hash($password, PASSWORD_DEFAULT), $row['username']));
        }
        start_user_session($row['username'], '');
        break;

    case 'logout':
        require_post($method);
        $_SESSION = array();
        session_destroy();
        dpb_json(array('ok' => true));
        break;

    case 'state':
        require_user();
        $row = $db->query('SELECT data, version, updated_at, updated_by FROM dpb_state WHERE id = 1')->fetch();
        if (!$row) {
            dpb_fail(500, 'Faltan las tablas. Ejecuta setup.php.');
        }
        $meta = array('ok' => true, 'version' => (int) $row['version'], 'updated_at' => $row['updated_at'], 'updated_by' => $row['updated_by']);
        if (isset($_GET['since']) && (int) $_GET['since'] === (int) $row['version']) {
            dpb_json($meta + array('unchanged' => true));
        }
        dpb_json($meta + array('data' => decode_data($row['data'])));
        break;

    case 'save':
        require_post($method);
        $user = require_user();
        $in = body();
        if (!isset($in['data']) || !is_array($in['data']) || !isset($in['baseVersion'])) {
            dpb_fail(400, 'Faltan datos.');
        }
        $json = json_encode($in['data'], JSON_UNESCAPED_UNICODE);
        $base = (int) $in['baseVersion'];
        $db->beginTransaction();
        $row = $db->query('SELECT data, version, updated_at, updated_by FROM dpb_state WHERE id = 1 FOR UPDATE')->fetch();
        if ((int) $row['version'] !== $base) {
            $db->rollBack();
            dpb_fail(409, 'Otra persona guardó cambios antes.', array(
                'version' => (int) $row['version'],
                'updated_by' => $row['updated_by'],
                'updated_at' => $row['updated_at'],
                'data' => decode_data($row['data']),
            ));
        }
        $version = $base + 1;
        $now = dpb_now();
        $db->prepare('UPDATE dpb_state SET data = ?, version = ?, updated_at = ?, updated_by = ? WHERE id = 1')
            ->execute(array($json, $version, $now, $user));
        $db->prepare('INSERT INTO dpb_history (version, data, saved_at, saved_by) VALUES (?, ?, ?, ?)')
            ->execute(array($version, $json, $now, $user));
        $keep = max(1, (int) dpb_get(dpb_config(), 'history_keep', 200));
        $db->prepare('DELETE FROM dpb_history WHERE version <= ?')->execute(array($version - $keep));
        $db->commit();
        dpb_json(array('ok' => true, 'version' => $version, 'updated_at' => $now, 'updated_by' => $user));
        break;

    case 'history':
        require_user();
        $rows = $db->query('SELECT version, saved_at, saved_by, LENGTH(data) AS bytes FROM dpb_history ORDER BY version DESC LIMIT 50')->fetchAll();
        $versions = array();
        foreach ($rows as $r) {
            $versions[] = array('version' => (int) $r['version'], 'saved_at' => $r['saved_at'], 'saved_by' => $r['saved_by'], 'bytes' => (int) $r['bytes']);
        }
        dpb_json(array('ok' => true, 'versions' => $versions));
        break;

    case 'history_get':
        require_user();
        $q = $db->prepare('SELECT version, data, saved_at, saved_by FROM dpb_history WHERE version = ?');
        $q->execute(array((int) dpb_get($_GET, 'version', 0)));
        $row = $q->fetch();
        if (!$row) {
            dpb_fail(404, 'Esa versión ya no existe.');
        }
        dpb_json(array('ok' => true, 'version' => (int) $row['version'], 'saved_at' => $row['saved_at'], 'saved_by' => $row['saved_by'], 'data' => decode_data($row['data'])));
        break;

    default:
        dpb_fail(404, 'Acción desconocida.');
}
