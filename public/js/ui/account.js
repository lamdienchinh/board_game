// Account tab: who you are (guest or Google), sign in with Google Identity Services, sign out.
import { $, esc } from '../core/util.js';
import { api } from '../net.js';
import { toast } from './hud.js';

let google = false;

// Returns false when there is no room server (static hosting): the page then stays solo-only.
export async function initAccount() {
  let cfg, me;
  try { [cfg, me] = await Promise.all([api('config'), api('me')]); } catch { return false; }
  google = !!cfg.googleClientId;
  $('#noGoogle').hidden = google;
  render(me);
  if (google) loadGoogle(cfg.googleClientId);
  return true;
}

function render(user) {
  const name = user?.name || 'Khách', img = $('#avatar'), picture = user?.picture;
  $('#profileName').textContent = name;
  $('#profileSub').textContent = user?.guest === false ? user.email ?? 'Đã đăng nhập Google' : 'Chơi không cần tài khoản';
  img.hidden = !picture; if (picture) img.src = picture;
  $('#profile .av').hidden = !!picture;
  $('#accountChip').innerHTML = picture ? `<img src="${esc(picture)}" alt="" referrerpolicy="no-referrer"><span>${esc(name)}</span>` : `<i class="av" style="--c:#FFC857"></i><span>${esc(name)}</span>`;
  $('#googleBox').hidden = !google || user?.guest === false;
  $('#logoutBtn').hidden = user?.guest !== false;
  if (user?.name && !$('#nameIn').value) $('#nameIn').value = user.name.slice(0, 12);
}

function loadGoogle(clientId) {
  const s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client';
  s.async = true;
  s.onload = () => {
    window.google.accounts.id.initialize({ client_id: clientId, callback: signedIn });
    window.google.accounts.id.renderButton($('#googleBtn'), { theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with', locale: 'vi' });
  };
  s.onerror = () => toast('Không tải được đăng nhập Google');
  document.head.append(s);
}

async function signedIn({ credential }) {
  try {
    const user = await api('auth/google', { credential });
    $('#nameIn').value = '';
    render(user);
    toast(`Chào ${user.name ?? 'bạn'}! 👋`);
  } catch (e) { toast(e.message); }
}

export async function logout() {
  try {
    render(await api('auth/logout', {}));
    window.google?.accounts.id.disableAutoSelect();
    toast('Đã đăng xuất');
  } catch (e) { toast(e.message); }
}
