<?php
/*
 * Cálculos de Libreta Maker en PHP: los mismos que js/calc.js (la app), para que el servidor MCP
 * calcule costes exactamente igual. tests/calc-php.test.js comprueba que ambos dan lo mismo.
 * Compatible con PHP 5.6 y superiores.
 */

function lm_num($v)
{
    if (is_bool($v)) {
        return $v ? 1.0 : 0.0;
    }
    if (is_int($v) || is_float($v)) {
        return is_finite($v) ? (float) $v : 0.0;
    }
    if (is_string($v)) {
        $s = trim($v);
        if ($s === '') {
            return 0.0;
        }
        return is_numeric($s) ? (float) $s : 0.0;
    }
    return 0.0;
}

function lm_get($arr, $key, $default = null)
{
    return (is_array($arr) && array_key_exists($key, $arr)) ? $arr[$key] : $default;
}

/** Coste por gramo (o ml) de un filamento o resina: precio de la bobina o envase ÷ contenido. */
function lm_cost_per_gram($f)
{
    $w = lm_num(lm_get($f, 'spoolWeight'));
    return $w > 0 ? lm_num(lm_get($f, 'price')) / $w : 0.0;
}

/** Coste de una unidad de componente (precio del paquete ÷ unidades por paquete). */
function lm_component_unit_cost($c)
{
    $units = lm_num(lm_get($c, 'packUnits'));
    if ($units == 0) {
        $units = 1;
    }
    return lm_num(lm_get($c, 'price')) / $units;
}

function lm_quantity($q)
{
    $n = floor(lm_num($q));
    return (int) max(1, $n ? $n : 1);
}

/** Unidades de cada componente que consume un trabajo (cantidad por pieza × piezas). */
function lm_components_used($components, $quantity)
{
    $out = array();
    $q = lm_quantity($quantity);
    foreach ((array) $components as $c) {
        $id = lm_get($c, 'componentId');
        if (!$id) {
            continue;
        }
        $out[$id] = lm_get($out, $id, 0) + lm_num(lm_get($c, 'qty')) * $q;
    }
    return $out;
}

/** Coste por cm² de un material en plancha. */
function lm_sheet_cost_per_cm2($m)
{
    $area = (lm_num(lm_get($m, 'sheetWidth')) * lm_num(lm_get($m, 'sheetHeight'))) / 100;
    return $area > 0 ? lm_num(lm_get($m, 'price')) / $area : 0.0;
}

function lm_sheet_area_cm2($it, $quantity, $wastePct)
{
    return ((lm_num(lm_get($it, 'width')) * lm_num(lm_get($it, 'height'))) / 100) * $quantity * (1 + lm_num($wastePct) / 100);
}

/** Planchas que consume un trabajo, por material (medidas de cada pieza en mm + desperdicio). */
function lm_sheets_used($sheets, $quantity, $wastePct, $materialsById)
{
    $out = array();
    $q = lm_quantity($quantity);
    foreach ((array) $sheets as $it) {
        $m = lm_get($materialsById, lm_get($it, 'materialId'));
        if (!$m) {
            continue;
        }
        $sheetArea = (lm_num(lm_get($m, 'sheetWidth')) * lm_num(lm_get($m, 'sheetHeight'))) / 100;
        if ($sheetArea <= 0) {
            continue;
        }
        $out[$m['id']] = lm_get($out, $m['id'], 0) + lm_sheet_area_cm2($it, $q, $wastePct) / $sheetArea;
    }
    return $out;
}

function lm_printer_params($settings, $printer)
{
    if ($printer) {
        return array('watts' => lm_num(lm_get($printer, 'watts')), 'price' => lm_num(lm_get($printer, 'price')),
            'lifeHours' => lm_num(lm_get($printer, 'lifeHours')), 'maintenancePerHour' => lm_num(lm_get($printer, 'maintenancePerHour')));
    }
    return array('watts' => lm_num(lm_get($settings, 'printerWatts')), 'price' => lm_num(lm_get($settings, 'printerPrice')),
        'lifeHours' => lm_num(lm_get($settings, 'printerLifeHours')), 'maintenancePerHour' => lm_num(lm_get($settings, 'maintenancePerHour')));
}

/** Amortización + mantenimiento por hora de una máquina. */
function lm_machine_hour_cost($settings, $printer)
{
    $p = lm_printer_params($settings, $printer);
    $amort = $p['lifeHours'] > 0 ? $p['price'] / $p['lifeHours'] : 0;
    return $amort + $p['maintenancePerHour'];
}

/** Coste por hora de una máquina sin material: amortización + mantenimiento + electricidad. */
function lm_printer_hour_cost($settings, $printer)
{
    $p = lm_printer_params($settings, $printer);
    return lm_machine_hour_cost($settings, $printer) + ($p['watts'] / 1000) * lm_num(lm_get($settings, 'kwhPrice'));
}

/** Desglose de coste de un trabajo (igual que Calc.printCost de la app). */
function lm_print_cost($job, $filamentsById, $settings, $printer, $componentsById, $materialsById)
{
    $material = 0.0;
    foreach ((array) lm_get($job, 'items', array()) as $it) {
        $f = lm_get($filamentsById, lm_get($it, 'filamentId'));
        $material += $f ? lm_num(lm_get($it, 'grams')) * lm_cost_per_gram($f) : 0;
    }
    $hours = lm_num(lm_get($job, 'hours'));
    $pp = lm_printer_params($settings, $printer);
    $electricity = $hours * ($pp['watts'] / 1000) * lm_num(lm_get($settings, 'kwhPrice'));
    $machine = $hours * lm_machine_hour_cost($settings, $printer);
    $labor = lm_num(lm_get($job, 'laborHours')) * lm_num(lm_get($settings, 'laborRate'));
    $extras = lm_num(lm_get($job, 'extras'));
    $quantity = lm_quantity(lm_get($job, 'quantity'));
    $components = 0.0;
    foreach ((array) lm_get($job, 'components', array()) as $it) {
        $c = lm_get($componentsById, lm_get($it, 'componentId'));
        $components += lm_num(lm_get($it, 'qty')) * $quantity * ($c ? lm_component_unit_cost($c) : lm_num(lm_get($it, 'unitCost')));
    }
    $sheet = 0.0;
    foreach ((array) lm_get($job, 'sheets', array()) as $it) {
        $m = lm_get($materialsById, lm_get($it, 'materialId'));
        $sheet += lm_sheet_area_cm2($it, $quantity, lm_get($settings, 'sheetWaste')) * ($m ? lm_sheet_cost_per_cm2($m) : lm_num(lm_get($it, 'costPerCm2')));
    }
    $failure = ($material + $sheet + $electricity + $machine) * (lm_num(lm_get($settings, 'failureRate')) / 100);
    $total = $material + $sheet + $electricity + $machine + $components + $labor + $extras + $failure;
    $unit = $total / $quantity;
    $mv = lm_get($job, 'margin');
    $margin = ($mv === null || $mv === '') ? lm_num(lm_get($settings, 'defaultMargin')) : lm_num($mv);
    return array(
        'material' => $material, 'sheet' => $sheet, 'electricity' => $electricity, 'machine' => $machine,
        'components' => $components, 'labor' => $labor, 'extras' => $extras, 'failure' => $failure, 'total' => $total,
        'quantity' => $quantity, 'unit' => $unit, 'suggestedUnitPrice' => $unit * (1 + $margin / 100), 'margin' => $margin,
    );
}

function lm_grams_by_filament($items)
{
    $out = array();
    foreach ((array) $items as $it) {
        $id = lm_get($it, 'filamentId');
        if ($id) {
            $out[$id] = lm_get($out, $id, 0) + lm_num(lm_get($it, 'grams'));
        }
    }
    return $out;
}

function lm_sold_by_print($sales)
{
    $out = array();
    foreach ((array) $sales as $s) {
        $id = lm_get($s, 'printId');
        if ($id) {
            $out[$id] = lm_get($out, $id, 0) + lm_num(lm_get($s, 'quantity'));
        }
    }
    return $out;
}

function lm_sale_totals($s)
{
    $revenue = lm_num(lm_get($s, 'quantity')) * lm_num(lm_get($s, 'unitPrice'));
    $fees = lm_num(lm_get($s, 'fees'));
    $cogs = lm_num(lm_get($s, 'quantity')) * lm_num(lm_get($s, 'unitCost'));
    return array('revenue' => $revenue, 'fees' => $fees, 'cogs' => $cogs, 'profit' => $revenue - $fees - $cogs);
}

function lm_in_range($date, $from, $to)
{
    $date = (string) $date;
    return (!$from || strcmp($date, $from) >= 0) && (!$to || strcmp($date, $to) <= 0);
}

/** Resumen económico de un periodo (igual que Calc.summary). */
function lm_summary($state, $from, $to)
{
    $r = array('revenue' => 0.0, 'fees' => 0.0, 'cogs' => 0.0, 'salesProfit' => 0.0, 'filamentSpend' => 0.0, 'otherSpend' => 0.0, 'units' => 0.0, 'salesCount' => 0);
    foreach ((array) lm_get($state, 'sales', array()) as $s) {
        if (!lm_in_range(lm_get($s, 'date'), $from, $to)) {
            continue;
        }
        $t = lm_sale_totals($s);
        $r['revenue'] += $t['revenue'];
        $r['fees'] += $t['fees'];
        $r['cogs'] += $t['cogs'];
        $r['units'] += lm_num(lm_get($s, 'quantity'));
        $r['salesCount'] += 1;
    }
    foreach ((array) lm_get($state, 'expenses', array()) as $e) {
        if (!lm_in_range(lm_get($e, 'date'), $from, $to)) {
            continue;
        }
        if (lm_get($e, 'category') === 'filamento') {
            $r['filamentSpend'] += lm_num(lm_get($e, 'amount'));
        } else {
            $r['otherSpend'] += lm_num(lm_get($e, 'amount'));
        }
    }
    $r['salesProfit'] = $r['revenue'] - $r['fees'] - $r['cogs'];
    $r['totalSpend'] = $r['filamentSpend'] + $r['otherSpend'];
    $r['cashResult'] = $r['revenue'] - $r['fees'] - $r['totalSpend'];
    $r['marginPct'] = $r['revenue'] > 0 ? ($r['salesProfit'] / $r['revenue']) * 100 : 0;
    return $r;
}

/** Trabajos, ingresos y beneficio por tipo de trabajo (igual que Calc.kindStats). */
function lm_kind_stats($state, $from, $to)
{
    $out = array();
    $kindOf = array();
    foreach ((array) lm_get($state, 'prints', array()) as $p) {
        $k = lm_get($p, 'kind') ? $p['kind'] : '3d';
        $kindOf[lm_get($p, 'id')] = $k;
        if (!lm_in_range(lm_get($p, 'date'), $from, $to)) {
            continue;
        }
        if (!isset($out[$k])) {
            $out[$k] = array('jobs' => 0, 'units' => 0.0, 'revenue' => 0.0, 'profit' => 0.0);
        }
        $out[$k]['jobs'] += 1;
        $out[$k]['units'] += lm_num(lm_get($p, 'quantity'));
    }
    foreach ((array) lm_get($state, 'sales', array()) as $s) {
        if (!lm_in_range(lm_get($s, 'date'), $from, $to)) {
            continue;
        }
        $t = lm_sale_totals($s);
        $pid = lm_get($s, 'printId');
        $k = ($pid && isset($kindOf[$pid])) ? $kindOf[$pid] : 'otros';
        if (!isset($out[$k])) {
            $out[$k] = array('jobs' => 0, 'units' => 0.0, 'revenue' => 0.0, 'profit' => 0.0);
        }
        $out[$k]['revenue'] += $t['revenue'];
        $out[$k]['profit'] += $t['profit'];
    }
    return $out;
}
