<?php
/*
 * Servidor MCP de Libreta Maker: deja que un agente de IA (Claude, ChatGPT, Claude Code…) consulte
 * y apunte en la libreta de un usuario. Protocolo MCP por HTTP («Streamable HTTP»), sin sesiones y
 * con respuestas JSON. Compatible con PHP 5.6 y superiores.
 *
 * Acceso con un token que cada usuario crea en la app (Ajustes → Agentes de IA). Se envía:
 *   - en la cabecera  Authorization: Bearer lm_…   (Claude Code, Claude Desktop con configuración, Cursor…)
 *   - o en la dirección  …/api/mcp.php?token=lm_…  (conectores personalizados de claude.ai y de la app de Claude)
 */
require __DIR__ . '/lib.php';
require __DIR__ . '/calc.php';
require __DIR__ . '/mcp_tools.php';

define('LM_MCP_VERSION', '1.0.0');

$tz = (string) dpb_get(dpb_config(), 'timezone', 'Europe/Madrid');
if ($tz !== '') {
    @date_default_timezone_set($tz);
}

// Los clientes que funcionan en el navegador (p. ej. el inspector de MCP) necesitan CORS. No hay cookies:
// el acceso va siempre con el token, así que permitir cualquier origen no da acceso a nadie más.
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID');
header('Access-Control-Expose-Headers: Mcp-Session-Id, WWW-Authenticate');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

$method = (string) dpb_get($_SERVER, 'REQUEST_METHOD', 'GET');
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if ($method !== 'POST') {
    // Sin flujo de eventos (SSE): todas las respuestas van en la respuesta a cada POST.
    http_response_code(405);
    header('Allow: POST, OPTIONS');
    header('Content-Type: text/plain; charset=utf-8');
    echo "Servidor MCP de Libreta Maker.\nAñádelo como conector en tu asistente de IA: las instrucciones están en la app, en Ajustes → Agentes de IA.\n";
    exit;
}

function mcp_send($payload, $status = 200)
{
    http_response_code($status);
    if ($payload === null) {
        exit;
    }
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function mcp_error($id, $code, $message, $status = 200)
{
    mcp_send(array('jsonrpc' => '2.0', 'id' => $id, 'error' => array('code' => $code, 'message' => $message)), $status);
}

function mcp_token_from_request()
{
    $h = '';
    foreach (array('HTTP_AUTHORIZATION', 'REDIRECT_HTTP_AUTHORIZATION') as $k) {
        if (!empty($_SERVER[$k])) {
            $h = (string) $_SERVER[$k];
            break;
        }
    }
    if ($h === '' && function_exists('getallheaders')) {
        foreach ((array) getallheaders() as $name => $value) {
            if (strtolower($name) === 'authorization') {
                $h = (string) $value;
            }
        }
    }
    if (preg_match('/^\s*Bearer\s+(\S+)/i', $h, $m)) {
        return $m[1];
    }
    if (!empty($_GET['token'])) {
        return (string) $_GET['token'];
    }
    $path = trim((string) dpb_get($_SERVER, 'PATH_INFO', ''), '/');
    return $path !== '' ? $path : '';
}

if (!dpb_mcp_enabled()) {
    mcp_error(null, -32001, 'El acceso para agentes de IA está desactivado en este servidor (mcp_enabled en api/config.php).', 403);
}

$db = dpb_db();
dpb_tokens_table($db);

// Máximo 10 tokens incorrectos por IP cada 15 minutos (la misma tabla que los intentos de entrar)
$db->prepare('DELETE FROM dpb_login_attempts WHERE attempted_at < ?')->execute(array(date('Y-m-d H:i:s', time() - 900)));
$q = $db->prepare('SELECT COUNT(*) FROM dpb_login_attempts WHERE ip = ?');
$q->execute(array(dpb_client_ip()));
if ((int) $q->fetchColumn() >= 10) {
    mcp_error(null, -32001, 'Demasiados intentos. Espera 15 minutos.', 429);
}

$token = mcp_token_from_request();
$auth = null;
if (preg_match('/^lm_[a-f0-9]{40}$/', $token)) {
    $q = $db->prepare('SELECT t.id, t.name, t.can_write, t.user_id, u.username, u.display_name
        FROM dpb_tokens t JOIN dpb_users u ON u.id = t.user_id WHERE t.token_hash = ?');
    $q->execute(array(hash('sha256', $token)));
    $auth = $q->fetch();
}
if (!$auth) {
    if ($token !== '') {
        // solo cuentan las claves incorrectas, no las peticiones sin clave (algunos clientes prueban así primero)
        $db->prepare('INSERT INTO dpb_login_attempts (ip, attempted_at) VALUES (?, ?)')->execute(array(dpb_client_ip(), dpb_now()));
    }
    header('WWW-Authenticate: Bearer realm="Libreta Maker"');
    mcp_error(null, -32001, $token === ''
        ? 'Falta el token de acceso. Créalo en la app: Ajustes → Agentes de IA.'
        : 'Token de acceso no válido o revocado. Crea uno nuevo en la app: Ajustes → Agentes de IA.', 401);
}
$db->prepare('UPDATE dpb_tokens SET last_used_at = ? WHERE id = ?')->execute(array(dpb_now(), (int) $auth['id']));

$uid = (int) $auth['user_id'];
$canWrite = (bool) $auth['can_write'];
$person = trim((string) $auth['display_name']) !== '' ? $auth['display_name'] : $auth['username'];
$savedBy = $auth['username'] . ' · ' . $auth['name'];
$today = date('Y-m-d');

$max = (int) dpb_get(dpb_config(), 'max_payload_mb', 8) * 1024 * 1024;
$raw = file_get_contents('php://input', false, null, 0, $max + 1);
if ($raw === false || strlen($raw) > $max) {
    mcp_error(null, -32600, 'Petición demasiado grande.', 413);
}
$msg = json_decode((string) $raw, true);
if (!is_array($msg)) {
    mcp_error(null, -32700, 'JSON no válido.', 400);
}

function mcp_instructions($person, $today, $canWrite, $currency)
{
    return "Libreta Maker es la libreta de un taller maker de {$person}: controla el stock de filamento y resina para impresión 3D, "
        . 'los materiales en plancha (láser y sellos), los componentes, las máquinas, los trabajos (con su coste calculado), las ventas y los gastos. '
        . "Hoy es {$today}. La moneda de la libreta es {$currency}.\n"
        . "- Unidades: el filamento va en gramos y la resina en ml (o g); los materiales en planchas, y las medidas de cada pieza en mm; el tiempo de máquina en horas (2.5 = 2 h 30 min).\n"
        . "- Antes de registrar, editar o borrar, usa las herramientas de consulta para conocer los ids: nunca te los inventes. Si un nombre coincide con varias fichas, pregunta cuál.\n"
        . ($canWrite
            ? "- Antes de CUALQUIER escritura (registrar, reponer, guardar, cambiar ajustes o eliminar), resume al usuario lo que vas a guardar y espera su confirmación, salvo que ya te haya dado todos los datos de forma explícita. Para eliminar, pide siempre confirmación.\n"
            . "- Al registrar un trabajo, el coste se calcula como en la app y el material se descuenta del stock. Si el usuario solo quiere un presupuesto, usa calcular_coste, que no guarda nada.\n"
            . "- Las compras de filamento, planchas o componentes se apuntan con reponer_stock (suma al stock y crea el gasto), no con registrar_gasto.\n"
            : "- Este acceso es de solo lectura: puedes consultar y calcular costes, pero no guardar cambios. Si el usuario quiere apuntar algo, dile que lo haga en la app o que cree un acceso con permiso para cambios.\n")
        . "- Convierte las fechas relativas («ayer», «el lunes») a AAAA-MM-DD a partir de hoy.\n"
        . "- Las fotos solo se pueden añadir desde la app; aquí se pueden ver con ver_fotos.\n"
        . '- Responde en el idioma del usuario, aunque los datos y las herramientas estén en español.';
}

function mcp_tools_for($canWrite)
{
    $out = array();
    foreach (lm_tools() as $t) {
        if ($t['write'] && !$canWrite) {
            continue;
        }
        unset($t['write']);
        $out[] = $t;
    }
    return $out;
}

function mcp_text_result($data, $isError = false)
{
    $text = is_string($data) ? $data : json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    return array('content' => array(array('type' => 'text', 'text' => $text)), 'isError' => $isError);
}

function mcp_load_state($db, $uid)
{
    $q = $db->prepare('SELECT data FROM dpb_user_state WHERE user_id = ?');
    $q->execute(array($uid));
    $row = $q->fetch();
    return lm_normalize(($row && $row['data'] !== null) ? json_decode($row['data'], true) : array());
}

function mcp_call_tool($db, $uid, $name, $args, $canWrite, $savedBy, $today)
{
    $tool = lm_tool($name);
    if (!$tool) {
        return array('error' => array(-32602, "Herramienta desconocida: {$name}"));
    }
    if ($tool['write'] && !$canWrite) {
        return array('result' => mcp_text_result('Este acceso es de solo lectura: no puede guardar cambios. Crea en la app un acceso con permiso para cambios.', true));
    }
    try {
        if (!$tool['write']) {
            $state = mcp_load_state($db, $uid);
            $r = lm_call_tool($name, $args, $state, $today);
        } else {
            $r = null;
            $out = dpb_change_state($db, $uid, $savedBy, function (&$data) use ($name, $args, $today, &$r) {
                $data = lm_normalize($data);
                $r = lm_call_tool($name, $args, $data, $today);
                return (bool) $r['changed'];
            });
            if ($out[1] !== null) {
                $r['data']['version_de_la_libreta'] = $out[1];
            }
        }
    } catch (LmToolError $e) {
        return array('result' => mcp_text_result($e->getMessage(), true));
    }
    $result = mcp_text_result($r['data']);
    if (!empty($r['photos'])) {
        dpb_photos_table($db);
        $col = $r['size'] === 'thumb' ? 'thumb' : 'data';
        $q = $db->prepare("SELECT $col AS bin FROM dpb_photos WHERE user_id = ? AND id = ?");
        $missing = 0;
        foreach ($r['photos'] as $pid) {
            $q->execute(array($uid, $pid));
            $bin = $q->fetchColumn();
            $mime = $bin ? dpb_image_mime($bin) : null;
            if ($mime) {
                $result['content'][] = array('type' => 'image', 'data' => base64_encode($bin), 'mimeType' => $mime);
            } else {
                $missing++;
            }
        }
        if ($missing) {
            $result['content'][] = array('type' => 'text', 'text' => "{$missing} foto(s) aún no están en el servidor (se subirán cuando el dispositivo que las hizo tenga conexión).");
        }
    } elseif (isset($r['photos'])) {
        $result['content'][0]['text'] .= "\n(No tiene fotos.)";
    }
    return array('result' => $result);
}

/** Atiende un mensaje JSON-RPC; devuelve la respuesta o null si era una notificación. */
function mcp_handle($m, $ctx)
{
    if (!is_array($m) || dpb_get($m, 'jsonrpc') !== '2.0') {
        return array('jsonrpc' => '2.0', 'id' => null, 'error' => array('code' => -32600, 'message' => 'Mensaje JSON-RPC no válido.'));
    }
    if (!isset($m['method'])) {
        return null; // respuesta del cliente a algo que no hemos pedido
    }
    $isRequest = array_key_exists('id', $m);
    $id = $isRequest ? $m['id'] : null;
    $params = (isset($m['params']) && is_array($m['params'])) ? $m['params'] : array();
    $res = null;
    switch ($m['method']) {
        case 'initialize':
            $supported = array('2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05');
            $asked = (string) dpb_get($params, 'protocolVersion', '');
            $res = array(
                'protocolVersion' => in_array($asked, $supported, true) ? $asked : '2025-06-18',
                'capabilities' => array('tools' => array('listChanged' => false)),
                'serverInfo' => array('name' => 'libreta-maker', 'title' => 'Libreta Maker', 'version' => LM_MCP_VERSION),
                'instructions' => mcp_instructions($ctx['person'], $ctx['today'], $ctx['canWrite'], $ctx['currency']),
            );
            break;
        case 'ping':
            $res = new stdClass();
            break;
        case 'tools/list':
            $res = array('tools' => mcp_tools_for($ctx['canWrite']));
            break;
        case 'tools/call':
            $name = (string) dpb_get($params, 'name', '');
            $args = dpb_get($params, 'arguments', array());
            $r = mcp_call_tool($ctx['db'], $ctx['uid'], $name, is_array($args) ? $args : array(), $ctx['canWrite'], $ctx['savedBy'], $ctx['today']);
            if (isset($r['error'])) {
                return $isRequest ? array('jsonrpc' => '2.0', 'id' => $id, 'error' => array('code' => $r['error'][0], 'message' => $r['error'][1])) : null;
            }
            $res = $r['result'];
            break;
        case 'resources/list':
            $res = array('resources' => array());
            break;
        case 'prompts/list':
            $res = array('prompts' => array());
            break;
        default:
            if (strpos($m['method'], 'notifications/') === 0 || !$isRequest) {
                return null;
            }
            return array('jsonrpc' => '2.0', 'id' => $id, 'error' => array('code' => -32601, 'message' => 'Método no disponible: ' . $m['method']));
    }
    return $isRequest ? array('jsonrpc' => '2.0', 'id' => $id, 'result' => $res) : null;
}

$state = mcp_load_state($db, $uid);
$ctx = array('db' => $db, 'uid' => $uid, 'canWrite' => $canWrite, 'savedBy' => $savedBy, 'today' => $today,
    'person' => $person, 'currency' => $state['settings']['currency']);
unset($state);

$isBatch = array_keys($msg) === range(0, count($msg) - 1) && count($msg) > 0;
$responses = array();
foreach ($isBatch ? $msg : array($msg) as $m) {
    try {
        $r = mcp_handle($m, $ctx);
    } catch (Exception $e) {
        error_log('Libreta Maker MCP: ' . $e->getMessage());
        $r = array('jsonrpc' => '2.0', 'id' => is_array($m) && isset($m['id']) ? $m['id'] : null,
            'error' => array('code' => -32603, 'message' => 'Error interno del servidor.'));
    }
    if ($r !== null) {
        $responses[] = $r;
    }
}
if (!$responses) {
    mcp_send(null, 202); // solo notificaciones
}
mcp_send($isBatch ? $responses : $responses[0]);
