import { QueryClient, useMutation, useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { create } from 'zustand';
import { get, ApiError } from './api';

export const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 20_000, retry: (n, e: any) => n < 1 && !(e instanceof ApiError && e.status < 500 && e.status !== 0), refetchOnWindowFocus: false } } });

export function useApi<T = any>(path: string | null | false, opts: Partial<UseQueryOptions<T>> = {}) {
  return useQuery<T>({ queryKey: [path], queryFn: () => get<T>(path as string), enabled: !!path, ...(opts as any) });
}
export function invalidate(...prefixes: string[]) {
  return queryClient.invalidateQueries({ predicate: (q) => prefixes.some((p) => String(q.queryKey[0] ?? '').startsWith(p)) });
}
export function useMut<TArgs = any, TRes = any>(fn: (a: TArgs) => Promise<TRes>, o: { invalidate?: string[]; success?: string | ((r: TRes) => string | null); onSuccess?: (r: TRes, a: TArgs) => void; onError?: (e: ApiError) => void } = {}) {
  return useMutation<TRes, ApiError, TArgs>({
    mutationFn: fn,
    onSuccess: (r, a) => { if (o.invalidate) invalidate(...o.invalidate); const s = typeof o.success === 'function' ? o.success(r) : o.success; if (s) toast(s); o.onSuccess?.(r, a); },
    onError: (e) => { if (o.onError) o.onError(e); else toast(e.message, 'error'); },
  });
}

interface Toast { id: number; text: string; kind: 'ok' | 'error' | 'info' }
export const useToasts = create<{ items: Toast[]; push(t: Omit<Toast, 'id'>): void; remove(id: number): void }>((set) => ({
  items: [], push: (t) => { const id = Date.now() + Math.random(); set((s) => ({ items: [...s.items, { ...t, id }] })); setTimeout(() => set((s) => ({ items: s.items.filter((x) => x.id !== id) })), 4200); },
  remove: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
}));
export const toast = (text: string, kind: Toast['kind'] = 'ok') => useToasts.getState().push({ text, kind });
