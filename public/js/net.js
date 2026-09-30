// Talking to a table. Solo: a Table running right here in the page. Online: the room server —
// events arrive over Server-Sent Events, moves go out as POST /api/act. Both look the same to the session.

export async function api(path, body) {
  const init = body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
  const r = await fetch(`api/${path}`, init);
  const data = await r.json().catch(() => null);
  if (!r.ok || data == null) throw new Error(data?.error ?? 'Không kết nối được máy chủ');
  return data;
}

export function soloTable(Table, opts, onEvent) {
  const table = new Table((s, ev) => onEvent(ev), opts);
  return { table, send: a => { const err = table.handle(0, a); if (err) onEvent({ type: 'error', msg: err }); }, leave() { table.stop(); } };
}

// params: { name, game } to create a room, { name, room } to join one.
export function joinRoom(params, onEvent) {
  const es = new EventSource('api/events?' + new URLSearchParams(params));
  let cid = null, gone = false;
  // Tell the server right away when the page goes away, so a bot takes the seat without waiting for a timeout.
  const beacon = () => { gone = true; if (cid) navigator.sendBeacon('api/leave', JSON.stringify({ cid })); };
  addEventListener('pagehide', beacon);
  es.onmessage = e => {
    const ev = JSON.parse(e.data);
    if (ev.type === 'hello') cid = ev.cid;
    if (ev.fatal) es.close();
    onEvent(ev);
  };
  // Closing / reloading the page also errors the stream first: wait a moment, an unloading page never gets there.
  es.onerror = () => { es.close(); setTimeout(() => gone || onEvent({ type: 'lost', joined: cid != null }), 800); };
  return {
    send: a => api('act', a).then(r => r.error && onEvent({ type: 'error', msg: r.error }))
      .catch(e => onEvent({ type: 'error', msg: e.message || 'Mạng chập chờn — thử lại nhé' })),
    leave() { beacon(); removeEventListener('pagehide', beacon); es.close(); },
  };
}
