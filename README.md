# Daprintbox

Aplicación web para gestionar un pequeño taller de **impresión 3D, corte y grabado láser y sellos personalizados**:

- **Filamentos** — stock de cada bobina (material, color, marca, precio, gramos restantes), aviso de stock bajo, reposiciones y valor del inventario.
- **Materiales en plancha** — madera, contrachapado, MDF, metacrilato, cuero, fotopolímero y fotolito para sellos… con medidas de plancha, coste por cm², stock en planchas y reposiciones.
- **Componentes** — piezas externas (portalámparas, tiras LED, imanes, anillas…) con precio por paquete, coste por unidad, stock, aviso de stock bajo y reposiciones.
- **Máquinas** — impresoras 3D, láser e insoladora UV para sellos, cada una con su consumo, precio, vida útil y mantenimiento. Muestra su coste por hora, horas de uso, trabajos, ingresos y beneficio generado.
- **Trabajos** — impresión 3D, corte/grabado láser o sello (insoladora: fotopolímero + fotolito). Eliges la máquina y calcula el coste real de cada pieza (filamento o material en plancha, electricidad, amortización y mantenimiento de esa máquina, componentes externos que lleve cada pieza, mano de obra, extras y margen por fallos), sugiere un precio de venta y descuenta automáticamente el material usado.
- **Ventas** — registra cada venta ligada a una impresión (o libre), con comisiones y envío, y calcula beneficio y margen.
- **Gastos** — compras de filamento (se añaden solas al comprar/reponer), repuestos, embalaje, etc.
- **Resumen** — ingresos, beneficio de las ventas, gastos pagados, resultado de caja, gráfico mensual de ingresos vs. gastos, resultados por línea de negocio (3D, láser, sellos), piezas más rentables y piezas fabricadas pendientes de vender.

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

Servida desde una web con HTTPS, Daprintbox se puede instalar como una app (PWA): icono propio en la pantalla de inicio, pantalla completa y apertura sin conexión. En Android: *Ajustes → Instalar la app* o menú ⋮ → *Instalar aplicación*. Los iconos están en `icons/` (generados a partir de `icons/original.png`).

## Usarla entre varias personas (servidor con PHP + MySQL)

La app puede guardar los datos en una base de datos MySQL de tu servidor para que varias personas trabajen con los mismos datos, entrando con su cuenta de Google (solo los correos autorizados) o con usuario y contraseña. La API funciona con PHP 5.6 o superior. Incluye aviso cuando dos personas guardan a la vez, actualización automática de los cambios de los demás e historial de versiones para restaurar.

```bash
npm run package   # crea dist/daprintbox-servidor.zip listo para subir
```

Los pasos (crear la base de datos, subir los archivos, `api/config.php`, `api/setup.php` para crear usuarios) están en **[INSTALACION.md](INSTALACION.md)**.

## Cómo se calcula el coste

| Concepto | Fórmula |
|---|---|
| Filamento (3D) | gramos × (precio bobina ÷ peso bobina) |
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
js/app.js       vistas y formularios
api/            API en PHP + MySQL (api.php, setup.php, config.example.php)
tests/          tests de los cálculos
```

```bash
npm test
```
