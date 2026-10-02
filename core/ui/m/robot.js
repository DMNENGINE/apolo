// Robot 3D para la app móvil (el mismo casco que el panel). Expone window.RobotM.crear(canvas) → robot.
import { createRobot } from '../robot3d.js';
window.RobotM = { crear: (canvas, log) => createRobot(canvas, '../casco.glb', { animacion: 'vitrina', log }) };
window.dispatchEvent(new Event('robotm-listo'));
