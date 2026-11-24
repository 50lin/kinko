import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express, { type Request, type Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import { createApp, type Db, type Providers, type RequestIn } from '@kinko/core';
import { config } from './config';
import { logger } from './logger';

/** Adaptador Express: seguridad HTTP, cookies, subida de archivos y webhooks. La lógica vive en @kinko/core. */
export function buildExpress(db: Db, providers: Providers) {
  const kinko = createApp({ db, providers });
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"], 'img-src': ["'self'", 'data:', 'blob:'], 'media-src': ["'self'", 'data:', 'blob:'],
        'connect-src': ["'self'", 'ws:', 'wss:'], 'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], 'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
        'script-src': ["'self'", "'wasm-unsafe-eval'"], 'frame-src': ['https://www.youtube-nocookie.com', 'https://player.vimeo.com'], 'frame-ancestors': ["'none'"], 'object-src': ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false, strictTransportSecurity: config.env === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
  }));
  app.use((_, res, next) => { res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), bluetooth=(self), geolocation=()'); next(); });
  app.use(cors({ origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin)), credentials: true }));
  app.use(compression());
  app.use(cookieParser());

  // Webhook de Stripe: cuerpo sin procesar y firma verificada.
  app.post('/api/payments/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
    try {
      const sig = String(req.headers['stripe-signature'] || '');
      const parts = Object.fromEntries(sig.split(',').map((x) => x.split('=') as [string, string]));
      const expected = crypto.createHmac('sha256', config.stripeWebhookSecret).update(`${parts.t}.${req.body}`).digest('hex');
      if (!config.stripeWebhookSecret || !parts.v1 || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1)) || Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return res.status(400).end();
      const event = JSON.parse(String(req.body));
      if (event.type === 'checkout.session.completed') {
        const md = event.data.object.metadata || {};
        if (md.appointmentId) await db.col('appointments').updateById(md.appointmentId, { $set: { paid: true, paymentRef: event.data.object.id } });
        if (md.orderId) await db.col('orders').updateById(md.orderId, { $set: { status: 'paid', paymentRef: event.data.object.id, paidAt: new Date().toISOString() } });
        if (md.userId && md.plan) await db.col('users').updateById(md.userId, { $set: { plan: md.plan, planSince: new Date().toISOString() } });
      }
      res.json({ received: true });
    } catch (e) { logger.error(e, 'webhook'); res.status(400).end(); }
  });

  app.use(express.json({ limit: '2mb' }));
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 80 * 1024 * 1024, files: 1 } });

  const handler = async (req: Request, res: Response) => {
    const started = Date.now();
    const file = (req as any).file as Express.Multer.File | undefined;
    const input: RequestIn = {
      method: req.method, path: req.path, query: req.query as any, body: req.body, cookies: req.cookies || {}, ip: req.ip || req.socket.remoteAddress || '',
      headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])),
      file: file ? { name: file.originalname, mime: file.mimetype, size: file.size, data: new Uint8Array(file.buffer) } : undefined,
    };
    const out = await kinko.handle(input);
    for (const c of out.setCookies) res.cookie(c.name, c.value, { httpOnly: c.opts.httpOnly, secure: c.opts.secure, sameSite: c.opts.sameSite, path: c.opts.path, maxAge: c.opts.maxAgeMs });
    for (const c of out.clearCookies) res.clearCookie(c.name, { path: c.opts.path });
    for (const [k, v] of Object.entries(out.headers)) res.setHeader(k, v);
    res.setHeader('Cache-Control', 'no-store');
    res.status(out.status).json(out.body);
    if (out.status >= 500 || config.env !== 'production') logger[out.status >= 500 ? 'error' : 'debug']({ method: req.method, path: req.path, status: out.status, ms: Date.now() - started }, 'request');
  };
  app.post('/api/media', upload.single('file'), handler);
  app.all('/api/*', handler);

  app.use('/uploads', express.static(config.uploadsDir, { maxAge: '7d', setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff') }));
  if (fs.existsSync(config.webDist)) {
    app.use(express.static(config.webDist, { maxAge: '1h', index: false }));
    app.get('*', (_req, res) => res.sendFile(path.join(config.webDist, 'index.html')));
  } else app.get('/', (_req, res) => res.type('text').send('Kinkō API en marcha. Abre la web en http://localhost:5173'));
  return { app, kinko };
}
