import fs from 'node:fs';
import path from 'node:path';
import { MemoryDb, withEncryption, type Db } from '@kinko/core';
import { config, DATA_DIR } from './config';
import { createCipher } from './crypto';
import { connectMongo } from './mongo';
import { logger } from './logger';

/** MongoDB si hay MONGODB_URI; si no, base de datos en memoria persistida en .data/kinko-dev.json (desarrollo sin instalar nada). */
export async function openDatabase(opts: { memoryFile?: string | null } = {}): Promise<Db> {
  const cipher = createCipher(config.dataKeys);
  if (config.mongoUri) {
    const db = await connectMongo(config.mongoUri, config.mongoDb);
    logger.info('MongoDB conectado');
    return withEncryption(db, cipher);
  }
  const file = opts.memoryFile === undefined ? path.join(DATA_DIR, 'kinko-dev.json') : opts.memoryFile;
  const initial = file && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined;
  let timer: NodeJS.Timeout | null = null;
  const mem = new MemoryDb({
    initial,
    onChange: (db) => {
      if (!file) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fs.writeFile(file, JSON.stringify(db.snapshot()), () => undefined), 800);
    },
  });
  logger.warn(`Sin MONGODB_URI: usando base de datos en memoria${file ? ` persistida en ${file}` : ''}. Para producción usa MongoDB Atlas.`);
  return withEncryption(mem, cipher);
}
