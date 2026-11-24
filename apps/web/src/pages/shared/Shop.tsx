import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { create } from 'zustand';
import { ExternalLink, Minus, Package, Plus, Search, ShoppingBag, ShoppingCart, Sparkles, Store, Truck, Info, PackageCheck, Ban } from 'lucide-react';
import { Badge, Button, Card, Chip, Empty, ErrorBox, Input, Loading, Modal, PageHeader, Select, Tabs, Textarea, cx } from '@/components/ui';
import { Cover } from '@/components/Icon';
import { useApi, useMut, toast } from '@/lib/query';
import { post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate, money } from '@/lib/format';

interface Line { product: any; qty: number }
const useCart = create<{ lines: Line[]; add(p: any): void; set(id: string, q: number): void; clear(): void }>((set) => ({
  lines: [], add: (p) => set((s) => { const ex = s.lines.find((l) => l.product._id === p._id); return { lines: ex ? s.lines.map((l) => (l.product._id === p._id ? { ...l, qty: Math.min(20, l.qty + 1) } : l)) : [...s.lines, { product: p, qty: 1 }] }; }),
  set: (id, q) => set((s) => ({ lines: q <= 0 ? s.lines.filter((l) => l.product._id !== id) : s.lines.map((l) => (l.product._id === id ? { ...l, qty: q } : l)) })), clear: () => set({ lines: [] }),
}));

async function openAffiliate(p: any) {
  try { const r = await post(`/shop/products/${p._id}/click`); const w = window.open(r.url, '_blank', 'noopener'); if (!w) { const a = document.createElement('a'); a.href = r.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; document.body.appendChild(a); a.click(); a.remove(); } } catch (e: any) { toast(e.message, 'error'); }
}

function ProductCard({ p, why }: { p: any; why?: string }) {
  const add = useCart((s) => s.add); const base = useAuth((s) => s.user?.role) === 'patient' ? '/app/tienda' : '/tienda';
  return (
    <Card className="flex flex-col overflow-hidden p-0">
      <Link to={`/tienda/${p._id}`}><Cover hue={p.coverHue || 160} icon={p.icon} className="h-36" size="h-12 w-12" /></Link>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center gap-1.5 text-xs muted">{p.type === 'affiliate' ? <><Store className="h-3.5 w-3.5" />{p.merchant}</> : <><Package className="h-3.5 w-3.5" />{p.merchant || 'Kinkō'}</>}{p.featured && <Badge tone="violet" className="ml-auto">Destacado</Badge>}</div>
        <Link to={`/tienda/${p._id}`} className="mt-1.5 font-semibold leading-snug hover:underline">{p.name}</Link>
        <p className="mt-1 line-clamp-2 flex-1 text-sm muted">{p.description}</p>
        {why && <div className="mt-2 flex items-start gap-1.5 rounded-xl bg-brand-50 px-2.5 py-1.5 text-xs text-brand-800 dark:bg-brand-500/10 dark:text-brand-200"><Sparkles className="mt-0.5 h-3 w-3 shrink-0" />{why}</div>}
        <div className="mt-3 flex items-center justify-between"><span className="font-display text-xl">{money(p.price)}</span>{p.type === 'affiliate' ? <Button size="sm" variant="outline" onClick={() => openAffiliate(p)} icon={<ExternalLink className="h-3.5 w-3.5" />}>Ver en tienda</Button> : <Button size="sm" onClick={() => { add(p); toast('Añadido al carrito'); }} icon={<ShoppingCart className="h-3.5 w-3.5" />}>Añadir</Button>}</div>
      </div>
      <span className="hidden">{base}</span>
    </Card>
  );
}

export function Shop() {
  const [sp, setSp] = useSearchParams(); const passion = sp.get('pasion') || '';
  const [q, setQ] = useState(''); const [cat, setCat] = useState(''); const [type, setType] = useState('');
  const user = useAuth((s) => s.user);
  const qs = new URLSearchParams(Object.entries({ q, category: cat, type, passion }).filter(([, v]) => v) as any).toString();
  const { data, isLoading, error } = useApi<any[]>(`/shop/products${qs ? `?${qs}` : ''}`);
  const all = useApi<any[]>('/shop/products');
  const reco = useApi<any[]>(user?.role === 'patient' && !qs ? '/shop/recommended' : null);
  const lines = useCart((s) => s.lines);
  const [cart, setCart] = useState(false); const [tab, setTab] = useState<'tienda' | 'mis'>('tienda');
  const cats = useMemo(() => Array.from(new Set((all.data || []).map((p) => p.category))).sort(), [all.data]);
  const seller = ['professional', 'clinic_admin', 'admin'].includes(user?.role || '');
  return (
    <div>
      <PageHeader eyebrow="Tienda" title="Para lo que te hace bien" subtitle="Material para tus pasiones y hábitos saludables. Nunca medicamentos ni suplementos. Algunos enlaces son de afiliado: Kinkō recibe una pequeña comisión sin coste para ti." actions={<><Button variant="outline" to={user?.role === 'patient' ? '/app/tienda/pedidos' : '/tienda/pedidos'}>Mis pedidos</Button><Button onClick={() => setCart(true)} icon={<ShoppingBag className="h-4 w-4" />}>Carrito{lines.length ? ` (${lines.reduce((a, l) => a + l.qty, 0)})` : ''}</Button></>} />
      {seller && <Tabs className="mb-6" value={tab} onChange={setTab} items={[{ id: 'tienda', label: 'Tienda' }, { id: 'mis', label: user?.role === 'admin' ? 'Catálogo (admin)' : 'Mis productos' }]} />}
      {tab === 'mis' ? <MyProducts /> : <>
        {passion && <Card className="mb-4 flex items-center gap-3"><Sparkles className="h-5 w-5 text-brand-500" /><span className="flex-1 text-sm">Mostrando material para tu pasión: <b>{passion}</b></span><Button size="sm" variant="ghost" onClick={() => setSp({})}>Quitar filtro</Button></Card>}
        {!!reco.data?.length && <div className="mb-8"><h2 className="mb-3 font-semibold">Elegido para ti</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{reco.data.slice(0, 4).map((p) => <ProductCard key={p._id} p={p} why={p.why} />)}</div></div>}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" /><input className="input pl-11" placeholder="Buscar productos, cursos, material…" value={q} onChange={(e) => setQ(e.target.value)} /></div><select className="input sm:!w-48" value={type} onChange={(e) => setType(e.target.value)}><option value="">Todo</option><option value="own">Venta directa Kinkō</option><option value="affiliate">Tiendas asociadas</option></select></div>
        <div className="mb-6 flex flex-wrap gap-1.5"><Chip active={!cat} onClick={() => setCat('')}>Todas</Chip>{cats.map((c) => <Chip key={c} active={cat === c} onClick={() => setCat(c)}>{c}</Chip>)}</div>
        {isLoading ? <Loading /> : error ? <ErrorBox error={error} /> : !data?.length ? <Empty title="Sin productos" /> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{data.map((p) => <ProductCard key={p._id} p={p} />)}</div>}
      </>}
      {cart && <CartModal onClose={() => setCart(false)} />}
    </div>
  );
}

function CartModal({ onClose }: { onClose: () => void }) {
  const { lines, set, clear } = useCart(); const user = useAuth((s) => s.user); const nav = useNavigate();
  const [step, setStep] = useState<'cart' | 'ship'>('cart');
  const [ship, setShip] = useState({ name: `${user?.profile?.firstName || ''} ${user?.profile?.lastName || ''}`.trim(), address: '', city: '', postalCode: '', phone: '' });
  const subtotal = lines.reduce((a, l) => a + l.product.price * l.qty, 0); const shipping = subtotal >= 40 || !subtotal ? 0 : 3.95;
  const order = useMut(() => post('/shop/orders', { items: lines.map((l) => ({ productId: l.product._id, qty: l.qty })), shipping: ship }), { invalidate: ['/shop'], onSuccess: (r: any) => { if (r.payment?.url) location.href = r.payment.url; else { clear(); onClose(); toast('Pedido confirmado (pago simulado)'); nav(user?.role === 'patient' ? '/app/tienda/pedidos' : '/tienda/pedidos'); } } });
  return (
    <Modal open onClose={onClose} title={step === 'cart' ? 'Tu carrito' : 'Envío'} footer={lines.length > 0 && (step === 'cart' ? <Button onClick={() => setStep('ship')}>Continuar · {money(subtotal + shipping)}</Button> : <><Button variant="ghost" onClick={() => setStep('cart')}>Atrás</Button><Button loading={order.isPending} disabled={!ship.address || !/^\d{5}$/.test(ship.postalCode)} onClick={() => order.mutate(undefined)}>Pagar {money(subtotal + shipping)}</Button></>)}>
      {!lines.length ? <Empty icon={<ShoppingBag className="h-8 w-8" />} title="Tu carrito está vacío" /> : step === 'cart' ? <div className="space-y-3">
        {lines.map((l) => <div key={l.product._id} className="flex items-center gap-3"><Cover hue={l.product.coverHue} icon={l.product.icon} className="h-12 w-12 rounded-xl" size="h-5 w-5" /><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{l.product.name}</div><div className="text-xs muted">{money(l.product.price)}</div></div><div className="flex items-center gap-1"><button onClick={() => set(l.product._id, l.qty - 1)} className="rounded-full p-1 hover:bg-ink-100 dark:hover:bg-white/10"><Minus className="h-4 w-4" /></button><span className="w-6 text-center text-sm">{l.qty}</span><button onClick={() => set(l.product._id, l.qty + 1)} className="rounded-full p-1 hover:bg-ink-100 dark:hover:bg-white/10"><Plus className="h-4 w-4" /></button></div></div>)}
        <div className="border-t border-ink-100 pt-3 text-sm dark:border-white/5"><div className="flex justify-between"><span>Subtotal</span><span>{money(subtotal)}</span></div><div className="flex justify-between muted"><span className="flex items-center gap-1"><Truck className="h-3.5 w-3.5" />Envío</span><span>{shipping ? money(shipping) : 'Gratis'}</span></div><div className="mt-1 flex justify-between font-semibold"><span>Total (IVA incl.)</span><span>{money(subtotal + shipping)}</span></div></div>
      </div> : <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Nombre" value={ship.name} onChange={(e) => setShip({ ...ship, name: e.target.value })} /><Input label="Teléfono" value={ship.phone} onChange={(e) => setShip({ ...ship, phone: e.target.value })} />
        <div className="sm:col-span-2"><Input label="Dirección" value={ship.address} onChange={(e) => setShip({ ...ship, address: e.target.value })} /></div>
        <Input label="Ciudad" value={ship.city} onChange={(e) => setShip({ ...ship, city: e.target.value })} /><Input label="Código postal" inputMode="numeric" maxLength={5} value={ship.postalCode} onChange={(e) => setShip({ ...ship, postalCode: e.target.value.replace(/\D/g, '') })} />
        <p className="text-xs muted sm:col-span-2">Pago seguro con Stripe. Derecho de desistimiento de 14 días.</p>
      </div>}
    </Modal>
  );
}

export function ProductPage() {
  const { id } = useParams();
  const { data: p, isLoading, error } = useApi<any>(`/shop/products/${id}`);
  const add = useCart((s) => s.add);
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader back eyebrow={p.category} title={p.name} />
      <div className="grid gap-6 md:grid-cols-2">
        <Cover hue={p.coverHue} icon={p.icon} className="aspect-square rounded-3xl" size="h-24 w-24" />
        <div>
          <div className="font-display text-4xl">{money(p.price)}</div>
          <p className="mt-4 leading-relaxed">{p.description}</p>
          <div className="mt-4 flex flex-wrap gap-1.5">{p.passionTags?.map((t: string) => <Badge key={t}>#{t}</Badge>)}</div>
          <div className="mt-6">{p.type === 'affiliate' ? <Button size="lg" onClick={() => openAffiliate(p)} icon={<ExternalLink className="h-4 w-4" />}>Comprar en {p.merchant}</Button> : <Button size="lg" onClick={() => { add(p); toast('Añadido al carrito'); }} icon={<ShoppingCart className="h-4 w-4" />}>Añadir al carrito</Button>}</div>
          <p className="mt-4 flex gap-2 text-xs muted"><Info className="h-4 w-4 shrink-0" />{p.type === 'affiliate' ? 'Enlace de afiliado: el precio puede variar en la tienda. Kinkō recibe una comisión sin coste extra para ti.' : `Vendido por ${p.merchant || 'Kinkō'}. Envío gratis desde 40 €. ${p.stock} en stock.`}</p>
        </div>
      </div>
    </div>
  );
}

export function Orders() {
  const { data, isLoading, error } = useApi<any[]>('/shop/orders');
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back title="Mis pedidos" />
      {isLoading ? <Loading /> : error ? <ErrorBox error={error} /> : !data?.length ? <Empty icon={<PackageCheck className="h-8 w-8" />} title="Sin pedidos" /> : <div className="space-y-3">{data.map((o) => (
        <Card key={o._id}><div className="flex items-center justify-between"><div><div className="font-semibold">Pedido #{o._id.slice(-6).toUpperCase()}</div><div className="text-xs muted">{fmtDate(o.createdAt, { day: 'numeric', month: 'long', year: 'numeric' })}</div></div><Badge tone={o.status === 'paid' ? 'brand' : 'amber'}>{o.status === 'paid' ? 'Pagado' : 'Pendiente de pago'}</Badge></div>
          <div className="mt-3 space-y-1 text-sm">{o.items.map((l: any) => <div key={l.productId} className="flex justify-between"><span>{l.qty} × {l.name}</span><span>{money(l.price * l.qty)}</span></div>)}<div className="flex justify-between border-t border-ink-100 pt-1 font-semibold dark:border-white/5"><span>Total</span><span>{money(o.total)}</span></div></div>
        </Card>
      ))}</div>}
    </div>
  );
}

function MyProducts() {
  const { data, isLoading } = useApi<any[]>('/shop/mine');
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({ name: '', description: '', price: 20, type: 'own', category: 'Cursos', affiliateUrl: '', merchant: '', stock: 10, passionTags: '', commissionRate: 0.05 });
  const create = useMut(() => post('/shop/products', { ...f, price: Number(f.price), stock: Number(f.stock), passionTags: f.passionTags.split(',').map((x: string) => x.trim()).filter(Boolean), affiliateUrl: f.type === 'affiliate' ? f.affiliateUrl : undefined }), { invalidate: ['/shop'], success: 'Producto enviado a revisión', onSuccess: () => setOpen(false) });
  return (
    <div>
      <div className="mb-4 flex justify-between gap-3"><p className="max-w-xl text-sm muted">Publica cursos, talleres o material. Todo pasa revisión: no se admiten fármacos, suplementos ni productos con promesas de salud.</p><Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>Nuevo producto</Button></div>
      {isLoading ? <Loading /> : <Card className="p-0"><table className="w-full text-sm"><thead><tr className="border-b border-ink-100 text-left text-xs muted dark:border-white/5"><th className="p-3">Producto</th><th>Tipo</th><th>Precio</th><th>Estado</th><th className="pr-3 text-right">Clics / ventas</th></tr></thead><tbody>{(data || []).map((p) => <tr key={p._id} className="border-b border-ink-100 last:border-0 dark:border-white/5"><td className="p-3 font-medium">{p.name}</td><td>{p.type === 'own' ? 'Propio' : 'Afiliado'}</td><td>{money(p.price)}</td><td><Badge tone={p.status === 'active' ? 'brand' : p.status === 'pending' ? 'amber' : 'rose'}>{p.status}</Badge></td><td className="pr-3 text-right">{p.clicks} / {p.sales}</td></tr>)}</tbody></table></Card>}
      <Modal open={open} onClose={() => setOpen(false)} wide title="Nuevo producto" footer={<Button loading={create.isPending} onClick={() => create.mutate(undefined)}>Enviar a revisión</Button>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Input label="Nombre" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="sm:col-span-2"><Textarea label="Descripción" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          <Select label="Tipo" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="own">Venta propia</option><option value="affiliate">Afiliado (enlace)</option></Select>
          <Input label="Categoría" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
          <Input label="Precio (€)" type="number" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
          {f.type === 'own' ? <Input label="Stock" type="number" value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} /> : <Input label="Tienda" value={f.merchant} onChange={(e) => setF({ ...f, merchant: e.target.value })} />}
          {f.type === 'affiliate' && <div className="sm:col-span-2"><Input label="Enlace de afiliado" value={f.affiliateUrl} onChange={(e) => setF({ ...f, affiliateUrl: e.target.value })} /></div>}
          <div className="sm:col-span-2"><Input label="Pasiones relacionadas (separadas por comas)" hint="futbol, yoga, guitarra…" value={f.passionTags} onChange={(e) => setF({ ...f, passionTags: e.target.value })} /></div>
          <p className="flex gap-2 text-xs muted sm:col-span-2"><Ban className="h-4 w-4 shrink-0 text-rose-500" />Se rechazan automáticamente productos con términos como medicamento, pastilla, suplemento, CBD o melatonina.</p>
        </div>
      </Modal>
    </div>
  );
}
