const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { crearActividad } = require('../actividad-reciente');

test('actividad reciente: resúmenes de todos los agentes + sesiones sin resumir, sin la propia ni tareas', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'act-')), ses = path.join(dir, 'sesiones'); fs.mkdirSync(ses);
  const ahora = Date.now(), g = (s) => fs.writeFileSync(path.join(ses, `${s.id}.json`), JSON.stringify(s));
  g({ id: 'cc-aaa', canal: 'claude-code', externo: 'claude-code', titulo: 'ya resumida', actualizada: ahora - 1000 });
  g({ id: 'cc-bbb', canal: 'claude-code', externo: 'claude-code', titulo: 'Arreglando el FOV', cwd: 'C:/x/FOV-Studio', actualizada: ahora - 2000 });
  g({ id: 'yo', canal: 'web', titulo: 'esta misma charla', actualizada: ahora });
  g({ id: 't1', canal: 'isla', tarea: true, titulo: 'tarea programada', actualizada: ahora });
  g({ id: 'vieja', canal: 'isla', titulo: 'de hace un mes', actualizada: ahora - 30 * 86400_000 });
  const aprenderCC = { resumenes: () => [
    { t: ahora - 1000, sesion: 'aaa', proyecto: 'C:/p/apolo', resumen: 'Montó el vídeo musical' },
    { t: ahora - 86400_000, sesion: 'x.dsh', agente: 'DeepSeek Harness', proyecto: '', resumen: 'Firmware DMA' }] };
  const a = crearActividad({ cfg: {}, sesionesDir: ses, aprenderCC });
  const t = a.texto({ excluir: 'yo' });
  assert.match(t, /Claude Code · apolo\] Montó el vídeo musical/);
  assert.match(t, /DeepSeek Harness\] Firmware DMA/);
  assert.match(t, /Arreglando el FOV/);
  assert.doesNotMatch(t, /ya resumida|esta misma charla|tarea programada|hace un mes/);
  assert.ok(t.indexOf('Montó') < t.indexOf('Firmware'), 'lo más reciente primero');
  assert.strictEqual(crearActividad({ cfg: { actividadReciente: { activo: false } }, sesionesDir: ses, aprenderCC }).texto(), '');
  fs.rmSync(dir, { recursive: true, force: true });
});
