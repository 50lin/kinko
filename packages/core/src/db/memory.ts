import { Query } from 'mingo';
import { newId } from '../util/ids';
import { applyUpdate, equalityFields } from './update';
import { getPath, setPath, clone } from './paths';
import type { Collection, Db, Doc, Filter, FindOpts, Sort, Update } from './types';

function compare(a: any, b: any): number {
  if (a === b) return 0;
  if (a === undefined || a === null) return -1;
  if (b === undefined || b === null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a) < String(b) ? -1 : 1;
}
export function sortDocs<T>(docs: T[], sort?: Sort): T[] {
  if (!sort) return docs;
  const entries = Object.entries(sort);
  return [...docs].sort((x, y) => {
    for (const [k, dir] of entries) {
      const c = compare(getPath(x, k), getPath(y, k));
      if (c !== 0) return c * dir;
    }
    return 0;
  });
}

class MemoryCollection<T extends Doc> implements Collection<T> {
  constructor(public readonly name: string, private store: Map<string, T>, private onChange: () => void, private now: () => Date) {}
  private match(filter: Filter = {}): T[] {
    if (filter._id && typeof filter._id === 'string' && Object.keys(filter).length === 1) {
      const d = this.store.get(filter._id); return d ? [d] : [];
    }
    const q = new Query(filter);
    const out: T[] = [];
    for (const d of this.store.values()) if (q.test(d)) out.push(d);
    return out;
  }
  async find(filter: Filter = {}, opts: FindOpts = {}): Promise<T[]> {
    let docs = sortDocs(this.match(filter), opts.sort);
    if (opts.skip) docs = docs.slice(opts.skip);
    if (opts.limit) docs = docs.slice(0, opts.limit);
    return docs.map(clone);
  }
  async findOne(filter: Filter, opts: { sort?: Sort } = {}): Promise<T | null> {
    const docs = sortDocs(this.match(filter), opts.sort);
    return docs.length ? clone(docs[0]) : null;
  }
  async findById(id: string) { const d = this.store.get(id); return d ? clone(d) : null; }
  async count(filter: Filter = {}) { return this.match(filter).length; }
  async insert(doc: any): Promise<T> {
    const ts = this.now().toISOString();
    const d = { ...clone(doc), _id: doc._id || newId(), createdAt: doc.createdAt || ts, updatedAt: doc.updatedAt || ts } as T;
    if (this.store.has(d._id)) throw Object.assign(new Error('duplicate _id'), { code: 11000 });
    this.store.set(d._id, d);
    this.onChange();
    return clone(d);
  }
  async insertMany(docs: any[]) { const out: T[] = []; for (const d of docs) out.push(await this.insert(d)); return out; }
  private write(d: T, update: Update, isInsert = false): T {
    const next = applyUpdate(d, update, isInsert) as T;
    next._id = d._id;
    next.updatedAt = this.now().toISOString();
    this.store.set(d._id, next);
    return next;
  }
  async updateOne(filter: Filter, update: Update, opts: { upsert?: boolean } = {}) {
    const [d] = this.match(filter);
    if (!d) {
      if (!opts.upsert) return null;
      const base: any = {};
      for (const [k, v] of Object.entries(equalityFields(filter))) setPath(base, k, v);
      const created = await this.insert(base);
      const res = this.write(created, update, true);
      this.onChange();
      return clone(res);
    }
    const res = this.write(d, update);
    this.onChange();
    return clone(res);
  }
  async updateMany(filter: Filter, update: Update) {
    const docs = this.match(filter);
    for (const d of docs) this.write(d, update);
    if (docs.length) this.onChange();
    return docs.length;
  }
  async updateById(id: string, update: Update) { return this.updateOne({ _id: id }, update); }
  async deleteOne(filter: Filter) { const [d] = this.match(filter); if (!d) return 0; this.store.delete(d._id); this.onChange(); return 1; }
  async deleteMany(filter: Filter) { const docs = this.match(filter); docs.forEach((d) => this.store.delete(d._id)); if (docs.length) this.onChange(); return docs.length; }
}

export interface MemoryDbOptions { initial?: Record<string, Doc[]>; onChange?: (db: MemoryDb) => void; now?: () => Date; }

/** Base de datos en memoria con lenguaje de consulta MongoDB (mingo). Se usa en desarrollo, tests y la demo en navegador. */
export class MemoryDb implements Db {
  readonly kind = 'memory' as const;
  private data = new Map<string, Map<string, any>>();
  private cols = new Map<string, MemoryCollection<any>>();
  constructor(private opts: MemoryDbOptions = {}) {
    for (const [name, docs] of Object.entries(opts.initial || {})) {
      const m = new Map<string, any>();
      for (const d of docs) m.set(d._id, d);
      this.data.set(name, m);
    }
  }
  col<T extends Doc = Doc>(name: string): Collection<T> {
    let c = this.cols.get(name);
    if (!c) {
      if (!this.data.has(name)) this.data.set(name, new Map());
      c = new MemoryCollection<T>(name, this.data.get(name)!, () => this.opts.onChange?.(this), this.opts.now || (() => new Date()));
      this.cols.set(name, c);
    }
    return c as Collection<T>;
  }
  snapshot(): Record<string, Doc[]> {
    const out: Record<string, Doc[]> = {};
    for (const [name, m] of this.data) out[name] = [...m.values()];
    return out;
  }
  async close() {}
}
