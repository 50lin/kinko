import { API_BASE, getAccessToken, mode } from './api';

type Handler = (data: any) => void;
const handlers = new Map<string, Set<Handler>>();
let socket: any = null; let unsub: (() => void) | null = null;
const dispatch = (event: string, data: any) => handlers.get(event)?.forEach((h) => h(data));

export function on(event: string, h: Handler) {
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event)!.add(h);
  return () => { handlers.get(event)?.delete(h); };
}
export async function connect(userId: string) {
  disconnect();
  if (mode.demo) {
    const { subscribe } = await import('./demo');
    unsub = await subscribe((target, event, data) => { if (target.user === userId) dispatch(event, data); });
    return;
  }
  const { io } = await import('socket.io-client');
  socket = io(API_BASE || undefined, { path: '/socket.io', auth: (cb: any) => cb({ token: getAccessToken() }), transports: ['websocket', 'polling'] });
  socket.onAny((event: string, data: any) => dispatch(event, data));
}
export function emit(event: string, data: any, ack?: (r: any) => void) {
  if (socket) socket.emit(event, data, ack); else ack?.({ ok: false, demo: true });
}
export const isLive = () => !!socket?.connected;
export function disconnect() { socket?.disconnect(); socket = null; unsub?.(); unsub = null; }
