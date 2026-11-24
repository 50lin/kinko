import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import type { Providers, AiRequest, UploadedFile, Role } from '@kinko/core';
import { config, DATA_DIR } from './config';
import { logger } from './logger';

authenticator.options = { window: 1 };

export function anthropicProvider(): Providers['ai'] {
  const available = !!config.anthropicKey;
  return {
    available, model: `${config.aiModelMain} / ${config.aiModelLight}`,
    async complete(req: AiRequest) {
      if (!available) return null;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 30_000);
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST', signal: ctrl.signal,
          headers: { 'content-type': 'application/json', 'x-api-key': config.anthropicKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: req.tier === 'light' ? config.aiModelLight : config.aiModelMain, max_tokens: req.maxTokens || 600, system: req.system, messages: req.messages }),
        });
        if (!res.ok) { logger.warn({ status: res.status }, 'Anthropic API error'); return null; }
        const data: any = await res.json();
        return (data.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n').trim() || null;
      } finally { clearTimeout(t); }
    },
  };
}

async function stripeCheckout(o: { amountCents: number; currency: string; description: string; metadata: Record<string, string>; successUrl: string; cancelUrl: string }) {
  const form = new URLSearchParams({
    mode: 'payment', success_url: o.successUrl, cancel_url: o.cancelUrl,
    'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': o.currency, 'line_items[0][price_data][unit_amount]': String(o.amountCents), 'line_items[0][price_data][product_data][name]': o.description,
  });
  for (const [k, v] of Object.entries(o.metadata)) form.set(`metadata[${k}]`, v);
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { authorization: `Bearer ${config.stripeKey}`, 'content-type': 'application/x-www-form-urlencoded' }, body: form });
  const data: any = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'Stripe error');
  return { mode: 'stripe' as const, url: data.url as string, id: data.id as string };
}

export function nodeProviders(realtime: Providers['realtime']): Providers {
  if (!fs.existsSync(config.uploadsDir)) fs.mkdirSync(config.uploadsDir, { recursive: true });
  const outbox = path.join(DATA_DIR, 'outbox.log');
  return {
    now: () => new Date(),
    hasher: {
      hash: (pw) => argonHash(pw, { memoryCost: 19456, timeCost: 2, parallelism: 1 }),
      verify: async (h, pw) => { try { return h.startsWith('$argon2') ? await argonVerify(h, pw) : false; } catch { return false; } },
    },
    tokens: {
      accessTtlSec: 900,
      signAccess: (p) => jwt.sign({ role: p.role, sid: p.sid }, config.jwtSecret, { subject: p.sub, expiresIn: 900, algorithm: 'HS256', issuer: 'kinko' }),
      verifyAccess: (t) => {
        try { const d = jwt.verify(t, config.jwtSecret, { algorithms: ['HS256'], issuer: 'kinko' }) as any; return { sub: d.sub, role: d.role as Role, sid: d.sid }; } catch { return null; }
      },
    },
    sha256: async (s) => crypto.createHash('sha256').update(s).digest('hex'),
    totp: {
      generateSecret: () => authenticator.generateSecret(),
      keyuri: (email, secret) => authenticator.keyuri(email, 'Kinkō', secret),
      verify: (token, secret) => { try { return !!secret && authenticator.verify({ token, secret }); } catch { return false; } },
      qr: (uri) => QRCode.toDataURL(uri, { margin: 1, width: 220 }),
    },
    ai: anthropicProvider(),
    realtime,
    mailer: {
      async send(to, subject, text) {
        // Sustituir por un proveedor SMTP/transaccional en producción (Brevo, Postmark, SES). En desarrollo se registra en .data/outbox.log
        fs.appendFileSync(outbox, `[${new Date().toISOString()}] Para: ${to}\nAsunto: ${subject}\n${text}\n\n`);
        logger.info({ to: to.replace(/(.).+@/, '$1***@'), subject }, 'email');
      },
    },
    storage: {
      async save(file: UploadedFile) {
        const key = crypto.randomBytes(24).toString('hex');
        const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf', 'audio/mpeg': 'mp3', 'video/mp4': 'mp4', 'video/webm': 'webm', 'audio/webm': 'weba', 'audio/mp4': 'm4a' } as Record<string, string>)[file.mime] || 'bin';
        const data = typeof file.data === 'string' ? Buffer.from(file.data.split(',')[1] || '', 'base64') : Buffer.from(file.data);
        fs.writeFileSync(path.join(config.uploadsDir, `${key}.${ext}`), data);
        return { url: `/uploads/${key}.${ext}`, key, size: data.length };
      },
    },
    payments: { checkout: async (o) => (config.stripeKey ? stripeCheckout(o) : { mode: 'simulated', id: `sim_${crypto.randomBytes(6).toString('hex')}` }) },
    config: {
      env: config.env, demoMode: config.demoMode, require2faForStaff: config.require2faForStaff, minorConsentAge: config.minorConsentAge, publicUrl: config.publicUrl,
      kAnon: config.kAnon, dpEpsilon: config.dpEpsilon, cookieSecure: config.cookieSecure, refreshTtlDays: 30,
      iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }, ...(config.turnUrl ? [{ urls: config.turnUrl, username: config.turnUser, credential: config.turnPass }] : [])],
    },
    log: (level, msg, meta) => logger[level](meta || {}, msg),
  };
}
