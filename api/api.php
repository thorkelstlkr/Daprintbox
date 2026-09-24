<?php
/*
 * API de Libreta Maker: guarda en MySQL la libreta de cada usuario (sus datos son privados).
 * Compatible con PHP 5.6 y superiores.
 *
 * Acciones (parámetro ?action=):
 *   GET  auth_config          → formas de entrar y si se permite crear cuentas (público)
 *   POST register             {username, password, code?} → crea la cuenta y entra
 *   POST login                {username, password}
 *   POST login_google         {credential} (token de "Iniciar sesión con Google")
 *   POST logout
 *   GET  me                   → usuario con sesión iniciada
 *   POST change_password      {current, password}
 *   GET  state[&since=N]      → libreta del usuario y su versión (si no ha cambiado desde N, solo la versión)
 *   POST save                 {data, baseVersion} → 409 si se guardó antes desde otro dispositivo
 *   GET  history              → últimas versiones guardadas de la libreta del usuario
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

/** Id del usuario de la sesión; todas las consultas de datos se filtran por él. */
function require_uid()
{
    $uid = dpb_current_uid();
    if ($uid === null) {
        dpb_fail(401, 'Inicia sesión.');
    }
    return $uid;
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

function registration_enabled()
{
    return in_array('password', dpb_login_methods(), true) && (bool) dpb_get(dpb_config(), 'allow_registration', false);
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

function failed_attempt($db, $message, $status = 401)
{
    $db->prepare('INSERT INTO dpb_login_attempts (ip, attempted_at) VALUES (?, ?)')->execute(array(dpb_client_ip(), dpb_now()));
    usleep(400000);
    dpb_fail($status, $message);
}

function start_user_session($db, $row)
{
    session_regenerate_id(true);
    $name = trim((string) dpb_get($row, 'display_name', ''));
    $_SESSION['uid'] = (int) $row['id'];
    $_SESSION['user'] = $name !== '' ? $name : $row['username'];
    $_SESSION['email'] = (string) dpb_get($row, 'email', '');
    $db->prepare('UPDATE dpb_users SET last_login_at = ? WHERE id = ?')->execute(array(dpb_now(), (int) $row['id']));
    $db->prepare('INSERT IGNORE INTO dpb_user_state (user_id, data, version) VALUES (?, NULL, 0)')->execute(array((int) $row['id']));
    dpb_json(array('ok' => true, 'user' => $_SESSION['user'], 'username' => $row['username'], 'email' => $_SESSION['email']));
}

function decode_data($json)
{
    return $json === null ? null : json_decode($json, true);
}

function user_state($db, $uid, $lock = false)
{
    $db->prepare('INSERT IGNORE INTO dpb_user_state (user_id, data, version) VALUES (?, NULL, 0)')->execute(array($uid));
    $q = $db->prepare('SELECT data, version, updated_at, updated_by FROM dpb_user_state WHERE user_id = ?' . ($lock ? ' FOR UPDATE' : ''));
    $q->execute(array($uid));
    return $q->fetch();
}

if ($action === 'auth_config') {
    $methods = dpb_login_methods();
    dpb_json(array(
        'ok' => true,
        'methods' => $methods,
        'registration' => registration_enabled(),
        'registration_code' => registration_enabled() && (string) dpb_get(dpb_config(), 'registration_code', '') !== '',
        'google_client_id' => in_array('google', $methods, true) ? (string) dpb_get(dpb_config(), 'google_client_id', '') : '',
    ));
}

$db = dpb_db();

switch ($action) {
    case 'me':
        require_uid();
        dpb_json(array('ok' => true, 'app' => 'libreta-maker', 'user' => dpb_current_user(), 'email' => dpb_get($_SESSION, 'email', '')));
        break;

    case 'register':
        require_post($method);
        if (!registration_enabled()) {
            dpb_fail(403, 'Crear cuentas nuevas no está permitido en este servidor.');
        }
        check_attempts($db);
        $in = body();
        $code = (string) dpb_get(dpb_config(), 'registration_code', '');
        if ($code !== '' && !hash_equals($code, (string) dpb_get($in, 'code', ''))) {
            failed_attempt($db, 'El código de invitación no es correcto.', 403);
        }
        // Máximo 5 cuentas nuevas por IP y hora
        $db->prepare('DELETE FROM dpb_signups WHERE created_at < ?')->execute(array(date('Y-m-d H:i:s', time() - 3600)));
        $q = $db->prepare('SELECT COUNT(*) FROM dpb_signups WHERE ip = ?');
        $q->execute(array(dpb_client_ip()));
        if ((int) $q->fetchColumn() >= 5) {
            dpb_fail(429, 'Se han creado demasiadas cuentas desde esta conexión. Espera una hora.');
        }
        $username = trim((string) dpb_get($in, 'username', ''));
        $password = (string) dpb_get($in, 'password', '');
        if (!dpb_valid_username($username)) {
            dpb_fail(400, 'El usuario debe tener entre 2 y 50 letras, números, puntos, guiones o guiones bajos (sin espacios).');
        }
        if (strlen($password) < 8) {
            dpb_fail(400, 'La contraseña debe tener al menos 8 caracteres.');
        }
        $q = $db->prepare('SELECT COUNT(*) FROM dpb_users WHERE username = ?');
        $q->execute(array($username));
        if ((int) $q->fetchColumn() > 0) {
            dpb_fail(409, 'Ese nombre de usuario ya existe. Elige otro.');
        }
        $max = (int) dpb_get(dpb_config(), 'max_users', 0);
        if ($max > 0 && (int) $db->query('SELECT COUNT(*) FROM dpb_users')->fetchColumn() >= $max) {
            dpb_fail(403, 'Se ha alcanzado el número máximo de cuentas de este servidor.');
        }
        $db->prepare('INSERT INTO dpb_users (username, password_hash, created_at) VALUES (?, ?, ?)')
            ->execute(array($username, password_hash($password, PASSWORD_DEFAULT), dpb_now()));
        $db->prepare('INSERT INTO dpb_signups (ip, created_at) VALUES (?, ?)')->execute(array(dpb_client_ip(), dpb_now()));
        $q = $db->prepare('SELECT id, username, email, display_name FROM dpb_users WHERE username = ?');
        $q->execute(array($username));
        start_user_session($db, $q->fetch());
        break;

    case 'login':
        require_post($method);
        require_method('password');
        check_attempts($db);
        $in = body();
        $username = trim((string) dpb_get($in, 'username', ''));
        $password = (string) dpb_get($in, 'password', '');
        $q = $db->prepare('SELECT id, username, email, display_name, password_hash FROM dpb_users WHERE username = ?');
        $q->execute(array($username));
        $row = $q->fetch();
        if (!$row || !$row['password_hash'] || !password_verify($password, $row['password_hash'])) {
            failed_attempt($db, 'Usuario o contraseña incorrectos.');
        }
        if (password_needs_rehash($row['password_hash'], PASSWORD_DEFAULT)) {
            $db->prepare('UPDATE dpb_users SET password_hash = ? WHERE id = ?')
                ->execute(array(password_hash($password, PASSWORD_DEFAULT), (int) $row['id']));
        }
        start_user_session($db, $row);
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
        $name = dpb_mb_cut(trim((string) dpb_get($result, 'name', '')), 100);
        $q = $db->prepare('SELECT id, username, email, display_name FROM dpb_users WHERE email = ?');
        $q->execute(array($email));
        $row = $q->fetch();
        if (!$row) {
            // Primera vez con esta cuenta de Google: se le crea su propia libreta
            $db->prepare('INSERT INTO dpb_users (username, password_hash, email, display_name, created_at) VALUES (?, NULL, ?, ?, ?)')
                ->execute(array(dpb_mb_cut($email, 100), $email, $name, dpb_now()));
            $q->execute(array($email));
            $row = $q->fetch();
        } elseif ($name !== '' && $name !== $row['display_name']) {
            $db->prepare('UPDATE dpb_users SET display_name = ? WHERE id = ?')->execute(array($name, (int) $row['id']));
            $row['display_name'] = $name;
        }
        start_user_session($db, $row);
        break;

    case 'logout':
        require_post($method);
        $_SESSION = array();
        session_destroy();
        dpb_json(array('ok' => true));
        break;

    case 'change_password':
        require_post($method);
        $uid = require_uid();
        check_attempts($db);
        $in = body();
        $q = $db->prepare('SELECT password_hash FROM dpb_users WHERE id = ?');
        $q->execute(array($uid));
        $hash = $q->fetchColumn();
        if (!$hash) {
            dpb_fail(400, 'Tu cuenta entra con Google: no tiene contraseña.');
        }
        if (!password_verify((string) dpb_get($in, 'current', ''), $hash)) {
            failed_attempt($db, 'La contraseña actual no es correcta.', 403);
        }
        $password = (string) dpb_get($in, 'password', '');
        if (strlen($password) < 8) {
            dpb_fail(400, 'La contraseña nueva debe tener al menos 8 caracteres.');
        }
        $db->prepare('UPDATE dpb_users SET password_hash = ? WHERE id = ?')->execute(array(password_hash($password, PASSWORD_DEFAULT), $uid));
        session_regenerate_id(true);
        dpb_json(array('ok' => true));
        break;

    case 'state':
        $uid = require_uid();
        $row = user_state($db, $uid);
        $meta = array('ok' => true, 'version' => (int) $row['version'], 'updated_at' => $row['updated_at'], 'updated_by' => $row['updated_by']);
        if (isset($_GET['since']) && (int) $_GET['since'] === (int) $row['version']) {
            dpb_json($meta + array('unchanged' => true));
        }
        dpb_json($meta + array('data' => decode_data($row['data'])));
        break;

    case 'save':
        require_post($method);
        $uid = require_uid();
        $user = dpb_current_user();
        $in = body();
        if (!isset($in['data']) || !is_array($in['data']) || !isset($in['baseVersion'])) {
            dpb_fail(400, 'Faltan datos.');
        }
        $json = json_encode($in['data'], JSON_UNESCAPED_UNICODE);
        $base = (int) $in['baseVersion'];
        $db->beginTransaction();
        $row = user_state($db, $uid, true);
        if ((int) $row['version'] !== $base) {
            $db->rollBack();
            dpb_fail(409, 'Se guardaron cambios antes desde otro dispositivo.', array(
                'version' => (int) $row['version'],
                'updated_by' => $row['updated_by'],
                'updated_at' => $row['updated_at'],
                'data' => decode_data($row['data']),
            ));
        }
        $version = $base + 1;
        $now = dpb_now();
        $db->prepare('UPDATE dpb_user_state SET data = ?, version = ?, updated_at = ?, updated_by = ? WHERE user_id = ?')
            ->execute(array($json, $version, $now, $user, $uid));
        $db->prepare('INSERT INTO dpb_history (user_id, version, data, saved_at, saved_by) VALUES (?, ?, ?, ?, ?)')
            ->execute(array($uid, $version, $json, $now, $user));
        $keep = max(1, (int) dpb_get(dpb_config(), 'history_keep', 200));
        $db->prepare('DELETE FROM dpb_history WHERE user_id = ? AND version <= ?')->execute(array($uid, $version - $keep));
        $db->commit();
        dpb_json(array('ok' => true, 'version' => $version, 'updated_at' => $now, 'updated_by' => $user));
        break;

    case 'history':
        $uid = require_uid();
        $q = $db->prepare('SELECT version, saved_at, saved_by, LENGTH(data) AS bytes FROM dpb_history WHERE user_id = ? ORDER BY version DESC LIMIT 50');
        $q->execute(array($uid));
        $versions = array();
        foreach ($q->fetchAll() as $r) {
            $versions[] = array('version' => (int) $r['version'], 'saved_at' => $r['saved_at'], 'saved_by' => $r['saved_by'], 'bytes' => (int) $r['bytes']);
        }
        dpb_json(array('ok' => true, 'versions' => $versions));
        break;

    case 'history_get':
        $uid = require_uid();
        $q = $db->prepare('SELECT version, data, saved_at, saved_by FROM dpb_history WHERE user_id = ? AND version = ?');
        $q->execute(array($uid, (int) dpb_get($_GET, 'version', 0)));
        $row = $q->fetch();
        if (!$row) {
            dpb_fail(404, 'Esa versión ya no existe.');
        }
        dpb_json(array('ok' => true, 'version' => (int) $row['version'], 'saved_at' => $row['saved_at'], 'saved_by' => $row['saved_by'], 'data' => decode_data($row['data'])));
        break;

    default:
        dpb_fail(404, 'Acción desconocida.');
}
