const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export function saveToken(token) {
  if (!token) return;
  localStorage.setItem('jwt', token);
  if (location.hostname !== 'localhost' && !location.hostname.includes('127.0.0.1') && location.hostname.endsWith('moderno.com.ar')) {
    document.cookie = `mp_token=${encodeURIComponent(token)}; domain=.moderno.com.ar; path=/; max-age=5184000; Secure; SameSite=Lax`;
  } else {
    document.cookie = `mp_token=${encodeURIComponent(token)}; path=/; max-age=5184000; SameSite=Lax`;
  }
}

export function readTokenFromCookie() {
  const m = document.cookie.match(/(?:^|; )mp_token=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function restoreToken() {
  const cached = readTokenFromCookie();
  if (cached && !localStorage.getItem('jwt')) {
    localStorage.setItem('jwt', cached);
  }
  return localStorage.getItem('jwt');
}

export function logout() {
  localStorage.removeItem('jwt');
  if (location.hostname.endsWith('moderno.com.ar')) {
    document.cookie = 'mp_token=; domain=.moderno.com.ar; path=/; max-age=0';
  } else {
    document.cookie = 'mp_token=; path=/; max-age=0';
  }
}

export async function loginEmail(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || 'Login failed');
  saveToken(data.access_token);
  return data.access_token;
}

export async function loginGoogle() {
  const redirect = `${window.location.origin}${window.location.pathname}`;
  const url = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirect)}`;
  window.location.href = url;
}

export function handleCallback() {
  if (!window.location.hash) return null;
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);
  const token = params.get('access_token');
  if (token) {
    saveToken(token);
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  return token;
}

export async function getUser() {
  const token = localStorage.getItem('jwt') || restoreToken();
  if (!token) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY }
  });
  if (!res.ok) return null;
  return res.json();
}