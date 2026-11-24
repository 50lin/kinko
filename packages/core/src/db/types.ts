export type Doc = { _id: string; createdAt: string; updatedAt: string; [k: string]: any };
export type Filter = Record<string, any>;
export type Sort = Record<string, 1 | -1>;
export type Update = Record<string, any>;
export interface FindOpts { sort?: Sort; limit?: number; skip?: number; }

export interface Collection<T extends Doc = Doc> {
  readonly name: string;
  find(filter?: Filter, opts?: FindOpts): Promise<T[]>;
  findOne(filter: Filter, opts?: { sort?: Sort }): Promise<T | null>;
  findById(id: string): Promise<T | null>;
  count(filter?: Filter): Promise<number>;
  insert(doc: Partial<T> & Record<string, any>): Promise<T>;
  insertMany(docs: (Partial<T> & Record<string, any>)[]): Promise<T[]>;
  /** Actualiza el primer documento que cumple el filtro y lo devuelve ya actualizado. */
  updateOne(filter: Filter, update: Update, opts?: { upsert?: boolean }): Promise<T | null>;
  updateMany(filter: Filter, update: Update): Promise<number>;
  updateById(id: string, update: Update): Promise<T | null>;
  deleteOne(filter: Filter): Promise<number>;
  deleteMany(filter: Filter): Promise<number>;
}

export interface Db {
  readonly kind: 'memory' | 'mongo';
  col<T extends Doc = Doc>(name: string): Collection<T>;
  close?(): Promise<void>;
}

export interface FieldCipher {
  encrypt(plain: string): string;
  decrypt(cipher: string): string;
  isEncrypted(v: unknown): boolean;
}
