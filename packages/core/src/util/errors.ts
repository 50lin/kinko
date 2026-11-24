export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
}
export const badRequest = (msg = 'Petición no válida', details?: unknown) => new HttpError(400, 'bad_request', msg, details);
export const unauthorized = (msg = 'Necesitas iniciar sesión', code = 'unauthorized') => new HttpError(401, code, msg);
export const forbidden = (msg = 'No tienes permiso para esto') => new HttpError(403, 'forbidden', msg);
export const notFound = (msg = 'No encontrado') => new HttpError(404, 'not_found', msg);
export const conflict = (msg = 'Ya existe') => new HttpError(409, 'conflict', msg);
export const tooMany = (msg = 'Demasiadas peticiones, espera un momento') => new HttpError(429, 'rate_limited', msg);
export function assert(cond: unknown, err: HttpError): asserts cond { if (!cond) throw err; }
