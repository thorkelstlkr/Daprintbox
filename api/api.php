<?php
/*
 * API de Daprintbox: guarda los datos de la app en MySQL para compartirlos entre varias personas.
 *
 * Acciones (parámetro ?action=):
 *   GET  me                  → usuario con sesión iniciada
 *   POST login               {username, password}
 *   POST logout
 *   GET  state[&since=N]     → datos actuales y su versión (si no han cambiado desde N, solo la versión)
 *   POST save                {data, baseVersion} → 409 si otra persona guardó antes
 *   GET  history             → últimas versiones guardadas
 *   GET  history_get&version=N
 */
declare(strict_types=1);
require __DIR__ . '/lib.php';

$action = (string) ($_GET['action'] ?? '');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// Las peticiones de la app llevan esta cabecera; un formulario de otra web no puede añadirla.
if (($_SERVER['HTTP_X_DAPRINTBOX'] ?? '') !== '1') {
    dpb_fail(400, 'Petición no válida.');
}
if ($method === 'POST' && stripos((string) ($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') === false && $action !== 'logout') {
    dpb_fail(415, 'Se esperaba JSON.');
}

dpb_start_session();

function body(): array
{
    $max = (int) (dpb_config()['max_payload_mb'] ?? 8) * 1024 * 1024;
    $raw = file_get_contents('php://input', false, null, 0, $max + 1);
    if ($raw === false || strlen($raw) > $max) {
        dpb_fail(413, 'Los datos son demasiado grandes.');
    }
    $data = json_decode($raw ?: '{}', true);
    if (!is_array($data)) {
        dpb_fail(400, 'JSON no válido.');
    }
    return $data;
}

function require_user(): string
{
    $user = dpb_current_user();
    if ($user === null) {
        dpb_fail(401, 'Inicia sesión.');
    }
    return $user;
}

function require_post(string $method): void
{
    if ($method !== 'POST') {
        dpb_fail(405, 'Método no permitido.');
    }
}

$db = dpb_db();

switch ($action) {
    case 'me':
        dpb_json(['ok' => true, 'app' => 'daprintbox', 'user' => require_user()]);

    case 'login':
        require_post($method);
        $in = body();
        $ip = dpb_client_ip();
        // Máximo 10 intentos fallidos por IP cada 15 minutos
        $db->prepare('DELETE FROM dpb_login_attempts WHERE attempted_at < ?')->execute([date('Y-m-d H:i:s', time() - 900)]);
        $q = $db->prepare('SELECT COUNT(*) FROM dpb_login_attempts WHERE ip = ?');
        $q->execute([$ip]);
        if ((int) $q->fetchColumn() >= 10) {
            dpb_fail(429, 'Demasiados intentos. Espera 15 minutos.');
        }
        $username = trim((string) ($in['username'] ?? ''));
        $password = (string) ($in['password'] ?? '');
        $q = $db->prepare('SELECT username, password_hash FROM dpb_users WHERE username = ?');
        $q->execute([$username]);
        $row = $q->fetch();
        if (!$row || !password_verify($password, $row['password_hash'])) {
            $db->prepare('INSERT INTO dpb_login_attempts (ip, attempted_at) VALUES (?, ?)')->execute([$ip, dpb_now()]);
            usleep(400000);
            dpb_fail(401, 'Usuario o contraseña incorrectos.');
        }
        if (password_needs_rehash($row['password_hash'], PASSWORD_DEFAULT)) {
            $db->prepare('UPDATE dpb_users SET password_hash = ? WHERE username = ?')
                ->execute([password_hash($password, PASSWORD_DEFAULT), $row['username']]);
        }
        session_regenerate_id(true);
        $_SESSION['user'] = $row['username'];
        dpb_json(['ok' => true, 'user' => $row['username']]);

    case 'logout':
        require_post($method);
        $_SESSION = [];
        session_destroy();
        dpb_json(['ok' => true]);

    case 'state':
        require_user();
        $row = $db->query('SELECT data, version, updated_at, updated_by FROM dpb_state WHERE id = 1')->fetch();
        if (!$row) {
            dpb_fail(500, 'Faltan las tablas. Ejecuta setup.php.');
        }
        $meta = ['ok' => true, 'version' => (int) $row['version'], 'updated_at' => $row['updated_at'], 'updated_by' => $row['updated_by']];
        if (isset($_GET['since']) && (int) $_GET['since'] === (int) $row['version']) {
            dpb_json($meta + ['unchanged' => true]);
        }
        dpb_json($meta + ['data' => $row['data'] === null ? null : json_decode($row['data'], true)]);

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
            dpb_fail(409, 'Otra persona guardó cambios antes.', [
                'version' => (int) $row['version'],
                'updated_by' => $row['updated_by'],
                'updated_at' => $row['updated_at'],
                'data' => $row['data'] === null ? null : json_decode($row['data'], true),
            ]);
        }
        $version = $base + 1;
        $now = dpb_now();
        $db->prepare('UPDATE dpb_state SET data = ?, version = ?, updated_at = ?, updated_by = ? WHERE id = 1')
            ->execute([$json, $version, $now, $user]);
        $db->prepare('INSERT INTO dpb_history (version, data, saved_at, saved_by) VALUES (?, ?, ?, ?)')
            ->execute([$version, $json, $now, $user]);
        $keep = max(1, (int) (dpb_config()['history_keep'] ?? 200));
        $db->prepare('DELETE FROM dpb_history WHERE version <= ?')->execute([$version - $keep]);
        $db->commit();
        dpb_json(['ok' => true, 'version' => $version, 'updated_at' => $now, 'updated_by' => $user]);

    case 'history':
        require_user();
        $rows = $db->query('SELECT version, saved_at, saved_by, LENGTH(data) AS bytes FROM dpb_history ORDER BY version DESC LIMIT 50')->fetchAll();
        dpb_json(['ok' => true, 'versions' => array_map(fn ($r) => [
            'version' => (int) $r['version'], 'saved_at' => $r['saved_at'], 'saved_by' => $r['saved_by'], 'bytes' => (int) $r['bytes'],
        ], $rows)]);

    case 'history_get':
        require_user();
        $q = $db->prepare('SELECT version, data, saved_at, saved_by FROM dpb_history WHERE version = ?');
        $q->execute([(int) ($_GET['version'] ?? 0)]);
        $row = $q->fetch();
        if (!$row) {
            dpb_fail(404, 'Esa versión ya no existe.');
        }
        dpb_json(['ok' => true, 'version' => (int) $row['version'], 'saved_at' => $row['saved_at'], 'saved_by' => $row['saved_by'], 'data' => json_decode($row['data'], true)]);

    default:
        dpb_fail(404, 'Acción desconocida.');
}
