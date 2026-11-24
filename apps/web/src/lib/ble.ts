import { Capacitor } from '@capacitor/core';

/** Perfiles Bluetooth LE estándar (GATT) de dispositivos de salud. Funcionan con la mayoría de bandas, tensiómetros, básculas, termómetros y pulsioxímetros. */
export const BLE_PROFILES = {
  heart_rate: { label: 'Banda o reloj de pulso', service: 0x180d, characteristic: 0x2a37, icon: 'HeartPulse', hint: 'Frecuencia cardiaca y variabilidad (HRV)' },
  blood_pressure: { label: 'Tensiómetro', service: 0x1810, characteristic: 0x2a35, icon: 'Gauge', hint: 'Tensión arterial y pulso' },
  thermometer: { label: 'Termómetro', service: 0x1809, characteristic: 0x2a1c, icon: 'Thermometer', hint: 'Temperatura corporal' },
  scale: { label: 'Báscula', service: 0x181d, characteristic: 0x2a9d, icon: 'Scale', hint: 'Peso' },
  pulse_oximeter: { label: 'Pulsioxímetro', service: 0x1822, characteristic: 0x2a5f, icon: 'Droplets', hint: 'Saturación de oxígeno y pulso' },
} as const;
export type BleKind = keyof typeof BLE_PROFILES;
export interface Reading { type: string; value: number }

function sfloat(dv: DataView, o: number): number {
  const raw = dv.getUint16(o, true);
  if ([0x07ff, 0x0800, 0x07fe, 0x0802, 0x0801].includes(raw)) return NaN;
  let m = raw & 0x0fff; if (m >= 0x0800) m -= 0x1000;
  let e = raw >> 12; if (e >= 0x08) e -= 0x10;
  return m * Math.pow(10, e);
}
function float32(dv: DataView, o: number): number {
  const raw = dv.getUint32(o, true);
  let m = raw & 0x00ffffff; if (m >= 0x800000) m -= 0x1000000;
  const e = (raw >> 24) << 24 >> 24;
  return m * Math.pow(10, e);
}
export function rmssd(rr: number[]): number | null {
  if (rr.length < 6) return null;
  const d = rr.slice(1).map((x, i) => (x - rr[i]) ** 2);
  return Math.round(Math.sqrt(d.reduce((a, b) => a + b, 0) / d.length));
}
/** Decodifica las notificaciones GATT a lecturas Kinkō. */
export function parse(kind: BleKind, dv: DataView, rrBuffer: number[]): Reading[] {
  const flags = dv.getUint8(0);
  switch (kind) {
    case 'heart_rate': {
      const wide = flags & 0x01; const hr = wide ? dv.getUint16(1, true) : dv.getUint8(1);
      let o = wide ? 3 : 2; if (flags & 0x08) o += 2;
      if (flags & 0x10) for (; o + 1 < dv.byteLength; o += 2) rrBuffer.push((dv.getUint16(o, true) / 1024) * 1000);
      if (rrBuffer.length > 120) rrBuffer.splice(0, rrBuffer.length - 120);
      const out: Reading[] = [{ type: 'heart_rate', value: hr }];
      const h = rmssd(rrBuffer); if (h != null) out.push({ type: 'hrv_rmssd', value: h });
      return out;
    }
    case 'blood_pressure': {
      const k = flags & 0x01 ? 7.50062 : 1; let o = 7; if (flags & 0x02) o += 7;
      const out = [{ type: 'bp_systolic', value: Math.round(sfloat(dv, 1) * k) }, { type: 'bp_diastolic', value: Math.round(sfloat(dv, 3) * k) }];
      if (flags & 0x04) out.push({ type: 'heart_rate', value: Math.round(sfloat(dv, o)) });
      return out;
    }
    case 'thermometer': { let t = float32(dv, 1); if (flags & 0x01) t = (t - 32) / 1.8; return [{ type: 'temperature', value: Math.round(t * 10) / 10 }]; }
    case 'scale': { const raw = dv.getUint16(1, true); const kg = flags & 0x01 ? raw * 0.01 * 0.453592 : raw * 0.005; return [{ type: 'weight', value: Math.round(kg * 10) / 10 }]; }
    case 'pulse_oximeter': return [{ type: 'spo2', value: Math.round(sfloat(dv, 1)) }, { type: 'heart_rate', value: Math.round(sfloat(dv, 3)) }];
  }
}

export const bleSupport = () => (Capacitor.isNativePlatform() ? 'native' : typeof navigator !== 'undefined' && 'bluetooth' in navigator ? 'web' : 'none');

export interface Connection { name: string; id: string; stop(): Promise<void> }

/** Conecta con un dispositivo real: Web Bluetooth en Chrome/Edge/Android, plugin nativo en las apps Android/iOS. */
export async function connectDevice(kind: BleKind, onReadings: (r: Reading[]) => void): Promise<Connection> {
  const p = BLE_PROFILES[kind]; const rr: number[] = [];
  if (Capacitor.isNativePlatform()) {
    const { BleClient, numberToUUID } = await import('@capacitor-community/bluetooth-le');
    await BleClient.initialize();
    const device = await BleClient.requestDevice({ services: [numberToUUID(p.service)] });
    await BleClient.connect(device.deviceId);
    await BleClient.startNotifications(device.deviceId, numberToUUID(p.service), numberToUUID(p.characteristic), (v) => onReadings(parse(kind, v, rr)));
    return { name: device.name || p.label, id: device.deviceId, stop: async () => { await BleClient.stopNotifications(device.deviceId, numberToUUID(p.service), numberToUUID(p.characteristic)).catch(() => {}); await BleClient.disconnect(device.deviceId).catch(() => {}); } };
  }
  const nav: any = navigator;
  if (!nav.bluetooth) throw new Error('Este navegador no permite Bluetooth. Usa Chrome o Edge en ordenador/Android, o la app nativa.');
  const device = await nav.bluetooth.requestDevice({ filters: [{ services: [p.service] }] });
  const server = await device.gatt.connect();
  const ch = await (await server.getPrimaryService(p.service)).getCharacteristic(p.characteristic);
  const handler = (e: any) => onReadings(parse(kind, e.target.value as DataView, rr));
  ch.addEventListener('characteristicvaluechanged', handler);
  await ch.startNotifications();
  return { name: device.name || p.label, id: device.id, stop: async () => { ch.removeEventListener('characteristicvaluechanged', handler); try { await ch.stopNotifications(); device.gatt.disconnect(); } catch { /* */ } } };
}

/** Simulador para demos y ferias: genera datos fisiológicos realistas (incluye intervalos RR para HRV). */
export function simulate(kind: BleKind, onReadings: (r: Reading[]) => void, stressed = false): Connection {
  const rr: number[] = []; let t = 0;
  const id = setInterval(() => {
    t++;
    if (kind === 'heart_rate') {
      const base = stressed ? 84 : 66; const hr = Math.round(base + Math.sin(t / 5) * 3 + (Math.random() - 0.5) * 4);
      const n = Math.round(hr / 60);
      for (let i = 0; i < Math.max(1, n); i++) rr.push((60000 / hr) + (Math.random() - 0.5) * (stressed ? 18 : 70));
      if (rr.length > 120) rr.splice(0, rr.length - 120);
      const out: Reading[] = [{ type: 'heart_rate', value: hr }]; const h = rmssd(rr); if (h) out.push({ type: 'hrv_rmssd', value: h });
      onReadings(out);
    } else if (kind === 'blood_pressure' && t === 3) onReadings([{ type: 'bp_systolic', value: stressed ? 138 : 118 }, { type: 'bp_diastolic', value: stressed ? 88 : 76 }, { type: 'heart_rate', value: stressed ? 82 : 68 }]);
    else if (kind === 'thermometer' && t === 2) onReadings([{ type: 'temperature', value: 36.6 }]);
    else if (kind === 'scale' && t === 2) onReadings([{ type: 'weight', value: 72.4 }]);
    else if (kind === 'pulse_oximeter') onReadings([{ type: 'spo2', value: 97 + Math.round(Math.random()) }, { type: 'heart_rate', value: 68 + Math.round(Math.random() * 4) }]);
  }, 1000);
  return { name: `Simulador · ${BLE_PROFILES[kind].label}`, id: `sim-${kind}`, stop: async () => clearInterval(id) };
}
