// Expone el robot 3D a los scripts normales del panel.
import { createRobot } from './robot3d.js';
window.Robot3D = { crear: (canvas, animacion, log) => createRobot(canvas, 'casco.glb', { animacion, log }) };
window.dispatchEvent(new Event('robot3d-listo'));
