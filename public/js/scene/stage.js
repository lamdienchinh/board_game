// The 3D stage: renderer, camera, lights and the table itself.
import * as THREE from 'three';
import { $, V, rnd } from '../core/util.js';
import { S } from '../core/state.js';

export const TABLE_R = 5.4, SEAT_R = TABLE_R + 0.9;

export const renderer = new THREE.WebGLRenderer({ canvas: $('#c'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

export const scene = new THREE.Scene();
scene.background = new THREE.Color('#FFE6D5');
scene.fog = new THREE.Fog('#FFE6D5', 20, 50);
export const camera = new THREE.PerspectiveCamera(46, 1, 0.5, 150);
scene.add(camera);
export const camHome = V();

scene.add(new THREE.HemisphereLight('#FFF6EC', '#D9C6F2', 1.9));
const sun = new THREE.DirectionalLight('#FFFFFF', 1.9);
sun.position.set(4, 12, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 44 });
sun.shadow.bias = -0.0005;
scene.add(sun);

// Toon shading: three flat bands of light.
const grad = new THREE.DataTexture(new Uint8Array([110, 190, 255]), 3, 1, THREE.RedFormat);
grad.minFilter = grad.magFilter = THREE.NearestFilter;
grad.needsUpdate = true;
export const toon = (color, extra) => new THREE.MeshToonMaterial({ color, gradientMap: grad, ...extra });

export function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

/* ---------- table ---------- */
const feltTex = canvasTex(1024, 1024, (x, w) => {
  const g = x.createRadialGradient(w / 2, w / 2, 60, w / 2, w / 2, w / 2);
  g.addColorStop(0, '#93E2CB'); g.addColorStop(1, '#5CC9AB');
  x.fillStyle = g; x.fillRect(0, 0, w, w);
  x.fillStyle = 'rgba(255,255,255,.12)';
  for (let i = 0; i < 600; i++) {
    const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * w / 2;
    x.beginPath(); x.arc(w / 2 + Math.cos(a) * r, w / 2 + Math.sin(a) * r, rnd(2, 5), 0, 6.283); x.fill();
  }
  x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 7; x.setLineDash([22, 18]);
  x.beginPath(); x.arc(w / 2, w / 2, w * 0.21, 0, 6.283); x.stroke();
});
const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(TABLE_R, TABLE_R, 0.3, 96),
  [toon('#F6B26B'), toon('#FFFFFF', { map: feltTex }), toon('#D98B3A')]);
tableTop.position.y = -0.15;
tableTop.receiveShadow = true;
const rim = new THREE.Mesh(new THREE.TorusGeometry(TABLE_R + 0.06, 0.2, 20, 140), toon('#F6B26B'));
rim.rotation.x = Math.PI / 2;
rim.castShadow = rim.receiveShadow = true;
const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.8, 2.3, 40), toon('#E39A4E'));
leg.position.y = -1.45;
leg.castShadow = true;
const floor = new THREE.Mesh(new THREE.CircleGeometry(80, 64), toon('#FFD9C6'));
const rug = new THREE.Mesh(new THREE.CircleGeometry(TABLE_R * 2, 80), toon('#FFC4B3'));
for (const [m, y] of [[floor, -2.6], [rug, -2.59]]) { m.rotation.x = -Math.PI / 2; m.position.y = y; m.receiveShadow = true; }
scene.add(tableTop, rim, leg, floor, rug);

// Fit the table across the screen: on portrait the side buddies may peek in from the edges,
// on wide screens the whole ring of seats fits, and the height decides on squat windows.
export function fitCamera() {
  const w = innerWidth, h = innerHeight, a = w / h;
  renderer.setSize(w, h, false);
  camera.aspect = a;
  camera.fov = a < 1 ? 50 : 44;
  const vf = THREE.MathUtils.degToRad(camera.fov / 2), hf = Math.atan(Math.tan(vf) * a);
  const short = h < 520; // squat screens keep room under the top bar for the far buddies' name tags
  const dist = Math.max((a < 1 ? TABLE_R + 0.4 : SEAT_R + 0.9) / Math.sin(hf), (TABLE_R + (short ? 3.4 : 1.4)) / Math.tan(vf));
  const target = V(0, 0, a < 1 ? 0.9 : short ? 1.9 : 0.8);
  camHome.copy(V(0, a < 1 ? 1.7 : 1.05, 1).normalize().multiplyScalar(dist)).add(target);
  camera.position.copy(camHome); camera.lookAt(target); camera.updateProjectionMatrix();
  Object.assign(scene.fog, { near: dist + 10, far: dist + 45 });
  S.pileScale = 1.3 * Math.min(2.2, dist / 14); // cards on the table keep a readable size on screen
  S.barPx = h - $('#bar').getBoundingClientRect().top;
}
