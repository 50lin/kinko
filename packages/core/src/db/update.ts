import { Query } from 'mingo';
import { getPath, setPath, unsetPath, clone } from './paths';
import type { Update } from './types';

const isOp = (u: Update) => Object.keys(u).some((k) => k.startsWith('$'));

function eq(a: any, b: any): boolean { return JSON.stringify(a) === JSON.stringify(b); }

/** Aplica operadores de actualización estilo MongoDB ($set, $unset, $inc, $push, $pull, $addToSet, $setOnInsert, $min, $max). */
export function applyUpdate(doc: any, update: Update, isInsert = false): any {
  const out = clone(doc);
  const u = isOp(update) ? update : { $set: update };
  for (const [op, spec] of Object.entries(u)) {
    for (const [path, val] of Object.entries(spec as Record<string, any>)) {
      switch (op) {
        case '$set': setPath(out, path, clone(val)); break;
        case '$setOnInsert': if (isInsert) setPath(out, path, clone(val)); break;
        case '$unset': unsetPath(out, path); break;
        case '$inc': setPath(out, path, (Number(getPath(out, path)) || 0) + Number(val)); break;
        case '$min': { const c = getPath(out, path); if (c === undefined || val < c) setPath(out, path, val); break; }
        case '$max': { const c = getPath(out, path); if (c === undefined || val > c) setPath(out, path, val); break; }
        case '$push': {
          const arr = Array.isArray(getPath(out, path)) ? getPath(out, path) : [];
          if (val && typeof val === 'object' && '$each' in val) {
            arr.push(...clone(val.$each));
            if (typeof val.$slice === 'number') {
              const s = val.$slice;
              const sliced = s < 0 ? arr.slice(s) : arr.slice(0, s);
              arr.length = 0; arr.push(...sliced);
            }
          } else arr.push(clone(val));
          setPath(out, path, arr);
          break;
        }
        case '$addToSet': {
          const arr = Array.isArray(getPath(out, path)) ? getPath(out, path) : [];
          const items = val && typeof val === 'object' && '$each' in val ? val.$each : [val];
          for (const it of items) if (!arr.some((x: any) => eq(x, it))) arr.push(clone(it));
          setPath(out, path, arr);
          break;
        }
        case '$pull': {
          const arr = getPath(out, path);
          if (!Array.isArray(arr)) break;
          const isCond = val && typeof val === 'object' && !Array.isArray(val);
          const q = isCond ? new Query(val) : null;
          setPath(out, path, arr.filter((x: any) => (q ? !(typeof x === 'object' ? q.test(x) : false) : !eq(x, val))));
          break;
        }
        default: throw new Error(`Operador de actualización no soportado: ${op}`);
      }
    }
  }
  return out;
}

/** Extrae los valores de igualdad simple de un filtro (para upsert). */
export function equalityFields(filter: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(filter)) {
    if (k.startsWith('$')) continue;
    if (v === null || typeof v !== 'object' || Array.isArray(v)) out[k] = v;
    else if ('$eq' in v) out[k] = v.$eq;
  }
  return out;
}
