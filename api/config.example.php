<?php
/*
 * Configuración de Libreta Maker en el servidor.
 * Copia este archivo como "config.php" y rellena tus datos.
 * config.php nunca debe subirse a GitHub (está en .gitignore).
 */
return array(
    // Datos de conexión a MySQL (los da el panel de tu hosting: cPanel, Plesk…)
    'db_host' => 'localhost',
    'db_port' => 3306,
    'db_name' => 'nombre_de_la_base_de_datos',
    'db_user' => 'usuario_mysql',
    'db_pass' => 'contraseña_mysql',

    // Formas de entrar: 'password' (usuario y contraseña) y/o 'google' (cuenta de Google).
    // Cada usuario tiene su propia libreta: sus datos son privados.
    'login_methods' => array('password'),

    // ¿Se pueden crear cuentas desde la propia app (botón «Crear cuenta»)?
    // Si es false, solo tú creas usuarios desde setup.php.
    'allow_registration' => true,

    // Código de invitación que hay que escribir para crear una cuenta ('' = sin código).
    // Muy recomendable: así un desconocido no puede registrarse en tu servidor.
    'registration_code' => 'cambia-este-codigo',

    // Número máximo de cuentas (0 = sin límite).
    'max_users' => 0,

    // Acceso con Google (solo si añades 'google' a login_methods): el "ID de cliente" de Google Cloud (ver INSTALACION.md)
    'google_client_id' => 'xxxxxxxxxxxx-xxxxxxxxxxxxxxxx.apps.googleusercontent.com',

    // Correos de Google que pueden entrar (cada uno con su libreta). También vale un dominio entero: '@mitaller.com'
    'allowed_emails' => array(
        'persona1@gmail.com',
        'persona2@gmail.com',
    ),

    // Clave para usar setup.php (comprobar el servidor, tablas y usuarios). Pon una frase larga y secreta.
    'setup_key' => 'cambia-esto-por-una-clave-larga-y-secreta',

    // Cuántas versiones anteriores de cada libreta se guardan como copia de seguridad.
    'history_keep' => 200,

    // Tamaño máximo de los datos en MB.
    'max_payload_mb' => 8,

    // Duración de la sesión iniciada (días).
    'session_days' => 30,
);
