import { useEffect, useRef, useState } from 'react';
import { Bluetooth, BluetoothSearching, CirclePlay, Plus, Square, Trash2, Wind, Smartphone, Watch } from 'lucide-react';
import { Badge, Button, Card, CardTitle, Confirm, Input, Loading, Modal, PageHeader, Select, Toggle, cx } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { Spark } from '@/components/Charts';
import { useApi, useMut, toast, invalidate } from '@/lib/query';
import { post, del } from '@/lib/api';
import { BLE_PROFILES, bleSupport, connectDevice, simulate, type BleKind, type Connection, type Reading } from '@/lib/ble';
import { fmtDateTime, num } from '@/lib/format';

const LABEL: Record<string, [string, string]> = { heart_rate: ['Pulso', 'lpm'], hrv_rmssd: ['HRV (RMSSD)', 'ms'], bp_systolic: ['Sistólica', 'mmHg'], bp_diastolic: ['Diastólica', 'mmHg'], temperature: ['Temperatura', '°C'], weight: ['Peso', 'kg'], spo2: ['SpO₂', '%'], steps: ['Pasos', ''], sleep_minutes: ['Sueño', 'min'], glucose: ['Glucosa', 'mg/dL'], respiratory_rate: ['Respiración', 'rpm'] };

export function Devices() {
  const devices = useApi<any[]>('/devices');
  const recent = useApi<any[]>('/measurements?days=14');
  const [conn, setConn] = useState<{ c: Connection; kind: BleKind; deviceId?: string } | null>(null);
  const [live, setLive] = useState<Record<string, { value: number; t: number }[]>>({});
  const buffer = useRef<Reading[]>([]);
  const [manual, setManual] = useState(false);
  const support = bleSupport();
  const flush = async (deviceId?: string) => {
    const items = buffer.current.splice(0); if (!items.length) return;
    // Agrega: medias por tipo para no inundar la base de datos con lecturas por segundo.
    const by: Record<string, number[]> = {}; items.forEach((r) => (by[r.type] ||= []).push(r.value));
    const out = Object.entries(by).map(([type, vs]) => ({ type, value: Math.round((vs.reduce((a, b) => a + b, 0) / vs.length) * 10) / 10, source: deviceId?.startsWith('sim') ? 'simulador' : 'ble' }));
    try { await post('/measurements', { deviceId, items: out }); invalidate('/measurements', '/stats'); } catch (e: any) { toast(e.message, 'error'); }
  };
  useEffect(() => { if (!conn) return; const id = setInterval(() => flush(conn.deviceId), 15000); return () => clearInterval(id); }, [conn]);
  const onReadings = (rs: Reading[]) => {
    buffer.current.push(...rs.filter((r) => !isNaN(r.value)));
    setLive((l) => { const n = { ...l }; rs.forEach((r) => { n[r.type] = [...(n[r.type] || []).slice(-59), { value: r.value, t: Date.now() }]; }); return n; });
  };
  const start = async (kind: BleKind, sim: false | 'normal' | 'stressed') => {
    try {
      const c = sim ? simulate(kind, onReadings, sim === 'stressed') : await connectDevice(kind, onReadings);
      const dev = await post('/devices', { type: sim ? 'simulator' : kind, name: c.name, bleId: c.id });
      setLive({}); setConn({ c, kind, deviceId: dev._id }); invalidate('/devices');
      toast(`Conectado: ${c.name}`);
    } catch (e: any) { if (e?.name !== 'NotFoundError') toast(e.message || 'No se pudo conectar', 'error'); }
  };
  const stop = async () => { if (!conn) return; await conn.c.stop(); await flush(conn.deviceId); setConn(null); toast('Mediciones guardadas'); };
  const removeDev = useMut((id: string) => del(`/devices/${id}`), { invalidate: ['/devices'] });
  const hrv = live.hrv_rmssd?.at(-1)?.value;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Dispositivos" title="Tu cuerpo también habla" subtitle="Conecta dispositivos Bluetooth estándar de salud. La variabilidad cardiaca (HRV) es uno de los mejores indicadores de estrés y recuperación." actions={<Button variant="outline" icon={<Plus className="h-4 w-4" />} onClick={() => setManual(true)}>Añadir a mano</Button>} />
      {support === 'none' && <Card className="bg-amber-50 text-sm dark:bg-amber-500/10">Tu navegador no admite Bluetooth (Safari/Firefox). Usa Chrome o Edge en ordenador o Android, o la app nativa de Kinkō. Mientras tanto puedes probar con el <b>simulador</b>.</Card>}
      {conn && (
        <Card className="ring-2 ring-brand-400">
          <div className="flex flex-wrap items-center gap-3"><span className="relative flex h-3 w-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" /><span className="relative inline-flex h-3 w-3 rounded-full bg-brand-500" /></span><div className="flex-1 font-semibold">{conn.c.name}</div><Button size="sm" variant="danger" icon={<Square className="h-4 w-4" />} onClick={stop}>Detener y guardar</Button></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(live).map(([type, xs]) => <div key={type} className="rounded-2xl bg-ink-50 p-4 dark:bg-white/5"><div className="text-xs muted">{LABEL[type]?.[0] || type}</div><div className="mt-1 font-display text-3xl">{num(xs.at(-1)?.value, 1)} <span className="text-sm font-sans muted">{LABEL[type]?.[1]}</span></div><Spark data={xs} k="value" color={type === 'hrv_rmssd' ? '#8b7bd8' : '#d9637d'} /></div>)}
            {!Object.keys(live).length && <div className="text-sm muted">Esperando datos del dispositivo…</div>}
          </div>
          {hrv != null && <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-violet-50 p-4 text-sm dark:bg-violet-500/10"><Wind className="h-5 w-5 text-violet-600" /><div className="flex-1">{hrv < 30 ? 'Tu HRV está baja: tu cuerpo está en modo alerta. Prueba 2 minutos de respiración coherente y mira cómo sube.' : 'Buena variabilidad: tu sistema nervioso está en equilibrio.'}</div><Button size="sm" variant="soft" to="/app/respirar?patron=coherente">Biofeedback</Button></div>}
        </Card>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(Object.keys(BLE_PROFILES) as BleKind[]).map((k) => (
          <Card key={k} className="flex flex-col">
            <div className="flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300"><Icon name={BLE_PROFILES[k].icon} /></div><div><div className="font-semibold">{BLE_PROFILES[k].label}</div><div className="text-xs muted">{BLE_PROFILES[k].hint}</div></div></div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" disabled={!!conn || support === 'none'} onClick={() => start(k, false)} icon={<BluetoothSearching className="h-4 w-4" />}>Conectar</Button>
              <Button size="sm" variant="soft" disabled={!!conn} onClick={() => start(k, 'normal')} icon={<CirclePlay className="h-4 w-4" />}>Simular</Button>
              {k === 'heart_rate' && <Button size="sm" variant="ghost" disabled={!!conn} onClick={() => start(k, 'stressed')}>Simular estrés</Button>}
            </div>
          </Card>
        ))}
        <Card className="flex flex-col"><div className="flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-ink-100 dark:bg-white/5"><Watch className="h-6 w-6" /></div><div><div className="font-semibold">Apple Salud / Health Connect</div><div className="text-xs muted">Pasos, sueño y pulso de tu reloj</div></div></div><p className="mt-3 text-xs muted">Próximamente en las apps nativas de iOS y Android (permisos del sistema). Mientras tanto, añade pasos o sueño a mano. <Smartphone className="inline h-3 w-3" /></p></Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardTitle title="Mis dispositivos" icon={<Bluetooth className="h-5 w-5 text-brand-500" />} />
          {devices.isLoading ? <Loading /> : !devices.data?.length ? <p className="text-sm muted">Ninguno todavía.</p> : <div className="space-y-2">{devices.data.map((d) => <div key={d._id} className="flex items-center gap-3 text-sm"><Badge>{d.type}</Badge><span className="flex-1 truncate">{d.name}</span><span className="text-xs muted">{d.lastSyncAt ? fmtDateTime(d.lastSyncAt) : 'sin datos'}</span><Confirm title="¿Olvidar dispositivo?" onConfirm={() => removeDev.mutate(d._id)}>{(o) => <button onClick={o} className="p-1 muted hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}</Confirm></div>)}</div>}
        </Card>
        <Card><CardTitle title="Últimas mediciones" subtitle="14 días" />
          {recent.isLoading ? <Loading /> : !recent.data?.length ? <p className="text-sm muted">Sin mediciones.</p> : <div className="max-h-72 space-y-1.5 overflow-y-auto">{recent.data.slice(0, 60).map((m) => <div key={m._id} className="flex items-center justify-between text-sm"><span>{LABEL[m.type]?.[0] || m.type}</span><span className="font-semibold">{num(m.value, 1)} {m.unit}</span><span className="w-36 text-right text-xs muted">{fmtDateTime(m.measuredAt)}</span></div>)}</div>}
        </Card>
      </div>
      {manual && <ManualModal onClose={() => setManual(false)} />}
    </div>
  );
}
function ManualModal({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState('bp'); const [a, setA] = useState(''); const [b, setB] = useState('');
  const save = useMut((items: any[]) => post('/measurements', { items }), { invalidate: ['/measurements', '/stats', '/me/dashboard'], success: 'Medición guardada', onSuccess: onClose });
  const submit = () => {
    const n = (x: string) => Number(x.replace(',', '.'));
    const items = type === 'bp' ? [{ type: 'bp_systolic', value: n(a) }, { type: 'bp_diastolic', value: n(b) }] : [{ type, value: n(a) }];
    if (items.some((i) => isNaN(i.value))) return toast('Revisa los valores', 'error');
    save.mutate(items.map((i) => ({ ...i, source: 'manual' })));
  };
  return (
    <Modal open onClose={onClose} title="Añadir medición" footer={<Button loading={save.isPending} onClick={submit}>Guardar</Button>}>
      <div className="space-y-4">
        <Select label="Tipo" value={type} onChange={(e) => setType(e.target.value)}><option value="bp">Tensión arterial</option><option value="heart_rate">Pulso</option><option value="weight">Peso</option><option value="temperature">Temperatura</option><option value="spo2">Saturación O₂</option><option value="steps">Pasos</option><option value="glucose">Glucosa</option></Select>
        <div className="grid grid-cols-2 gap-3"><Input label={type === 'bp' ? 'Sistólica (mmHg)' : `Valor ${LABEL[type]?.[1] ? `(${LABEL[type][1]})` : ''}`} inputMode="decimal" value={a} onChange={(e) => setA(e.target.value)} />{type === 'bp' && <Input label="Diastólica (mmHg)" inputMode="decimal" value={b} onChange={(e) => setB(e.target.value)} />}</div>
        <p className="text-xs muted">Kinkō no es un dispositivo médico. Si un valor te preocupa, consulta con tu médico; ante síntomas graves, 112.</p>
      </div>
    </Modal>
  );
}
export { Toggle, cx };
