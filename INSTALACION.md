# Instalar Libreta Maker en tu servidor (PHP + MySQL)

Con esta instalación varias personas usan la app desde el navegador con **los mismos datos**, guardados en una base de datos MySQL de tu servidor. Cada persona entra con **su cuenta de Google** (o, si lo prefieres, con usuario y contraseña).

**Requisitos del servidor**

- **PHP 5.6 o superior** (funciona igual en PHP 7 y 8) con las extensiones `pdo_mysql`, `openssl` y `curl` (vienen activadas en casi todos los hostings).
- **MySQL 5.5.3 o superior**, o MariaDB.
- **HTTPS** (certificado SSL). Google lo exige para iniciar sesión; la mayoría de hostings lo dan gratis con Let's Encrypt.
- Que el servidor pueda conectarse a internet (para descargar las claves públicas de Google).

`api/setup.php` comprueba todo esto por ti y te dice qué falta.

## 1. Crear la base de datos

En el panel de tu hosting (cPanel, Plesk, DirectAdmin…), en «Bases de datos MySQL»:

1. Crea una base de datos, por ejemplo `libreta_maker`.
2. Crea un usuario de MySQL con una contraseña segura.
3. Da a ese usuario **todos los privilegios** sobre la base de datos.

Apunta el nombre de la base de datos, el usuario, la contraseña y el servidor (normalmente `localhost`).

## 2. Crear el acceso con Google (unos 5 minutos, gratis)

1. Entra en <https://console.cloud.google.com/> con tu cuenta de Google y crea un proyecto nuevo, por ejemplo «Libreta Maker».
2. Ve a **APIs y servicios → Pantalla de consentimiento de OAuth** (en la consola nueva se llama **Google Auth Platform**) y configúrala:
   - Tipo de usuario: **Externo**.
   - Nombre de la aplicación: `Libreta Maker`, y tu correo como correo de asistencia y de contacto.
   - En **Público / Usuarios de prueba**, añade los correos de Google de las personas que van a usar la app. (Otra opción es pulsar **Publicar aplicación**: al pedir solo nombre y correo, Google no exige revisión.)
3. Ve a **Credenciales** (o **Clientes**) → **Crear credenciales → ID de cliente de OAuth**:
   - Tipo de aplicación: **Aplicación web**.
   - **Orígenes de JavaScript autorizados**: la dirección de tu web **sin carpeta**, por ejemplo `https://www.mitaller.com`. Si se entra con y sin `www`, añade las dos.
   - No hace falta rellenar los «URI de redirección».
4. Copia el **ID de cliente**, que acaba en `.apps.googleusercontent.com`.

> Los nombres de los menús de Google Cloud cambian a veces; si no encuentras uno, busca «ID de cliente OAuth» en la barra de búsqueda de la consola.

## 3. Subir los archivos

Sube el contenido de `libreta-maker-servidor.zip` a una carpeta de tu web, por ejemplo `public_html/libreta-maker/`. Lo más fácil es subir el zip desde el administrador de archivos del panel y usar «Extraer».

> ¿Ya la tenías instalada en otra carpeta (por ejemplo `daprintbox/`)? No hace falta moverla: sube los archivos nuevos encima, conservando tu `api/config.php`. Los datos y las cuentas siguen igual.

Debe quedar así:

```
libreta-maker/
├── index.html
├── manifest.webmanifest   (datos de la app instalable)
├── sw.js                  (permite instalarla y abrirla sin conexión)
├── icons/
├── css/
├── js/            (config.js ya apunta a api/api.php)
└── api/
    ├── api.php
    ├── lib.php
    ├── setup.php
    ├── config.example.php
    └── .htaccess
```

> ¿No tienes el zip? Descarga el repositorio y ejecuta `npm run package`: se crea en `dist/`. O sube a mano esos archivos y cambia en `js/config.js` la línea a `apiUrl: 'api/api.php'`.

## 4. Configurar

En la carpeta `api/`, **copia** `config.example.php` como `config.php` y edítalo:

```php
'db_host' => 'localhost',
'db_name' => 'libreta_maker',              // tu base de datos
'db_user' => 'usuario_mysql',           // tu usuario de MySQL
'db_pass' => 'contraseña_mysql',

'login_methods' => array('google'),
'google_client_id' => '1234567890-abc123.apps.googleusercontent.com',
'allowed_emails' => array(
    'tu.correo@gmail.com',
    'tu.socio@gmail.com',
),

'setup_key' => 'una-frase-larga-que-solo-sepas-tu',
```

- **allowed_emails** son las cuentas de Google que pueden entrar; cualquier otra verá «no tiene permiso». Si tenéis Google Workspace con dominio propio, podéis autorizarlo entero con `'@mitaller.com'`.
- Para permitir también usuario y contraseña: `'login_methods' => array('google', 'password')`. Los usuarios con contraseña se crean en `setup.php`.

`config.php` contiene contraseñas: el archivo `.htaccess` impide que se pueda descargar desde la web.

## 5. Comprobar el servidor y crear las tablas

Abre en el navegador `https://tu-dominio/libreta-maker/api/setup.php` y escribe tu `setup_key`. Verás una lista de comprobaciones:

- ✓ PHP, extensiones, HTTPS y conexión con Google.
- ✓ ID de cliente y correos autorizados.
- ✓ Base de datos y tablas (se crean automáticamente).

Si algo sale en rojo, debajo pone cómo arreglarlo. Cuando esté todo en verde, puedes **borrar `setup.php`** del servidor por seguridad y volver a subirlo cuando lo necesites.

## 6. Entrar y pasar vuestros datos

Abre `https://tu-dominio/libreta-maker/`, pulsa **Iniciar sesión con Google** y, como la base de datos está vacía, elige cómo empezar:

- **Pegar una copia en texto**: en la versión que usabais hasta ahora (por ejemplo el enlace de Claude), ve a *Ajustes → Copia en texto → Copiar al portapapeles* y pégalo aquí.
- **Subir los datos de este navegador**: si ya usabas la app en este mismo navegador y dirección.
- **Empezar vacío** o **Datos de ejemplo**.

## 7. Instalarla en el móvil (Android) como una app

Libreta Maker es una app instalable: se abre a pantalla completa, con su icono en la pantalla de inicio y en la lista de aplicaciones.

- **Android (Chrome):** abre la dirección de la app, entra con tu cuenta y ve a *Ajustes → Instalar la app*. Si no aparece el botón, usa el menú **⋮** → **Instalar aplicación** (o **Añadir a pantalla de inicio**).
- **iPhone (Safari):** botón **Compartir** → **Añadir a pantalla de inicio**.
- **Ordenador (Chrome o Edge):** icono de instalar a la derecha de la barra de direcciones.

Las actualizaciones llegan solas: cuando subas una versión nueva al servidor, la app la usa la próxima vez que se abra con conexión. Sin conexión la app se abre igualmente, pero para ver y guardar los datos compartidos necesita conectar con el servidor.

> Requisito: la web debe ir por **HTTPS** (el mismo que pide el acceso con Google).

## Cómo funciona el trabajo entre dos personas

- Cada cambio se guarda al momento en el servidor. Arriba a la derecha verás **● Guardado · tu nombre**.
- La app comprueba cada 15 segundos (y al volver a la pestaña) si la otra persona ha hecho cambios, y los carga sola.
- Si los dos guardáis **a la vez**, gana el primero: al segundo se le cargan los datos nuevos y se le avisa para que repita su último cambio. Nadie pisa sin querer el trabajo del otro.
- **Historial de versiones** (Ajustes → Servidor compartido): cada guardado crea una versión (se guardan las últimas 200) con quién y cuándo la guardó. Si algo se borra por error, restaura una versión anterior.
- Si se corta la conexión, verás **● Sin guardar** con un botón **Reintentar**; no cierres la pestaña hasta que ponga «Guardado».
- La sesión dura 30 días en cada navegador; «Cerrar sesión» está en Ajustes.

## Copias de seguridad

Además del historial, conviene hacer de vez en cuando una copia completa:

- Desde la app: *Ajustes → Exportar copia (JSON)*.
- Desde el panel del hosting: exportar la base de datos con phpMyAdmin.

## Problemas frecuentes

| Mensaje o síntoma | Solución |
|---|---|
| «Falta api/config.php» | Copia `config.example.php` como `config.php` en la carpeta `api/`. |
| «No se pudo conectar con MySQL» | Revisa host, nombre de base de datos, usuario y contraseña en `config.php`. |
| «Faltan las tablas. Ejecuta setup.php» | Abre `api/setup.php` e introduce la clave. |
| El botón de Google da error «origin_mismatch» o no aparece | En Google Cloud, añade la dirección exacta de tu web (con `https://`, con o sin `www`) en «Orígenes de JavaScript autorizados». Los cambios pueden tardar unos minutos. |
| «La cuenta … no tiene permiso» | Añade ese correo a `allowed_emails` en `config.php`. |
| Google dice que la app no está verificada o que no tienes acceso | Añade el correo como «usuario de prueba» en la pantalla de consentimiento, o pulsa «Publicar aplicación». |
| «El token es para otra aplicación» | El `google_client_id` de `config.php` no coincide con el de Google Cloud. |
| «El servidor no pudo descargar las claves de Google» | El hosting bloquea las conexiones salientes: activa `curl` o pide al hosting que permita conectar con `www.googleapis.com`. |
| La app no pide entrar y guarda en el navegador | `js/config.js` debe tener `apiUrl: 'api/api.php'`. |
| «Demasiados intentos» | Tras 10 intentos fallidos desde la misma conexión hay que esperar 15 minutos. |
| El servidor usa Nginx en vez de Apache | `.htaccess` no se aplica: pide a tu hosting que bloquee el acceso a `api/config.php` y `api/lib.php`, o mueve `config.php` fuera de la carpeta pública y ajusta la ruta en `api/lib.php`. |
