# Genera las voces de la presentación (app/voz-show/*.mp3) con voces neurales de Microsoft (edge-tts).
# Uso: python tools/voces-presentacion.py [voz]   p. ej. es-CU-ManuelNeural
import asyncio, os, sys, edge_tts

VOZ = sys.argv[1] if len(sys.argv) > 1 else 'es-ES-AlvaroNeural'
NOMBRE = 'APOLO'
FRASES = {
    'hola': f'¡Hola! Soy {NOMBRE}. Vivo en tu escritorio y vigilo a tus agentes de inteligencia artificial.',
    'mira': 'Mira todo lo que hago a la vez: tres terminales y dos subagentes.',
    'peligro': '¡Ojo! Quieren borrar una carpeta entera. Eso no pasa.',
    'permiso': 'Necesito tu permiso para correr los tests.',
    'siempre': 'Perfecto, ya no te vuelvo a preguntar.',
    'cliente': 'Te escribe un cliente. Ya te dejé la respuesta preparada.',
    'web': 'Ahora navego por la web yo solito.',
    'listo1': '¡Terminé el ranking!',
    'error': 'Uy, algo falló en el mapa.',
    'todo': 'Todo listo. Si te vas, te aviso por Discord.',
    'mareo': '¡Para, para! ¡Todo me da vueltas!',
    'final': 'Sígueme para ver más.',
}
DIR = os.path.join(os.path.dirname(__file__), '..', 'app', 'voz-show')

async def main():
    os.makedirs(DIR, exist_ok=True)
    for k, t in FRASES.items():
        await edge_tts.Communicate(t, VOZ, rate='+8%', pitch='+12Hz').save(os.path.join(DIR, k + '.mp3'))
        print('ok', k)

asyncio.run(main())
