// Decide el destino antes de ejecutar: nunca cambia una selección por otra pestaña.
const { admiteArchivo } = require('../core/aranas-archivos');
const TIPOS = ['lectora','ia','codigo','discord','radar'];
function destinoArana(tipo, contexto, nucleo) {
  if (!TIPOS.includes(tipo)) throw new Error('Tipo de araña desconocido');
  if (!nucleo?.aranas) throw new Error('El núcleo de arañas todavía no está disponible');
  if (tipo === 'discord') {
    if (!/^[\w.-]+@[\w.-]+$/.test(nucleo.cfg?.aranas?.discord?.ssh || '')) throw new Error('Configura primero la conexión de la araña de Discord');
    return {tipo};
  }
  if (tipo === 'radar') return {tipo};
  if (contexto.objetivo?.length) {
    if (!contexto.archivo) throw new Error('Selecciona un único archivo de texto o código para esta araña');
    if (!admiteArchivo(contexto.archivo,tipo)) throw new Error('Formato no compatible con esta araña. Elige texto o código; para HTML, abre la página en el navegador');
    return {tipo,archivo:contexto.archivo};
  }
  if (contexto.navegador && nucleo.navegador?.conectado?.()) return {tipo,tituloObjetivo:contexto.titulo || ''};
  if (/^\d+$/.test(String(contexto.hwnd || ''))) return {tipo,ventana:true};
  throw new Error('No se identificó la ventana del atajo; vuelve a abrir el menú sobre el contenido');
}
function disponibilidadAranas(contexto,nucleo) {
  return Object.fromEntries(TIPOS.map(tipo=>{
    try { destinoArana(tipo,contexto,nucleo);return [tipo,{disponible:true}]; }
    catch(e){return [tipo,{disponible:false,razon:e.message}];}
  }));
}
module.exports={destinoArana,disponibilidadAranas};
