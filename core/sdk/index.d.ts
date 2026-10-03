// Tipos de @apolo/sdk (API de plugins de APOLO). Versión 1.x: estable; cambios incompatibles suben la mayor.

export declare const VERSION: string;
export declare const RIESGOS: readonly Riesgo[];
export declare const PERMISOS: readonly string[];

/** lectura = se ejecuta sola · escritura / ejecucion = pasa por los permisos del usuario. El que cuenta es el DECLARADO en el manifest. */
export type Riesgo = 'lectura' | 'escritura' | 'ejecucion';

/** Permisos de apolo-plugin.json. Lo no declarado se pregunta SIEMPRE al usuario (y puede negarse). */
export type Permiso = `red:${string}` | 'red' | `archivos:${string}` | 'shell' | 'pantalla' | 'memoria' | 'tareas' | 'conversaciones' | 'notificaciones';

export interface Manifest {
  nombre: string;                 // minúsculas, números y guiones
  version: string;                // semver
  descripcion?: string;
  autor?: string;
  licencia?: string;
  entrada?: string;               // por defecto index.js (CommonJS)
  apoloSdk: string;               // rango semver del SDK, ej. "^1.0.0"
  permisos?: Permiso[];
  aporta?: {
    herramientas?: Array<string | { nombre: string; riesgo?: Riesgo; descripcion?: string }>;
    canales?: Array<string | { nombre: string; descripcion?: string }>;
    proveedores?: Array<string | { nombre: string }>;
    comandos?: Array<string | { nombre: string; descripcion?: string }>;
    vistas?: Array<{ nombre: string; archivo: string }>;   // JS/HTML para el panel (de momento solo declaradas)
    gestos?: Array<string | { nombre: string }>;
    voces?: Array<string | { nombre: string }>;
  };
}

/** JSON Schema de los parámetros de una herramienta. */
export type Esquema = { type: 'object'; properties: Record<string, any>; required?: string[] };

export interface ContextoLlamada {
  sesion?: { id?: string; canal?: string; modelo?: string };
  cwd?: string;
  canal?: string;
  /** se aborta si el usuario cancela el turno o vence el timeout */
  signal: AbortSignal;
}

export type Resultado = string | { texto: string } | unknown;

export interface Herramienta {
  nombre: string;                 // debe estar en aporta.herramientas
  descripcion: string;
  parametros?: Esquema;
  /** solo puede ENDURECER el riesgo declarado en el manifest */
  riesgo?: Riesgo;
  ejecutar(args: Record<string, any>, ctx: ContextoLlamada): Resultado | Promise<Resultado>;
}

export interface Comando {
  nombre: string;                 // /nombre en la CLI y el chat; debe estar en aporta.comandos
  descripcion?: string;
  ejecutar(texto: string, ctx: ContextoLlamada): Resultado | Promise<Resultado>;
}

/** Formato interno de mensajes del núcleo (común a todos los proveedores). */
export interface Mensaje {
  role: 'user' | 'assistant' | 'tool';
  content: string | null;
  toolCalls?: Array<{ id: string; name: string; args: Record<string, any> }>;
  toolCallId?: string;
  name?: string;
}
export interface PeticionChat {
  model: string;
  system?: string;
  mensajes: Mensaje[];
  herramientas: Array<{ nombre: string; descripcion: string; parametros: Esquema }>;
  signal: AbortSignal;
  [extra: string]: any;
}
export interface RespuestaChat {
  texto: string;
  toolCalls?: Array<{ id: string; name: string; args: Record<string, any> }>;
  uso?: { entrada: number; salida: number };
}
export interface Proveedor {
  nombre: string;                 // se usa como "nombre/modelo"; debe estar en aporta.proveedores
  modelos?: string[];
  chat(p: PeticionChat): Promise<RespuestaChat>;
}

export interface Canal {
  id: string;                     // debe estar en aporta.canales
  nombre?: string;
  descripcion?: string;
  /** el núcleo te pide enviar algo por tu canal (avisos proactivos) */
  enviar?(texto: string, o: { a?: any }): void | Promise<void>;
  /** permiso pendiente (solo si aporta.canales[].permisos = true). Devuelve false si no lo mostraste. */
  permiso?(p: PermisoCanal): boolean | void | Promise<boolean | void>;
  /** ese permiso se resolvió (aquí o por otra vía: isla, Stream Deck, tiempo agotado) */
  permisoResuelto?(id: string, decision: 'allow' | 'always' | 'deny' | 'expired' | string, via: string): void | Promise<void>;
  /** tarjeta del cerebro (correo/mensaje importante); requiere el permiso "conversaciones" */
  tarjeta?(t: TarjetaCanal): boolean | void | Promise<boolean | void>;
  /** acciones de configuración que la app llama desde el panel (estado, conectar…) */
  acciones?: Record<string, (datos: any) => any>;
}
export interface PermisoCanal { id: string; tool: string; detail: string; peligro: string; session: string }
export interface TarjetaCanal { id: string; kind: string; author: string; guild: string; resumen: string; respuesta: string; prioridad: string; canSend: boolean }
export interface CanalRegistrado {
  /** un mensaje entrante del usuario: el agente responde y te devuelve el texto final */
  recibir(texto: string, o?: { de?: string }): Promise<string>;
  estado(estado: 'activo' | 'inactivo' | 'error' | string, detalle?: string): Promise<boolean>;
  /** resolver un permiso que se mostró en ESTE canal (cualquier otro se rechaza) */
  decidir(permiso: string, decision: 'allow' | 'always' | 'deny'): Promise<boolean>;
  /** acción sobre una tarjeta mostrada en este canal: enviar | descartar | ruido | urgente | normal */
  tarjeta(tarjeta: string, accion: string, texto?: string): Promise<string>;
  /** Mensaje de otra persona → solo a la app (permiso "conversaciones"); la app decide si responder. */
  ajeno(datos: Record<string, unknown>): Promise<boolean>;
  /** audio guardado dentro de apolo.almacen.ruta → texto (Whisper de la app) */
  transcribir(ruta: string): Promise<{ texto: string; error: string }>;
}

export type EventoBus = 'plugins' | 'skills' | 'tarea' | 'turno' | 'aviso' | `plugin:${string}:${string}`;

export interface Apolo {
  readonly nombre: string;
  readonly version: string;       // versión del plugin
  readonly sdk: string;           // versión del SDK en ejecución
  /** SOLO tu sección: cfg.plugins[nombre] (congelada) */
  readonly config: Readonly<Record<string, any>>;
  log(...a: any[]): void;

  registrarHerramienta(h: Herramienta): Promise<boolean>;
  registrarComando(c: Comando): Promise<boolean>;
  registrarProveedor(p: Proveedor): Promise<boolean>;
  registrarCanal(c: Canal): CanalRegistrado;

  /** eventos filtrados: 'turno' y 'aviso' requieren el permiso "conversaciones" */
  bus: {
    on(tipo: EventoBus, fn: (datos: any) => void): Promise<boolean>;
    off(tipo: EventoBus, fn: (datos: any) => void): void;
    /** llega a los demás como plugin:<tu-nombre>:<tipo> */
    emitir(tipo: string, datos?: any): Promise<boolean>;
  };
  /** solo nombres declarados en "secretos" del manifest (ej. "tg:token"); fuera de "<tu-nombre>:" el usuario lo aprueba una vez */
  secretos: {
    leer(nombre: string): Promise<string>;
    guardar(nombre: string, valor: string): Promise<boolean>;
  };
  /** requiere "memoria" (si no, se pregunta cada vez) */
  memoria: {
    buscar(consulta: string, o?: { limite?: number }): Promise<Array<{ id: string; tipo: string; texto: string }>>;
    recordar(texto: string, o?: { tipo?: 'perfil' | 'preferencia' | 'proyecto' | 'persona' | 'hecho' }): Promise<{ id: string; accion: string }>;
  };
  /** requiere "tareas". cuando: { en: 'YYYY-MM-DDTHH:mm' } | { cron: '0 8 * * *' } | { cadaMin: 30 } */
  tareas: {
    programar(t: { nombre: string; cuando: { en?: string; cron?: string; cadaMin?: number }; aviso?: string; ejecutar?: () => Resultado | Promise<Resultado> }): Promise<{ id: string; proxima: number; existia?: boolean }>;
    ver(): Promise<Array<{ id: string; nombre: string; cuando: any; proxima: number | null; activa: boolean }>>;
    borrar(id: string): Promise<boolean>;
  };
  permisos: {
    readonly declarados: readonly string[];
    /** true si está declarado; si no, pregunta al usuario (cada vez) */
    pedir(permiso: Permiso | string, motivo?: string): Promise<boolean>;
  };
  /** archivos fuera de tu carpeta: pasan por el núcleo; si no están declarados se preguntan */
  archivos: {
    leer(ruta: string): Promise<string>;
    escribir(ruta: string, contenido: string): Promise<boolean>;
  };
  /** comando de sistema ejecutado por el núcleo ("shell" no declarado = se pregunta cada vez) */
  shell(comando: string, o?: { timeoutSeg?: number }): Promise<{ salida: string; codigo: number }>;
  /** tu carpeta de datos: <dir>/plugins-datos/<nombre> */
  almacen: {
    readonly ruta: string;
    leer<T = any>(clave: string, porDefecto?: T): T;
    guardar(clave: string, valor: any): boolean;
    borrar(clave: string): boolean;
  };
}

export interface DefinicionPlugin {
  activar(apolo: Apolo): void | Promise<void>;
  desactivar?(): void | Promise<void>;
}

export declare function definirPlugin<T extends DefinicionPlugin>(def: T): T;
