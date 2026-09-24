<?php
/*
 * Instalador de Libreta Maker: comprueba el servidor, crea o actualiza las tablas y gestiona
 * los usuarios (cada uno con su propia libreta). Protegido por la "setup_key" de config.php.
 * Compatible con PHP 5.6 y superiores. Cuando termines, puedes borrar este archivo.
 */
define('DPB_HTML_ERRORS', true); // los errores del instalador se muestran como página, no como JSON
require __DIR__ . '/lib.php';

// Muchos hostings guardan en caché los archivos PHP: se fuerza a leer el config.php recién editado
$configFile = __DIR__ . '/config.php';
if (function_exists('opcache_invalidate') && is_file($configFile)) {
    @opcache_invalidate($configFile, true);
}
clearstatcache();

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');

$config = dpb_config();
$setupKey = trim((string) dpb_get($config, 'setup_key', ''));
$key = trim((string) dpb_get($_POST, 'setup_key', ''));
// Si config.php se guardó con otra codificación (ñ, tildes…), se pasa a UTF-8 antes de comparar
if ($setupKey !== '' && function_exists('mb_check_encoding') && !mb_check_encoding($setupKey, 'UTF-8')) {
    $setupKey = mb_convert_encoding($setupKey, 'UTF-8', 'ISO-8859-1');
}
$messages = array();
$errors = array();
$users = array();
$checks = array();
$legacy = null;
$authorized = false;
$methods = dpb_login_methods();

$exampleKey = 'cambia-esto-por-una-clave-larga-y-secreta';
$keyProblem = '';
if ($setupKey === '') {
    $keyProblem = 'la línea «setup_key» está vacía o no existe';
} elseif ($setupKey === $exampleKey) {
    $keyProblem = 'la clave sigue siendo la de ejemplo («' . $exampleKey . '»)';
} elseif (strlen($setupKey) < 8) {
    $keyProblem = 'la clave es demasiado corta (mínimo 8 caracteres)';
}
$openSetup = dpb_get($config, 'setup_sin_clave', false) === true;
if ($openSetup) {
    // Vía alternativa: instalador abierto sin clave mientras config.php lo permita
    $keyProblem = '';
    $setupKey = 'setup-sin-clave';
    if (dpb_get($_SERVER, 'REQUEST_METHOD') !== 'POST') {
        $_SERVER['REQUEST_METHOD'] = 'POST';
    }
    $key = $setupKey;
}
if ($keyProblem !== '') {
    $errors[] = 'Pon una «setup_key» propia en api/config.php: ' . $keyProblem . '.';
    $errors[] = 'Archivo que se está leyendo: ' . $configFile . ' (guardado por última vez el ' . date('d/m/Y \a \l\a\s H:i:s', (int) @filemtime($configFile)) . '). Si no coincide con el que has editado, o la fecha no es la de tu último cambio, estás editando otro archivo.';
} elseif (dpb_get($_SERVER, 'REQUEST_METHOD') === 'POST') {
    if (!hash_equals($setupKey, $key)) {
        usleep(500000);
        $len = function ($t) { return function_exists('mb_strlen') ? mb_strlen($t, 'UTF-8') : strlen($t); };
        $errors[] = 'La clave de instalación no coincide con la «setup_key» de api/config.php. Has escrito ' . $len($key)
            . ' caracteres y la de config.php tiene ' . $len($setupKey) . '. Lo más fácil: copia la clave de config.php (lo que hay entre las comillas) y pégala aquí. Distingue mayúsculas y minúsculas. Si aun así no coincide, cambia la clave por una solo con letras sin tilde, números y guiones (sin ñ, tildes, comillas ni barras).';
    } else {
        $authorized = true;

        // Comprobaciones del servidor
        $checks[] = array(version_compare(PHP_VERSION, '5.6.0', '>='), 'PHP ' . PHP_VERSION, 'Se necesita PHP 5.6 o superior.');
        $checks[] = array(extension_loaded('pdo_mysql'), 'Extensión pdo_mysql', 'Actívala en el panel del hosting (selector de versión de PHP → extensiones).');
        $checks[] = array(dpb_is_https(), 'Conexión HTTPS', 'Activa el certificado SSL (Let\'s Encrypt) en el panel del hosting.');
        if (in_array('password', $methods, true)) {
            $reg = (bool) dpb_get($config, 'allow_registration', false);
            $code = (string) dpb_get($config, 'registration_code', '');
            $checks[] = array(true, $reg ? ('Registro de cuentas nuevas: abierto' . ($code !== '' ? ' con código de invitación' : ' SIN código de invitación')) : 'Registro de cuentas nuevas: cerrado (solo tú creas usuarios aquí)', '');
            if ($reg && $code === 'cambia-este-codigo') {
                $checks[] = array(false, 'Código de invitación', 'Cambia el registration_code de ejemplo de config.php por uno tuyo.');
            } elseif ($reg && $code === '') {
                $checks[] = array(false, 'Código de invitación', 'Cualquiera que encuentre la web podría crearse una cuenta. Pon un registration_code en config.php y compártelo solo con quien quieras.');
            }
        }
        if (in_array('google', $methods, true)) {
            $clientId = (string) dpb_get($config, 'google_client_id', '');
            $checks[] = array(extension_loaded('openssl'), 'Extensión openssl', 'Necesaria para comprobar los accesos con Google.');
            $checks[] = array(function_exists('curl_init') || ini_get('allow_url_fopen'), 'Descargas desde PHP (curl o allow_url_fopen)', 'Activa la extensión curl en el panel del hosting.');
            $checks[] = array(count(dpb_google_certs(true)) > 0, 'Conexión con Google', 'El servidor no pudo conectarse a www.googleapis.com.');
            $checks[] = array(preg_match('/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/', $clientId) === 1, 'google_client_id configurado', 'Pega en config.php el ID de cliente de Google Cloud (ver INSTALACION.md).');
            $emails = array_filter((array) dpb_get($config, 'allowed_emails', array()));
            $placeholder = count(array_filter($emails, function ($e) { return strpos($e, 'persona') === 0; })) > 0;
            $checks[] = array(count($emails) > 0 && !$placeholder, 'Correos de Google autorizados: ' . (count($emails) ? implode(', ', $emails) : 'ninguno'), 'Pon en allowed_emails los correos de Google de cada persona.');
        }

        $db = dpb_db();
        dpb_install($db);
        $checks[] = array(true, 'Base de datos y tablas', '');

        $op = (string) dpb_get($_POST, 'op', '');
        $username = trim((string) dpb_get($_POST, 'username', ''));
        if ($op === 'save_user') {
            $password = (string) dpb_get($_POST, 'password', '');
            if (!dpb_valid_username($username)) {
                $errors[] = 'El usuario debe tener entre 2 y 50 letras, números, puntos, guiones o guiones bajos.';
            } elseif (strlen($password) < 8) {
                $errors[] = 'La contraseña debe tener al menos 8 caracteres.';
            } else {
                $hash = password_hash($password, PASSWORD_DEFAULT);
                $q = $db->prepare('SELECT id FROM dpb_users WHERE username = ?');
                $q->execute(array($username));
                if ($q->fetch()) {
                    $db->prepare('UPDATE dpb_users SET password_hash = ? WHERE username = ?')->execute(array($hash, $username));
                    $messages[] = "Contraseña de «{$username}» actualizada.";
                } else {
                    $db->prepare('INSERT INTO dpb_users (username, password_hash, created_at) VALUES (?, ?, ?)')->execute(array($username, $hash, dpb_now()));
                    $messages[] = "Usuario «{$username}» creado, con su libreta vacía.";
                }
            }
        } elseif ($op === 'delete_user') {
            $q = $db->prepare('SELECT id FROM dpb_users WHERE username = ?');
            $q->execute(array($username));
            $id = $q->fetchColumn();
            if ($id) {
                $db->prepare('DELETE FROM dpb_history WHERE user_id = ?')->execute(array($id));
                $db->prepare('DELETE FROM dpb_user_state WHERE user_id = ?')->execute(array($id));
                $db->prepare('DELETE FROM dpb_users WHERE id = ?')->execute(array($id));
                $messages[] = "Usuario «{$username}» y su libreta eliminados.";
            }
        } elseif ($op === 'assign_legacy') {
            $q = $db->prepare('SELECT id FROM dpb_users WHERE username = ?');
            $q->execute(array($username));
            $id = $q->fetchColumn();
            $result = $id ? dpb_assign_legacy_state($db, (int) $id) : 'Usuario no encontrado.';
            if ($result === true) {
                $messages[] = "La libreta compartida anterior ahora es la libreta de «{$username}».";
            } else {
                $errors[] = $result;
            }
        }
        $users = $db->query('SELECT u.username, u.email, u.password_hash IS NOT NULL AS has_password, u.created_at, u.last_login_at,
            s.version, LENGTH(s.data) AS bytes
            FROM dpb_users u LEFT JOIN dpb_user_state s ON s.user_id = u.id ORDER BY u.username')->fetchAll();
        $legacy = dpb_legacy_state($db);
    }
}

function h($s)
{
    return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
}

function hidden_key($key)
{
    return '<input type="hidden" name="setup_key" value="' . h($key) . '">';
}
?><!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Instalación de Libreta Maker</title>
<style>
  :root { color-scheme: light dark; --bg:#f9f9f7; --card:#fff; --ink:#111; --muted:#666; --line:#ddd; --accent:#2a78d6; --ok:#006300; --bad:#c62828; }
  @media (prefers-color-scheme: dark) { :root { --bg:#111; --card:#1b1b1a; --ink:#f3f3f3; --muted:#aaa; --line:#333; --accent:#3987e5; --ok:#3fbf3f; --bad:#ff6b6b; } }
  body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 system-ui, sans-serif; padding:24px 16px; }
  main { max-width:680px; margin:0 auto; display:grid; gap:16px; }
  section { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:16px; overflow-x:auto; }
  h1 { font-size:1.3rem; margin:0; } h2 { font-size:1rem; margin:0 0 10px; }
  label { display:block; font-size:.85rem; color:var(--muted); margin:10px 0 4px; font-weight:600; }
  input, select { width:100%; box-sizing:border-box; padding:8px 10px; border:1px solid var(--line); border-radius:8px; background:var(--bg); color:var(--ink); font:inherit; }
  button { margin-top:12px; padding:8px 14px; border-radius:8px; border:0; background:var(--accent); color:#fff; font:inherit; font-weight:600; cursor:pointer; }
  button.link { background:none; color:var(--bad); padding:0; margin:0; font-weight:400; }
  .ok { color:var(--ok); } .bad { color:var(--bad); } .muted { color:var(--muted); font-size:.9rem; }
  table { width:100%; border-collapse:collapse; font-size:.9rem; } th { text-align:left; color:var(--muted); font-weight:600; font-size:.8rem; }
  td, th { padding:6px 8px 6px 0; border-bottom:1px solid var(--line); vertical-align:top; }
  ul.checks { list-style:none; padding:0; margin:0; } ul.checks li { padding:6px 0; border-bottom:1px solid var(--line); } ul.checks li:last-child { border:0; }
  .warn { border-color:#e0a800; }
</style>
</head>
<body>
<main>
  <h1>Instalación de Libreta Maker</h1>
  <p class="muted">Versión del instalador: 2026-09-25</p>
  <?php if (!empty($openSetup)): ?><p class="bad"><b>⚠ Instalador abierto sin clave</b> (<code>'setup_sin_clave' => true</code> en config.php). Cuando termines, cámbialo a <code>false</code> o borra esa línea: mientras esté así, cualquiera que conozca esta dirección podría gestionar los usuarios.</p><?php endif; ?>
  <?php foreach ($messages as $m): ?><p class="ok">✓ <?php echo h($m); ?></p><?php endforeach; ?>
  <?php foreach ($errors as $e): ?><p class="bad">⚠ <?php echo h($e); ?></p><?php endforeach; ?>

  <?php if (!$authorized): ?>
  <section>
    <h2>Comprobar el servidor</h2>
    <p class="muted">Escribe la <b>setup_key</b> que pusiste en <code>api/config.php</code>. Se comprobará el servidor y se crearán o actualizarán las tablas.</p>
    <form method="post">
      <label for="k1">Clave de instalación</label>
      <input id="k1" type="password" name="setup_key" required autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false">
      <label style="display:flex;gap:6px;align-items:center;font-weight:400"><input type="checkbox" style="width:auto" onclick="document.getElementById('k1').type = this.checked ? 'text' : 'password'"> Mostrar lo que escribo</label>
      <button type="submit">Continuar</button>
    </form>
  </section>
  <?php else: ?>
  <section>
    <h2>Estado del servidor</h2>
    <ul class="checks">
      <?php foreach ($checks as $c): ?>
      <li class="<?php echo $c[0] ? 'ok' : 'bad'; ?>"><?php echo $c[0] ? '✓' : '✗'; ?> <?php echo h($c[1]); ?>
        <?php if (!$c[0] && $c[2]): ?><div class="muted"><?php echo h($c[2]); ?></div><?php endif; ?></li>
      <?php endforeach; ?>
    </ul>
    <p class="muted">Formas de entrar activadas: <b><?php echo h(implode(', ', $methods)); ?></b> (<code>login_methods</code> en config.php).</p>
  </section>

  <?php if ($legacy): ?>
  <section class="warn">
    <h2>Libreta compartida de la versión anterior</h2>
    <p class="muted">Hay datos guardados cuando la app tenía una sola libreta para todos (versión <?php echo (int) $legacy['version']; ?>, último cambio de <?php echo h($legacy['updated_by']); ?> el <?php echo h($legacy['updated_at']); ?>). Ahora cada usuario tiene su propia libreta: elige a quién pertenecen estos datos. Debe ser un usuario que aún no tenga datos.</p>
    <?php if ($users): ?>
    <form method="post">
      <?php echo hidden_key($key); ?>
      <input type="hidden" name="op" value="assign_legacy">
      <label for="lu">Asignar a</label>
      <select id="lu" name="username"><?php foreach ($users as $u): ?><option value="<?php echo h($u['username']); ?>"><?php echo h($u['username']); ?><?php echo $u['bytes'] ? ' (ya tiene datos)' : ''; ?></option><?php endforeach; ?></select>
      <button type="submit">Asignar la libreta</button>
    </form>
    <?php else: ?><p class="muted">Primero crea un usuario abajo.</p><?php endif; ?>
  </section>
  <?php endif; ?>

  <section>
    <h2>Usuarios y sus libretas</h2>
    <?php if (!$users): ?><p class="muted">Todavía no hay usuarios.</p><?php else: ?>
    <table>
      <tr><th>Usuario</th><th>Libreta</th><th>Último acceso</th><th></th></tr>
      <?php foreach ($users as $u): ?>
      <tr>
        <td><b><?php echo h($u['username']); ?></b><?php if (!$u['has_password']): ?> <span class="muted">(Google)</span><?php endif; ?>
          <div class="muted">desde <?php echo h(substr($u['created_at'], 0, 10)); ?></div></td>
        <td><?php echo $u['bytes'] ? h(number_format($u['bytes'] / 1024, 1, ',', '.')) . ' KB · v' . (int) $u['version'] : '<span class="muted">vacía</span>'; ?></td>
        <td><?php echo $u['last_login_at'] ? h(substr($u['last_login_at'], 0, 16)) : '<span class="muted">nunca</span>'; ?></td>
        <td style="text-align:right">
          <form method="post" onsubmit="return confirm('¿Eliminar este usuario y TODA su libreta? No se puede deshacer.')">
            <?php echo hidden_key($key); ?>
            <input type="hidden" name="op" value="delete_user">
            <input type="hidden" name="username" value="<?php echo h($u['username']); ?>">
            <button class="link" type="submit">Eliminar</button>
          </form>
        </td></tr>
      <?php endforeach; ?>
    </table>
    <?php endif; ?>
  </section>

  <?php if (in_array('password', $methods, true)): ?>
  <section>
    <h2>Crear usuario o cambiar su contraseña</h2>
    <form method="post">
      <?php echo hidden_key($key); ?>
      <input type="hidden" name="op" value="save_user">
      <label for="u">Usuario</label>
      <input id="u" name="username" required autocomplete="off" placeholder="ej. ana">
      <label for="p">Contraseña (mínimo 8 caracteres)</label>
      <input id="p" type="password" name="password" required minlength="8" autocomplete="new-password">
      <button type="submit">Guardar usuario</button>
    </form>
  </section>
  <?php endif; ?>

  <p class="muted">Si todo está en verde, abre la app y entra. Por seguridad puedes borrar <code>setup.php</code> del servidor; súbelo de nuevo cuando lo necesites.</p>
  <?php endif; ?>
</main>
</body>
</html>
