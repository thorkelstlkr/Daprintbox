<?php
/*
 * Configuración de Daprintbox en el servidor.
 * Copia este archivo como "config.php" y rellena los datos de tu base de datos MySQL.
 * config.php nunca debe subirse a GitHub (está en .gitignore).
 */
return [
    // Datos de conexión (los da el panel de tu hosting: cPanel, Plesk…)
    'db_host' => 'localhost',
    'db_port' => 3306,
    'db_name' => 'nombre_de_la_base_de_datos',
    'db_user' => 'usuario_mysql',
    'db_pass' => 'contraseña_mysql',

    // Clave para usar setup.php (crear tablas y usuarios). Pon una frase larga y secreta.
    'setup_key' => 'cambia-esto-por-una-clave-larga-y-secreta',

    // Cuántas versiones anteriores de los datos se guardan como copia de seguridad.
    'history_keep' => 200,

    // Tamaño máximo de los datos en MB.
    'max_payload_mb' => 8,

    // Duración de la sesión iniciada (días).
    'session_days' => 30,
];
