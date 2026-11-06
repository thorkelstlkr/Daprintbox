<?php
/*
 * Ayuda para los tests de Node: ejecuta los cálculos o las herramientas MCP en PHP (sin base de datos).
 * Entrada (stdin, JSON): {mode: 'calc', cases: [...]} o {mode: 'tools', state, today, calls: [{name, args}]}.
 */
require __DIR__ . '/../../api/calc.php';
require __DIR__ . '/../../api/mcp_tools.php';

$in = json_decode(stream_get_contents(STDIN), true);
mt_srand(42);
if ($in['mode'] === 'calc') {
    $out = array();
    foreach ($in['cases'] as $c) {
        $st = $c['state'];
        $printer = null;
        foreach ($st['printers'] as $p) {
            if ($p['id'] === $c['job']['printerId']) {
                $printer = $p;
            }
        }
        $out[] = array(
            'cost' => lm_print_cost($c['job'], lm_by_id($st['filaments']), $st['settings'], $printer, lm_by_id($st['components']), lm_by_id($st['materials'])),
            'sheets' => (object) lm_sheets_used($c['job']['sheets'], $c['job']['quantity'], $st['settings']['sheetWaste'], lm_by_id($st['materials'])),
            'summary' => lm_summary($st, $c['from'], $c['to']),
            'kinds' => (object) lm_kind_stats($st, $c['from'], $c['to']),
            'hourCost' => $printer ? lm_printer_hour_cost($st['settings'], $printer) : null,
        );
    }
    echo json_encode($out);
    exit;
}
$state = lm_normalize($in['state']);
$results = array();
foreach ($in['calls'] as $call) {
    $copy = $state;
    try {
        $r = lm_call_tool($call['name'], isset($call['args']) ? $call['args'] : array(), $copy, $in['today']);
        $state = $copy;
        $results[] = array('ok' => true, 'changed' => $r['changed'], 'data' => $r['data'], 'photos' => isset($r['photos']) ? $r['photos'] : null);
    } catch (LmToolError $e) {
        $results[] = array('ok' => false, 'error' => $e->getMessage());
    }
}
echo json_encode(array('results' => $results, 'state' => $state, 'tools' => lm_tools()), JSON_UNESCAPED_UNICODE);
