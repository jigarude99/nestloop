# PLAN MAESTRO — NestLoop (continuación del proyecto)

> **Instrucciones para el agente que lea esto:** Este documento es auto-contenido. Léelo completo antes de tocar código. Contiene el contexto del proyecto, el estado exacto en que quedó, los problemas detectados en una auditoría previa, y las fases de trabajo pendientes con criterios de aceptación. Ejecuta las fases en orden. No rehagas lo que ya funciona.

---

## 1. Contexto: qué es NestLoop y qué problema resuelve

NestLoop es una app para **la familia del usuario** (varias personas en una casa, varias de ellas **poco tecnológicas**). Hoy gestionan todo informalmente:

- **Turnos rotativos** (ej. comprar el agua) se marcan en una pizarra física con ganchitos: cuando alguien compra, se marca, y le toca al siguiente de la lista; al llegar al último se borra todo y se reinicia.
- **Gastos compartidos** (ej. compras en Walmart) se pasan por foto de factura en el chat de WhatsApp con un "esto se divide entre tantos".
- **Horarios** (ej. uso de la lavadora) se asignan verbalmente por días.

### Requisitos funcionales que pidió el usuario

1. Cada miembro de la casa tiene su **perfil/cuenta** para entrar.
2. **Crear un gasto** con foto de la factura, quién pagó, fecha, y entre quiénes se divide.
3. División del gasto: **partes iguales o montos específicos por persona**.
4. A cada persona le aparece **lo que debe**, cuánto, y un poco de info del gasto (no demasiado detalle).
5. **Pagar con comprobante**: subir captura de la transferencia, o marcar "entregué efectivo".
   - **Regla clave**: pago por transferencia con comprobante → se marca confirmado automáticamente. Pago en efectivo → el que cobró debe **aceptarlo manualmente** para confirmarse.
6. **Turnos rotativos** (el del agua primero) con avance automático al siguiente.
7. **Calendario/horario de lavadora** por persona y día.
8. **Requisito de diseño explícito y muy importante**: la app debe ser *extremadamente* simple e intuitiva visualmente, "un gozo visual", con botones grandes, porque la van a usar personas que no saben usar tecnología. El usuario los va a ayudar, pero la app no puede ser un dolor de cabeza.

---

## 2. Estado actual (verificado el 2026-06-10)

### Infraestructura ✅ (ya montada, NO rehacer)

- **Repo GitHub**: `jigarude99/nestloop` (rama `main`, 3 commits).
- **Deploy Vercel**: https://nestloop-eight.vercel.app — funciona, carga bien en desktop y móvil, badge "Cloud ready" visible.
- **Supabase**: proyecto activo en `https://zzaqgynyezsgcbdynekc.supabase.co`. El schema de `docs/supabase-schema.sql` ya fue ejecutado, más dos fixes (`docs/supabase-fix-rls.sql` por recursión infinita en RLS, y `docs/supabase-fix-grants.sql` por grants de API). La REST API responde 200.
- **Storage**: existe el bucket `receipts` (privado), creado manualmente. **Sin políticas todavía.**
- **Variables de entorno**: `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` configuradas en `.env.local` (ignorado por git) y en Vercel (Production + Preview + Development).
- **Acceso del agente**: hay conectores MCP de Supabase y Vercel disponibles — se pueden ejecutar migraciones SQL directamente con `apply_migration` / `execute_sql` sin pedirle al usuario que copie SQL a mano.

### Código

- **Stack**: Next.js 16.2.9 (App Router), React 19, TypeScript, CSS propio en `app/globals.css` (no Tailwind), `lucide-react` para iconos, `@supabase/supabase-js` 2.108.1. PWA con manifest y service worker (`components/RegisterServiceWorker.tsx`).
- **`components/NestLoopApp.tsx`** (1,619 líneas): TODA la app vive aquí. Vistas: Home, Bills (gastos), Turns (turnos), horario de lavadora, People (balances). UI pulida y mobile-first.
- **`lib/supabase.ts`**: crea el cliente de Supabase pero **solo se usa para mostrar el badge "Cloud ready"**. Ningún dato pasa por Supabase.
- **Persistencia actual**: `localStorage` del navegador (hook `useStoredState`), sembrado con datos demo (`DEMO_EXPENSES`, `DEMO_ROTATIONS`, `DEMO_SLOTS`). Cada navegador tiene sus propios datos: **no hay datos compartidos reales, no hay login, las fotos solo guardan el nombre del archivo (no se suben a ningún lado)**.

### Schema de base de datos (ya aplicado en Supabase)

Tablas: `households`, `profiles` (FK a `auth.users`), `household_members` (con rol admin/member), `expenses` (con `receipt_path`, montos en centavos), `expense_shares` (con `status` pending/sent/confirmed/rejected, `payment_method` transfer/cash/other, `proof_path` — **el modelo de pagos vive aquí, no hace falta tabla aparte**), `task_rotations`, `task_rotation_members`, `task_events`, `schedule_slots`. Todas con RLS habilitado.

---

## 3. Problemas detectados (auditoría) — esto es lo que hay que corregir

1. **Tablas inaccesibles por RLS sin políticas**: `task_rotations`, `task_rotation_members`, `task_events` y `schedule_slots` tienen RLS habilitado pero **cero políticas** → la API las bloquea por completo. Los módulos de turnos y lavadora no podrán funcionar con datos reales hasta arreglarlo.
2. **Faltan políticas de escritura**: no hay INSERT en `expense_shares` (no se pueden crear las divisiones al crear un gasto), ni INSERT/UPDATE/DELETE en households, members, rotations, slots, etc. Solo existen: SELECT en households/members/profiles/expenses/shares, INSERT en expenses, y UPDATE del propio share.
3. **Bucket `receipts` sin políticas de Storage**: nadie puede subir ni leer fotos. Hacen falta políticas sobre `storage.objects` (subir a carpeta del household, leer solo miembros del household).
4. **No hay trigger de creación de perfil**: cuando alguien se registre con Supabase Auth, no se crea su fila en `profiles`. Hace falta un trigger `on auth.users insert` (security definer) o crear el perfil desde la app tras el signup.
5. **No hay flujo de onboarding al household**: nada conecta una cuenta nueva con el household de la familia. Decisión recomendada: el usuario (admin) crea las cuentas de su familia él mismo, o se usa un código de invitación simple.
6. **UI en inglés** ("Home", "Bills", "Turns", "Shared groceries"): la familia es hispanohablante y poco tecnológica. **Traducir toda la UI al español** (o i18n simple con español por defecto).
7. **Monolito de 1,619 líneas**: dividir `NestLoopApp.tsx` en módulos al conectar datos reales (por vista: gastos, pagos, turnos, horario, personas + hooks de datos).
8. **Estrategia de login no definida**: para gente no tecnológica usar **email + contraseña** (el admin las configura y las reparte), con sesión persistente para que solo hagan login una vez por dispositivo. Evitar magic links (requieren abrir el correo cada vez).

---

## 4. Fases pendientes

> Las fases 1–6 del plan original (diseño, base técnica, UI, schema inicial, deploy en Vercel, y entrega) están hechas o parcialmente hechas como se describe arriba. Continuar desde aquí.

### Fase 7 — Reparar la base de datos ✅ COMPLETADA (2026-06-10)

Aplicada vía MCP. SQL consolidado guardado en `docs/supabase-phase7.sql`. Resultado:
- Políticas RLS completas en TODAS las tablas (turnos y horarios ya no están bloqueados); CRUD por household, escritura de divisiones de gasto, gestión de miembros por admin.
- Storage: políticas para buckets `receipts` y `payment-proofs` (acceso solo a miembros del household; convención de ruta `<household_id>/...`).
- Trigger `on_auth_user_created` → crea `profiles` al registrarse.
- Onboarding: columna `households.invite_code` + RPC `create_household(p_name)` y `join_household(p_invite_code)` (SECURITY DEFINER, sortean el bootstrap de RLS).
- Helpers nuevos: `is_household_admin`, `can_manage_expense`, `can_access_rotation`.
- **Prueba E2E pasada** (8/8): trigger crea perfiles, aislamiento entre households, escritura en todas las tablas del propio household, bloqueo de escritura cruzada. `get_advisors` security: solo WARN aceptados (funciones SECURITY DEFINER expuestas como RPC = patrón estándar RLS; trigger y onboarding endurecidos).

**Nota para Fase 8/9 (contrato de datos ya disponible):**
- Registro de usuario: pasar `full_name` en `options.data` del `signUp` para que el trigger lo use.
- Crear la casa: `supabase.rpc('create_household', { p_name })`.
- Unirse a una casa: `supabase.rpc('join_household', { p_invite_code })`.
- Subir archivos SIEMPRE con ruta que empiece por el `household_id`: ej. `receipts` → `${householdId}/${expenseId}/factura.jpg`; `payment-proofs` → `${householdId}/${shareId}/comprobante.jpg`.
- Flujo efectivo/transferencia: la política UPDATE de `expense_shares` permite que el participante actualice su propio share (marcar `sent`) y que el `paid_by` del gasto confirme/rechace (status `confirmed`/`rejected`).

<details><summary>Detalle original de la Fase 7 (referencia)</summary>

Aplicar una migración (vía MCP `apply_migration` directamente) que incluya:

1. Políticas RLS completas para `task_rotations`, `task_rotation_members`, `task_events`, `schedule_slots`: SELECT/INSERT/UPDATE/DELETE para miembros del household correspondiente. **Cuidado con la recursión**: usar la misma técnica del fix anterior (`docs/supabase-fix-rls.sql` usa una función `security definer` tipo `is_household_member()` para evitar la recursión infinita en `household_members` — reutilizarla).
2. INSERT en `expense_shares` para miembros del household; UPDATE del share propio ya existe (verificar que cubra el flujo de confirmación: quien cobró confirma shares de otros → puede requerir política adicional para que el `paid_by` del expense pueda actualizar status de los shares de su gasto).
3. Políticas de `storage.objects` para el bucket `receipts`: rutas `household_id/...`, INSERT y SELECT solo para miembros de ese household.
4. Trigger para crear `profiles` automáticamente al registrarse un usuario (tomar `full_name` de `raw_user_meta_data`).
5. Políticas INSERT/UPDATE para `households` y `household_members` que permitan el onboarding (crear casa, unirse con invitación) sin romper la seguridad.
6. Guardar el SQL final también en `docs/` y commitearlo.

**Criterio de aceptación**: con un usuario autenticado de prueba, se puede leer/escribir en todas las tablas de su household vía REST, y subir/leer un archivo en `receipts`. Un usuario de otro household NO ve nada. Correr `get_advisors` de Supabase para validar seguridad.

</details>

### Fase 8 — Autenticación y familia ✅ COMPLETADA (2026-06-11)

Implementada con auth client-side (`@supabase/supabase-js`, sesión persistida en localStorage). Archivos nuevos: `lib/supabase.ts` (cliente singleton), `lib/household.ts` (tipos + mapeo a `Person`), `components/AuthProvider.tsx` (contexto: sesión/perfil/casa/miembros + acciones), `components/AuthScreen.tsx` (login/registro), `components/HouseholdSetup.tsx` (crear/unirse), `components/AuthGate.tsx` (orquesta loading/signed-out/no-household/ready). `components/NestLoopApp.tsx` reescrito: recibe personas + usuario reales (sin switcher demo; barra superior con usuario, código de invitación y cerrar sesión), datos por casa en localStorage (vacíos), y **toda la UI traducida al español**.

- **Build OK** (compila + TypeScript). **Validado E2E contra Supabase real**: login → trigger crea perfil → `create_household` → lecturas anidadas correctas; datos de prueba limpiados. **Verificado visualmente** (login desktop + móvil).
- Onboarding usado: **código de invitación** (el admin crea la casa y comparte el código de 6 caracteres; cada quien se registra y elige "Unirme con código"). Crear cuentas por el admin (admin API) se deja fuera por requerir service_role.
- ⚠️ **PENDIENTE MANUAL (1 clic):** la confirmación de correo está ACTIVADA en Supabase. Para onboarding sin fricción, desactivarla en Dashboard → Authentication → Sign In/Providers → Email → apagar "Confirm email". El código maneja ambos casos.

<details><summary>Plan original de la Fase 8 (referencia)</summary>

1. Activar email+password en Supabase Auth (desactivar confirmación por email si complica, o usar cuentas pre-creadas por el admin).
2. Pantalla de login en español, ultra simple: campos grandes, un botón, mensajes de error claros y amables.
3. Flujo de primera vez: el admin (el usuario) crea su cuenta → crea el household ("la casa") → crea/invita a los miembros. Mantenerlo simple: una pantalla de administración mínima.
4. Sesión persistente (Supabase ya la maneja con localStorage) — la familia hace login UNA vez por teléfono.
5. El switcher de "persona actual" del demo se reemplaza por el usuario autenticado real.

**Criterio de aceptación**: dos usuarios distintos en dos navegadores ven el mismo household con sus respectivas identidades.

</details>

### Fase 9 — Conectar datos reales ✅ COMPLETADA (2026-06-11)

Toda la app dejó de usar localStorage y ahora lee/escribe en Supabase. Capa de datos en `lib/api.ts` (gastos, divisiones, pagos, turnos, eventos, horarios + URLs firmadas para fotos). `components/NestLoopApp.tsx` reescrito: carga datos por casa al montar, formularios async con estado "Guardando…" y errores amables, subida real de fotos (factura → bucket `receipts`, comprobante → `payment-proofs`, ruta `<household_id>/...`), y `SignedImage` para mostrar fotos de buckets privados. Migración `phase9_rotation_icon_and_events`: columna `icon` en `task_rotations` + se relajó la política INSERT de `task_events` para que cualquier miembro pueda marcar un turno hecho.

- **Build OK**. **Validado E2E por REST** (gasto+divisiones, marcar pago, turno+miembros+evento+avance, horario con tipo `time`, **subida real a Storage** OK, subida cruzada BLOQUEADA). **Verificado en navegador real**: login → crear casa → crear gasto → se guarda en Supabase y aparece; sin errores de consola.
- Horario de lavadora ahora usa selector de hora (`type="time"`), más fácil que escribir "6:00 PM".
- Flujo efectivo/transferencia funcionando: transferencia con comprobante → confirmado; efectivo → "Por aprobar" hasta que quien cobró acepte/rechace.

<details><summary>Plan original de la Fase 9 (referencia)</summary>

Orden recomendado (de mayor a menor valor):

1. **Gastos + divisiones**: crear gasto → INSERT en `expenses` + `expense_shares`; subir foto de factura a Storage; listar gastos del household con sus shares. Reemplazar `DEMO_EXPENSES`/localStorage.
2. **Pagos + comprobantes**: marcar share como pagado; transferencia con comprobante → `confirmed` directo; efectivo → `sent` hasta que el cobrador lo confirme o rechace. Subir captura a Storage.
3. **Turnos rotativos**: CRUD de rotaciones, marcar "comprado/hecho" → registra `task_event` y avanza `current_index` al siguiente.
4. **Horario de lavadora**: CRUD de `schedule_slots`.

Durante esta fase:
- **Dividir `NestLoopApp.tsx`** en componentes por vista + hooks de datos (`useExpenses`, `useRotations`, etc.).
- **Traducir toda la UI al español.**
- Mantener estados de carga/error visibles pero amables (la familia no debe ver errores técnicos crudos).
- Considerar Realtime de Supabase (suscripciones) para que los cambios se vean al instante entre miembros — opcional, un refetch al volver a la vista es suficiente para v1.

**Criterio de aceptación por módulo**: el dato creado en un navegador aparece en otro navegador con otro usuario; las fotos se suben y se ven; el flujo efectivo-requiere-confirmación funciona de punta a punta. Verificar también en el deploy de Vercel, no solo local.

</details>

**Diferido a futuro (no bloquea):** dividir `NestLoopApp.tsx` en archivos por vista (sigue siendo monolito, ~1300 líneas) y Realtime de Supabase (hoy se recarga tras cada acción; suficiente para v1). Mostrar comprobantes de pago con `SignedImage` en cada fila (hoy solo se muestra la factura del gasto).

### Fase 10 — Entrega a la familia ✅ COMPLETADA (2026-06-11)

**La familia ya está registrada y usando la app en producción.** El usuario (Gandhi) creó su casa real (se ve código de invitación activo) y los miembros entraron. A partir de aquí: **⚠️ HAY DATOS REALES EN LA BASE — ver advertencia al inicio de la Fase 11.**

<details><summary>Detalle de la Fase 10 (referencia)</summary>

### Fase 10 (detalle original) 🟡

Hecho por código:
- **Logo unificado y rediseñado**: una casa (nido) dentro de un bucle, coronada por un sol, en `public/icon.svg` (ícono instalado/PWA + favicon) y en `components/BrandGlyph.tsx` (logo dentro de la app). Antes había dos diseños distintos (nube+más vs. flecha-bucle); ahora los tres lugares (instalado, navegador, dentro de la app) usan el mismo. Se quitó el sol duplicado del CSS de `.brand-mark`. `manifest.json` en español, con purposes `any` + `maskable`.
- **Guía de ayuda en español** dentro de la app: botón "?" en la barra superior abre un modal con 6 pasos (agregar gasto, pagar, confirmar efectivo, turnos, lavadora, invitar). Verificado visualmente en móvil.
- Base de datos dejada **impecable** (0 datos) para el primer registro real del usuario.

Pendiente (acciones del usuario, no código):
1. Desactivar "Confirm email" en Supabase (1 clic) para registro sin fricción.
2. El admin crea su cuenta + casa y comparte el código; cada miembro se registra y se une.
3. Instalar como app (Add to Home Screen) en los teléfonos y prueba guiada con un gasto real.

<details><summary>Plan original de la Fase 10 (referencia)</summary>

> **Onboarding = autoservicio con código de invitación** (decidido en Fase 8). El admin NO crea cuentas ajenas (requeriría service_role, inseguro en cliente). Cada miembro crea su propia cuenta y se une con el código de 6 caracteres.

1. El admin crea su cuenta + la casa, y comparte el código de invitación con la familia.
2. Cada miembro se registra solo y entra el código (con ayuda presencial del admin si hace falta).
3. Verificar deploy final en Vercel y la instalación PWA en iPhone y Android (Add to Home Screen).
4. Mini-guía visual en español (puede ser una página `/ayuda` dentro de la app) con: cómo entrar, cómo poner un gasto, cómo pagar, cómo confirmar efectivo, cómo marcar el turno del agua.
5. Prueba guiada con un gasto real de la casa.
6. (Recordatorio) Desactivar "Confirm email" en Supabase para que el registro sea sin fricción.

</details>

</details>

### Fase 11 — Pulido tras el estreno ✅ COMPLETADA (2026-06-11)

Hecho y verificado (build + pruebas REST de servidor + verificación en navegador móvil con un usuario/casa de prueba aislados; datos de la familia intactos): 11.1 barra superior móvil sin superposición (quitado el `position:absolute`; código de invitación oculto ≤540px con especificidad `.top-actions .code-pill`). 11.2 sesión robusta en `AuthProvider` (deferir `loadFor` fuera del callback de `onAuthStateChange` para evitar el deadlock de supabase-js; try/catch con reintentos; no recargar en `TOKEN_REFRESHED`; estado `error` con pantalla "Reintentar" en `AuthGate`) + `sw.js` con `skipWaiting`/`clients.claim`/cache `v3`. 11.3 turnos: RPC `complete_rotation`/`undo_rotation` que validan en servidor que solo el dueño marca/deshace; UI con botón deshabilitado "Le toca a X" y "Deshacer mi turno"; políticas de `task_events` endurecidas. 11.4 "Lavadora"→"Horarios" + campo "¿Para qué?". 11.5 rediseño de tarjetas de horario (barra de color, ancho completo, hora formateada). 11.6 editar/eliminar gastos (en el detalle), turnos y horarios (menú al mantener apretado o botón ⋮ / tocar, con confirmación de dos pasos). 11.7 colores distintos por persona (migración reparte paleta + trigger asigna a nuevos). 11.8 pulido: stats compactas en móvil, animación de modales, feedback al tocar.

<details><summary>Detalle del plan original de la Fase 11 (referencia)</summary>

> ## ⚠️ ADVERTENCIA CRÍTICA: YA HAY DATOS REALES
> La familia del usuario ya tiene cuentas, casa, y datos reales en Supabase. **PROHIBIDO** ejecutar borrados globales (`delete from households`, `delete from auth.users`, etc.) como se hacía en fases anteriores. Para pruebas E2E: crear UN usuario de prueba con email `*@test.local` y SU PROPIA casa de prueba, y al terminar borrar SOLO ese usuario y SOLO esa casa por id/email exacto. Verificar los conteos antes y después. Las migraciones de schema son seguras; los datos no se tocan.

Ejecutar los bloques en orden. Build + verificación visual móvil (preview 375px) por bloque; commit y push por bloque.

#### 11.1 Arreglar la barra superior en móvil (se superponen los elementos)

**Síntoma** (foto del usuario en su teléfono): el código de invitación se monta sobre el logo, el avatar queda cortado, todo apiñado.
**Causa exacta**: en `app/globals.css` (~línea 1140), en `@media (max-width: 1100px)` el `.top-actions` queda `position: absolute; right: 26px; top: 14px;` flotando sobre la fila del `.mobile-brand`. Con 5 elementos (sync-pill, code-pill, person-chip, notification-pill, ayuda, salir) no caben y se encima.
**Arreglo propuesto**: eliminar el posicionamiento absoluto; hacer `.top-bar` una sola fila flex (marca a la izquierda, acciones a la derecha) con `flex-wrap` o reducción progresiva. En pantallas angostas (≤540px) **ocultar el `.code-pill`** (el código ya se muestra grande en la vista Personas, que es su lugar natural) y dejar: marca + avatar + pendientes + ayuda + salir. Verificar también que no se rompa en tablet (768) y desktop.

#### 11.2 Sesión que "se cierra sola" + pantalla que se queda cargando

El usuario reporta: (a) si pasa un rato fuera de la app, al volver le pide entrar de nuevo; (b) una vez se quedó en "Cargando tu casa…" para siempre. **No hace falta un botón "mantener sesión"** — Supabase ya persiste la sesión; hay que arreglar los bugs que la hacen parecer cerrada:

1. **Deadlock conocido de supabase-js v2** en `components/AuthProvider.tsx` (~línea 119): el callback de `onAuthStateChange` llama `loadFor()` que hace queries con el mismo cliente → el lock interno de auth puede trabarse (causa de la pantalla colgada). Arreglo estándar: diferir el trabajo fuera del callback (`setTimeout(() => loadFor(s), 0)`).
2. **`loadFor` no maneja errores**: si una query lanza/rechaza (red móvil inestable), `status` se queda en `"loading"` para siempre. Envolver en try/catch: ante fallo, reintentar 1-2 veces y si no, mostrar estado de error con botón "Reintentar" (no expulsar al login).
3. **Cada `TOKEN_REFRESHED` resetea a `"loading"` y recarga todo**: al volver a la app tras un rato, el token se refresca y el usuario ve la pantalla de carga (y si pega con el deadlock, se cuelga → parece "sesión cerrada"). Arreglo: solo poner `"loading"`/recargar en eventos `SIGNED_IN` y `SIGNED_OUT`; en `TOKEN_REFRESHED` solo actualizar `session` sin tocar `status`.
4. **No tratar `null` transitorio como logout**: solo pasar a `signed-out` ante el evento `SIGNED_OUT` explícito o `getSession` null estable.
5. **Service worker** (`public/sw.js`): añadir `self.skipWaiting()` en install y `clients.claim()` en activate, y subir `CACHE_NAME` (ej. `nestloop-v2`) en cada cambio del SW, para que los teléfonos no queden atrapados en versiones viejas (esto también afecta el ícono y los deploys).
6. Verificar en Supabase Dashboard → Authentication → Sessions que NO esté activado "Time-box user sessions" ni "Inactivity timeout" (por defecto están apagados; si están encendidos, apagarlos — eso sí cerraría la sesión).

**Criterio de aceptación**: con sesión iniciada, cerrar la pestaña/app, esperar >1h (o forzar expiración del access token), volver a abrir → entra directo sin login y sin quedarse cargando.

#### 11.3 Turnos: solo el dueño del turno puede marcar "hecho" + botón deshacer

- **UI** (`RotationCard` en `components/NestLoopApp.tsx`): si `currentUserId !== rotation.queue[rotation.currentIndex]`, el botón "Marcar hecho" se deshabilita y muestra "Le toca a {nombre}". Solo el dueño del turno lo ve activo.
- **Servidor (recomendado)**: crear dos RPC `SECURITY DEFINER` en una migración — `complete_rotation(p_rotation_id uuid)` que valida server-side que `auth.uid()` ES el del turno actual, inserta el `task_event` y avanza `current_index` atómicamente; y `undo_rotation(p_rotation_id uuid)` que valida que el último `task_event` es de `auth.uid()`, lo borra y retrocede `current_index`. Cambiar `lib/api.ts` para usar estos RPC en vez de insert+update sueltos.
- **Endurecer políticas**: la migración `phase9_rotation_icon_and_events` relajó el INSERT de `task_events` a cualquier miembro — revertir a `profile_id = auth.uid()`; y el DELETE restringirlo a `profile_id = auth.uid()` (para el deshacer). Con los RPC, esto es defensa en profundidad.
- **UI deshacer**: tras marcar hecho, mostrar en la tarjeta un botón "Deshacer" (visible solo para quien hizo el último evento, mientras sea el último). Con confirmación no hace falta; es reversible por naturaleza.

#### 11.4 Renombrar "Lavadora" → "Horarios"

La sección sirve para horarios en general, no solo lavadora. Cambiar en `components/NestLoopApp.tsx`: ítem de navegación (`NAV_ITEMS`), títulos de la vista ("Semana de lavadora" → algo como "Horarios de la semana"), el eyebrow del formulario, el texto del paso correspondiente en `HelpSheet`, y el `label` por defecto que se inserta en BD (`createSlot` en `lib/api.ts` y el placeholder "Lavadora"). El usuario podría querer poner un campo "¿Para qué?" (etiqueta libre del turno, ej. "Lavadora", "Cocina") — añadirlo como input opcional con default "Lavadora".

#### 11.5 Diseño de las tarjetas del horario (slot dentro del día)

El usuario reporta que el cuadro de turno dentro del día no se ve centrado ni estético. Revisar `.day-card` y `.slot-pill` en `app/globals.css`: alinear el contenido, padding consistente, que el pill ocupe el ancho completo de la tarjeta del día, avatar y texto bien alineados verticalmente, hora con tipografía menor pero legible. Verificar en móvil (la grilla de 7 días pasa a 1 columna) y en desktop.

#### 11.6 Eliminar y editar gastos, turnos y horarios

Hoy no se puede borrar nada (el usuario creó dos turnos de agua por error y no puede quitar uno).

- **Interacción**: mantener apretado (long-press ~500ms, también clic derecho en desktop) sobre una tarjeta de gasto, turno u horario abre un menú simple: "Editar" / "Eliminar". **Además**, para que sea descubrible por gente no tecnológica, poner un botón visible "Eliminar" (y "Editar" donde aplique) dentro del detalle del gasto y en las tarjetas de turno/horario (ej. ícono de lápiz/papelera discreto). Confirmación en español antes de borrar ("¿Seguro que quieres eliminar este gasto? Esta acción no se puede deshacer.").
- **Permisos** (las políticas ya existen de Fase 7, verificar): gastos → borra quien lo creó o pagó (`creator deletes expense`); turnos y horarios → cualquier miembro. En la UI, ocultar "Eliminar" del gasto si el usuario no es creador/pagador.
- **API** (`lib/api.ts`): añadir `deleteExpense`, `updateExpense` (+ reconciliar shares: borrar e insertar de nuevo — políticas `managers create/delete shares` ya existen), `deleteRotation`, `updateRotation` (+ reemplazar miembros), `deleteSlot`, `updateSlot`.
- **Editar gasto**: reusar `ExpenseForm` con valores iniciales (modo edición). Si cambia el total o participantes, regenerar las divisiones (advertir que se reinician los estados de pago si cambia el monto).
- **Storage**: al borrar un gasto, borrar también su foto de factura y comprobantes asociados (best-effort).

#### 11.7 Bug de colores: todos los avatares salen verdes

`profiles.color` tiene default `'#0f9f7a'` (no null), así que `toPerson` en `lib/household.ts` nunca usa la paleta por índice → **todos los miembros tienen el mismo color verde** (se pierde la distinción visual por persona, importante para la familia). Arreglo en dos partes: (a) migración que reparte colores distintos a los perfiles existentes (UPDATE por orden de creación con la paleta de `lib/household.ts`); (b) que los nuevos perfiles reciban color automático distinto — opción simple: en el trigger `handle_new_user`, elegir color rotando la paleta; o quitar el default y dejar que el cliente asigne por índice. Bonus opcional: dejar que cada quien elija su color en un mini-perfil.

#### 11.8 Repaso general de diseño (mejoras sugeridas, aplicar con criterio)

Auditoría visual completa en móvil (la familia usa teléfonos). Sugerencias concretas detectadas:
- **Jerarquía del Inicio**: las 3 tarjetas de stats en móvil quedan muy altas y empujan el contenido útil; considerar compactarlas (fila horizontal de 3 mini-tarjetas).
- **Contraste y tamaño**: revisar textos `--muted` sobre fondos suaves (legibilidad para mayores); botones principales ya son grandes, mantener.
- **Consistencia de íconos y tonos**: cada vista tiene su tono (coral gastos, sky turnos, etc.) — aplicarlo de forma consistente en encabezados.
- **Pulido del hero**: la frase del hero es larga en móvil; valorar versión más corta.
- **Microinteracciones**: estados hover/active en tarjetas, transición suave al abrir modales.
- **Pantalla de carga**: sustituir el empty-state de "Cargando tu casa…" por skeletons suaves de tarjetas (se siente más rápido).
- **NO cambiar** la identidad (colores de marca, logo, estilo cálido) — solo refinar. Cualquier rediseño grande, proponerlo al usuario antes.

**Verificación final de la fase**: build OK; probar en preview móvil el flujo completo (entrar, crear/editar/borrar gasto y turno, marcar/deshacer turno, horarios); revisar consola sin errores; push y verificación en el deploy real de Vercel; datos reales de la familia intactos (conteos iguales antes/después salvo lo que el flujo de prueba creó y borró en su propia casa de prueba).

</details>

### Fases 12–14 — Hechas por Codex (2026-06-11/12) ✅

Trabajo realizado por el agente Codex (documentado en `docs/supabase-phase12..14*.sql`):
- **Fase 12**: propiedad de horarios (`schedule_slots.created_by` + políticas: solo el creador o un admin edita/borra).
- **Fase 13**: privacidad de gastos (`hidden_from_non_participants`, política `can_read_expense` la respeta) y **"Pagar por todos"** (RPC `pay_expense_for_everyone`: archiva el gasto original y crea un gasto de reembolso para los que deben).
- **Fase 14**: **notificaciones push reales** (tablas `push_subscriptions`/`notification_deliveries`/`notification_preferences`, triggers que encolan avisos por gasto/confirmación/turno/horario, recordatorios cada 3 días, RPCs `collect_due_push_notifications`/`mark_push_notifications_sent` validados por secreto SHA-256, ruta `/api/notifications/push` con web-push y cron diario en `vercel.json`, campana con historial en la UI). Claves VAPID y `NOTIFICATION_CRON_SECRET` configuradas en Vercel (verificado: el endpoint responde 401 sin auth, no 500). Familia actual: 5 miembros, 2 suscripciones push activas, envíos reales confirmados (`send_count > 0`).

### Fase 15 — Revisión integral post-Codex ✅ COMPLETADA (2026-06-12)

Auditoría completa del código de las fases 12–14 + arreglos (verificado: build, flujo completo en navegador móvil con usuario/casa de prueba aislados y luego borrados, consola sin errores, datos de la familia intactos):

1. **Cron de recordatorios arreglado**: Vercel Cron manda `Authorization: Bearer ${CRON_SECRET}` (esa env var exacta); la ruta solo aceptaba `NOTIFICATION_CRON_SECRET` → el cron diario daba 401 en silencio. Ahora la ruta acepta ambas variables y también identifica el user-agent `vercel-cron/` (riesgo bajo: solo dispara envíos ya vencidos e idempotentes).
2. **Registro de push robusto en teléfonos compartidos**: nuevo RPC `register_push_subscription` (SECURITY DEFINER) reasigna el endpoint del navegador al usuario actual; antes el upsert fallaba con RLS si la suscripción era de otro miembro. Cliente actualizado. (`docs/supabase-phase15-push-register-day-names.sql`)
3. **Aviso de horario con nombre de día** ("el martes" en vez de "el dia 2").
4. **Barra superior móvil rediseñada**: solo campana + avatar (botón de perfil). Nueva **hoja "Mi perfil"**: casa, código de invitación (copiar), activar avisos, guía de uso y cerrar sesión. Se eliminaron de la barra el sync-pill, code-pill, ayuda y salir.
5. **Modales arreglados de raíz**: componente común `ModalBackdrop` + `useBodyScrollLock` (bloqueo de scroll del fondo robusto en iOS), centrado vertical (`place-items: center`), `overscroll-behavior: contain`; tocar fuera cierra las hojas informativas pero NO los formularios (no se pierde lo escrito).
6. **Horario de otra persona ya no se ve "apagado"** (el estilo global de botón deshabilitado lo desteñía).
7. **Editar un turno conserva el orden original** de la rotación (antes se reordenaba según la lista de personas).
8. **Ícono maskable regenerado con zona segura** (Android ya no recorta el dibujo en íconos circulares); `maximumScale` eliminado del viewport (accesibilidad: la familia puede hacer zoom); service worker a v10.

---

## 5. Reglas de trabajo para el agente

- **Idioma**: responder al usuario siempre en español. El usuario no es programador: explicar en términos simples y guiarlo paso a paso cuando tenga que hacer algo manual (con instrucciones exactas de qué click dar).
- **Autonomía**: hacer todo lo posible directamente (migraciones vía MCP de Supabase, commits, push a GitHub que dispara el deploy de Vercel). Solo pedirle al usuario lo que de verdad requiere su intervención manual.
- **No degradar el diseño**: el nivel visual actual es bueno; cualquier pantalla nueva debe estar al mismo nivel. Mobile-first siempre, botones grandes, lenguaje no técnico en la UI.
- **Commits**: pequeños y por módulo, push a `main` (despliega automático en Vercel). Probar el build (`npm run build`) antes de pushear.
- **Seguridad**: nunca commitear `.env.local` ni keys secretas; el anon key publishable es público por diseño, eso está bien.
- **Verificación**: después de cada fase, probar contra el deploy real de Vercel, no solo localhost.
