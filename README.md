# Libreta Maker

Aplicación web para gestionar un pequeño taller de **impresión 3D, corte y grabado láser y sellos personalizados**:

- **Filamento y resina** — bobinas de filamento (FDM, en gramos) y envases de resina (SLA/MSLA, en ml o g): material, color, marca, precio, cantidad restante, aviso de stock bajo, reposiciones y valor del inventario.
- **Materiales en plancha** — madera, contrachapado, MDF, metacrilato, cuero, fotopolímero y fotolito para sellos… con medidas de plancha, coste por cm², stock en planchas y reposiciones.
- **Componentes** — piezas externas (portalámparas, tiras LED, imanes, anillas…) con precio por paquete, coste por unidad, stock, aviso de stock bajo y reposiciones.
- **Máquinas** — impresoras 3D, láser e insoladora UV para sellos, cada una con su consumo, precio, vida útil y mantenimiento. Muestra su coste por hora, horas de uso, trabajos, ingresos y beneficio generado.
- **Trabajos** — impresión 3D, corte/grabado láser o sello (insoladora: fotopolímero + fotolito). Eliges la máquina y calcula el coste real de cada pieza (filamento o material en plancha, electricidad, amortización y mantenimiento de esa máquina, componentes externos que lleve cada pieza, mano de obra, extras y margen por fallos), sugiere un precio de venta y descuenta automáticamente el material usado.
- **Ventas** — registra cada venta ligada a una impresión (o libre), con comisiones y envío, y calcula beneficio y margen.
- **Gastos** — compras de filamento (se añaden solas al comprar/reponer), repuestos, embalaje, etc.
- **Resumen** — ingresos, beneficio de las ventas, gastos pagados, resultado de caja, gráfico mensual de ingresos vs. gastos, resultados por línea de negocio (3D, láser, sellos), piezas más rentables y piezas fabricadas pendientes de vender.
- **Idiomas** — español, catalán, inglés, alemán, italiano y francés. La primera vez se usa el idioma del dispositivo; se cambia en *Ajustes → Idioma y apariencia* o en la pantalla de acceso. Números, fechas y moneda siguen el formato de cada idioma. Las páginas de privacidad y condiciones están solo en español.

## Cómo usarla

No necesita instalación ni servidor: abre `index.html` en el navegador.

Si prefieres servirla (por ejemplo para usarla desde el móvil en tu red):

```bash
npm start        # sirve la carpeta en http://localhost:8080
```

También funciona publicada en GitHub Pages tal cual.

Los datos se guardan en el `localStorage` del navegador. Desde **Ajustes** puedes exportar/importar una copia de seguridad en JSON, exportar ventas, gastos y filamentos a CSV (compatible con Excel) y cargar datos de ejemplo para probarla.

Si ya usabas una versión anterior, la impresora que tenías en Ajustes se convierte automáticamente en tu primera máquina y los trabajos existentes se consideran de impresión 3D.

## App instalable (Android, iPhone, ordenador)

Servida desde una web con HTTPS, Libreta Maker se puede instalar como una app (PWA): icono propio en la pantalla de inicio, pantalla completa y apertura sin conexión. En Android: *Ajustes → Instalar la app* o menú ⋮ → *Instalar aplicación*. Los iconos están en `icons/` (generados a partir de `icons/original.png`).

## Versión con servidor: cuentas de usuario y MySQL

La app puede guardar los datos en una base de datos MySQL de tu servidor. **Cada usuario tiene su propia libreta privada**: entra con usuario y contraseña (se puede crear cuenta desde la app con un código de invitación) u, opcionalmente, con Google. Funciona sin conexión (guarda cada cambio en el dispositivo y lo sube al volver internet), se sincroniza entre los dispositivos del mismo usuario combinando los cambios hechos a la vez (`js/merge.js`, con tests) y guarda un historial de versiones por usuario. La API funciona con PHP 5.6 o superior.

```bash
npm run package   # crea dist/libreta-maker-servidor.zip listo para subir
```

Los pasos (base de datos, subir archivos, `api/config.php`, `api/setup.php` para comprobar el servidor y gestionar usuarios) están en **[INSTALACION.md](INSTALACION.md)**.

## Cómo se calcula el coste

| Concepto | Fórmula |
|---|---|
| Filamento o resina (3D) | cantidad (g o ml, según el laminador) × (precio de la bobina o envase ÷ su contenido) |
| Plancha (láser, sellos) | ancho × alto de cada pieza (cm²) × piezas × (1 + % desperdicio) × (precio plancha ÷ área plancha) |
| Electricidad | horas × (W de la impresora ÷ 1000) × precio kWh |
| Máquina | horas × (precio de la impresora ÷ vida útil + mantenimiento/h) |
| Componentes | cantidad por pieza × piezas × (precio paquete ÷ uds. por paquete) |
| Mano de obra | horas de trabajo × tarifa/h |
| Fallos | % sobre filamento/plancha + electricidad + máquina (no sobre componentes) |
| Precio sugerido | coste por unidad × (1 + margen %) |

En el resumen:

- **Beneficio de las ventas** = ingresos − comisiones − coste de lo vendido.
- **Resultado de caja** = ingresos − comisiones − todos los gastos pagados en el periodo (incluidas las compras de filamento aunque aún no se hayan usado).

## Desarrollo

```
index.html      estructura
css/styles.css  estilos (tema claro/oscuro)
js/calc.js      cálculos puros (probados)
js/store.js     persistencia local
js/remote.js    cliente de la API del servidor
js/config.js    apiUrl: '' (navegador) o 'api/api.php' (servidor)
js/app.js       vistas y formularios (textos en español dentro de t())
js/i18n.js      idioma de la interfaz: t(), idioma elegido y formato local
js/i18n/*.js    traducciones (ca, en, de, it, fr), con el texto en español como clave
api/            API en PHP + MySQL (api.php, setup.php, config.example.php)
tests/          tests de los cálculos, la combinación de cambios y las traducciones
```

```bash
npm test
```
