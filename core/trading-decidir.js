// El cerebro de APOLO decide por el piloto real de DMN Trader: vetar una entrada o salir de una posición.
// POST /v1/trading/decidir {tipo:'entrada'|'posicion', simbolo, propuesta, datos} → {decision|accion, confianza, motivo, modelo}
// Usa el modelo del cerebro, la personalidad y lo que APOLO recuerda de trading; cada decisión queda en el registro.
const ESQUEMAS = {
  entrada: { type: 'object', properties: { decision: { type: 'string', enum: ['entrar', 'vetar'] }, confianza: { type: 'number' }, motivo: { type: 'string' } }, required: ['decision', 'confianza', 'motivo'] },
  posicion: { type: 'object', properties: { accion: { type: 'string', enum: ['mantener', 'salir'] }, confianza: { type: 'number' }, motivo: { type: 'string' } }, required: ['accion', 'confianza', 'motivo'] },
};
const REGLAS = 'Decides tú las operaciones con dinero real del piloto de memecoins de Solana (DMN Trader). Sé frío y escéptico: costes reales ≈ 6 % ida y vuelta, '
  + 'solo merece la pena si el movimiento esperado lo supera con claridad. Peligros: ventas > compras sostenidas, smart money vendiendo, mechas largas arriba, '
  + 'volumen cayendo tras un pump, holders concentrados. Ante la duda con dinero real, no entres. "motivo": una frase en español.';
const texto = (x, max) => String(x ?? '').slice(0, max);

function crearDecidir({ generarJSON, memoria, personalidad, modelo, registro }) {
  return async function decidir(b = {}) {
    const tipo = b.tipo === 'posicion' ? 'posicion' : b.tipo === 'entrada' ? 'entrada' : null;
    if (!tipo) throw Object.assign(new Error('tipo: entrada o posicion'), { status: 400 });
    const simbolo = texto(b.simbolo, 40), propuesta = texto(b.propuesta, 2000), datos = typeof b.datos === 'string' ? texto(b.datos, 12000) : texto(JSON.stringify(b.datos ?? {}), 12000);
    let recuerdos = [];
    try { recuerdos = (await (memoria.buscarH || memoria.buscar)(`trading memecoin ${simbolo} piloto real operación`, { limite: 6 })) || []; } catch { }
    let pers = ''; try { pers = personalidad?.prompt?.() || ''; } catch { }
    const system = `${pers}\n\n${REGLAS}${recuerdos.length ? '\n\nLo que recuerdas de trading:\n' + recuerdos.map(m => '- ' + texto(m.texto, 300)).join('\n') : ''}`;
    const m = modelo();
    const { datos: r } = await generarJSON({ modelo: m, system, schema: ESQUEMAS[tipo], signal: AbortSignal.timeout(120_000),
      prompt: `${tipo === 'entrada' ? 'Propuesta de ENTRADA' : 'Posición ABIERTA'} en ${simbolo}:\n${propuesta}\nDatos de mercado: ${datos}` });
    const out = { ...r, confianza: Math.max(0, Math.min(1, Number(r.confianza) || 0)), motivo: texto(r.motivo, 200), modelo: m };
    try { registro?.add('info', `APOLO trading · ${simbolo}`, `${tipo === 'entrada' ? out.decision : out.accion} (${Math.round(out.confianza * 100)} %): ${out.motivo}`); } catch { }
    return out;
  };
}

module.exports = { crearDecidir, ESQUEMAS };
