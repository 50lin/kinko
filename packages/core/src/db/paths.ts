export function getPath(obj: any, path: string): any {
  let cur = obj;
  for (const k of path.split('.')) {
    if (cur == null) return undefined;
    cur = cur[k];
  }
  return cur;
}
export function setPath(obj: any, path: string, value: any): void {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
}
export function unsetPath(obj: any, path: string): void {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) { cur = cur?.[keys[i]]; if (cur == null) return; }
  delete cur[keys[keys.length - 1]];
}
export function clone<T>(x: T): T {
  return x === undefined ? x : (typeof structuredClone === 'function' ? structuredClone(x) : JSON.parse(JSON.stringify(x)));
}
