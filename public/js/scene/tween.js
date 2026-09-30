// Minimal tweening: move/rotate/scale an object over time, with an optional hop (arc).
// A new tween on the same object replaces the old one (and resolves its promise).
export const easeOut = t => 1 - (1 - t) ** 3, easeIn = t => t * t * t;
const tweens = new Set();

export function tween(obj, { pos, quat = obj.quaternion.clone(), scale = obj.scale.x, arc = 0, dur = 0.4, delay = 0, ease = easeOut }) {
  for (const t of tweens) if (t.obj === obj) { tweens.delete(t); t.res(); }
  return new Promise(res => tweens.add({ obj, pos: pos.clone(), quat, scale, arc, dur, t: -delay, ease, res, p0: null }));
}

export function stepTweens(dt) {
  for (const tw of tweens) {
    tw.t += dt;
    if (tw.t < 0) continue;
    if (!tw.p0) Object.assign(tw, { p0: tw.obj.position.clone(), q0: tw.obj.quaternion.clone(), s0: tw.obj.scale.x });
    const k = Math.min(1, tw.t / tw.dur), e = tw.ease(k);
    tw.obj.position.lerpVectors(tw.p0, tw.pos, e);
    tw.obj.position.y += Math.sin(Math.PI * k) * tw.arc;
    tw.obj.quaternion.slerpQuaternions(tw.q0, tw.quat, e);
    tw.obj.scale.setScalar(tw.s0 + (tw.scale - tw.s0) * e);
    if (k >= 1) { tweens.delete(tw); tw.res(); }
  }
}
