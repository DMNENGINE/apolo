// Caja de texto multilínea: cursor, palabras, historial y pegado.
'use strict';

class Editor {
  constructor(historial = []) {
    this.texto = ''; this.pos = 0;
    this.historial = historial; this.hIdx = historial.length; this.borrador = '';
  }
  poner(t, pos = t.length) { this.texto = t; this.pos = Math.max(0, Math.min(pos, t.length)); }
  vaciar() { this.poner(''); this.hIdx = this.historial.length; }
  insertar(s) { this.texto = this.texto.slice(0, this.pos) + s + this.texto.slice(this.pos); this.pos += s.length; }
  borrarAtras() {
    if (!this.pos) return;
    const n = this.texto.codePointAt(this.pos - 2) > 0xffff ? 2 : 1;   // pares sustitutos (emojis)
    this.texto = this.texto.slice(0, this.pos - n) + this.texto.slice(this.pos); this.pos -= n;
  }
  borrarDelante() { if (this.pos < this.texto.length) { const n = this.texto.codePointAt(this.pos) > 0xffff ? 2 : 1; this.texto = this.texto.slice(0, this.pos) + this.texto.slice(this.pos + n); } }
  izquierda() { if (this.pos) this.pos -= this.texto.codePointAt(this.pos - 2) > 0xffff ? 2 : 1; }
  derecha() { if (this.pos < this.texto.length) this.pos += this.texto.codePointAt(this.pos) > 0xffff ? 2 : 1; }
  inicioLinea() { this.pos = this.texto.lastIndexOf('\n', this.pos - 1) + 1; }
  finLinea() { const k = this.texto.indexOf('\n', this.pos); this.pos = k < 0 ? this.texto.length : k; }
  palabraAtras() { let p = this.pos; while (p && /\s/.test(this.texto[p - 1])) p--; while (p && !/\s/.test(this.texto[p - 1])) p--; return p; }
  palabraDelante() { let p = this.pos; const t = this.texto; while (p < t.length && /\s/.test(t[p])) p++; while (p < t.length && !/\s/.test(t[p])) p++; return p; }
  borrarPalabra() { const p = this.palabraAtras(); this.texto = this.texto.slice(0, p) + this.texto.slice(this.pos); this.pos = p; }
  borrarHastaInicio() { const i = this.texto.lastIndexOf('\n', this.pos - 1) + 1; this.texto = this.texto.slice(0, i) + this.texto.slice(this.pos); this.pos = i; }
  borrarHastaFin() { const k = this.texto.indexOf('\n', this.pos); const f = k < 0 ? this.texto.length : k === this.pos ? k + 1 : k; this.texto = this.texto.slice(0, this.pos) + this.texto.slice(f); }
  // fila/columna del cursor dentro del texto (en caracteres)
  filaCol() { const antes = this.texto.slice(0, this.pos).split('\n'); return { fila: antes.length - 1, col: antes[antes.length - 1].length }; }
  numLineas() { return this.texto.split('\n').length; }
  // ↑/↓: se mueve entre líneas; en la primera/última línea navega el historial
  arriba() {
    const { fila, col } = this.filaCol();
    if (fila > 0) { const ls = this.texto.split('\n'); let p = 0; for (let i = 0; i < fila - 1; i++) p += ls[i].length + 1; this.pos = p + Math.min(col, ls[fila - 1].length); return true; }
    if (!this.historial.length || this.hIdx === 0) return false;
    if (this.hIdx === this.historial.length) this.borrador = this.texto;
    this.hIdx--; this.poner(this.historial[this.hIdx]); return true;
  }
  abajo() {
    const { fila, col } = this.filaCol(); const ls = this.texto.split('\n');
    if (fila < ls.length - 1) { let p = 0; for (let i = 0; i <= fila; i++) p += ls[i].length + 1; this.pos = p + Math.min(col, ls[fila + 1].length); return true; }
    if (this.hIdx >= this.historial.length) return false;
    this.hIdx++; this.poner(this.hIdx === this.historial.length ? this.borrador : this.historial[this.hIdx]); return true;
  }
  guardarEnHistorial(t) {
    if (t.trim() && this.historial[this.historial.length - 1] !== t) this.historial.push(t);
    if (this.historial.length > 500) this.historial.splice(0, this.historial.length - 500);
    this.hIdx = this.historial.length; this.borrador = '';
  }
  // palabra que se está escribiendo (para autocompletar @archivos)
  palabraActual() { const ini = this.palabraAtras(); return { ini, texto: this.texto.slice(ini, this.pos) }; }
}

module.exports = { Editor };
