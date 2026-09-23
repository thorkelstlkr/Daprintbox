# Instalar Daprintbox en tu servidor (PHP + MySQL)

Con esta instalación varias personas usan la app desde el navegador con **los mismos datos**, guardados en una base de datos MySQL de tu servidor. Cada persona entra con su usuario y contraseña.

**Requisitos:** hosting con PHP 8.0 o superior (con la extensión `pdo_mysql`, que viene activada casi siempre), una base de datos MySQL o MariaDB y, muy recomendable, HTTPS (certificado SSL; la mayoría de hostings lo dan gratis con Let's Encrypt).

## 1. Crear la base de datos

En el panel de tu hosting (cPanel, Plesk, DirectAdmin…), en «Bases de datos MySQL»:

1. Crea una base de datos, por ejemplo `daprintbox`.
2. Crea un usuario de MySQL con una contraseña segura.
3. Da a ese usuario **todos los privilegios** sobre la base de datos.

Apunta el nombre de la base de datos, el usuario, la contraseña y el servidor (normalmente `localhost`).

## 2. Subir los archivos

Sube el contenido de `daprintbox-servidor.zip` a una carpeta de tu web, por ejemplo `public_html/daprintbox/`. Lo más fácil es subir el zip desde el administrador de archivos del panel y usar «Extraer».

Debe quedar así:

```
daprintbox/
├── index.html
├── css/
├── js/            (config.js ya apunta a api/api.php)
└── api/
    ├── api.php
    ├── lib.php
    ├── setup.php
    ├── config.example.php
    └── .htaccess
```

> ¿No tienes el zip? Descarga el repositorio y ejecuta `npm run package`: se crea en `dist/`. O sube a mano los archivos de la lista y cambia en `js/config.js` la línea a `apiUrl: 'api/api.php'`.

## 3. Configurar la conexión

En la carpeta `api/`, **copia** `config.example.php` como `config.php` y edítalo:

```php
'db_host' => 'localhost',
'db_name' => 'daprintbox',          // tu base de datos
'db_user' => 'usuario_mysql',       // tu usuario de MySQL
'db_pass' => 'contraseña_mysql',
'setup_key' => 'una-frase-larga-que-solo-sepas-tu',
```

`config.php` contiene contraseñas: el archivo `.htaccess` impide que se pueda descargar desde la web.

## 4. Crear las tablas y los usuarios

Abre en el navegador `https://tu-dominio/daprintbox/api/setup.php`:

1. Escribe la `setup_key` que pusiste en `config.php`. Se crean las tablas automáticamente.
2. Crea un usuario para cada persona (por ejemplo `ana` y `kike`), con contraseña de al menos 8 caracteres.

Desde esa misma página puedes cambiar contraseñas o eliminar usuarios más adelante. Por seguridad, cuando termines puedes **borrar `setup.php`** del servidor y volver a subirlo cuando lo necesites.

## 5. Entrar y pasar vuestros datos

Abre `https://tu-dominio/daprintbox/`, entra con tu usuario y, como la base de datos está vacía, elige cómo empezar:

- **Subir los datos de este navegador**: si ya usabas la app en este mismo navegador y servidor.
- **Pegar una copia en texto**: en la versión que usabais hasta ahora (por ejemplo el enlace de Claude), ve a *Ajustes → Copia en texto → Copiar al portapapeles* y pégalo aquí.
- **Empezar vacío** o **Datos de ejemplo**.

## Cómo funciona el trabajo entre dos personas

- Cada cambio se guarda al momento en el servidor. Arriba a la derecha verás **● Guardado · tu usuario**.
- La app comprueba cada 15 segundos (y al volver a la pestaña) si la otra persona ha hecho cambios, y los carga sola.
- Si los dos guardáis **a la vez**, gana el primero: al segundo se le cargan los datos nuevos y se le avisa para que repita su último cambio. Nadie pisa sin querer el trabajo del otro.
- **Historial de versiones** (Ajustes → Servidor compartido): cada guardado crea una versión (se guardan las últimas 200). Si algo se borra por error, restaura una versión anterior.
- Si se corta la conexión, verás **● Sin guardar** con un botón **Reintentar**; no cierres la pestaña hasta que ponga «Guardado».

## Copias de seguridad

Además del historial, conviene hacer de vez en cuando una copia completa:

- Desde la app: *Ajustes → Exportar copia (JSON)*.
- Desde el panel del hosting: exportar la base de datos con phpMyAdmin.

## Problemas frecuentes

| Mensaje | Solución |
|---|---|
| «Falta api/config.php» | Copia `config.example.php` como `config.php` en la carpeta `api/`. |
| «No se pudo conectar con MySQL» | Revisa host, nombre de base de datos, usuario y contraseña en `config.php`. |
| «Faltan las tablas. Ejecuta setup.php» | Abre `api/setup.php` e introduce la clave. |
| La app no pide usuario y guarda en el navegador | `js/config.js` debe tener `apiUrl: 'api/api.php'`. |
| «Demasiados intentos» | Tras 10 contraseñas incorrectas desde la misma conexión hay que esperar 15 minutos. |
| El servidor usa Nginx en vez de Apache | `.htaccess` no se aplica: pide a tu hosting que bloquee el acceso a `api/config.php` y `api/lib.php`, o mueve `config.php` fuera de la carpeta pública y ajusta la ruta en `api/lib.php`. |
