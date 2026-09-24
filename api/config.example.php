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

    // Formas de entrar: 'google' (cuenta de Google) y/o 'password' (usuario y contraseña de setup.php)
    'login_methods' => array('google'),

    // Acceso con Google: el "ID de cliente" que crea Google Cloud (ver INSTALACION.md)
    'google_client_id' => 'xxxxxxxxxxxx-xxxxxxxxxxxxxxxx.apps.googleusercontent.com',

    // Correos de Google que pueden entrar. También vale un dominio entero: '@mitaller.com'
    'allowed_emails' => array(
        'persona1@gmail.com',
        'persona2@gmail.com',
    ),

    // Clave para usar setup.php (comprobar el servidor, crear tablas y usuarios). Pon una frase larga y secreta.
    'setup_key' => 'cambia-esto-por-una-clave-larga-y-secreta',

    // Cuántas versiones anteriores de los datos se guardan como copia de seguridad.
    'history_keep' => 200,

    // Tamaño máximo de los datos en MB.
    'max_payload_mb' => 8,

    // Duración de la sesión iniciada (días).
    'session_days' => 30,
);
