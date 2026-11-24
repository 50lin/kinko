import http from 'node:http';
import cron from 'node-cron';
import { runJobs, seedDemo } from '@kinko/core';
import { config } from './config';
import { logger } from './logger';
import { openDatabase } from './database';
import { nodeProviders } from './providers';
import { createRealtime } from './realtime';
import { buildExpress } from './app';

async function main() {
  const db = await openDatabase();
  const rt = createRealtime();
  const providers = nodeProviders(rt.realtime);
  if (config.seedDemo) {
    const r = await seedDemo(db, providers);
    if (!r.skipped) logger.info(r, 'Datos de demostración creados (contraseña de todas las cuentas demo: Kinko2026!)');
  }
  const { app } = buildExpress(db, providers);
  const server = http.createServer(app);
  rt.attach(server, db, providers);
  cron.schedule('*/15 * * * *', () => runJobs(db, providers).then((s) => logger.info(s, 'jobs')).catch((e) => logger.error(e, 'jobs')), { timezone: 'Europe/Madrid' });
  server.listen(config.port, '0.0.0.0', () => {
    logger.info(`Kinkō API escuchando en http://localhost:${config.port} · BD: ${db.kind} · IA: ${providers.ai.available ? 'Claude' : 'motor local'} · demo: ${config.demoMode}`);
  });
  const stop = async () => { server.close(); await db.close?.(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
main().catch((e) => { logger.fatal(e); process.exit(1); });
