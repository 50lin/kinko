import { create } from 'zustand';
import { post, get, setAccessToken, refreshSession, setSessionListener, tokenStore, mode, store } from './api';
import { connect, disconnect } from './realtime';
import { queryClient } from './query';

export type Role = 'patient' | 'parent' | 'professional' | 'clinic_admin' | 'developer' | 'org_admin' | 'admin';
export interface User { id: string; email: string; role: Role; status: string; plan: string; profile: any; settings: any; consents: any; twoFactorEnabled: boolean; gamification: any; age: number | null; isMinor: boolean; organization: any }

interface AuthState {
  user: User | null; ready: boolean; mfaToken: string | null;
  init(): Promise<void>; afterLogin(data: any): Promise<User>;
  login(email: string, password: string): Promise<User | null>; verify2fa(code: string): Promise<User>; demoLogin(email: string): Promise<User>;
  register(data: any): Promise<{ user: User; guardianCode?: string }>; logout(): Promise<void>; setUser(u: User | null): void; reload(): Promise<void>;
}

export const HOME: Record<Role, string> = { patient: '/app', professional: '/pro', clinic_admin: '/clinica', parent: '/familia', developer: '/dev', org_admin: '/empresa', admin: '/admin' };

export const useAuth = create<AuthState>((set, getState) => ({
  user: null, ready: false, mfaToken: null,
  async init() {
    setSessionListener((u) => { if (u) set({ user: u }); else if (getState().user) { set({ user: null }); disconnect(); queryClient.clear(); } });
    if (mode.demo) await (await import('./demo')).demoReady();
    const r = await refreshSession().catch(() => null);
    if (r?.user) { set({ user: r.user }); connect(r.user.id); }
    set({ ready: true });
  },
  async afterLogin(data) {
    setAccessToken(data.accessToken);
    queryClient.clear(); // nunca mostrar datos en caché de otra sesión
    if (data.refreshToken) await tokenStore.set(data.refreshToken);
    set({ user: data.user, mfaToken: null });
    connect(data.user.id);
    applyTheme(data.user.settings?.theme);
    return data.user;
  },
  async login(email, password) {
    const r = await post('/auth/login', { email, password });
    if (r.mfaRequired) { set({ mfaToken: r.mfaToken }); return null; }
    return getState().afterLogin(r);
  },
  async verify2fa(code) { return getState().afterLogin(await post('/auth/2fa/verify', { mfaToken: getState().mfaToken, code })); },
  async demoLogin(email) { return getState().afterLogin(await post('/auth/demo-login', { email })); },
  async register(data) { const r = await post('/auth/register', data); const user = await getState().afterLogin(r); return { user, guardianCode: r.guardianCode }; },
  async logout() { await post('/auth/logout').catch(() => null); setAccessToken(null); await tokenStore.clear(); disconnect(); queryClient.clear(); set({ user: null }); },
  setUser(u) { set({ user: u }); },
  async reload() { const u = await get('/auth/me'); set({ user: u }); },
}));

export function applyTheme(theme?: string) {
  const dark = theme === 'dark' || (theme !== 'light' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', !!dark);
  store.set('kinko:theme', theme || 'system');
}
applyTheme(store.get('kinko:theme') || 'system');
