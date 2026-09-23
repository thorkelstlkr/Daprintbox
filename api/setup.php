<?php
/*
 * Instalador de Daprintbox: comprueba el servidor, crea las tablas en MySQL y gestiona
 * los usuarios con contraseña. Protegido por la "setup_key" de config.php.
 * Compatible con PHP 5.6 y superiores. Cuando termines, puedes borrar este archivo.
 */
require __DIR__ . '/lib.php';

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');

$config = dpb_config();
$setupKey = (string) dpb_get($config, 'setup_key', '');
$key = (string) dpb_get($_POST, 'setup_key', '');
$messages = array();
$errors = array();
$users = array();
$checks = array();
$authorized = false;
$methods = dpb_login_methods();

if ($setupKey === '' || strpos($setupKey, 'cambia-esto') === 0) {
    $errors[] = 'Primero pon una "setup_key" propia en api/config.php.';
} elseif (dpb_get($_SERVER, 'REQUEST_METHOD') === 'POST') {
    if (!hash_equals($setupKey, $key)) {
        usleep(500000);
        $errors[] = 'Clave de instalación incorrecta.';
    } else {
        $authorized = true;

        // Comprobaciones del servidor
        $checks[] = array(version_compare(PHP_VERSION, '5.6.0', '>='), 'PHP ' . PHP_VERSION, 'Se necesita PHP 5.6 o superior.');
        $checks[] = array(extension_loaded('pdo_mysql'), 'Extensión pdo_mysql', 'Actívala en el panel del hosting (selector de versión de PHP → extensiones).');
        $checks[] = array(dpb_is_https(), 'Conexión HTTPS', 'Activa el certificado SSL (Let\'s Encrypt) en el panel del hosting. Google exige HTTPS.');
        if (in_array('google', $methods, true)) {
            $clientId = (string) dpb_get($config, 'google_client_id', '');
            $checks[] = array(extension_loaded('openssl'), 'Extensión openssl', 'Necesaria para comprobar los accesos con Google.');
            $checks[] = array(function_exists('curl_init') || ini_get('allow_url_fopen'), 'Descargas desde PHP (curl o allow_url_fopen)', 'Activa la extensión curl en el panel del hosting.');
            $checks[] = array(count(dpb_google_certs(true)) > 0, 'Conexión con Google', 'El servidor no pudo conectarse a www.googleapis.com.');
            $checks[] = array(preg_match('/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/', $clientId) === 1, 'google_client_id configurado', 'Pega en config.php el ID de cliente de Google Cloud (ver INSTALACION.md).');
            $emails = array_filter((array) dpb_get($config, 'allowed_emails', array()));
            $placeholder = count(array_filter($emails, function ($e) { return strpos($e, 'persona') === 0; })) > 0;
            $checks[] = array(count($emails) > 0 && !$placeholder, 'Correos autorizados: ' . (count($emails) ? implode(', ', $emails) : 'ninguno'), 'Pon en allowed_emails los correos de Google de cada persona.');
        }

        $db = dpb_db();
        dpb_install($db);
        $checks[] = array(true, 'Base de datos y tablas', '');

        $op = (string) dpb_get($_POST, 'op', '');
        $username = trim((string) dpb_get($_POST, 'username', ''));
        if ($op === 'save_user') {
            $password = (string) dpb_get($_POST, 'password', '');
            if (!preg_match('/^[\p{L}\p{N}._-]{2,50}$/u', $username)) {
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
                    $messages[] = "Usuario «{$username}» creado.";
                }
            }
        } elseif ($op === 'delete_user') {
            $db->prepare('DELETE FROM dpb_users WHERE username = ?')->execute(array($username));
            $messages[] = "Usuario «{$username}» eliminado.";
        }
        $users = $db->query('SELECT username, created_at FROM dpb_users ORDER BY username')->fetchAll();
    }
}

function h($s)
{
    return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
}
?><!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Instalación de Daprintbox</title>
<style>
  :root { color-scheme: light dark; --bg:#f9f9f7; --card:#fff; --ink:#111; --muted:#666; --line:#ddd; --accent:#2a78d6; --ok:#006300; --bad:#c62828; }
  @media (prefers-color-scheme: dark) { :root { --bg:#111; --card:#1b1b1a; --ink:#f3f3f3; --muted:#aaa; --line:#333; --accent:#3987e5; --ok:#3fbf3f; --bad:#ff6b6b; } }
  body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 system-ui, sans-serif; padding:24px 16px; }
  main { max-width:620px; margin:0 auto; display:grid; gap:16px; }
  section { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:16px; }
  h1 { font-size:1.3rem; margin:0; } h2 { font-size:1rem; margin:0 0 10px; }
  label { display:block; font-size:.85rem; color:var(--muted); margin:10px 0 4px; font-weight:600; }
  input { width:100%; box-sizing:border-box; padding:8px 10px; border:1px solid var(--line); border-radius:8px; background:var(--bg); color:var(--ink); font:inherit; }
  button { margin-top:12px; padding:8px 14px; border-radius:8px; border:0; background:var(--accent); color:#fff; font:inherit; font-weight:600; cursor:pointer; }
  button.link { background:none; color:var(--bad); padding:0; margin:0; font-weight:400; }
  .ok { color:var(--ok); } .bad { color:var(--bad); } .muted { color:var(--muted); font-size:.9rem; }
  table { width:100%; border-collapse:collapse; } td { padding:6px 0; border-bottom:1px solid var(--line); vertical-align:top; }
  ul.checks { list-style:none; padding:0; margin:0; } ul.checks li { padding:6px 0; border-bottom:1px solid var(--line); } ul.checks li:last-child { border:0; }
</style>
</head>
<body>
<main>
  <h1>Instalación de Daprintbox</h1>
  <?php foreach ($messages as $m): ?><p class="ok">✓ <?php echo h($m); ?></p><?php endforeach; ?>
  <?php foreach ($errors as $e): ?><p class="bad">⚠ <?php echo h($e); ?></p><?php endforeach; ?>

  <?php if (!$authorized): ?>
  <section>
    <h2>Comprobar el servidor</h2>
    <p class="muted">Escribe la <b>setup_key</b> que pusiste en <code>api/config.php</code>. Se comprobará el servidor y se crearán las tablas si aún no existen.</p>
    <form method="post">
      <label for="k1">Clave de instalación</label>
      <input id="k1" type="password" name="setup_key" required autocomplete="off">
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

  <?php if (in_array('password', $methods, true)): ?>
  <section>
    <h2>Usuarios con contraseña</h2>
    <?php if (!$users): ?><p class="muted">Todavía no hay usuarios.</p><?php endif; ?>
    <table>
      <?php foreach ($users as $u): ?>
      <tr><td><b><?php echo h($u['username']); ?></b> <span class="muted">· desde <?php echo h(substr($u['created_at'], 0, 10)); ?></span></td>
        <td style="text-align:right">
          <form method="post" onsubmit="return confirm('¿Eliminar este usuario?')">
            <input type="hidden" name="setup_key" value="<?php echo h($key); ?>">
            <input type="hidden" name="op" value="delete_user">
            <input type="hidden" name="username" value="<?php echo h($u['username']); ?>">
            <button class="link" type="submit">Eliminar</button>
          </form>
        </td></tr>
      <?php endforeach; ?>
    </table>
    <form method="post">
      <input type="hidden" name="setup_key" value="<?php echo h($key); ?>">
      <input type="hidden" name="op" value="save_user">
      <label for="u">Usuario</label>
      <input id="u" name="username" required autocomplete="off" placeholder="ej. ana">
      <label for="p">Contraseña (mínimo 8 caracteres)</label>
      <input id="p" type="password" name="password" required minlength="8" autocomplete="new-password">
      <button type="submit">Crear usuario o cambiar contraseña</button>
    </form>
  </section>
  <?php endif; ?>

  <p class="muted">Si todo está en verde, abre la app y entra. Por seguridad puedes borrar <code>setup.php</code> del servidor; súbelo de nuevo cuando lo necesites.</p>
  <?php endif; ?>
</main>
</body>
</html>
