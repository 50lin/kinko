# Kinkō v1 · Plataforma de bienestar mental y seguimiento clínico

Aplicación completa para **pacientes, profesionales, clínicas, familias, empresas, investigadores/desarrolladores y administración**.
Una sola base de código React + Node que se publica como **web, PWA y apps nativas Android/iOS** (Capacitor).

> Kinkō no es un producto sanitario ni sustituye a la atención profesional. Ante una emergencia: **112**. Conducta suicida: **024**. Menores: **ANAR 900 20 20 10**.

## Qué incluye

| Área | Funciones |
|---|---|
| Paciente | Esfera Kinkō 3D (7 dimensiones), check-in diario guiado, 11 tests validados (PHQ-9, GAD-7, WHO-5, CBI, Rosenberg, UCLA-3, ASQ, AUDIT-C…) con cambio fiable (RCI), diario cifrado con fotos y dictado, **Kio** (IA de acompañamiento en 6 modos, con detección de riesgo y derivación), progreso y estadísticas, rutas de 7-14 días, biblioteca con guías por voz, mapa de pasiones, plan de tratamiento, citas y reserva, videollamada, dispositivos Bluetooth (pulso/HRV, tensión, báscula, termómetro, pulsioxímetro) y simulador, equipo de cuidado con consentimiento granular, tienda (afiliados + propia, sin fármacos), comunidad moderada, botón de ayuda/SOS. |
| Profesional | Triaje con semáforo, alertas (PHQ-9 ítem 9, ASQ, SOS, deterioro, patrón de recaída), ficha 360º: resumen pre-sesión, línea de vida con puntos ciegos, tests con respuestas, diario compartido, biometría, pasiones, resúmenes de Kio, patrones de recaída, **historia clínica SOAP cifrada con versiones**, editor del plan, mediciones programadas (ROM), agenda, vídeo con notas, contenido propio, facturación. |
| Clínica | Panel de centro (ocupación, ingresos, no-shows), equipo e invitaciones, agenda compartida, pacientes (vista administrativa sin datos clínicos), perfil público. |
| Familia | Evolución semanal del adolescente según lo que él/ella comparta, alertas de crisis siempre, citas, plan, chat con su profesional, guías, vinculación por código o alta del menor. |
| Empresa | Bienestar agregado y anónimo por departamento (k ≥ 10), código de alta para la plantilla. |
| Datos / desarrolladores | Insights API (k-anonimato + privacidad diferencial), claves sandbox/live con revisión del DPO, explorador visual, documentación, métricas de uso. |
| Admin | Resumen, usuarios, verificación de colegiación/centros/claves, moderación, contenido, **auditoría de accesos**, sistema y empresas. |

## Arquitectura

```
packages/core   Lógica de negocio isomorfa (TypeScript): API completa, motores clínicos, IA, seguridad, seed de demo.
apps/api        Servidor Node/Express + MongoDB + Socket.IO (producción). Cifrado AES-256-GCM, Argon2id, JWT rotativo.
apps/web        React 19 + Vite + Tailwind 4 + Three.js. Capacitor para Android/iOS. Build "demo" en un único HTML.
```
La misma API (`@kinko/core`) corre en el servidor **y** dentro del navegador en modo demo, así la demo de feria funciona sin internet ni servidor.

## Arrancar

### 1. Demo sin instalar nada
Abre `apps/web/dist-demo/index.html` (o el enlace publicado). Todo funciona en el navegador con datos ficticios. Contraseña de todas las cuentas: `Kinko2026!`.

### 2. Desarrollo local (PC)
Requisitos: Node 20+.
```bash
npm install
cp .env.example apps/api/.env      # opcional: sin cambios funciona con base de datos local en archivo
npm run dev                        # web http://localhost:5173 · API http://localhost:4000
npm test                           # 33 pruebas (motores clínicos, flujos de API, seguridad)
```
Desde el móvil en la misma wifi: `http://IP-de-tu-PC:5173`.

### 3. Con MongoDB en Docker
```bash
echo "JWT_SECRET=$(openssl rand -base64 48)" > .env
echo "DATA_ENCRYPTION_KEY=$(openssl rand -base64 32)" >> .env
docker compose up --build          # http://localhost:4000
```

### 4. Apps Android / iOS
```bash
cd apps/web
npx cap add android && npx cap add ios      # solo la primera vez
VITE_API_URL=https://api.tu-dominio.es npm run android   # abre Android Studio
VITE_API_URL=https://api.tu-dominio.es npm run ios       # abre Xcode (Mac)
```
Permisos a declarar: cámara y micrófono (vídeo), Bluetooth (dispositivos), notificaciones. Para Apple/Google, la app de salud mental necesita política de privacidad, descargo médico y contactos de crisis (ya incluidos).

## Cuentas de demostración
| Perfil | Email | Qué probar |
|---|---|---|
| Paciente adulto en tratamiento | mateo@kinko.app | Recaída en curso, plan, alertas, vídeo, dispositivos |
| Adolescente 16 años | lucia@kinko.app | Pasión por el fútbol sin apoyo familiar, permisos a la familia |
| Estudiante sin profesional | ana@kinko.app | Tests, Kio, directorio y reserva |
| Psicóloga clínica | elena@kinko.app | Triaje, ficha 360º, historia clínica, plan |
| Psiquiatra | mikel@kinko.app | Segunda opinión, chat entre profesionales |
| Clínica | clinica@kinko.app | Panel de centro, equipo, agenda |
| Padre | javier@kinko.app | Portal de familias |
| Analista de datos | dev@kinko.app | Insights API (clave sandbox `kk_test_demo_kinko2026`) |
| Empresa | empresa@kinko.app | Bienestar agregado de la plantilla |
| Administración | admin@kinko.app | Verificaciones, moderación, auditoría |

## Seguridad y cumplimiento (resumen)
- Contraseñas Argon2id; sesiones JWT de 15 min + renovación rotatoria con detección de reutilización (cookie httpOnly SameSite=Strict); 2FA TOTP (obligatoria para staff en producción); bloqueo tras 5 intentos.
- Cifrado en reposo AES-256-GCM con rotación de claves para diario, mensajes, Kio, notas clínicas (SOAP) y secretos 2FA; TLS en tránsito.
- Consentimiento granular por tipo de dato y fecha; auditoría de cada acceso a datos de pacientes; exportación y borrado (RGPD arts. 15, 17, 20); conservación bloqueada de historia clínica (Ley 41/2002).
- Menores: consentimiento parental < 16 años (LOPDGDD art. 7), su diario y Kio nunca visibles para la familia; alertas de crisis siempre.
- Datos para terceros solo agregados: k-anonimato (k=10), ruido de Laplace (ε=1), tamaños redondeados, consentimiento de investigación explícito y revocable.
- Validación estricta (zod), saneado anti-inyección NoSQL, límites de peticiones, CSP/HSTS, verificación de firma real de archivos, webhooks Stripe firmados.
- Antes de producción: EIPD (evaluación de impacto), DPO, contrato de encargado con proveedores (UE), pentest externo, ENS si se trabaja con sector público, y análisis MDR (la app evita diagnosticar para no ser producto sanitario).

## Variables de entorno
Ver `.env.example`. Sin `ANTHROPIC_API_KEY`, Kio usa un motor local sin conexión; sin `STRIPE_SECRET_KEY`, los pagos se simulan; sin `MONGODB_URI`, se usa una base de datos local en archivo.
