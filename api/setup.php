<?php
/*
 * Instalador de Daprintbox: crea las tablas en MySQL y gestiona los usuarios.
 * Protegido por la "setup_key" de config.php. Cuando termines, puedes borrar este archivo
 * del servidor (vuelve a subirlo si necesitas añadir usuarios o cambiar contraseñas).
 */
declare(strict_types=1);
require __DIR__ . '/lib.php';

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');

$config = dpb_config();
$key = (string) ($_POST['setup_key'] ?? '');
$messages = [];
$errors = [];
$users = [];
$authorized = false;

if (($config['setup_key'] ?? '') === '' || str_starts_with((string) $config['setup_key'], 'cambia-esto')) {
    $errors[] = 'Primero pon una "setup_key" propia en api/config.php.';
} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!hash_equals((string) $config['setup_key'], $key)) {
        usleep(500000);
        $errors[] = 'Clave de instalación incorrecta.';
    } else {
        $authorized = true;
        $db = dpb_db();
        dpb_install($db);
        $op = (string) ($_POST['op'] ?? '');
        $username = trim((string) ($_POST['username'] ?? ''));
        if ($op === 'save_user') {
            $password = (string) ($_POST['password'] ?? '');
            if (!preg_match('/^[\p{L}\p{N}._-]{2,50}$/u', $username)) {
                $errors[] = 'El usuario debe tener entre 2 y 50 letras, números, puntos, guiones o guiones bajos.';
            } elseif (strlen($password) < 8) {
                $errors[] = 'La contraseña debe tener al menos 8 caracteres.';
            } else {
                $hash = password_hash($password, PASSWORD_DEFAULT);
                $q = $db->prepare('SELECT id FROM dpb_users WHERE username = ?');
                $q->execute([$username]);
                if ($q->fetch()) {
                    $db->prepare('UPDATE dpb_users SET password_hash = ? WHERE username = ?')->execute([$hash, $username]);
                    $messages[] = "Contraseña de «{$username}» actualizada.";
                } else {
                    $db->prepare('INSERT INTO dpb_users (username, password_hash, created_at) VALUES (?, ?, ?)')->execute([$username, $hash, dpb_now()]);
                    $messages[] = "Usuario «{$username}» creado.";
                }
            }
        } elseif ($op === 'delete_user') {
            $db->prepare('DELETE FROM dpb_users WHERE username = ?')->execute([$username]);
            $messages[] = "Usuario «{$username}» eliminado.";
        } else {
            $messages[] = 'Tablas comprobadas: todo listo.';
        }
        $users = $db->query('SELECT username, created_at FROM dpb_users ORDER BY username')->fetchAll();
    }
}

$h = fn ($s) => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
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
  main { max-width:560px; margin:0 auto; display:grid; gap:16px; }
  section { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:16px; }
  h1 { font-size:1.3rem; margin:0; } h2 { font-size:1rem; margin:0 0 10px; }
  label { display:block; font-size:.85rem; color:var(--muted); margin:10px 0 4px; font-weight:600; }
  input { width:100%; box-sizing:border-box; padding:8px 10px; border:1px solid var(--line); border-radius:8px; background:var(--bg); color:var(--ink); font:inherit; }
  button { margin-top:12px; padding:8px 14px; border-radius:8px; border:0; background:var(--accent); color:#fff; font:inherit; font-weight:600; cursor:pointer; }
  button.link { background:none; color:var(--bad); padding:0; margin:0; font-weight:400; }
  .ok { color:var(--ok); } .bad { color:var(--bad); } .muted { color:var(--muted); font-size:.9rem; }
  table { width:100%; border-collapse:collapse; } td { padding:6px 0; border-bottom:1px solid var(--line); }
</style>
</head>
<body>
<main>
  <h1>Instalación de Daprintbox</h1>
  <?php foreach ($messages as $m): ?><p class="ok">✓ <?= $h($m) ?></p><?php endforeach; ?>
  <?php foreach ($errors as $e): ?><p class="bad">⚠ <?= $h($e) ?></p><?php endforeach; ?>

  <?php if (!$authorized): ?>
  <section>
    <h2>1. Comprobar la base de datos</h2>
    <p class="muted">Escribe la <b>setup_key</b> que pusiste en <code>api/config.php</code>. Se crearán las tablas si aún no existen.</p>
    <form method="post">
      <label for="k1">Clave de instalación</label>
      <input id="k1" type="password" name="setup_key" required autocomplete="off">
      <button type="submit">Continuar</button>
    </form>
  </section>
  <?php else: ?>
  <section>
    <h2>Usuarios</h2>
    <?php if (!$users): ?><p class="muted">Todavía no hay usuarios. Crea uno para cada persona que vaya a usar la app.</p><?php endif; ?>
    <table>
      <?php foreach ($users as $u): ?>
      <tr><td><b><?= $h($u['username']) ?></b> <span class="muted">· desde <?= $h(substr($u['created_at'], 0, 10)) ?></span></td>
        <td style="text-align:right">
          <form method="post" onsubmit="return confirm('¿Eliminar este usuario?')">
            <input type="hidden" name="setup_key" value="<?= $h($key) ?>">
            <input type="hidden" name="op" value="delete_user">
            <input type="hidden" name="username" value="<?= $h($u['username']) ?>">
            <button class="link" type="submit">Eliminar</button>
          </form>
        </td></tr>
      <?php endforeach; ?>
    </table>
  </section>
  <section>
    <h2>Crear usuario o cambiar contraseña</h2>
    <form method="post">
      <input type="hidden" name="setup_key" value="<?= $h($key) ?>">
      <input type="hidden" name="op" value="save_user">
      <label for="u">Usuario</label>
      <input id="u" name="username" required autocomplete="off" placeholder="ej. ana">
      <label for="p">Contraseña (mínimo 8 caracteres)</label>
      <input id="p" type="password" name="password" required minlength="8" autocomplete="new-password">
      <button type="submit">Guardar usuario</button>
    </form>
  </section>
  <p class="muted">Cuando tengas los usuarios creados, abre la app y entra con ellos. Por seguridad puedes borrar <code>setup.php</code> del servidor; súbelo de nuevo cuando necesites gestionar usuarios.</p>
  <?php endif; ?>
</main>
</body>
</html>
