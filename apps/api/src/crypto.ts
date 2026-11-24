import crypto from 'node:crypto';
import type { FieldCipher } from '@kinko/core';

/** Cifrado de campos con AES-256-GCM. Formato: enc:v1:<keyId>:<iv>:<tag>:<datos> (base64). Admite rotación de claves. */
export function createCipher(keys: { id: string; key: Buffer }[]): FieldCipher {
  const [primary] = keys;
  const byId = new Map(keys.map((k) => [k.id, k.key]));
  return {
    isEncrypted: (v) => typeof v === 'string' && v.startsWith('enc:v1:'),
    encrypt(plain) {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv('aes-256-gcm', primary.key, iv);
      const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
      return `enc:v1:${primary.id}:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${data.toString('base64')}`;
    },
    decrypt(cipher) {
      const [, , id, iv, tag, data] = cipher.split(':');
      const key = byId.get(id);
      if (!key) throw new Error('Clave de cifrado desconocida');
      const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
      d.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
    },
  };
}
