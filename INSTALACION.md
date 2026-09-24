# Instalar Libreta Maker en tu servidor (PHP + MySQL)

Con esta instalación la app se usa desde el navegador o el móvil y **cada usuario tiene su propia libreta**, guardada en una base de datos MySQL de tu servidor. Cada persona entra con **su usuario y contraseña** y solo ve sus datos (filamentos, trabajos, ventas, gastos…). Opcionalmente, también se puede entrar con una cuenta de Google.

**Requisitos del servidor**

- **PHP 5.6 o superior** (funciona igual en PHP 7 y 8) con la extensión `pdo_mysql` (viene activada en casi todos los hostings).
- **MySQL 5.5.3 o superior**, o MariaDB.
- **HTTPS** (certificado SSL), muy recomendable para que las contraseñas viajen cifradas y para poder instalar la app en el móvil. La mayoría de hostings lo dan gratis con Let's Encrypt.

`api/setup.php` comprueba todo esto por ti y te dice qué falta.

## 1. Crear la base de datos

En el panel de tu hosting (cPanel, Plesk, DirectAdmin…), en «Bases de datos MySQL»:

1. Crea una base de datos, por ejemplo `libreta_maker`.
2. Crea un usuario de MySQL con una contraseña segura.
3. Da a ese usuario **todos los privilegios** sobre la base de datos.

Apunta el nombre de la base de datos, el usuario, la contraseña y el servidor (normalmente `localhost`).

## 2. Subir los archivos

Sube el contenido de `libreta-maker-servidor.zip` a una carpeta de tu web, por ejemplo `public_html/libreta-maker/`. Lo más fácil es subir el zip desde el administrador de archivos del panel y usar «Extraer».

> ¿Ya la tenías instalada? Sube los archivos nuevos encima, **conservando tu `api/config.php`**, y sigue en el paso 4: las tablas se actualizan solas y podrás asignar la libreta que ya teníais a un usuario.

Debe quedar así:

```
libreta-maker/
├── index.html
├── privacidad.html        (privacidad: rellena tus datos)
├── condiciones.html       (condiciones de uso: rellena tus datos)
├── manifest.webmanifest   (datos de la app instalable)
├── sw.js                  (permite instalarla y abrirla sin conexión)
├── img/  icons/  css/
├── js/                    (config.js ya apunta a api/api.php)
└── api/
    ├── api.php
    ├── lib.php
    ├── setup.php
    ├── config.example.php
    └── .htaccess
```

> ¿No tienes el zip? Descarga el repositorio y ejecuta `npm run package`: se crea en `dist/`.

## 3. Configurar

En la carpeta `api/`, **copia** `config.example.php` como `config.php` y edítalo:

```php
'db_host' => 'localhost',
'db_name' => 'libreta_maker',          // tu base de datos
'db_user' => 'usuario_mysql',          // tu usuario de MySQL
'db_pass' => 'contraseña_mysql',

'login_methods' => array('password'),  // entrar con usuario y contraseña
'allow_registration' => true,          // botón «Crear cuenta» en la app
'registration_code' => 'maker-2026',   // código de invitación para crear cuenta
'max_users' => 0,                      // 0 = sin límite

'setup_key' => 'una-frase-larga-que-solo-sepas-tu',
```

- **allow_registration**: con `true`, cualquiera que tenga el **código de invitación** puede crearse una cuenta desde la app. Con `false`, solo tú creas los usuarios desde `setup.php`.
- **registration_code**: compártelo solo con quien quieras que use tu servidor. Si lo dejas vacío (`''`), cualquiera que encuentre la web podría registrarse, así que no es recomendable.
- `config.php` contiene contraseñas: el archivo `.htaccess` impide que se pueda descargar desde la web.

## 4. Comprobar el servidor, crear las tablas y los usuarios

Abre en el navegador `https://tu-dominio/libreta-maker/api/setup.php` y escribe tu `setup_key`. Verás:

- **Estado del servidor**: PHP, extensiones, HTTPS, registro de cuentas… Si algo sale en rojo, debajo pone cómo arreglarlo.
- **Usuarios y sus libretas**: cada usuario con el tamaño de su libreta y su último acceso. Desde aquí puedes **crear usuarios**, **cambiarles la contraseña** o **eliminarlos** (se borra también su libreta).
- **Libreta compartida de la versión anterior** (solo si actualizas desde una versión con una única libreta para todos): elige a qué usuario pertenecen esos datos. Tiene que ser un usuario que todavía no tenga datos.

Cuando esté todo en verde, puedes **borrar `setup.php`** del servidor por seguridad y volver a subirlo cuando lo necesites.

## 5. Entrar

Abre `https://tu-dominio/libreta-maker/`:

- **Entrar**: con tu usuario y contraseña.
- **Crear cuenta**: elige usuario y contraseña (mínimo 8 caracteres) y escribe el código de invitación.

La primera vez tu libreta está vacía y puedes elegir cómo empezar:

- **Pegar una copia en texto**: en la versión que usabas hasta ahora (por ejemplo el enlace de Claude), ve a *Ajustes → Copia en texto → Copiar al portapapeles* y pégalo aquí.
- **Subir los datos de este navegador**: si ya usabas la app en este mismo navegador.
- **Empezar vacío** o **Datos de ejemplo**.

En *Ajustes → Tu cuenta* puedes **cambiar tu contraseña**, ver el **historial de versiones** de tu libreta y **cerrar sesión**.

## Privacidad y condiciones de uso

El paquete incluye dos páginas pensadas para un uso **privado entre amigos, gratuito y sin ánimo de lucro**:

- `privacidad.html`: qué datos guarda la app, quién puede verlos, cuánto tiempo y cómo descargarlos o borrarlos.
- `condiciones.html`: reglas básicas de uso (cuenta personal, buen uso, cálculos orientativos, sin garantías, baja).

Ya están rellenas con los datos del administrador (Kike Silva, kikeradiactiu@gmail.com, www.kikesilva.es); si cambian, edítalas con cualquier editor de texto. Se enlazan solas desde la pantalla de acceso y desde *Ajustes*.

Si activas el acceso con Google, en la pantalla de consentimiento de Google Cloud pon `https://tu-dominio/libreta-maker/privacidad.html` como «Enlace a la política de privacidad» y `…/condiciones.html` como «Enlace a las condiciones del servicio».

> Si algún día la abres al público o cobras por ella, conviene volver a una versión más completa (identificación según la LSSI, etc.) y que la revise un profesional; la versión formal está en el historial del repositorio.

## 6. Instalarla en el móvil (Android) como una app

Libreta Maker es una app instalable: se abre a pantalla completa, con su icono en la pantalla de inicio y en la lista de aplicaciones.

- **Android (Chrome):** abre la dirección de la app, entra con tu cuenta y ve a *Ajustes → Instalar la app*. Si no aparece el botón, usa el menú **⋮** → **Instalar aplicación** (o **Añadir a pantalla de inicio**).
- **iPhone (Safari):** botón **Compartir** → **Añadir a pantalla de inicio**.
- **Ordenador (Chrome o Edge):** icono de instalar a la derecha de la barra de direcciones.

Las actualizaciones llegan solas: cuando subas una versión nueva al servidor, la app la usa la próxima vez que se abra con conexión. Sin conexión la app se abre igualmente, pero para ver y guardar tu libreta necesita conectar con el servidor.

## Cómo se guardan los datos

- **Cada usuario tiene su libreta**: en MySQL, la tabla `dpb_user_state` guarda una libreta por usuario y `dpb_history` su historial. El servidor comprueba en cada petición quién ha iniciado sesión y solo le deja leer y guardar la suya.
- **Varios dispositivos**: puedes usar tu cuenta a la vez en el móvil y en el ordenador. Cada cambio se guarda al momento (arriba a la derecha verás **● Guardado · tu usuario**) y el otro dispositivo lo recibe solo en unos segundos.
- **Sin conexión**: la app funciona igual. Cada cambio se guarda al instante en el dispositivo (verás **Sin conexión · guardado en este dispositivo**) y se sube solo al servidor en cuanto vuelve internet. La app también se abre sin conexión con la última copia de tu libreta (hace falta haber entrado una vez con conexión en ese dispositivo).
- **Cambios en dos dispositivos a la vez** (con o sin conexión): se **combinan**. Lo añadido en cada uno se conserva, las ediciones de registros distintos se mezclan, los borrados se aplican y el stock suma lo gastado en ambos (si en el móvil gastas 100 g de un filamento y en el PC 50 g, se descuentan 150 g). Si los dos cambiáis el mismo dato del mismo registro, se queda el del último dispositivo en sincronizar.
- **Cerrar sesión** borra la copia de la libreta de ese dispositivo; si hay cambios sin subir, la app te pedirá conectarte antes.
- **Historial de versiones** (*Ajustes → Tu cuenta*): cada guardado crea una versión (se guardan las últimas 200 de cada usuario). Si algo se borra por error, restaura una versión anterior.
- La sesión dura 30 días en cada navegador.

## Opcional: entrar también con Google

Si quieres que se pueda entrar con una cuenta de Google (cada cuenta de Google tendrá también su propia libreta):

1. En <https://console.cloud.google.com/> crea un proyecto, configura la **pantalla de consentimiento de OAuth** (tipo Externo; añade los correos como usuarios de prueba o publica la aplicación) y crea un **ID de cliente de OAuth** de tipo **Aplicación web**, con la dirección de tu web (con `https://`, sin carpeta) en **Orígenes de JavaScript autorizados**.
2. En `config.php`:

   ```php
   'login_methods' => array('password', 'google'),
   'google_client_id' => '1234567890-abc123.apps.googleusercontent.com',
   'allowed_emails' => array('tu.correo@gmail.com', '@mitaller.com'),
   ```

   Solo pueden entrar los correos de `allowed_emails` (o todo un dominio con `'@dominio.com'`). Hacen falta además las extensiones `openssl` y `curl` y que el servidor pueda conectarse a `www.googleapis.com`; `setup.php` lo comprueba.

## Copias de seguridad

Además del historial, conviene hacer de vez en cuando una copia completa:

- Cada usuario, desde la app: *Ajustes → Exportar copia (JSON)*.
- Desde el panel del hosting: exportar la base de datos con phpMyAdmin (incluye las libretas de todos).

## Problemas frecuentes

| Mensaje o síntoma | Solución |
|---|---|
| «Falta api/config.php» | Copia `config.example.php` como `config.php` en la carpeta `api/`. |
| «No se pudo conectar con MySQL» | Revisa host, nombre de base de datos, usuario y contraseña en `config.php`. |
| No aparece «Crear cuenta» | Pon `'allow_registration' => true` en `config.php` (y `'password'` en `login_methods`). |
| «El código de invitación no es correcto» | Debe coincidir exactamente con `registration_code` de `config.php`. |
| «Ese nombre de usuario ya existe» | Elige otro nombre, o cámbiale la contraseña a ese usuario en `setup.php`. |
| Alguien olvidó su contraseña | En `setup.php`, «Crear usuario o cambiar su contraseña» con su mismo nombre de usuario. |
| setup.php dice que la clave no coincide aunque la copias de config.php | Pon `'setup_sin_clave' => true,` en `config.php`, termina la instalación y vuelve a ponerlo en `false`. |
| «Demasiados intentos» | Tras 10 intentos fallidos desde la misma conexión hay que esperar 15 minutos. |
| La app no pide usuario y guarda en el navegador | `js/config.js` debe tener `apiUrl: 'api/api.php'`. |
| El botón de Google da error «origin_mismatch» | En Google Cloud, añade la dirección exacta de tu web en «Orígenes de JavaScript autorizados». |
| El servidor usa Nginx en vez de Apache | `.htaccess` no se aplica: pide a tu hosting que bloquee el acceso a `api/config.php` y `api/lib.php`, o mueve `config.php` fuera de la carpeta pública y ajusta la ruta en `api/lib.php`. |
