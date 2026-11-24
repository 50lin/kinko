import { getPath, setPath, clone } from './paths';
import type { Collection, Db, Doc, FieldCipher, Filter, FindOpts, Update } from './types';

/** Envuelve una colección y cifra/descifra de forma transparente los campos sensibles (AES-256-GCM en el servidor). */
export class EncryptedCollection<T extends Doc> implements Collection<T> {
  constructor(private inner: Collection<T>, private fields: string[], private cipher: FieldCipher) {}
  get name() { return this.inner.name; }
  private enc(doc: any): any {
    const d = clone(doc);
    for (const f of this.fields) {
      const v = getPath(d, f);
      if (typeof v === 'string' && v.length && !this.cipher.isEncrypted(v)) setPath(d, f, this.cipher.encrypt(v));
    }
    return d;
  }
  private dec = (doc: any): any => {
    if (!doc) return doc;
    for (const f of this.fields) {
      const v = getPath(doc, f);
      if (typeof v === 'string' && this.cipher.isEncrypted(v)) {
        try { setPath(doc, f, this.cipher.decrypt(v)); } catch { setPath(doc, f, '[no se pudo descifrar]'); }
      }
    }
    return doc;
  };
  private encUpdate(update: Update): Update {
    const hasOps = Object.keys(update).some((k) => k.startsWith('$'));
    const u = clone(hasOps ? update : { $set: update });
    for (const op of ['$set', '$setOnInsert']) {
      const spec = u[op];
      if (!spec) continue;
      for (const key of Object.keys(spec)) {
        for (const f of this.fields) {
          if (key === f && typeof spec[key] === 'string' && !this.cipher.isEncrypted(spec[key])) spec[key] = this.cipher.encrypt(spec[key]);
          else if (f.startsWith(key + '.') && spec[key] && typeof spec[key] === 'object') {
            const sub = f.slice(key.length + 1);
            const v = getPath(spec[key], sub);
            if (typeof v === 'string' && v.length && !this.cipher.isEncrypted(v)) setPath(spec[key], sub, this.cipher.encrypt(v));
          }
        }
      }
    }
    return u;
  }
  async find(filter?: Filter, opts?: FindOpts) { return (await this.inner.find(filter, opts)).map(this.dec); }
  async findOne(filter: Filter, opts?: any) { return this.dec(await this.inner.findOne(filter, opts)); }
  async findById(id: string) { return this.dec(await this.inner.findById(id)); }
  count(filter?: Filter) { return this.inner.count(filter); }
  async insert(doc: any) { return this.dec(await this.inner.insert(this.enc(doc))); }
  async insertMany(docs: any[]) { return (await this.inner.insertMany(docs.map((d) => this.enc(d)))).map(this.dec); }
  async updateOne(filter: Filter, update: Update, opts?: any) { return this.dec(await this.inner.updateOne(filter, this.encUpdate(update), opts)); }
  updateMany(filter: Filter, update: Update) { return this.inner.updateMany(filter, this.encUpdate(update)); }
  async updateById(id: string, update: Update) { return this.dec(await this.inner.updateById(id, this.encUpdate(update))); }
  deleteOne(filter: Filter) { return this.inner.deleteOne(filter); }
  deleteMany(filter: Filter) { return this.inner.deleteMany(filter); }
}

/** Campos cifrados en reposo por colección. */
export const ENCRYPTED_FIELDS: Record<string, string[]> = {
  users: ['twoFactor.secret'],
  checkins: ['note'],
  journal: ['content'],
  companionMessages: ['content'],
  companionThreads: ['summary'],
  messages: ['body'],
  clinicalRecords: ['soap.s', 'soap.o', 'soap.a', 'soap.p', 'content'],
};

export function withEncryption(db: Db, cipher: FieldCipher): Db {
  const cache = new Map<string, Collection<any>>();
  return {
    kind: db.kind,
    close: db.close?.bind(db),
    col<T extends Doc>(name: string) {
      if (!ENCRYPTED_FIELDS[name]) return db.col<T>(name);
      if (!cache.has(name)) cache.set(name, new EncryptedCollection<T>(db.col<T>(name), ENCRYPTED_FIELDS[name], cipher));
      return cache.get(name)!;
    },
  };
}
