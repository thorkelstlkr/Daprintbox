# Daprintbox

Aplicación web para gestionar un pequeño negocio de impresión 3D:

- **Filamentos** — stock de cada bobina (material, color, marca, precio, gramos restantes), aviso de stock bajo, reposiciones y valor del inventario.
- **Impresiones** — calcula el coste real de cada pieza (material, electricidad, amortización y mantenimiento de la impresora, mano de obra, extras y margen por fallos), sugiere un precio de venta y descuenta automáticamente el filamento usado.
- **Ventas** — registra cada venta ligada a una impresión (o libre), con comisiones y envío, y calcula beneficio y margen.
- **Gastos** — compras de filamento (se añaden solas al comprar/reponer), repuestos, embalaje, etc.
- **Resumen** — ingresos, beneficio de las ventas, gastos pagados, resultado de caja, gráfico mensual de ingresos vs. gastos, piezas más rentables y piezas fabricadas pendientes de vender.

## Cómo usarla

No necesita instalación ni servidor: abre `index.html` en el navegador.

Si prefieres servirla (por ejemplo para usarla desde el móvil en tu red):

```bash
npm start        # sirve la carpeta en http://localhost:8080
```

También funciona publicada en GitHub Pages tal cual.

Los datos se guardan en el `localStorage` del navegador. Desde **Ajustes** puedes exportar/importar una copia de seguridad en JSON, exportar ventas, gastos y filamentos a CSV (compatible con Excel) y cargar datos de ejemplo para probarla.

## Cómo se calcula el coste

| Concepto | Fórmula |
|---|---|
| Material | gramos × (precio bobina ÷ peso bobina) |
| Electricidad | horas × (W ÷ 1000) × precio kWh |
| Máquina | horas × (precio impresora ÷ vida útil + mantenimiento/h) |
| Mano de obra | horas de trabajo × tarifa/h |
| Fallos | % sobre material + electricidad + máquina |
| Precio sugerido | coste por unidad × (1 + margen %) |

En el resumen:

- **Beneficio de las ventas** = ingresos − comisiones − coste de lo vendido.
- **Resultado de caja** = ingresos − comisiones − todos los gastos pagados en el periodo (incluidas las compras de filamento aunque aún no se hayan usado).

## Desarrollo

```
index.html      estructura
css/styles.css  estilos (tema claro/oscuro)
js/calc.js      cálculos puros (probados)
js/store.js     persistencia
js/app.js       vistas y formularios
tests/          tests de los cálculos
```

```bash
npm test
```
