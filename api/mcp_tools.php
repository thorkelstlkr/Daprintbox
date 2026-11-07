<?php
/*
 * Herramientas MCP de Libreta Maker: lo que un agente de IA puede consultar y apuntar en la libreta.
 * Funciones puras sobre el estado de la libreta (el mismo JSON que guarda la app); mcp.php se encarga
 * de cargarlo, guardarlo con su versión e historial, y de la conexión. Compatible con PHP 5.6+.
 */

class LmToolError extends Exception
{
}

// ---------------------------------------------------------------- datos y formato

function lm_default_settings()
{
    return array(
        'currency' => 'EUR', 'kwhPrice' => 0.18, 'printerWatts' => 120, 'printerPrice' => 400, 'printerLifeHours' => 5000,
        'maintenancePerHour' => 0.05, 'defaultPrinterId' => '', 'laborRate' => 10, 'failureRate' => 10, 'defaultMargin' => 60,
        'lowStockGrams' => 200, 'sheetWaste' => 15,
    );
}

function lm_collections()
{
    return array('printers', 'filaments', 'components', 'materials', 'products', 'prints', 'sales', 'expenses');
}

/** Libreta con todas sus listas (igual que Store.normalize de la app). */
function lm_normalize($data)
{
    $s = is_array($data) ? $data : array();
    $settings = lm_default_settings();
    foreach ((array) lm_get($s, 'settings', array()) as $k => $v) {
        $settings[$k] = $v;
    }
    $out = $s;
    $out['version'] = 1;
    $out['demo'] = (bool) lm_get($s, 'demo', false);
    $out['settings'] = $settings;
    foreach (lm_collections() as $c) {
        $out[$c] = (isset($s[$c]) && is_array($s[$c])) ? array_values($s[$c]) : array();
    }
    return $out;
}

/** Nombres de las secciones tal como los usa el agente. */
function lm_col_names()
{
    return array('filamentos' => 'filaments', 'materiales' => 'materials', 'componentes' => 'components', 'maquinas' => 'printers',
        'escandallos' => 'products', 'trabajos' => 'prints', 'ventas' => 'sales', 'gastos' => 'expenses');
}

function lm_col($name)
{
    $map = lm_col_names();
    if (!isset($map[$name])) {
        throw new LmToolError('Sección desconocida: «' . $name . '». Usa una de: ' . implode(', ', array_keys($map)) . '.');
    }
    return $map[$name];
}

function lm_expense_categories()
{
    return array('filamento' => 'Filamento y resina', 'materiales' => 'Materiales en plancha', 'componentes' => 'Componentes',
        'electricidad' => 'Electricidad', 'repuestos' => 'Repuestos y mantenimiento', 'maquinaria' => 'Máquinas y herramientas',
        'embalaje' => 'Embalaje y envíos', 'otros' => 'Otros');
}

function lm_kinds()
{
    return array('3d' => 'Impresión 3D', 'laser' => 'Corte y grabado láser', 'sello' => 'Sello personalizado');
}

function lm_machine_types()
{
    return array('3d' => 'Impresora 3D FDM', 'resina' => 'Impresora 3D de resina', 'laser' => 'Láser', 'insoladora' => 'Insoladora', 'otra' => 'Otra');
}

function lm_r2($v)
{
    return round(lm_num($v), 2);
}

function lm_uid()
{
    $ms = base_convert(sprintf('%.0f', floor(microtime(true) * 1000)), 10, 36);
    $chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    $rand = '';
    for ($i = 0; $i < 6; $i++) {
        $rand .= $chars[mt_rand(0, 35)];
    }
    return $ms . $rand;
}

/** Número con hasta $d decimales al estilo español (coma decimal), como fmtNum de la app. */
function lm_fmt($v, $d = 0)
{
    $s = number_format(lm_num($v), $d, ',', '.');
    if ($d > 0) {
        $s = rtrim(rtrim($s, '0'), ',');
    }
    return $s;
}

function lm_unit_of($f)
{
    $u = lm_get($f, 'unit');
    if ($u) {
        return $u;
    }
    return lm_get($f, 'kind') === 'resina' ? 'ml' : 'g';
}

function lm_fmt_amount($q, $unit)
{
    $q = lm_num($q);
    if ($unit === 'ml') {
        return abs($q) >= 1000 ? lm_fmt($q / 1000, 2) . ' L' : lm_fmt($q) . ' ml';
    }
    return abs($q) >= 1000 ? lm_fmt($q / 1000, 2) . ' kg' : lm_fmt($q) . ' g';
}

function lm_fmt_sheets($n)
{
    return lm_fmt($n, 2) . (abs(lm_num($n) - 1) < 1e-9 ? ' plancha' : ' planchas');
}

function lm_unit_label($u)
{
    return $u ? $u : 'ud.';
}

function lm_filament_label($f)
{
    return lm_get($f, 'name', '') . (lm_get($f, 'material') ? ' · ' . $f['material'] : '');
}

function lm_material_label($m)
{
    return lm_get($m, 'name', '') . (lm_num(lm_get($m, 'thickness')) ? ' ' . lm_fmt($m['thickness'], 1) . ' mm' : '');
}

function lm_by_id($list)
{
    $out = array();
    foreach ((array) $list as $x) {
        if (is_array($x) && isset($x['id'])) {
            $out[$x['id']] = $x;
        }
    }
    return $out;
}

function lm_index_of($list, $id)
{
    foreach ($list as $i => $x) {
        if (lm_get($x, 'id') === $id) {
            return $i;
        }
    }
    return -1;
}

function lm_require_index($state, $col, $id, $what)
{
    $i = lm_index_of($state[$col], (string) $id);
    if ($i < 0) {
        throw new LmToolError("No existe ningún $what con id «{$id}». Búscalo antes para conocer su id.");
    }
    return $i;
}

function lm_low_threshold($x, $default)
{
    $l = lm_get($x, 'lowStock');
    return ($l === '' || $l === null) ? lm_num($default) : lm_num($l);
}

function lm_machine_type($m)
{
    return lm_get($m, 'type') ? $m['type'] : '3d';
}

function lm_machine_fits($m, $kind)
{
    if (!$m) {
        return false;
    }
    $t = lm_machine_type($m);
    if ($kind === '3d') {
        return $t === '3d' || $t === 'resina';
    }
    $need = array('laser' => 'laser', 'sello' => 'insoladora');
    return $t === lm_get($need, $kind, '3d');
}

function lm_kind_for_machine($m)
{
    $t = lm_machine_type($m);
    return $t === 'laser' ? 'laser' : ($t === 'insoladora' ? 'sello' : '3d');
}

function lm_text($v, $max = 200)
{
    $s = trim((string) $v);
    return function_exists('mb_substr') ? mb_substr($s, 0, $max, 'UTF-8') : substr($s, 0, $max);
}

function lm_date($v, $today)
{
    if ($v === null || $v === '') {
        return $today;
    }
    $v = (string) $v;
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m) || !checkdate((int) $m[2], (int) $m[3], (int) $m[1])) {
        throw new LmToolError("Fecha no válida: «{$v}». Usa el formato AAAA-MM-DD.");
    }
    return $v;
}

function lm_number($v, $what, $min = null)
{
    if (is_bool($v) || (!is_int($v) && !is_float($v) && !(is_string($v) && is_numeric(trim($v))))) {
        throw new LmToolError("«{$what}» debe ser un número.");
    }
    $n = (float) $v;
    if ($min !== null && $n < $min) {
        throw new LmToolError("«{$what}» debe ser mayor o igual que {$min}.");
    }
    return $n;
}

// ---------------------------------------------------------------- fichas tal como las ve el agente

function lm_out_filament($f, $st)
{
    $u = lm_unit_of($f);
    return array(
        'id' => lm_get($f, 'id'), 'nombre' => lm_get($f, 'name', ''), 'tipo' => lm_get($f, 'kind') === 'resina' ? 'resina' : 'filamento',
        'material' => lm_get($f, 'material', ''), 'marca' => lm_get($f, 'brand', ''), 'color' => lm_get($f, 'colorName', ''),
        'color_hex' => lm_get($f, 'color', ''), 'diametro_mm' => lm_get($f, 'diameter', ''), 'unidad' => $u,
        'contenido_por_' . ($u === 'ml' ? 'envase' : 'bobina') => lm_num(lm_get($f, 'spoolWeight')),
        'precio_por_' . ($u === 'ml' ? 'envase' : 'bobina') => lm_r2(lm_get($f, 'price')),
        ($u === 'ml' ? 'coste_por_litro' : 'coste_por_kg') => lm_r2(lm_cost_per_gram($f) * 1000),
        'stock' => lm_num(lm_get($f, 'remaining')), 'stock_texto' => lm_fmt_amount(lm_get($f, 'remaining'), $u),
        'aviso_stock_bajo' => lm_low_threshold($f, $st['lowStockGrams']),
        'stock_bajo' => lm_num(lm_get($f, 'remaining')) <= lm_low_threshold($f, $st['lowStockGrams']),
        'valor_stock' => lm_r2(max(0, lm_num(lm_get($f, 'remaining'))) * lm_cost_per_gram($f)),
        'tiene_foto' => (bool) lm_get($f, 'photo'),
    );
}

function lm_out_material($m)
{
    return array(
        'id' => lm_get($m, 'id'), 'nombre' => lm_get($m, 'name', ''), 'categoria' => lm_get($m, 'category', ''),
        'grosor_mm' => lm_num(lm_get($m, 'thickness')), 'ancho_plancha_mm' => lm_num(lm_get($m, 'sheetWidth')),
        'alto_plancha_mm' => lm_num(lm_get($m, 'sheetHeight')), 'precio_por_plancha' => lm_r2(lm_get($m, 'price')),
        'coste_por_100_cm2' => lm_r2(lm_sheet_cost_per_cm2($m) * 100), 'stock_planchas' => round(lm_num(lm_get($m, 'stock')), 3),
        'aviso_stock_bajo' => lm_low_threshold($m, 0), 'stock_bajo' => lm_num(lm_get($m, 'stock')) <= lm_low_threshold($m, 0),
        'valor_stock' => lm_r2(max(0, lm_num(lm_get($m, 'stock'))) * lm_num(lm_get($m, 'price'))),
        'proveedor' => lm_get($m, 'supplier', ''), 'tiene_foto' => (bool) lm_get($m, 'photo'),
    );
}

function lm_out_component($c)
{
    return array(
        'id' => lm_get($c, 'id'), 'nombre' => lm_get($c, 'name', ''), 'categoria' => lm_get($c, 'category', ''),
        'unidad' => lm_unit_label(lm_get($c, 'unit')), 'precio_paquete' => lm_r2(lm_get($c, 'price')),
        'unidades_por_paquete' => lm_num(lm_get($c, 'packUnits')) ? lm_num($c['packUnits']) : 1,
        'coste_unidad' => round(lm_component_unit_cost($c), 4), 'stock' => round(lm_num(lm_get($c, 'stock')), 2),
        'aviso_stock_bajo' => lm_low_threshold($c, 0), 'stock_bajo' => lm_num(lm_get($c, 'stock')) <= lm_low_threshold($c, 0),
        'valor_stock' => lm_r2(max(0, lm_num(lm_get($c, 'stock'))) * lm_component_unit_cost($c)),
        'proveedor' => lm_get($c, 'supplier', ''), 'tiene_foto' => (bool) lm_get($c, 'photo'),
    );
}

function lm_out_printer($p, $state)
{
    $st = $state['settings'];
    $hours = 0;
    $jobs = 0;
    foreach ($state['prints'] as $j) {
        if (lm_get($j, 'printerId') === lm_get($p, 'id')) {
            $hours += lm_num(lm_get($j, 'hours'));
            $jobs++;
        }
    }
    $types = lm_machine_types();
    return array(
        'id' => lm_get($p, 'id'), 'nombre' => lm_get($p, 'name', ''), 'tipo' => lm_machine_type($p),
        'tipo_nombre' => lm_get($types, lm_machine_type($p), ''), 'consumo_w' => lm_num(lm_get($p, 'watts')),
        'precio' => lm_r2(lm_get($p, 'price')), 'vida_util_h' => lm_num(lm_get($p, 'lifeHours')),
        'mantenimiento_por_hora' => lm_num(lm_get($p, 'maintenancePerHour')), 'coste_por_hora' => lm_r2(lm_printer_hour_cost($st, $p)),
        'horas_usadas' => round($hours, 1), 'trabajos' => $jobs, 'predeterminada' => lm_get($st, 'defaultPrinterId') === lm_get($p, 'id'),
        'notas' => lm_get($p, 'notes', ''),
    );
}

function lm_out_print($p, $sold)
{
    $c = (array) lm_get($p, 'cost', array());
    $q = lm_num(lm_get($p, 'quantity'));
    $s = lm_num(lm_get($sold, lm_get($p, 'id'), 0));
    $mat = array();
    foreach ((array) lm_get($p, 'items', array()) as $it) {
        $mat[] = lm_get($it, 'filamentName', '') . ': ' . lm_fmt_amount(lm_get($it, 'grams'), lm_get($it, 'unit', 'g'));
    }
    foreach ((array) lm_get($p, 'sheets', array()) as $it) {
        $cnt = lm_get($it, 'count');
        $mat[] = lm_get($it, 'materialName', '') . ': ' . ($cnt !== null && lm_num($cnt) != 1 ? lm_fmt($cnt, 2) . ' × ' : '')
            . lm_fmt(lm_get($it, 'width')) . ' × ' . lm_fmt(lm_get($it, 'height')) . ' mm por pieza';
    }
    $comps = array();
    foreach ((array) lm_get($p, 'components', array()) as $it) {
        $comps[] = lm_fmt(lm_get($it, 'qty'), 2) . ' × ' . lm_get($it, 'componentName', '') . ' por pieza';
    }
    $kinds = lm_kinds();
    $k = lm_get($p, 'kind') ? $p['kind'] : '3d';
    return array(
        'id' => lm_get($p, 'id'), 'fecha' => lm_get($p, 'date', ''), 'nombre' => lm_get($p, 'name', ''), 'tipo' => $k,
        'tipo_nombre' => lm_get($kinds, $k, $k), 'maquina' => lm_get($p, 'printerName', ''), 'maquina_id' => lm_get($p, 'printerId', ''),
        'unidades' => $q, 'horas_maquina' => round(lm_num(lm_get($p, 'hours')), 2), 'materiales' => $mat, 'componentes' => $comps,
        'mano_obra_horas' => lm_num(lm_get($p, 'laborHours')), 'extras' => lm_r2(lm_get($p, 'extras')),
        'coste_total' => lm_r2(lm_get($c, 'total')), 'coste_unidad' => lm_r2(lm_get($c, 'unit')),
        'precio_sugerido_unidad' => lm_r2(lm_get($c, 'suggestedUnitPrice')), 'margen_pct' => lm_num(lm_get($c, 'margin')),
        'vendidas' => $s, 'disponibles' => max(0, $q - $s), 'stock_descontado' => (bool) lm_get($p, 'stockDeducted'),
        'enlace_archivo' => lm_get($p, 'fileUrl', ''), 'fotos' => count((array) lm_get($p, 'photos', array())), 'notas' => lm_get($p, 'notes', ''),
    );
}

function lm_out_sale($s)
{
    $t = lm_sale_totals($s);
    return array(
        'id' => lm_get($s, 'id'), 'fecha' => lm_get($s, 'date', ''), 'descripcion' => lm_get($s, 'description', ''),
        'trabajo_id' => lm_get($s, 'printId') ? $s['printId'] : null, 'unidades' => lm_num(lm_get($s, 'quantity')),
        'precio_unidad' => lm_r2(lm_get($s, 'unitPrice')), 'ingreso' => lm_r2($t['revenue']), 'comisiones_y_envio' => lm_r2($t['fees']),
        'coste_unidad' => round(lm_num(lm_get($s, 'unitCost')), 4), 'coste' => lm_r2($t['cogs']), 'beneficio' => lm_r2($t['profit']),
        'margen_pct' => $t['revenue'] > 0 ? round($t['profit'] / $t['revenue'] * 100, 1) : null,
        'cliente' => lm_get($s, 'customer', ''), 'canal' => lm_get($s, 'channel', ''),
    );
}

function lm_out_expense($e)
{
    $cats = lm_expense_categories();
    $k = lm_get($e, 'category', 'otros');
    return array('id' => lm_get($e, 'id'), 'fecha' => lm_get($e, 'date', ''), 'categoria' => $k, 'categoria_nombre' => lm_get($cats, $k, $k),
        'descripcion' => lm_get($e, 'description', ''), 'importe' => lm_r2(lm_get($e, 'amount')));
}

/** Máquina de un escandallo: la suya, o la predeterminada o la primera adecuada al tipo (como la app). */
function lm_product_printer($pd, $state)
{
    $printers = lm_by_id($state['printers']);
    $kind = lm_get($pd, 'kind') ? $pd['kind'] : '3d';
    $own = lm_get($printers, lm_get($pd, 'printerId'));
    if ($own) {
        return $own;
    }
    $default = lm_get($printers, lm_get($state['settings'], 'defaultPrinterId'));
    if (lm_machine_fits($default, $kind)) {
        return $default;
    }
    foreach ($state['printers'] as $p) {
        if (lm_machine_fits($p, $kind)) {
            return $p;
        }
    }
    return $default;
}

/** Trabajo de N conjuntos de un escandallo, con nombres y coste, igual que en la app. */
function lm_product_cost($pd, $sets, $state)
{
    $fils = lm_by_id($state['filaments']);
    $mats = lm_by_id($state['materials']);
    $comps = lm_by_id($state['components']);
    $job = lm_product_job($pd, $sets, $fils, $mats);
    foreach ($job['sheets'] as $k => $it) {
        if (isset($mats[$it['materialId']])) {
            $job['sheets'][$k]['materialName'] = lm_material_label($mats[$it['materialId']]);
        }
    }
    foreach ($job['components'] as $k => $c) {
        $x = lm_get($comps, $c['componentId']);
        $job['components'][$k]['componentName'] = $x ? $x['name'] : '';
        $job['components'][$k]['unitCost'] = $x ? lm_component_unit_cost($x) : 0;
    }
    $pr = lm_product_printer($pd, $state);
    $job['printerId'] = $pr ? $pr['id'] : '';
    $job['printerName'] = $pr ? $pr['name'] : '';
    $job['cost'] = lm_print_cost($job, $fils, $state['settings'], $pr, $comps, $mats);
    return $job;
}

function lm_out_product($pd, $state)
{
    $j = lm_product_cost($pd, 1, $state);
    $parts = array();
    $fils = lm_by_id($state['filaments']);
    $mats = lm_by_id($state['materials']);
    foreach ((array) lm_get($pd, 'parts', array()) as $pt) {
        $o = array('pieza' => lm_get($pt, 'name', ''), 'unidades_por_conjunto' => lm_num(lm_get($pt, 'qty')), 'minutos_por_pieza' => lm_num(lm_get($pt, 'minutes')));
        if (lm_get($pt, 'filamentId')) {
            $f = lm_get($fils, $pt['filamentId']);
            $o['filamento'] = $f ? lm_filament_label($f) : '(ya no existe)';
            $o['cantidad_por_pieza'] = lm_fmt_amount(lm_get($pt, 'grams'), $f ? lm_unit_of($f) : 'g');
        }
        if (lm_get($pt, 'materialId')) {
            $m = lm_get($mats, $pt['materialId']);
            $o['material'] = $m ? lm_material_label($m) : '(ya no existe)';
            $o['medidas_mm'] = lm_fmt(lm_get($pt, 'width')) . ' × ' . lm_fmt(lm_get($pt, 'height'));
        }
        $parts[] = $o;
    }
    $comps = array();
    foreach ($j['components'] as $c) {
        $comps[] = lm_fmt($c['qty'], 2) . ' × ' . $c['componentName'];
    }
    $kinds = lm_kinds();
    $k = lm_get($pd, 'kind') ? $pd['kind'] : '3d';
    return array(
        'id' => lm_get($pd, 'id'), 'nombre' => lm_get($pd, 'name', ''), 'tipo' => $k, 'tipo_nombre' => lm_get($kinds, $k, $k),
        'maquina' => $j['printerName'], 'piezas' => $parts, 'componentes_por_conjunto' => $comps,
        'montaje_minutos_por_conjunto' => lm_num(lm_get($pd, 'laborMinutes')), 'extras_por_conjunto' => lm_r2(lm_get($pd, 'extras')),
        'minutos_de_maquina_por_conjunto' => round($j['hours'] * 60, 1), 'coste_por_conjunto' => lm_r2($j['cost']['unit']),
        'margen_pct' => $j['cost']['margin'], 'precio_sugerido_por_conjunto' => lm_r2($j['cost']['suggestedUnitPrice']),
        'notas' => lm_get($pd, 'notes', ''), 'tiene_foto' => (bool) lm_get($pd, 'photo'),
    );
}

function lm_out_settings($st)
{
    return array(
        'moneda' => lm_get($st, 'currency', 'EUR'), 'precio_kwh' => lm_num($st['kwhPrice']), 'mano_obra_por_hora' => lm_num($st['laborRate']),
        'margen_fallos_pct' => lm_num($st['failureRate']), 'desperdicio_plancha_pct' => lm_num($st['sheetWaste']),
        'margen_beneficio_pct' => lm_num($st['defaultMargin']), 'aviso_stock_bajo_g_o_ml' => lm_num($st['lowStockGrams']),
        'maquina_predeterminada_id' => lm_get($st, 'defaultPrinterId', ''),
    );
}

function lm_matches($q, $fields)
{
    if ($q === null || $q === '') {
        return true;
    }
    $hay = implode(' ', $fields);
    return function_exists('mb_stripos') ? mb_stripos($hay, (string) $q, 0, 'UTF-8') !== false : stripos($hay, (string) $q) !== false;
}

/** [desde, hasta] a partir de periodo o desde/hasta. */
function lm_range($args, $today, $defaultPeriod)
{
    $from = lm_get($args, 'desde');
    $to = lm_get($args, 'hasta');
    if ($from || $to) {
        return array($from ? lm_date($from, $today) : null, $to ? lm_date($to, $today) : null);
    }
    $p = lm_get($args, 'periodo', $defaultPeriod);
    list($y, $m) = array((int) substr($today, 0, 4), (int) substr($today, 5, 2));
    switch ($p) {
        case 'este_mes':
            return array(sprintf('%04d-%02d-01', $y, $m), sprintf('%04d-%02d-%02d', $y, $m, cal_days($y, $m)));
        case 'mes_anterior':
            $py = $m === 1 ? $y - 1 : $y;
            $pm = $m === 1 ? 12 : $m - 1;
            return array(sprintf('%04d-%02d-01', $py, $pm), sprintf('%04d-%02d-%02d', $py, $pm, cal_days($py, $pm)));
        case 'este_año':
            return array("$y-01-01", "$y-12-31");
        case 'ultimos_12_meses':
            $sy = $m === 12 ? $y : $y - 1;
            $sm = $m === 12 ? 1 : $m + 1;
            return array(sprintf('%04d-%02d-01', $sy, $sm), $today);
        case 'todo':
        case null:
            return array(null, null);
    }
    throw new LmToolError("Periodo desconocido: «{$p}».");
}

function cal_days($y, $m)
{
    return (int) date('t', mktime(0, 0, 0, $m, 1, $y));
}

function lm_limit($args, $default)
{
    $l = (int) lm_get($args, 'limite', $default);
    return max(1, min(200, $l ? $l : $default));
}

// ---------------------------------------------------------------- trabajos: coste y stock

/** Trabajo con el mismo formato que guarda la app, a partir de los argumentos del agente. */
function lm_build_job($args, $state, &$warnings)
{
    $st = $state['settings'];
    $printers = lm_by_id($state['printers']);
    $fils = lm_by_id($state['filaments']);
    $mats = lm_by_id($state['materials']);
    $comps = lm_by_id($state['components']);

    $printer = null;
    $mid = lm_get($args, 'maquina_id');
    if ($mid) {
        $printer = lm_get($printers, $mid);
        if (!$printer) {
            throw new LmToolError("No existe ninguna máquina con id «{$mid}». Consulta ver_maquinas_y_ajustes.");
        }
    }
    $kinds = lm_kinds();
    $kind = lm_get($args, 'tipo');
    if ($kind !== null && !isset($kinds[$kind])) {
        throw new LmToolError('«tipo» debe ser uno de: ' . implode(', ', array_keys($kinds)) . '.');
    }
    if (!$kind) {
        $default = lm_get($printers, lm_get($st, 'defaultPrinterId'));
        $kind = $printer ? lm_kind_for_machine($printer) : ($default ? lm_kind_for_machine($default) : '3d');
    }
    if (!$printer) {
        $default = lm_get($printers, lm_get($st, 'defaultPrinterId'));
        if (lm_machine_fits($default, $kind)) {
            $printer = $default;
        } else {
            foreach ($state['printers'] as $p) {
                if (lm_machine_fits($p, $kind)) {
                    $printer = $p;
                    break;
                }
            }
        }
        if (!$printer && $state['printers']) {
            $printer = $default ? $default : $state['printers'][0];
        }
    }
    if ($printer && !lm_machine_fits($printer, $kind)) {
        $warnings[] = 'La máquina «' . $printer['name'] . '» no es del tipo habitual para ' . $kinds[$kind] . '.';
    }

    $items = array();
    $sheets = array();
    if ($kind === '3d') {
        foreach ((array) lm_get($args, 'filamentos', array()) as $it) {
            $f = lm_get($fils, lm_get($it, 'id'));
            if (!$f) {
                throw new LmToolError('No existe ningún filamento o resina con id «' . lm_get($it, 'id') . '». Consulta ver_stock.');
            }
            $g = lm_number(lm_get($it, 'cantidad'), 'cantidad de ' . $f['name'], 0);
            if ($g > 0) {
                $items[] = array('filamentId' => $f['id'], 'filamentName' => lm_filament_label($f), 'unit' => lm_unit_of($f), 'grams' => $g);
            }
        }
        if (lm_get($args, 'planchas')) {
            $warnings[] = 'Las planchas solo cuentan en trabajos de láser o sello; se han ignorado.';
        }
    } else {
        foreach ((array) lm_get($args, 'planchas', array()) as $it) {
            $m = lm_get($mats, lm_get($it, 'id'));
            if (!$m) {
                throw new LmToolError('No existe ningún material en plancha con id «' . lm_get($it, 'id') . '». Consulta ver_stock.');
            }
            $w = lm_number(lm_get($it, 'ancho_mm'), 'ancho_mm', 0);
            $h = lm_number(lm_get($it, 'alto_mm'), 'alto_mm', 0);
            if ($w > 0 && $h > 0) {
                $sheets[] = array('materialId' => $m['id'], 'materialName' => lm_material_label($m), 'width' => $w, 'height' => $h,
                    'costPerCm2' => lm_sheet_cost_per_cm2($m));
            }
        }
        if (lm_get($args, 'filamentos')) {
            $warnings[] = 'El filamento y la resina solo cuentan en trabajos de impresión 3D; se han ignorado.';
        }
    }
    $components = array();
    foreach ((array) lm_get($args, 'componentes', array()) as $it) {
        $c = lm_get($comps, lm_get($it, 'id'));
        if (!$c) {
            throw new LmToolError('No existe ningún componente con id «' . lm_get($it, 'id') . '». Consulta ver_stock.');
        }
        $q = lm_number(lm_get($it, 'cantidad_por_pieza'), 'cantidad_por_pieza', 0);
        if ($q > 0) {
            $components[] = array('componentId' => $c['id'], 'componentName' => $c['name'], 'qty' => $q, 'unitCost' => lm_component_unit_cost($c));
        }
    }
    $hours = lm_number(lm_get($args, 'horas', 0), 'horas', 0);
    $quantity = lm_quantity(lm_number(lm_get($args, 'unidades', 1), 'unidades', 1));
    $margin = lm_get($args, 'margen_pct');
    $job = array(
        'kind' => $kind, 'printerId' => $printer ? $printer['id'] : '', 'items' => $items, 'sheets' => $sheets, 'components' => $components,
        'hours' => $hours, 'quantity' => $quantity, 'laborHours' => lm_number(lm_get($args, 'mano_obra_horas', 0), 'mano_obra_horas', 0),
        'extras' => lm_number(lm_get($args, 'extras', 0), 'extras', 0), 'margin' => $margin === null || $margin === '' ? '' : lm_number($margin, 'margen_pct', 0),
    );
    if (!$items && !$sheets && !$components && !$hours) {
        throw new LmToolError('Indica el material usado o el tiempo de máquina.');
    }
    $job['cost'] = lm_print_cost($job, $fils, $st, $printer, $comps, $mats);
    $job['printerName'] = $printer ? $printer['name'] : '';
    return $job;
}

/** Avisos de stock insuficiente para un trabajo. */
function lm_stock_warnings($job, $state)
{
    $out = array();
    $fils = lm_by_id($state['filaments']);
    foreach (lm_grams_by_filament($job['items']) as $id => $g) {
        $f = $fils[$id];
        if ($g > lm_num(lm_get($f, 'remaining'))) {
            $out[] = 'Stock insuficiente de ' . $f['name'] . ': necesitas ' . lm_fmt_amount($g, lm_unit_of($f)) . ' y quedan ' . lm_fmt_amount($f['remaining'], lm_unit_of($f)) . '.';
        }
    }
    $mats = lm_by_id($state['materials']);
    foreach (lm_sheets_used($job['sheets'], $job['quantity'], $state['settings']['sheetWaste'], $mats) as $id => $n) {
        if ($n > lm_num(lm_get($mats[$id], 'stock')) + 1e-9) {
            $out[] = 'Faltan planchas de ' . lm_material_label($mats[$id]) . ': necesitas ' . lm_fmt($n, 2) . ' y hay ' . lm_fmt(lm_get($mats[$id], 'stock'), 2) . '.';
        }
    }
    $comps = lm_by_id($state['components']);
    foreach (lm_components_used($job['components'], $job['quantity']) as $id => $q) {
        if ($q > lm_num(lm_get($comps[$id], 'stock'))) {
            $out[] = 'Faltan ' . $comps[$id]['name'] . ': necesitas ' . lm_fmt($q, 2) . ' y hay ' . lm_fmt(lm_get($comps[$id], 'stock'), 2) . '.';
        }
    }
    return $out;
}

/** Suma (+1) o descuenta (-1) del stock lo que consume un trabajo (igual que applyJobStock). */
function lm_apply_job_stock(&$state, $job, $sign)
{
    foreach (lm_grams_by_filament(lm_get($job, 'items', array())) as $id => $g) {
        $i = lm_index_of($state['filaments'], $id);
        if ($i >= 0) {
            $state['filaments'][$i]['remaining'] = round(lm_num(lm_get($state['filaments'][$i], 'remaining')) + $sign * $g, 1);
        }
    }
    foreach (lm_sheets_used(lm_get($job, 'sheets', array()), lm_get($job, 'quantity'), $state['settings']['sheetWaste'], lm_by_id($state['materials'])) as $id => $n) {
        $i = lm_index_of($state['materials'], $id);
        $state['materials'][$i]['stock'] = round(lm_num(lm_get($state['materials'][$i], 'stock')) + $sign * $n, 3);
    }
    foreach (lm_components_used(lm_get($job, 'components', array()), lm_get($job, 'quantity')) as $id => $q) {
        $i = lm_index_of($state['components'], $id);
        if ($i >= 0) {
            $state['components'][$i]['stock'] = round(lm_num(lm_get($state['components'][$i], 'stock')) + $sign * $q, 2);
        }
    }
}

function lm_out_cost($c, $settings)
{
    return array(
        'filamento_o_resina' => lm_r2($c['material']), 'material_en_plancha' => lm_r2($c['sheet']), 'electricidad' => lm_r2($c['electricity']),
        'amortizacion_y_mantenimiento' => lm_r2($c['machine']), 'componentes' => lm_r2($c['components']), 'mano_de_obra' => lm_r2($c['labor']),
        'extras' => lm_r2($c['extras']), 'margen_fallos' => lm_r2($c['failure']), 'margen_fallos_pct' => lm_num($settings['failureRate']),
        'coste_total' => lm_r2($c['total']), 'unidades' => $c['quantity'], 'coste_unidad' => lm_r2($c['unit']),
        'margen_pct' => $c['margin'], 'precio_sugerido_unidad' => lm_r2($c['suggestedUnitPrice']),
    );
}

// ---------------------------------------------------------------- herramientas

function lm_job_schema($withRecord)
{
    $props = array(
        'tipo' => array('type' => 'string', 'enum' => array('3d', 'laser', 'sello'), 'description' => '3d = impresión 3D (filamento o resina), laser = corte/grabado láser, sello = sello de insoladora. Si no se indica, el de la máquina.'),
        'maquina_id' => array('type' => 'string', 'description' => 'Id de la máquina (ver_maquinas_y_ajustes). Si no se indica, la predeterminada o la primera adecuada al tipo.'),
        'horas' => array('type' => 'number', 'minimum' => 0, 'description' => 'Tiempo total de máquina en horas (todas las unidades), p. ej. 2.5 = 2 h 30 min.'),
        'unidades' => array('type' => 'integer', 'minimum' => 1, 'description' => 'Piezas que salen del trabajo. Por defecto 1.'),
        'filamentos' => array('type' => 'array', 'description' => 'Solo tipo 3d: filamento o resina usados, en total para todas las unidades (lo que dice el laminador).',
            'items' => array('type' => 'object', 'properties' => array(
                'id' => array('type' => 'string', 'description' => 'Id del filamento o resina (ver_stock).'),
                'cantidad' => array('type' => 'number', 'minimum' => 0, 'description' => 'Gramos de filamento o ml de resina (la unidad de esa ficha).'),
            ), 'required' => array('id', 'cantidad'))),
        'planchas' => array('type' => 'array', 'description' => 'Solo láser y sello: material en plancha con las medidas que ocupa CADA pieza. En sellos, añade el fotopolímero y el fotolito.',
            'items' => array('type' => 'object', 'properties' => array(
                'id' => array('type' => 'string', 'description' => 'Id del material (ver_stock).'),
                'ancho_mm' => array('type' => 'number', 'minimum' => 0), 'alto_mm' => array('type' => 'number', 'minimum' => 0),
            ), 'required' => array('id', 'ancho_mm', 'alto_mm'))),
        'componentes' => array('type' => 'array', 'description' => 'Componentes externos (portalámparas, LED, imanes…) por pieza.',
            'items' => array('type' => 'object', 'properties' => array(
                'id' => array('type' => 'string', 'description' => 'Id del componente (ver_stock).'),
                'cantidad_por_pieza' => array('type' => 'number', 'minimum' => 0),
            ), 'required' => array('id', 'cantidad_por_pieza'))),
        'mano_obra_horas' => array('type' => 'number', 'minimum' => 0, 'description' => 'Horas de diseño, montaje y acabado (se cobran al precio de mano de obra de los ajustes).'),
        'extras' => array('type' => 'number', 'minimum' => 0, 'description' => 'Gastos sueltos no inventariados, en la moneda de la libreta.'),
        'margen_pct' => array('type' => 'number', 'minimum' => 0, 'description' => 'Margen para el precio sugerido. Si no se indica, el de los ajustes.'),
    );
    $required = array();
    if ($withRecord) {
        $props['nombre'] = array('type' => 'string', 'description' => 'Pieza o encargo, p. ej. «Soporte de auriculares».');
        $props['fecha'] = array('type' => 'string', 'description' => 'AAAA-MM-DD. Por defecto, hoy.');
        $props['notas'] = array('type' => 'string');
        $props['enlace_archivo'] = array('type' => 'string', 'description' => 'Enlace al archivo usado (Printables, Thingiverse, MakerWorld…).');
        $props['descontar_stock'] = array('type' => 'boolean', 'description' => 'Descontar del stock el material y los componentes. Por defecto sí.');
        $required[] = 'nombre';
    }
    $s = array('type' => 'object', 'properties' => $props);
    if ($required) {
        $s['required'] = $required;
    }
    return $s;
}

function lm_fields_doc()
{
    return "Campos por sección (en «datos»):\n"
        . "- filamentos: nombre, tipo (filamento|resina), material, marca, color (nombre), color_hex, diametro_mm (1.75|2.85|3.00), unidad (g|ml, solo resina), contenido (g o ml por bobina o envase), precio (por bobina o envase), stock (g o ml que quedan), aviso_stock_bajo.\n"
        . "- materiales: nombre, categoria, grosor_mm, ancho_plancha_mm, alto_plancha_mm, precio (por plancha), stock (planchas; admite decimales), aviso_stock_bajo, proveedor.\n"
        . "- componentes: nombre, categoria, unidad (ud., m, par…), precio (del paquete), unidades_por_paquete, stock, aviso_stock_bajo, proveedor.\n"
        . "- maquinas: nombre, tipo (3d|resina|laser|insoladora|otra), consumo_w, precio, vida_util_h, mantenimiento_por_hora, notas.\n"
        . "- trabajos (solo editar): nombre, fecha, notas, enlace_archivo. Para cambiar materiales, tiempos o unidades, elimina el trabajo y regístralo de nuevo.\n"
        . "- ventas (solo editar): descripcion, fecha, unidades, precio_unidad, comisiones, coste_unidad, cliente, canal.\n"
        . "- gastos (solo editar): fecha, categoria, descripcion, importe.";
}

/** Definición de todas las herramientas: nombre, descripción, esquema de entrada y si cambian la libreta. */
function lm_tools()
{
    $period = array('type' => 'string', 'enum' => array('este_mes', 'mes_anterior', 'este_año', 'ultimos_12_meses', 'todo'));
    $date = array('type' => 'string', 'description' => 'AAAA-MM-DD');
    $dateToday = array('type' => 'string', 'description' => 'AAAA-MM-DD. Por defecto, hoy.');
    $cols = array_keys(lm_col_names());
    $ro = array('readOnlyHint' => true, 'openWorldHint' => false);
    $rw = array('readOnlyHint' => false, 'destructiveHint' => false, 'openWorldHint' => false);
    return array(
        array('name' => 'ver_resumen', 'title' => 'Resumen económico', 'write' => false, 'annotations' => $ro,
            'description' => 'Resumen de un periodo: ventas (ingresos, beneficio, margen), gastos, resultado de caja, resultados por línea de negocio (3D, láser, sellos), avisos de stock bajo, valor del inventario y piezas fabricadas sin vender.',
            'inputSchema' => array('type' => 'object', 'properties' => array(
                'periodo' => $period + array('description' => 'Por defecto este_mes. Se ignora si se dan desde/hasta.'),
                'desde' => $date, 'hasta' => $date))),
        array('name' => 'ver_stock', 'title' => 'Stock', 'write' => false, 'annotations' => $ro,
            'description' => 'Filamento y resina, materiales en plancha y componentes con su id, stock, aviso de stock bajo, precio y valor. Úsala para conocer los ids antes de registrar trabajos o reponer.',
            'inputSchema' => array('type' => 'object', 'properties' => array(
                'tipo' => array('type' => 'string', 'enum' => array('todo', 'filamentos', 'materiales', 'componentes'), 'description' => 'Por defecto todo.'),
                'solo_bajo' => array('type' => 'boolean', 'description' => 'Solo lo que está por debajo del aviso de stock bajo.'),
                'buscar' => array('type' => 'string', 'description' => 'Texto a buscar en nombre, material, marca, color, categoría o proveedor.')))),
        array('name' => 'buscar_trabajos', 'title' => 'Buscar trabajos', 'write' => false, 'annotations' => $ro,
            'description' => 'Trabajos registrados (impresiones 3D, láser, sellos), del más reciente al más antiguo, con su coste, precio sugerido y unidades vendidas y disponibles.',
            'inputSchema' => array('type' => 'object', 'properties' => array(
                'buscar' => array('type' => 'string', 'description' => 'Texto en el nombre, notas, máquina o materiales.'),
                'tipo' => array('type' => 'string', 'enum' => array('3d', 'laser', 'sello')),
                'desde' => $date, 'hasta' => $date,
                'pendientes_de_vender' => array('type' => 'boolean', 'description' => 'Solo los que tienen unidades sin vender.'),
                'limite' => array('type' => 'integer', 'minimum' => 1, 'maximum' => 200, 'description' => 'Por defecto 20.')))),
        array('name' => 'buscar_ventas', 'title' => 'Buscar ventas', 'write' => false, 'annotations' => $ro,
            'description' => 'Ventas, de la más reciente a la más antigua, con ingreso, comisiones, coste y beneficio, y los totales de las encontradas.',
            'inputSchema' => array('type' => 'object', 'properties' => array(
                'buscar' => array('type' => 'string', 'description' => 'Texto en la descripción, el cliente o el canal.'),
                'periodo' => $period + array('description' => 'Por defecto todo. Se ignora si se dan desde/hasta.'), 'desde' => $date, 'hasta' => $date,
                'limite' => array('type' => 'integer', 'minimum' => 1, 'maximum' => 200, 'description' => 'Por defecto 30.')))),
        array('name' => 'buscar_gastos', 'title' => 'Buscar gastos', 'write' => false, 'annotations' => $ro,
            'description' => 'Gastos, del más reciente al más antiguo, con los totales por categoría de los encontrados.',
            'inputSchema' => array('type' => 'object', 'properties' => array(
                'categoria' => array('type' => 'string', 'enum' => array_keys(lm_expense_categories())),
                'buscar' => array('type' => 'string', 'description' => 'Texto en la descripción.'),
                'periodo' => $period + array('description' => 'Por defecto todo. Se ignora si se dan desde/hasta.'), 'desde' => $date, 'hasta' => $date,
                'limite' => array('type' => 'integer', 'minimum' => 1, 'maximum' => 200, 'description' => 'Por defecto 30.')))),
        array('name' => 'ver_maquinas_y_ajustes', 'title' => 'Máquinas y ajustes', 'write' => false, 'annotations' => $ro,
            'description' => 'Máquinas (impresoras 3D, láser, insoladora) con su id, coste por hora y uso, y los ajustes de costes de la libreta (moneda, precio de la luz, mano de obra, márgenes).',
            'inputSchema' => array('type' => 'object', 'properties' => new stdClass())),
        array('name' => 'ver_ficha', 'title' => 'Ver ficha', 'write' => false, 'annotations' => $ro,
            'description' => 'Todos los datos de una ficha por su id. Para un trabajo incluye el desglose de coste y sus ventas.',
            'inputSchema' => array('type' => 'object', 'properties' => array(
                'seccion' => array('type' => 'string', 'enum' => $cols), 'id' => array('type' => 'string')), 'required' => array('seccion', 'id'))),
        array('name' => 'ver_fotos', 'title' => 'Ver fotos', 'write' => false, 'annotations' => $ro,
            'description' => 'Muestra las fotos de un trabajo (varias), filamento, material, componente o escandallo (una).',
            'inputSchema' => array('type' => 'object', 'properties' => array(
                'seccion' => array('type' => 'string', 'enum' => array('trabajos', 'filamentos', 'materiales', 'componentes', 'escandallos')),
                'id' => array('type' => 'string'),
                'tamano' => array('type' => 'string', 'enum' => array('grande', 'miniatura'), 'description' => 'Por defecto grande.')), 'required' => array('seccion', 'id'))),
        array('name' => 'ver_escandallos', 'title' => 'Escandallos', 'write' => false, 'annotations' => $ro,
            'description' => 'Escandallos: productos que se venden como un conjunto de piezas (p. ej. un clicker: carcasa y tecla impresas + interruptor + anilla de llavero), con sus piezas, componentes, coste y precio sugerido por conjunto a los precios actuales. Para un encargo de un escandallo usa presupuestar_encargo y registrar_encargo, no calcular_coste.',
            'inputSchema' => array('type' => 'object', 'properties' => array('buscar' => array('type' => 'string', 'description' => 'Texto en el nombre.')))),
        array('name' => 'presupuestar_encargo', 'title' => 'Presupuestar encargo', 'write' => false, 'annotations' => $ro,
            'description' => 'Coste, precio sugerido y total de un encargo de N conjuntos de un escandallo, sin guardar nada, con avisos si falta stock. Con precio_por_conjunto calcula el total y el beneficio a ese precio.',
            'inputSchema' => array('type' => 'object', 'properties' => array(
                'escandallo_id' => array('type' => 'string', 'description' => 'Id del escandallo (ver_escandallos).'),
                'conjuntos' => array('type' => 'integer', 'minimum' => 1),
                'precio_por_conjunto' => array('type' => 'number', 'minimum' => 0, 'description' => 'Opcional. Por defecto, el sugerido.')),
                'required' => array('escandallo_id', 'conjuntos'))),
        array('name' => 'registrar_encargo', 'title' => 'Registrar encargo', 'write' => true, 'annotations' => $rw,
            'description' => 'Registra el trabajo de N conjuntos de un escandallo (descuenta piezas impresas, planchas y componentes del stock) y, si se indica venta, también la venta ligada a ese trabajo.',
            'inputSchema' => array('type' => 'object', 'properties' => array(
                'escandallo_id' => array('type' => 'string'), 'conjuntos' => array('type' => 'integer', 'minimum' => 1),
                'fecha' => $dateToday, 'nombre' => array('type' => 'string', 'description' => 'Nombre del trabajo. Por defecto «escandallo ×N».'),
                'descontar_stock' => array('type' => 'boolean', 'description' => 'Por defecto sí.'),
                'venta' => array('type' => 'object', 'description' => 'Solo si el encargo ya está vendido.', 'properties' => array(
                    'precio_por_conjunto' => array('type' => 'number', 'minimum' => 0, 'description' => 'Por defecto, el sugerido.'),
                    'comisiones' => array('type' => 'number', 'minimum' => 0), 'cliente' => array('type' => 'string'), 'canal' => array('type' => 'string')))),
                'required' => array('escandallo_id', 'conjuntos'))),
        array('name' => 'calcular_coste', 'title' => 'Calcular coste', 'write' => false, 'annotations' => $ro,
            'description' => 'Calcula el coste y el precio sugerido de un trabajo sin guardarlo (para presupuestos), con avisos si falta stock. Mismo cálculo que la app.',
            'inputSchema' => lm_job_schema(false)),
        array('name' => 'registrar_trabajo', 'title' => 'Registrar trabajo', 'write' => true, 'annotations' => $rw,
            'description' => 'Registra un trabajo hecho (impresión 3D, láser o sello): calcula su coste y, salvo que se indique lo contrario, descuenta el material y los componentes del stock.',
            'inputSchema' => lm_job_schema(true)),
        array('name' => 'registrar_venta', 'title' => 'Registrar venta', 'write' => true, 'annotations' => $rw,
            'description' => 'Registra una venta. Si viene de un trabajo registrado, indica trabajo_id: la descripción y el coste por unidad se toman de él. Sin trabajo_id es una venta libre y la descripción es obligatoria.',
            'inputSchema' => array('type' => 'object', 'properties' => array(
                'trabajo_id' => array('type' => 'string', 'description' => 'Id del trabajo vendido (buscar_trabajos).'),
                'descripcion' => array('type' => 'string'), 'fecha' => $dateToday,
                'unidades' => array('type' => 'number', 'minimum' => 1, 'description' => 'Por defecto 1.'),
                'precio_unidad' => array('type' => 'number', 'minimum' => 0, 'description' => 'Precio de venta por unidad.'),
                'comisiones' => array('type' => 'number', 'minimum' => 0, 'description' => 'Total de comisiones y envío de la venta (Etsy, Wallapop, PayPal…).'),
                'coste_unidad' => array('type' => 'number', 'minimum' => 0, 'description' => 'Solo si no quieres usar el coste del trabajo.'),
                'cliente' => array('type' => 'string'), 'canal' => array('type' => 'string', 'description' => 'Etsy, Wallapop, tienda online, directo, feria…')),
                'required' => array('precio_unidad'))),
        array('name' => 'registrar_gasto', 'title' => 'Registrar gasto', 'write' => true, 'annotations' => $rw,
            'description' => 'Registra un gasto (repuestos, embalaje, electricidad…). Para compras de filamento, planchas o componentes usa reponer_stock, que además suma al stock.',
            'inputSchema' => array('type' => 'object', 'properties' => array(
                'fecha' => $dateToday,
                'categoria' => array('type' => 'string', 'enum' => array_keys(lm_expense_categories())),
                'descripcion' => array('type' => 'string'), 'importe' => array('type' => 'number', 'minimum' => 0)),
                'required' => array('categoria', 'descripcion', 'importe'))),
        array('name' => 'reponer_stock', 'title' => 'Reponer stock', 'write' => true, 'annotations' => $rw,
            'description' => 'Suma una compra al stock de un filamento o resina, material en plancha o componente y, por defecto, la registra como gasto.',
            'inputSchema' => array('type' => 'object', 'properties' => array(
                'seccion' => array('type' => 'string', 'enum' => array('filamentos', 'materiales', 'componentes')),
                'id' => array('type' => 'string'),
                'unidades_compradas' => array('type' => 'number', 'minimum' => 0, 'description' => 'Bobinas o envases, planchas o paquetes comprados.'),
                'cantidad' => array('type' => 'number', 'minimum' => 0, 'description' => 'Opcional: cantidad exacta a sumar (g o ml de filamento o resina, unidades de componente). Por defecto unidades_compradas × contenido de la ficha.'),
                'importe' => array('type' => 'number', 'minimum' => 0, 'description' => 'Total pagado. Por defecto unidades_compradas × precio de la ficha.'),
                'fecha' => $dateToday,
                'registrar_gasto' => array('type' => 'boolean', 'description' => 'Por defecto sí.'),
                'actualizar_precio' => array('type' => 'boolean', 'description' => 'Guardar el nuevo precio por unidad (importe ÷ unidades_compradas) en la ficha.')),
                'required' => array('seccion', 'id', 'unidades_compradas'))),
        array('name' => 'guardar_ficha', 'title' => 'Crear o editar ficha', 'write' => true, 'annotations' => $rw + array('idempotentHint' => true),
            'description' => "Crea (sin id) o edita (con id) una ficha. Al editar solo cambian los campos indicados. Para dar de alta una compra con stock, créala con stock 0 y luego usa reponer_stock (así queda el gasto).\n" . lm_fields_doc(),
            'inputSchema' => array('type' => 'object', 'properties' => array(
                'seccion' => array('type' => 'string', 'enum' => $cols),
                'id' => array('type' => 'string', 'description' => 'Para editar. Sin id se crea una ficha nueva (solo filamentos, materiales, componentes y maquinas).'),
                'datos' => array('type' => 'object', 'description' => 'Campos a guardar (ver la descripción de la herramienta).')),
                'required' => array('seccion', 'datos'))),
        array('name' => 'cambiar_ajustes', 'title' => 'Cambiar ajustes', 'write' => true, 'annotations' => $rw + array('idempotentHint' => true),
            'description' => 'Cambia los ajustes de costes. No modifica el coste de los trabajos ya registrados.',
            'inputSchema' => array('type' => 'object', 'properties' => array(
                'moneda' => array('type' => 'string', 'enum' => array('EUR', 'USD', 'MXN', 'ARS', 'COP', 'CLP', 'GBP', 'CHF')),
                'precio_kwh' => array('type' => 'number', 'minimum' => 0), 'mano_obra_por_hora' => array('type' => 'number', 'minimum' => 0),
                'margen_fallos_pct' => array('type' => 'number', 'minimum' => 0), 'desperdicio_plancha_pct' => array('type' => 'number', 'minimum' => 0),
                'margen_beneficio_pct' => array('type' => 'number', 'minimum' => 0), 'aviso_stock_bajo_g_o_ml' => array('type' => 'number', 'minimum' => 0),
                'maquina_predeterminada_id' => array('type' => 'string')))),
        array('name' => 'eliminar', 'title' => 'Eliminar', 'write' => true,
            'annotations' => array('readOnlyHint' => false, 'destructiveHint' => true, 'openWorldHint' => false),
            'description' => 'Elimina una ficha. Un trabajo con stock descontado devuelve su material al stock y sus ventas pasan a ventas libres. Se puede deshacer restaurando una versión anterior en Ajustes → Historial de versiones de la app.',
            'inputSchema' => array('type' => 'object', 'properties' => array(
                'seccion' => array('type' => 'string', 'enum' => $cols), 'id' => array('type' => 'string')), 'required' => array('seccion', 'id'))),
    );
}

function lm_tool($name)
{
    foreach (lm_tools() as $t) {
        if ($t['name'] === $name) {
            return $t;
        }
    }
    return null;
}

/**
 * Ejecuta una herramienta sobre la libreta. Devuelve array('data' => resultado, 'changed' => bool[, 'photos' => ids]).
 * $state se modifica en las herramientas de escritura. Lanza LmToolError con un mensaje para el agente.
 */
function lm_call_tool($name, $args, &$state, $today)
{
    $args = is_array($args) ? $args : array();
    $fn = 'lm_tool_' . $name;
    if (!lm_tool($name) || !function_exists($fn)) {
        throw new LmToolError("Herramienta desconocida: {$name}.");
    }
    return call_user_func_array($fn, array($args, &$state, $today));
}

function lm_ok($data, $changed = false)
{
    return array('data' => $data, 'changed' => $changed);
}

function lm_tool_ver_resumen($args, &$state, $today)
{
    list($from, $to) = lm_range($args, $today, 'este_mes');
    $r = lm_summary($state, $from, $to);
    $st = $state['settings'];
    $lines = array();
    $names = lm_kinds() + array('otros' => 'Ventas libres (sin trabajo)');
    foreach (lm_kind_stats($state, $from, $to) as $k => $v) {
        $lines[] = array('linea' => lm_get($names, $k, $k), 'trabajos' => $v['jobs'], 'unidades_fabricadas' => $v['units'],
            'ingresos' => lm_r2($v['revenue']), 'beneficio' => lm_r2($v['profit']));
    }
    $low = array();
    $value = 0;
    foreach ($state['filaments'] as $f) {
        $value += max(0, lm_num(lm_get($f, 'remaining'))) * lm_cost_per_gram($f);
        if (lm_num(lm_get($f, 'remaining')) <= lm_low_threshold($f, $st['lowStockGrams'])) {
            $low[] = lm_get($f, 'name') . ' (' . lm_fmt_amount(lm_get($f, 'remaining'), lm_unit_of($f)) . ')';
        }
    }
    foreach ($state['materials'] as $m) {
        $value += max(0, lm_num(lm_get($m, 'stock'))) * lm_num(lm_get($m, 'price'));
        if (lm_num(lm_get($m, 'stock')) <= lm_low_threshold($m, 0)) {
            $low[] = lm_material_label($m) . ' (' . lm_fmt_sheets(lm_get($m, 'stock')) . ')';
        }
    }
    foreach ($state['components'] as $c) {
        $value += max(0, lm_num(lm_get($c, 'stock'))) * lm_component_unit_cost($c);
        if (lm_num(lm_get($c, 'stock')) <= lm_low_threshold($c, 0)) {
            $low[] = lm_get($c, 'name') . ' (' . lm_fmt(lm_get($c, 'stock'), 2) . ' ' . lm_unit_label(lm_get($c, 'unit')) . ')';
        }
    }
    $sold = lm_sold_by_print($state['sales']);
    $units = 0;
    $cost = 0;
    foreach ($state['prints'] as $p) {
        $left = lm_num(lm_get($p, 'quantity')) - lm_num(lm_get($sold, lm_get($p, 'id'), 0));
        if ($left > 0) {
            $units += $left;
            $cost += $left * lm_num(lm_get((array) lm_get($p, 'cost', array()), 'unit'));
        }
    }
    return lm_ok(array(
        'periodo' => array('desde' => $from, 'hasta' => $to), 'moneda' => $st['currency'],
        'ventas' => array('numero' => $r['salesCount'], 'unidades' => $r['units'], 'ingresos' => lm_r2($r['revenue']),
            'comisiones_y_envio' => lm_r2($r['fees']), 'coste_de_lo_vendido' => lm_r2($r['cogs']), 'beneficio' => lm_r2($r['salesProfit']),
            'margen_pct' => round($r['marginPct'], 1)),
        'gastos_pagados' => array('filamento_y_resina' => lm_r2($r['filamentSpend']), 'otros' => lm_r2($r['otherSpend']), 'total' => lm_r2($r['totalSpend'])),
        'resultado_de_caja' => lm_r2($r['cashResult']),
        'por_linea_de_negocio' => $lines,
        'stock_bajo' => $low,
        'valor_del_inventario' => lm_r2($value),
        'piezas_fabricadas_sin_vender' => array('unidades' => $units, 'coste' => lm_r2($cost)),
        'nota' => 'Beneficio de ventas = ingresos − comisiones − coste de lo vendido. Resultado de caja = ingresos − comisiones − todos los gastos pagados del periodo.',
    ));
}

function lm_tool_ver_stock($args, &$state, $today)
{
    $tipo = lm_get($args, 'tipo', 'todo');
    $low = (bool) lm_get($args, 'solo_bajo', false);
    $q = lm_get($args, 'buscar');
    $out = array('moneda' => $state['settings']['currency']);
    if ($tipo === 'todo' || $tipo === 'filamentos') {
        $out['filamentos_y_resinas'] = array();
        foreach ($state['filaments'] as $f) {
            $o = lm_out_filament($f, $state['settings']);
            if ((!$low || $o['stock_bajo']) && lm_matches($q, array($o['nombre'], $o['material'], $o['marca'], $o['color'], $o['tipo']))) {
                $out['filamentos_y_resinas'][] = $o;
            }
        }
    }
    if ($tipo === 'todo' || $tipo === 'materiales') {
        $out['materiales_en_plancha'] = array();
        foreach ($state['materials'] as $m) {
            $o = lm_out_material($m);
            if ((!$low || $o['stock_bajo']) && lm_matches($q, array($o['nombre'], $o['categoria'], $o['proveedor']))) {
                $out['materiales_en_plancha'][] = $o;
            }
        }
    }
    if ($tipo === 'todo' || $tipo === 'componentes') {
        $out['componentes'] = array();
        foreach ($state['components'] as $c) {
            $o = lm_out_component($c);
            if ((!$low || $o['stock_bajo']) && lm_matches($q, array($o['nombre'], $o['categoria'], $o['proveedor']))) {
                $out['componentes'][] = $o;
            }
        }
    }
    return lm_ok($out);
}

function lm_sort_by_date_desc(&$list)
{
    usort($list, function ($a, $b) {
        return strcmp((string) lm_get($b, 'date', ''), (string) lm_get($a, 'date', ''));
    });
}

function lm_tool_buscar_trabajos($args, &$state, $today)
{
    list($from, $to) = lm_range($args, $today, 'todo');
    $sold = lm_sold_by_print($state['sales']);
    $list = $state['prints'];
    lm_sort_by_date_desc($list);
    $found = array();
    foreach ($list as $p) {
        $o = lm_out_print($p, $sold);
        if (lm_get($args, 'tipo') && $o['tipo'] !== $args['tipo']) {
            continue;
        }
        if (!lm_in_range($o['fecha'], $from, $to) || (lm_get($args, 'pendientes_de_vender') && $o['disponibles'] <= 0)) {
            continue;
        }
        if (!lm_matches(lm_get($args, 'buscar'), array($o['nombre'], $o['notas'], $o['maquina'], implode(' ', $o['materiales']), implode(' ', $o['componentes'])))) {
            continue;
        }
        $found[] = $o;
    }
    $limit = lm_limit($args, 20);
    return lm_ok(array('moneda' => $state['settings']['currency'], 'encontrados' => count($found), 'mostrados' => min($limit, count($found)),
        'trabajos' => array_slice($found, 0, $limit)));
}

function lm_tool_buscar_ventas($args, &$state, $today)
{
    list($from, $to) = lm_range($args, $today, 'todo');
    $list = $state['sales'];
    lm_sort_by_date_desc($list);
    $found = array();
    $tot = array('unidades' => 0, 'ingresos' => 0, 'comisiones_y_envio' => 0, 'coste' => 0, 'beneficio' => 0);
    foreach ($list as $s) {
        if (!lm_in_range(lm_get($s, 'date'), $from, $to)
            || !lm_matches(lm_get($args, 'buscar'), array(lm_get($s, 'description', ''), lm_get($s, 'customer', ''), lm_get($s, 'channel', '')))) {
            continue;
        }
        $o = lm_out_sale($s);
        $found[] = $o;
        $tot['unidades'] += $o['unidades'];
        $tot['ingresos'] += $o['ingreso'];
        $tot['comisiones_y_envio'] += $o['comisiones_y_envio'];
        $tot['coste'] += $o['coste'];
        $tot['beneficio'] += $o['beneficio'];
    }
    foreach ($tot as $k => $v) {
        $tot[$k] = lm_r2($v);
    }
    $limit = lm_limit($args, 30);
    return lm_ok(array('moneda' => $state['settings']['currency'], 'periodo' => array('desde' => $from, 'hasta' => $to),
        'encontradas' => count($found), 'totales' => $tot, 'mostradas' => min($limit, count($found)), 'ventas' => array_slice($found, 0, $limit)));
}

function lm_tool_buscar_gastos($args, &$state, $today)
{
    list($from, $to) = lm_range($args, $today, 'todo');
    $list = $state['expenses'];
    lm_sort_by_date_desc($list);
    $found = array();
    $byCat = array();
    $total = 0;
    foreach ($list as $e) {
        $o = lm_out_expense($e);
        if ((lm_get($args, 'categoria') && $o['categoria'] !== $args['categoria']) || !lm_in_range($o['fecha'], $from, $to)
            || !lm_matches(lm_get($args, 'buscar'), array($o['descripcion']))) {
            continue;
        }
        $found[] = $o;
        $byCat[$o['categoria_nombre']] = lm_get($byCat, $o['categoria_nombre'], 0) + $o['importe'];
        $total += $o['importe'];
    }
    arsort($byCat);
    foreach ($byCat as $k => $v) {
        $byCat[$k] = lm_r2($v);
    }
    $limit = lm_limit($args, 30);
    return lm_ok(array('moneda' => $state['settings']['currency'], 'periodo' => array('desde' => $from, 'hasta' => $to),
        'encontrados' => count($found), 'total' => lm_r2($total), 'por_categoria' => (object) $byCat,
        'mostrados' => min($limit, count($found)), 'gastos' => array_slice($found, 0, $limit)));
}

function lm_tool_ver_maquinas_y_ajustes($args, &$state, $today)
{
    $m = array();
    foreach ($state['printers'] as $p) {
        $m[] = lm_out_printer($p, $state);
    }
    return lm_ok(array('maquinas' => $m, 'ajustes' => lm_out_settings($state['settings']),
        'nota' => 'Coste por hora = amortización (precio ÷ vida útil) + mantenimiento + electricidad (consumo × precio del kWh).'));
}

function lm_tool_ver_ficha($args, &$state, $today)
{
    $col = lm_col(lm_get($args, 'seccion'));
    $i = lm_require_index($state, $col, lm_get($args, 'id'), 'registro en ' . $args['seccion']);
    $x = $state[$col][$i];
    $st = $state['settings'];
    switch ($col) {
        case 'filaments':
            $o = lm_out_filament($x, $st);
            break;
        case 'materials':
            $o = lm_out_material($x);
            break;
        case 'components':
            $o = lm_out_component($x);
            break;
        case 'printers':
            $o = lm_out_printer($x, $state);
            break;
        case 'sales':
            $o = lm_out_sale($x);
            break;
        case 'expenses':
            $o = lm_out_expense($x);
            break;
        case 'products':
            $o = lm_out_product($x, $state);
            break;
        default:
            $o = lm_out_print($x, lm_sold_by_print($state['sales']));
            $c = (array) lm_get($x, 'cost', array());
            if ($c) {
                $c += array('material' => 0, 'sheet' => 0, 'electricity' => 0, 'machine' => 0, 'components' => 0, 'labor' => 0, 'extras' => 0,
                    'failure' => 0, 'total' => 0, 'quantity' => 1, 'unit' => 0, 'margin' => 0, 'suggestedUnitPrice' => 0);
                $o['desglose_coste'] = lm_out_cost($c, $st);
            }
            $o['ventas'] = array();
            foreach ($state['sales'] as $s) {
                if (lm_get($s, 'printId') === $x['id']) {
                    $o['ventas'][] = lm_out_sale($s);
                }
            }
    }
    $o['moneda'] = $st['currency'];
    return lm_ok($o);
}

function lm_tool_ver_fotos($args, &$state, $today)
{
    $col = lm_col(lm_get($args, 'seccion'));
    $i = lm_require_index($state, $col, lm_get($args, 'id'), 'registro en ' . $args['seccion']);
    $x = $state[$col][$i];
    $ids = $col === 'prints' ? array_values(array_filter((array) lm_get($x, 'photos', array()))) : (lm_get($x, 'photo') ? array($x['photo']) : array());
    $r = lm_ok(array('nombre' => lm_get($x, 'name', ''), 'fotos' => count($ids)));
    $r['photos'] = array_slice($ids, 0, 6);
    $r['size'] = lm_get($args, 'tamano') === 'miniatura' ? 'thumb' : 'full';
    return $r;
}

function lm_tool_calcular_coste($args, &$state, $today)
{
    $warnings = array();
    $job = lm_build_job($args, $state, $warnings);
    $warnings = array_merge($warnings, lm_stock_warnings($job, $state));
    $printers = lm_by_id($state['printers']);
    return lm_ok(array('moneda' => $state['settings']['currency'], 'maquina' => $job['printerName'], 'tipo' => $job['kind'],
        'desglose' => lm_out_cost($job['cost'], $state['settings']), 'avisos' => $warnings,
        'nota' => $job['printerId'] && isset($printers[$job['printerId']]) ? null : 'Sin máquina: se han usado los valores de máquina de los ajustes.'));
}

function lm_tool_registrar_trabajo($args, &$state, $today)
{
    $name = lm_text(lm_get($args, 'nombre', ''));
    if ($name === '') {
        throw new LmToolError('Falta «nombre»: la pieza o el encargo.');
    }
    if (!$state['printers']) {
        throw new LmToolError('Primero añade una máquina (guardar_ficha con seccion maquinas).');
    }
    $warnings = array();
    $job = lm_build_job($args, $state, $warnings);
    $deduct = lm_get($args, 'descontar_stock', true) !== false;
    if ($deduct) {
        $warnings = array_merge($warnings, lm_stock_warnings($job, $state));
    }
    $url = lm_text(lm_get($args, 'enlace_archivo', ''), 500);
    if ($url !== '' && !preg_match('#^[a-z][a-z0-9+.-]*:#i', $url)) {
        $url = 'https://' . $url;
    }
    $rec = array('id' => lm_uid()) + $job + array('name' => $name, 'fileUrl' => $url, 'photos' => array(),
        'date' => lm_date(lm_get($args, 'fecha'), $today), 'notes' => lm_text(lm_get($args, 'notas', ''), 1000), 'stockDeducted' => $deduct);
    if ($deduct) {
        lm_apply_job_stock($state, $rec, -1);
    }
    $state['prints'][] = $rec;
    return lm_ok(array('mensaje' => $deduct ? 'Trabajo registrado y stock actualizado.' : 'Trabajo registrado (sin descontar stock).',
        'trabajo' => lm_out_print($rec, lm_sold_by_print($state['sales'])), 'desglose' => lm_out_cost($rec['cost'], $state['settings']),
        'avisos' => $warnings, 'moneda' => $state['settings']['currency']), true);
}

function lm_tool_registrar_venta($args, &$state, $today)
{
    $pid = lm_get($args, 'trabajo_id');
    $p = null;
    if ($pid) {
        $p = $state['prints'][lm_require_index($state, 'prints', $pid, 'trabajo')];
    }
    $desc = lm_text(lm_get($args, 'descripcion', ''));
    if ($desc === '') {
        if (!$p) {
            throw new LmToolError('Falta «descripcion» (o indica trabajo_id si la venta es de un trabajo registrado).');
        }
        $desc = $p['name'];
    }
    $qty = lm_number(lm_get($args, 'unidades', 1), 'unidades', 1);
    $costGiven = lm_get($args, 'coste_unidad') !== null;
    $unitCost = $costGiven ? lm_number($args['coste_unidad'], 'coste_unidad', 0) : ($p ? lm_num(lm_get((array) lm_get($p, 'cost', array()), 'unit')) : 0);
    $sale = array('id' => lm_uid(), 'printId' => $p ? $p['id'] : null, 'description' => $desc, 'date' => lm_date(lm_get($args, 'fecha'), $today),
        'quantity' => $qty, 'unitPrice' => lm_number(lm_get($args, 'precio_unidad'), 'precio_unidad', 0),
        'fees' => lm_number(lm_get($args, 'comisiones', 0), 'comisiones', 0), 'unitCost' => $unitCost,
        'customer' => lm_text(lm_get($args, 'cliente', '')), 'channel' => lm_text(lm_get($args, 'canal', '')), 'costFromPrint' => $p && !$costGiven);
    $warnings = array();
    if ($p) {
        $sold = lm_sold_by_print($state['sales']);
        $left = lm_num(lm_get($p, 'quantity')) - lm_num(lm_get($sold, $p['id'], 0));
        if ($qty > $left) {
            $warnings[] = 'Del trabajo «' . $p['name'] . '» solo quedaban ' . lm_fmt($left) . ' unidades sin vender.';
        }
    }
    $state['sales'][] = $sale;
    return lm_ok(array('mensaje' => 'Venta registrada.', 'venta' => lm_out_sale($sale), 'avisos' => $warnings, 'moneda' => $state['settings']['currency']), true);
}

function lm_tool_registrar_gasto($args, &$state, $today)
{
    $cats = lm_expense_categories();
    $cat = lm_get($args, 'categoria');
    if (!isset($cats[$cat])) {
        throw new LmToolError('«categoria» debe ser una de: ' . implode(', ', array_keys($cats)) . '.');
    }
    $desc = lm_text(lm_get($args, 'descripcion', ''));
    if ($desc === '') {
        throw new LmToolError('Falta «descripcion».');
    }
    $e = array('id' => lm_uid(), 'date' => lm_date(lm_get($args, 'fecha'), $today), 'category' => $cat, 'description' => $desc,
        'amount' => lm_number(lm_get($args, 'importe'), 'importe', 0));
    $state['expenses'][] = $e;
    return lm_ok(array('mensaje' => 'Gasto registrado.', 'gasto' => lm_out_expense($e), 'moneda' => $state['settings']['currency']), true);
}

function lm_tool_reponer_stock($args, &$state, $today)
{
    $sec = lm_get($args, 'seccion');
    if (!in_array($sec, array('filamentos', 'materiales', 'componentes'), true)) {
        throw new LmToolError('«seccion» debe ser filamentos, materiales o componentes.');
    }
    $col = lm_col($sec);
    $i = lm_require_index($state, $col, lm_get($args, 'id'), 'registro en ' . $sec);
    $x = &$state[$col][$i];
    $n = lm_number(lm_get($args, 'unidades_compradas'), 'unidades_compradas', 0);
    $amount = lm_get($args, 'importe') !== null ? lm_number($args['importe'], 'importe', 0) : round($n * lm_num(lm_get($x, 'price')), 2);
    $date = lm_date(lm_get($args, 'fecha'), $today);
    $expense = lm_get($args, 'registrar_gasto', true) !== false && $amount > 0;
    if ($col === 'filaments') {
        $u = lm_unit_of($x);
        $qty = lm_get($args, 'cantidad') !== null ? lm_number($args['cantidad'], 'cantidad', 0) : $n * lm_num(lm_get($x, 'spoolWeight'));
        $x['remaining'] = lm_num(lm_get($x, 'remaining')) + $qty;
        $text = lm_fmt_amount($qty, $u);
        $label = lm_filament_label($x);
        $ref = array('category' => 'filamento', 'filamentId' => $x['id']);
        $now = lm_fmt_amount($x['remaining'], $u);
    } elseif ($col === 'materials') {
        $qty = lm_get($args, 'cantidad') !== null ? lm_number($args['cantidad'], 'cantidad', 0) : $n;
        $x['stock'] = lm_num(lm_get($x, 'stock')) + $qty;
        $text = lm_fmt_sheets($qty);
        $label = lm_material_label($x);
        $ref = array('category' => 'materiales', 'materialId' => $x['id']);
        $now = lm_fmt_sheets($x['stock']);
    } else {
        $units = lm_num(lm_get($x, 'packUnits')) ? lm_num($x['packUnits']) : 1;
        $qty = lm_get($args, 'cantidad') !== null ? lm_number($args['cantidad'], 'cantidad', 0) : $n * $units;
        $x['stock'] = lm_num(lm_get($x, 'stock')) + $qty;
        $text = lm_fmt($qty, 2) . ' ' . lm_unit_label(lm_get($x, 'unit'));
        $label = $x['name'];
        $ref = array('category' => 'componentes', 'componentId' => $x['id']);
        $now = lm_fmt($x['stock'], 2) . ' ' . lm_unit_label(lm_get($x, 'unit'));
    }
    if (lm_get($args, 'actualizar_precio') && $n > 0) {
        $x['price'] = round($amount / $n, 2);
    }
    if ($expense) {
        $state['expenses'][] = array('id' => lm_uid(), 'date' => $date, 'category' => $ref['category'],
            'description' => 'Reposición ' . $text . ' · ' . $label, 'amount' => $amount) + $ref;
    }
    unset($x);
    return lm_ok(array('mensaje' => '+' . $text . ' de ' . $label . '.', 'stock_actual' => $now,
        'gasto_registrado' => $expense ? lm_r2($amount) : false, 'moneda' => $state['settings']['currency']), true);
}

/** Campos editables: nombre del agente → array(campo interno, tipo). */
function lm_field_map($col)
{
    $maps = array(
        'filaments' => array('nombre' => array('name', 'text'), 'tipo' => array('kind', 'enum:filamento,resina'), 'material' => array('material', 'text'),
            'marca' => array('brand', 'text'), 'color' => array('colorName', 'text'), 'color_hex' => array('color', 'hex'),
            'diametro_mm' => array('diameter', 'enum:1.75,2.85,3.00'), 'unidad' => array('unit', 'enum:g,ml'), 'contenido' => array('spoolWeight', 'pos'),
            'precio' => array('price', 'num'), 'stock' => array('remaining', 'any'), 'aviso_stock_bajo' => array('lowStock', 'opt')),
        'materials' => array('nombre' => array('name', 'text'), 'categoria' => array('category', 'text'), 'grosor_mm' => array('thickness', 'num'),
            'ancho_plancha_mm' => array('sheetWidth', 'pos'), 'alto_plancha_mm' => array('sheetHeight', 'pos'), 'precio' => array('price', 'num'),
            'stock' => array('stock', 'any'), 'aviso_stock_bajo' => array('lowStock', 'opt'), 'proveedor' => array('supplier', 'text')),
        'components' => array('nombre' => array('name', 'text'), 'categoria' => array('category', 'text'), 'unidad' => array('unit', 'text'),
            'precio' => array('price', 'num'), 'unidades_por_paquete' => array('packUnits', 'pos'), 'stock' => array('stock', 'any'),
            'aviso_stock_bajo' => array('lowStock', 'opt'), 'proveedor' => array('supplier', 'text')),
        'printers' => array('nombre' => array('name', 'text'), 'tipo' => array('type', 'enum:3d,resina,laser,insoladora,otra'), 'consumo_w' => array('watts', 'num'),
            'precio' => array('price', 'num'), 'vida_util_h' => array('lifeHours', 'pos'), 'mantenimiento_por_hora' => array('maintenancePerHour', 'num'),
            'notas' => array('notes', 'text')),
        'prints' => array('nombre' => array('name', 'text'), 'fecha' => array('date', 'date'), 'notas' => array('notes', 'long'), 'enlace_archivo' => array('fileUrl', 'url')),
        'sales' => array('descripcion' => array('description', 'text'), 'fecha' => array('date', 'date'), 'unidades' => array('quantity', 'pos'),
            'precio_unidad' => array('unitPrice', 'num'), 'comisiones' => array('fees', 'num'), 'coste_unidad' => array('unitCost', 'num'),
            'cliente' => array('customer', 'text'), 'canal' => array('channel', 'text')),
        'expenses' => array('fecha' => array('date', 'date'), 'categoria' => array('category', 'enum:' . implode(',', array_keys(lm_expense_categories()))),
            'descripcion' => array('description', 'text'), 'importe' => array('amount', 'num')),
    );
    return $maps[$col];
}

function lm_coerce($v, $type, $key, $today)
{
    if (strpos($type, 'enum:') === 0) {
        $opts = explode(',', substr($type, 5));
        $v = (string) $v;
        if (!in_array($v, $opts, true)) {
            throw new LmToolError("«{$key}» debe ser uno de: " . implode(', ', $opts) . '.');
        }
        return $v;
    }
    switch ($type) {
        case 'text':
            return lm_text($v);
        case 'long':
            return lm_text($v, 1000);
        case 'date':
            return lm_date($v, $today);
        case 'hex':
            if (!preg_match('/^#[0-9a-fA-F]{6}$/', (string) $v)) {
                throw new LmToolError("«{$key}» debe ser un color como #3987e5.");
            }
            return strtolower($v);
        case 'url':
            $u = lm_text($v, 500);
            return ($u !== '' && !preg_match('#^[a-z][a-z0-9+.-]*:#i', $u)) ? 'https://' . $u : $u;
        case 'pos':
            $n = lm_number($v, $key, 0);
            if ($n <= 0) {
                throw new LmToolError("«{$key}» debe ser mayor que 0.");
            }
            return $n;
        case 'num':
            return lm_number($v, $key, 0);
        case 'any':
            return lm_number($v, $key);
        case 'opt':
            return ($v === '' || $v === null) ? '' : lm_number($v, $key, 0);
    }
    return $v;
}

function lm_tool_guardar_ficha($args, &$state, $today)
{
    $sec = lm_get($args, 'seccion');
    $col = lm_col($sec);
    if ($col === 'products') {
        throw new LmToolError('Los escandallos se crean y se editan en la app (pestaña Escandallos). Desde aquí se pueden consultar, presupuestar y registrar encargos.');
    }
    $datos = lm_get($args, 'datos');
    if (!is_array($datos) || !$datos) {
        throw new LmToolError('Faltan los campos a guardar en «datos».');
    }
    $map = lm_field_map($col);
    $data = array();
    foreach ($datos as $k => $v) {
        if (!isset($map[$k])) {
            throw new LmToolError("Campo desconocido para {$sec}: «{$k}». Campos válidos: " . implode(', ', array_keys($map)) . '.');
        }
        $data[$map[$k][0]] = lm_coerce($v, $map[$k][1], $k, $today);
    }
    $id = lm_get($args, 'id');
    $st = $state['settings'];
    if ($id) {
        $i = lm_require_index($state, $col, $id, 'registro en ' . $sec);
        $old = $state[$col][$i];
        $state[$col][$i] = array_merge($old, $data);
        $rec = $state[$col][$i];
        if ($col === 'sales' && array_key_exists('unitCost', $data)) {
            $state[$col][$i]['costFromPrint'] = false;
        }
        if ($col === 'filaments' && isset($data['kind'])) {
            $state[$col][$i]['unit'] = $data['kind'] === 'resina' ? lm_get($data, 'unit', lm_get($old, 'unit') === 'g' ? 'g' : 'ml') : 'g';
            if ($data['kind'] === 'resina') {
                $state[$col][$i]['diameter'] = '';
            }
        }
        // los trabajos guardan el nombre de lo que usan: se actualiza como en la app
        foreach ($state['prints'] as $j => $p) {
            if ($col === 'printers' && lm_get($p, 'printerId') === $id) {
                $state['prints'][$j]['printerName'] = $rec['name'];
            }
            foreach (array('materials' => array('sheets', 'materialId', 'materialName'), 'components' => array('components', 'componentId', 'componentName')) as $c => $f) {
                if ($col !== $c) {
                    continue;
                }
                foreach ((array) lm_get($p, $f[0], array()) as $k => $it) {
                    if (lm_get($it, $f[1]) === $id) {
                        $state['prints'][$j][$f[0]][$k][$f[2]] = $c === 'materials' ? lm_material_label($rec) : $rec['name'];
                    }
                }
            }
        }
        $msg = 'Ficha actualizada.';
    } else {
        if (!in_array($col, array('filaments', 'materials', 'components', 'printers'), true)) {
            throw new LmToolError("En {$sec} no se crean fichas con guardar_ficha: usa registrar_trabajo, registrar_venta o registrar_gasto.");
        }
        if (lm_get($data, 'name', '') === '') {
            throw new LmToolError('Falta «nombre».');
        }
        if ($col === 'filaments') {
            $resin = lm_get($data, 'kind') === 'resina';
            $rec = array_merge(array('kind' => 'filamento', 'unit' => $resin ? 'ml' : 'g', 'material' => $resin ? 'Resina estándar' : 'PLA',
                'color' => '#999999', 'colorName' => '', 'brand' => '', 'diameter' => $resin ? '' : '1.75', 'price' => 0, 'remaining' => 0,
                'lowStock' => '', 'createdAt' => $today), $data);
            if ($rec['kind'] !== 'resina') {
                $rec['unit'] = 'g';
            }
            if (lm_num(lm_get($rec, 'spoolWeight')) <= 0) {
                throw new LmToolError('Falta «contenido»: gramos por bobina (filamento) o ml por envase (resina).');
            }
        } elseif ($col === 'materials') {
            $rec = array_merge(array('category' => '', 'thickness' => 0, 'price' => 0, 'stock' => 0, 'lowStock' => 1, 'supplier' => ''), $data);
            if (!lm_get($rec, 'sheetWidth') || !lm_get($rec, 'sheetHeight')) {
                throw new LmToolError('Faltan las medidas de la plancha: ancho_plancha_mm y alto_plancha_mm.');
            }
        } elseif ($col === 'components') {
            $rec = array_merge(array('category' => '', 'unit' => 'ud.', 'price' => 0, 'packUnits' => 1, 'stock' => 0, 'lowStock' => 2, 'supplier' => ''), $data);
        } else {
            $rec = array_merge(array('type' => '3d', 'notes' => '', 'watts' => $st['printerWatts'], 'price' => $st['printerPrice'],
                'lifeHours' => $st['printerLifeHours'], 'maintenancePerHour' => $st['maintenancePerHour']), $data);
        }
        $rec = array('id' => lm_uid()) + $rec;
        $state[$col][] = $rec;
        if ($col === 'printers' && !lm_get(lm_by_id($state['printers']), lm_get($st, 'defaultPrinterId'))) {
            $state['settings']['defaultPrinterId'] = $rec['id'];
        }
        $msg = 'Ficha creada.';
    }
    $args2 = array('seccion' => $sec, 'id' => $rec['id']);
    $view = lm_tool_ver_ficha($args2, $state, $today);
    return lm_ok(array('mensaje' => $msg, 'ficha' => $view['data']), true);
}

function lm_tool_cambiar_ajustes($args, &$state, $today)
{
    $map = array('moneda' => array('currency', 'enum:EUR,USD,MXN,ARS,COP,CLP,GBP,CHF'), 'precio_kwh' => array('kwhPrice', 'num'),
        'mano_obra_por_hora' => array('laborRate', 'num'), 'margen_fallos_pct' => array('failureRate', 'num'),
        'desperdicio_plancha_pct' => array('sheetWaste', 'num'), 'margen_beneficio_pct' => array('defaultMargin', 'num'),
        'aviso_stock_bajo_g_o_ml' => array('lowStockGrams', 'num'), 'maquina_predeterminada_id' => array('defaultPrinterId', 'text'));
    $changed = false;
    foreach ($args as $k => $v) {
        if (!isset($map[$k])) {
            throw new LmToolError("Ajuste desconocido: «{$k}».");
        }
        if ($k === 'maquina_predeterminada_id') {
            lm_require_index($state, 'printers', $v, 'máquina');
        }
        $state['settings'][$map[$k][0]] = lm_coerce($v, $map[$k][1], $k, $today);
        $changed = true;
    }
    if (!$changed) {
        throw new LmToolError('No has indicado ningún ajuste.');
    }
    return lm_ok(array('mensaje' => 'Ajustes guardados.', 'ajustes' => lm_out_settings($state['settings'])), true);
}

function lm_tool_eliminar($args, &$state, $today)
{
    $sec = lm_get($args, 'seccion');
    $col = lm_col($sec);
    $id = lm_get($args, 'id');
    $i = lm_require_index($state, $col, $id, 'registro en ' . $sec);
    $x = $state[$col][$i];
    $notes = array();
    if ($col === 'prints') {
        if (lm_get($x, 'stockDeducted')) {
            lm_apply_job_stock($state, $x, +1);
            $notes[] = 'El material y los componentes usados se han devuelto al stock.';
        }
        $n = 0;
        foreach ($state['sales'] as $k => $s) {
            if (lm_get($s, 'printId') === $id) {
                $state['sales'][$k]['printId'] = null;
                $state['sales'][$k]['costFromPrint'] = false;
                $n++;
            }
        }
        if ($n) {
            $notes[] = "Sus {$n} venta(s) se conservan como ventas libres.";
        }
    }
    array_splice($state[$col], $i, 1);
    if ($col === 'printers' && lm_get($state['settings'], 'defaultPrinterId') === $id) {
        $state['settings']['defaultPrinterId'] = $state['printers'] ? $state['printers'][0]['id'] : '';
    }
    if (in_array($col, array('filaments', 'materials', 'components', 'printers'), true)) {
        $notes[] = 'Los trabajos y gastos que lo usaban conservan sus datos y su coste.';
    }
    return lm_ok(array('mensaje' => 'Eliminado: ' . lm_get($x, 'name', lm_get($x, 'description', $id)) . '.', 'notas' => $notes,
        'deshacer' => 'Se puede recuperar restaurando la versión anterior en la app (Ajustes → Historial de versiones).'), true);
}

function lm_tool_ver_escandallos($args, &$state, $today)
{
    $out = array();
    foreach ($state['products'] as $pd) {
        if (lm_matches(lm_get($args, 'buscar'), array(lm_get($pd, 'name', '')))) {
            $out[] = lm_out_product($pd, $state);
        }
    }
    return lm_ok(array('moneda' => $state['settings']['currency'], 'escandallos' => $out));
}

function lm_order($args, $state)
{
    $pd = $state['products'][lm_require_index($state, 'products', lm_get($args, 'escandallo_id'), 'escandallo')];
    $n = (int) lm_number(lm_get($args, 'conjuntos'), 'conjuntos', 1);
    return array($pd, $n, lm_product_cost($pd, $n, $state));
}

function lm_tool_presupuestar_encargo($args, &$state, $today)
{
    list($pd, $n, $j) = lm_order($args, $state);
    $c = $j['cost'];
    $price = lm_get($args, 'precio_por_conjunto') !== null ? lm_number($args['precio_por_conjunto'], 'precio_por_conjunto', 0) : round($c['suggestedUnitPrice'], 2);
    return lm_ok(array(
        'moneda' => $state['settings']['currency'], 'escandallo' => $pd['name'], 'conjuntos' => $n, 'maquina' => $j['printerName'],
        'tiempo_de_maquina_horas' => round($j['hours'], 2), 'coste_por_conjunto' => lm_r2($c['unit']), 'coste_total' => lm_r2($c['total']),
        'precio_sugerido_por_conjunto' => lm_r2($c['suggestedUnitPrice']), 'precio_por_conjunto' => lm_r2($price),
        'total_del_encargo' => lm_r2($price * $n), 'beneficio' => lm_r2($price * $n - $c['total']),
        'margen_sobre_precio_pct' => $price > 0 ? round(($price - $c['unit']) / $price * 100, 1) : null,
        'desglose' => lm_out_cost($c, $state['settings']), 'avisos' => lm_stock_warnings($j, $state),
    ));
}

function lm_tool_registrar_encargo($args, &$state, $today)
{
    if (!$state['printers']) {
        throw new LmToolError('Primero añade una máquina (guardar_ficha con seccion maquinas).');
    }
    list($pd, $n, $j) = lm_order($args, $state);
    $deduct = lm_get($args, 'descontar_stock', true) !== false;
    $warnings = $deduct ? lm_stock_warnings($j, $state) : array();
    $date = lm_date(lm_get($args, 'fecha'), $today);
    $name = lm_text(lm_get($args, 'nombre', ''));
    $rec = array('id' => lm_uid()) + $j + array('name' => $name !== '' ? $name : ($n > 1 ? $pd['name'] . ' ×' . $n : $pd['name']), 'fileUrl' => '',
        'photos' => lm_get($pd, 'photo') ? array($pd['photo']) : array(), 'date' => $date, 'notes' => '', 'stockDeducted' => $deduct);
    if ($deduct) {
        lm_apply_job_stock($state, $rec, -1);
    }
    $state['prints'][] = $rec;
    $out = array('mensaje' => $deduct ? 'Encargo registrado y stock actualizado.' : 'Encargo registrado (sin descontar stock).',
        'trabajo' => lm_out_print($rec, lm_sold_by_print($state['sales'])), 'desglose' => lm_out_cost($rec['cost'], $state['settings']));
    $sale = lm_get($args, 'venta');
    if (is_array($sale)) {
        $price = lm_get($sale, 'precio_por_conjunto') !== null ? lm_number($sale['precio_por_conjunto'], 'precio_por_conjunto', 0) : round($rec['cost']['suggestedUnitPrice'], 2);
        $s = array('id' => lm_uid(), 'date' => $date, 'printId' => $rec['id'], 'description' => $pd['name'], 'quantity' => $n, 'unitPrice' => $price,
            'fees' => lm_number(lm_get($sale, 'comisiones', 0), 'comisiones', 0), 'unitCost' => $rec['cost']['unit'],
            'customer' => lm_text(lm_get($sale, 'cliente', '')), 'channel' => lm_text(lm_get($sale, 'canal', '')), 'costFromPrint' => true);
        $state['sales'][] = $s;
        $out['mensaje'] .= ' Venta registrada.';
        $out['venta'] = lm_out_sale($s);
    }
    $out['avisos'] = $warnings;
    $out['moneda'] = $state['settings']['currency'];
    return lm_ok($out, true);
}
