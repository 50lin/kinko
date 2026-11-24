const hex = (n: number) => n.toString(16).padStart(2, '0');
export function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}
export function randomHex(n: number): string { return Array.from(randomBytes(n), hex).join(''); }
/** Identificador tipo ObjectId (24 hex) ordenable por tiempo. */
export function newId(): string {
  const ts = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0');
  return ts + randomHex(8);
}
export function randomToken(bytes = 32): string {
  const b = randomBytes(bytes);
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function randomCode(len = 8): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(randomBytes(len), (x) => alphabet[x % alphabet.length]).join('');
}
