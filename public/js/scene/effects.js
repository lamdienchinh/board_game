// Confetti bursts and camera shake.
import * as THREE from 'three';
import { V, rnd } from '../core/util.js';
import { scene } from './stage.js';

export const fx = { shake: 0 }; // camera shake strength, decays every frame

const confGeo = new THREE.PlaneGeometry(0.09, 0.15);
const CONF = ['#FF6F91', '#FFC857', '#5CC9AB', '#B9A7F5', '#7EC8F5'].map(color => new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
const confetti = [];

export function burst(at, n = 50, power = 1) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(confGeo, CONF[i % 5]);
    m.position.copy(at);
    m.userData = { v: V(rnd(-1, 1), rnd(1.4, 3), rnd(-1, 1)).multiplyScalar(2.2 * power), s: V(rnd(-9, 9), rnd(-9, 9), rnd(-9, 9)), life: rnd(1.4, 2.4) };
    scene.add(m); confetti.push(m);
  }
}

export function stepEffects(dt) {
  fx.shake = Math.max(0, fx.shake - dt * 1.1);
  for (let i = confetti.length - 1; i >= 0; i--) {
    const m = confetti[i], u = m.userData;
    u.life -= dt; u.v.y -= 7 * dt; u.v.multiplyScalar(1 - dt * 1.3);
    m.position.addScaledVector(u.v, dt);
    if (m.position.y < 0.01) { m.position.y = 0.01; u.v.set(0, 0, 0); m.rotation.set(-Math.PI / 2, 0, m.rotation.z); }
    else { m.rotation.x += u.s.x * dt; m.rotation.y += u.s.y * dt; m.rotation.z += u.s.z * dt; }
    if (u.life <= 0) { scene.remove(m); confetti.splice(i, 1); }
  }
}
