// Tiny helpers used everywhere in the client.
import * as THREE from 'three';

export const $ = s => document.querySelector(s);
export const $$ = s => [...document.querySelectorAll(s)];
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const Q = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
export const rnd = (a, b) => a + Math.random() * (b - a);
export const pick = a => a[Math.floor(Math.random() * a.length)];
export const wait = ms => new Promise(r => setTimeout(r, ms));
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const cap = t => t[0].toUpperCase() + t.slice(1);
export const esc = t => String(t).replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);

// localStorage that never throws (private windows, blocked storage).
export const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
