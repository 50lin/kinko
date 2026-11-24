import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { seedDemo } from '@kinko/core';
import { openDatabase } from '../src/database';
import { nodeProviders } from '../src/providers';
import { buildExpress } from '../src/app';

let app: any; let db: any;
beforeAll(async () => {
  db = await openDatabase({ memoryFile: null });
  const providers = nodeProviders({ toUser() {}, toRoom() {} });
  await seedDemo(db, providers);
  app = buildExpress(db, providers).app;
}, 120_000);

describe('servidor Express', () => {
  it('cabeceras de seguridad', async () => {
    const r = await request(app).get('/api/health');
    expect(r.status).toBe(200);
    expect(r.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-powered-by']).toBeUndefined();
  });
  it('login con cookie httpOnly y refresh rotado', async () => {
    const agent = request.agent(app);
    const l = await agent.post('/api/auth/login').send({ email: 'mateo@kinko.app', password: 'Kinko2026!' });
    expect(l.status).toBe(200);
    expect(String(l.headers['set-cookie'])).toMatch(/kinko_rt=.*HttpOnly.*SameSite=Strict/i);
    expect(l.body.refreshToken).toBeUndefined();
    const me = await agent.get('/api/auth/me').set('Authorization', `Bearer ${l.body.accessToken}`);
    expect(me.body.email).toBe('mateo@kinko.app');
    const r = await agent.post('/api/auth/refresh');
    expect(r.status).toBe(200); expect(r.body.accessToken).toBeTruthy();
  });
  it('JWT manipulado rechazado', async () => {
    const l = await request(app).post('/api/auth/login').send({ email: 'ana@kinko.app', password: 'Kinko2026!' });
    const [h, p, s] = l.body.accessToken.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url').toString()), role: 'admin' })).toString('base64url');
    expect((await request(app).get('/api/admin/overview').set('Authorization', `Bearer ${h}.${forged}.${s}`)).status).toBe(401);
  });
  it('datos clínicos cifrados en reposo (AES-256-GCM)', async () => {
    const { MemoryDb, withEncryption } = await import('@kinko/core');
    const { createCipher } = await import('../src/crypto');
    const { config } = await import('../src/config');
    const raw = new MemoryDb();
    const enc = withEncryption(raw, createCipher(config.dataKeys));
    await enc.col('clinicalRecords').insert({ patientId: 'p1', soap: { s: 'Refiere insomnio', o: '', a: 'Ansiedad', p: '' } });
    const stored = raw.snapshot().clinicalRecords[0];
    expect(stored.soap.s).toMatch(/^enc:v1:k1:/);
    expect(JSON.stringify(stored)).not.toContain('insomnio');
    expect((await enc.col('clinicalRecords').findOne({ patientId: 'p1' }))!.soap.s).toBe('Refiere insomnio');
  });
  it('subida de archivos valida la firma real', async () => {
    const l = await request(app).post('/api/auth/login').send({ email: 'ana@kinko.app', password: 'Kinko2026!' });
    const fake = await request(app).post('/api/media').set('Authorization', `Bearer ${l.body.accessToken}`).attach('file', Buffer.from('<script>alert(1)</script>'), { filename: 'foto.png', contentType: 'image/png' });
    expect(fake.status).toBe(400);
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4500000000049454e44ae426082', 'hex');
    const ok = await request(app).post('/api/media').set('Authorization', `Bearer ${l.body.accessToken}`).attach('file', png, { filename: 'p.png', contentType: 'image/png' });
    expect(ok.status).toBe(200); expect(ok.body.url).toMatch(/^\/uploads\//);
  });
  it('API de insights por clave', async () => {
    const r = await request(app).get('/api/v1/insights/overview').set('X-API-Key', 'kk_test_demo_kinko2026');
    expect(r.status).toBe(200); expect(r.body.dataset).toContain('sandbox');
  });
});
