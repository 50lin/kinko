import { seedDemo } from '@kinko/core';
import { openDatabase } from './database';
import { nodeProviders } from './providers';

const force = process.argv.includes('--force');
const db = await openDatabase();
const r = await seedDemo(db, nodeProviders({ toUser() {}, toRoom() {} }), { force });
console.log(r.skipped ? 'Ya había datos: usa --force con una base de datos vacía.' : r);
setTimeout(() => process.exit(0), 1500);
