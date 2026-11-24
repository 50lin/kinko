import { MongoClient, type Db as MDb } from 'mongodb';
import { newId, type Collection, type Db, type Doc, type Filter, type FindOpts, type Update } from '@kinko/core';

const hasOps = (u: Update) => Object.keys(u).some((k) => k.startsWith('$'));

class MongoCollection<T extends Doc> implements Collection<T> {
  constructor(public readonly name: string, private c: import('mongodb').Collection<any>) {}
  find(filter: Filter = {}, o: FindOpts = {}) { let cur = this.c.find(filter); if (o.sort) cur = cur.sort(o.sort); if (o.skip) cur = cur.skip(o.skip); if (o.limit) cur = cur.limit(o.limit); return cur.toArray() as Promise<T[]>; }
  findOne(filter: Filter, o: { sort?: any } = {}) { return this.c.findOne(filter, { sort: o.sort }) as Promise<T | null>; }
  findById(id: string) { return this.c.findOne({ _id: id }) as Promise<T | null>; }
  count(filter: Filter = {}) { return this.c.countDocuments(filter); }
  async insert(doc: any) { const ts = new Date().toISOString(); const d = { ...doc, _id: doc._id || newId(), createdAt: doc.createdAt || ts, updatedAt: doc.updatedAt || ts }; await this.c.insertOne(d); return d as T; }
  async insertMany(docs: any[]) { if (!docs.length) return []; const ts = new Date().toISOString(); const ds = docs.map((d) => ({ ...d, _id: d._id || newId(), createdAt: d.createdAt || ts, updatedAt: d.updatedAt || ts })); await this.c.insertMany(ds, { ordered: false }); return ds as T[]; }
  private norm(update: Update, upsert = false): Update {
    const u: any = hasOps(update) ? { ...update } : { $set: update };
    u.$set = { ...(u.$set || {}), updatedAt: new Date().toISOString() };
    if (upsert) u.$setOnInsert = { ...(u.$setOnInsert || {}), _id: newId(), createdAt: new Date().toISOString() };
    return u;
  }
  async updateOne(filter: Filter, update: Update, o: { upsert?: boolean } = {}) { return (await this.c.findOneAndUpdate(filter, this.norm(update, o.upsert), { returnDocument: 'after', upsert: !!o.upsert })) as T | null; }
  async updateMany(filter: Filter, update: Update) { return (await this.c.updateMany(filter, this.norm(update))).modifiedCount; }
  updateById(id: string, update: Update) { return this.updateOne({ _id: id }, update); }
  async deleteOne(filter: Filter) { return (await this.c.deleteOne(filter)).deletedCount; }
  async deleteMany(filter: Filter) { return (await this.c.deleteMany(filter)).deletedCount; }
}

const INDEXES: Record<string, [Record<string, 1 | -1>, Record<string, any>?][]> = {
  users: [[{ email: 1 }, { unique: true }], [{ role: 1, status: 1 }], [{ 'organization.id': 1 }]],
  sessions: [[{ userId: 1 }], [{ expiresAt: 1 }]],
  professionals: [[{ userId: 1 }, { unique: true }], [{ verificationStatus: 1, province: 1 }]],
  careRelations: [[{ patientId: 1, professionalId: 1, status: 1 }], [{ professionalId: 1, status: 1 }]],
  guardianLinks: [[{ parentId: 1 }], [{ teenId: 1 }], [{ code: 1 }]],
  checkins: [[{ userId: 1, date: -1 }, { unique: true }]],
  assessments: [[{ userId: 1, instrumentId: 1, completedAt: -1 }]],
  journal: [[{ userId: 1, createdAt: -1 }]],
  companionMessages: [[{ threadId: 1, createdAt: 1 }], [{ userId: 1, createdAt: -1 }]],
  appointments: [[{ professionalId: 1, startAt: 1 }], [{ patientId: 1, startAt: 1 }], [{ clinicId: 1, startAt: 1 }]],
  messages: [[{ conversationId: 1, createdAt: -1 }]],
  conversations: [[{ participants: 1, lastMessageAt: -1 }]],
  clinicalRecords: [[{ patientId: 1, sessionDate: -1 }]],
  measurements: [[{ userId: 1, type: 1, measuredAt: -1 }]],
  alerts: [[{ professionalIds: 1, status: 1 }], [{ patientId: 1, createdAt: -1 }]],
  notifications: [[{ userId: 1, read: 1, createdAt: -1 }]],
  auditLogs: [[{ createdAt: -1 }], [{ patientId: 1, createdAt: -1 }], [{ actorId: 1, createdAt: -1 }]],
  apiKeys: [[{ keyHash: 1 }, { unique: true }]],
  apiUsage: [[{ keyId: 1, day: 1, endpoint: 1 }, { unique: true }]],
  forumPosts: [[{ categoryId: 1, status: 1, lastActivityAt: -1 }]],
  products: [[{ status: 1, passionTags: 1 }]],
};

export async function connectMongo(uri: string, dbName: string): Promise<Db> {
  const client = new MongoClient(uri, { maxPoolSize: 20, retryWrites: true });
  await client.connect();
  const mdb: MDb = client.db(dbName);
  for (const [col, idx] of Object.entries(INDEXES)) for (const [keys, opts] of idx) await mdb.collection(col).createIndex(keys, opts || {}).catch(() => undefined);
  const cache = new Map<string, MongoCollection<any>>();
  return {
    kind: 'mongo',
    col<T extends Doc>(name: string) { if (!cache.has(name)) cache.set(name, new MongoCollection<T>(name, mdb.collection(name))); return cache.get(name)! as Collection<T>; },
    close: () => client.close(),
  };
}
