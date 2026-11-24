import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const env = (k: string, d = '') => process.env[k] ?? d;
const bool = (k: string, d: boolean) => (process.env[k] == null ? d : ['1', 'true', 'yes', 'on'].includes(String(process.env[k]).toLowerCase()));
const NODE_ENV = (env('NODE_ENV', 'development') as 'development' | 'production' | 'test');
export const DATA_DIR = path.resolve(env('DATA_DIR', path.join(process.cwd(), '.data')));
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

/** En desarrollo se generan claves locales persistentes; en producción son obligatorias por variable de entorno. */
function devSecret(name: string, bytes: number): string {
  const file = path.join(DATA_DIR, 'dev-secrets.json');
  const all = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  if (!all[name]) { all[name] = crypto.randomBytes(bytes).toString('base64'); fs.writeFileSync(file, JSON.stringify(all, null, 2), { mode: 0o600 }); }
  return all[name];
}
function secret(name: string, bytes: number): string {
  const v = process.env[name];
  if (v) return v;
  if (NODE_ENV === 'production') throw new Error(`Falta la variable de entorno obligatoria ${name}`);
  return devSecret(name, bytes);
}

export const config = {
  env: NODE_ENV,
  port: Number(env('PORT', '4000')),
  publicUrl: env('PUBLIC_URL', 'http://localhost:5173'),
  mongoUri: env('MONGODB_URI'),
  mongoDb: env('MONGODB_DB', 'kinko'),
  jwtSecret: secret('JWT_SECRET', 48),
  dataKeys: (() => {
    // DATA_ENCRYPTION_KEYS = "k2:base64,k1:base64" (la primera cifra; todas descifran, para rotar claves)
    const raw = process.env.DATA_ENCRYPTION_KEYS || `k1:${secret('DATA_ENCRYPTION_KEY', 32)}`;
    return raw.split(',').map((x) => { const [id, k] = x.split(':'); return { id, key: Buffer.from(k, 'base64') }; });
  })(),
  demoMode: bool('DEMO_MODE', NODE_ENV !== 'production'),
  seedDemo: bool('SEED_DEMO', NODE_ENV !== 'production'),
  require2faForStaff: bool('REQUIRE_2FA_STAFF', NODE_ENV === 'production'),
  cookieSecure: bool('COOKIE_SECURE', NODE_ENV === 'production'),
  corsOrigins: env('CORS_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173,capacitor://localhost,https://localhost,http://localhost').split(',').map((s) => s.trim()).filter(Boolean),
  trustProxy: bool('TRUST_PROXY', NODE_ENV === 'production'),
  anthropicKey: env('ANTHROPIC_API_KEY'),
  aiModelMain: env('AI_MODEL_MAIN', 'claude-sonnet-5-5'),
  aiModelLight: env('AI_MODEL_LIGHT', 'claude-haiku-5-5'),
  stripeKey: env('STRIPE_SECRET_KEY'),
  stripeWebhookSecret: env('STRIPE_WEBHOOK_SECRET'),
  turnUrl: env('TURN_URL'), turnUser: env('TURN_USERNAME'), turnPass: env('TURN_PASSWORD'),
  minorConsentAge: Number(env('MINOR_CONSENT_AGE', '16')),
  kAnon: Number(env('K_ANONYMITY', '10')),
  dpEpsilon: Number(env('DP_EPSILON', '1')),
  uploadsDir: path.resolve(env('UPLOADS_DIR', path.join(DATA_DIR, 'uploads'))),
  webDist: path.resolve(env('WEB_DIST', path.join(process.cwd(), '../web/dist'))),
};
if (config.env === 'production') {
  if (config.jwtSecret.length < 32) throw new Error('JWT_SECRET demasiado corto');
  if (config.dataKeys.some((k) => k.key.length !== 32)) throw new Error('Las claves de cifrado deben ser de 32 bytes (base64)');
  if (!config.mongoUri) throw new Error('En producción es obligatorio MONGODB_URI');
}
