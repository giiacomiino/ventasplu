# Login y roles para ventas-plu

## Contexto

`ventas-plu` es una SPA (Vite + React 19 + Supabase) para registrar ventas diarias por producto de La Trattoria. Actualmente no tiene ningún control de acceso: la anon key de Supabase tiene política RLS `allow_all` en `productos`, `precios` y `ventas_plu`, por lo que cualquiera con la URL puede leer y escribir todo.

Este proyecto es independiente de VURA (el SaaS financiero en Bubble.io del que forma parte conceptualmente el módulo "Ventas por PLU"). VURA maneja 5 roles (Owner, Admin, Proveedores, Pagos, RH) para sus 11 módulos; `ventas-plu` solo cubre uno de esos módulos, así que no se replica ese esquema completo — solo los 3 roles que hoy usan esta app.

Actualmente la persona que llena los datos es la encargada de RH. Giacomo (Owner) quiere poder invitar usuarios y controlar quién entra, sin depender de una service_role key expuesta ni de infraestructura de servidor nueva (el sitio se despliega estático, vía GitHub Pages/Vercel).

## Objetivo

Agregar autenticación con Supabase Auth y un esquema simple de 3 roles (Owner, Admin, RH) que:
1. Bloquea el acceso público actual (RLS abierta).
2. Permite que Owner, Admin y RH usen la app exactamente igual (un solo módulo, mismo acceso funcional).
3. Da a Owner una pantalla para invitar usuarios, asignarles rol, y revocar acceso — sin necesitar backend adicional ni exponer credenciales admin en el cliente.

## Arquitectura de autenticación

- **Supabase Auth** (email + password) vía `supabase.auth.signUp` / `signInWithPassword`, ya disponible con la dependencia `@supabase/supabase-js` existente.
- **Tabla `profiles`**: `id uuid PK references auth.users(id) on delete cascade`, `email text`, `rol text check (rol in ('owner','admin','rh'))`, `created_at timestamptz default now()`.
- **Tabla `invitaciones`**: `email text PK`, `rol text check (rol in ('owner','admin','rh'))`, `invitado_por uuid references profiles(id)`, `created_at timestamptz default now()`.
- **Trigger `BEFORE INSERT` en `auth.users`**: si `NEW.email` no existe en `invitaciones`, lanza excepción y bloquea el signup (nadie puede autoregistrarse sin invitación previa).
- **Trigger `AFTER INSERT` en `auth.users`**: si el email sí estaba invitado, crea la fila en `profiles` con el rol de la invitación y borra la invitación usada.
- Este patrón evita necesitar la `service_role` key en el cliente o una Supabase Edge Function — todo el control de alta de usuarios vive en RLS + triggers de Postgres, y funciona igual sin importar dónde se hostee el frontend estático.

## Modelo de roles y permisos

- **Owner, Admin y RH** tienen el mismo acceso funcional a Ventas por PLU: registrar días, editar precios, auditar/eliminar registros. No hay diferenciación de permisos dentro del módulo de ventas — la única diferencia de rol relevante hoy es quién puede administrar usuarios.
- **Solo Owner** puede acceder a la pantalla de gestión de usuarios (ver lista, invitar, cambiar rol, revocar acceso).
- RLS de `productos`, `precios`, `ventas_plu` cambia de `allow_all` (público) a: cualquier usuario autenticado que tenga una fila en `profiles` (sin importar el rol específico) puede leer/escribir.
- RLS de `profiles`: cualquier usuario autenticado puede leer su propia fila (para saber su rol); solo `owner` puede leer todas las filas, actualizar el rol de otros, o borrar (revocar) perfiles ajenos.
- RLS de `invitaciones`: solo usuarios con rol `owner` pueden insertar, leer o borrar invitaciones.

## Pantallas y flujo

### Login (`/login`)
- Formulario simple: email + password, estilo Tailwind consistente con el resto de la app.
- Sin opción de "olvidé mi contraseña" en esta primera versión (fuera de alcance — se puede resetear manualmente vía Supabase si hace falta).
- Sin auto-registro visible en la UI: la única manera de crear cuenta es que Owner invite el correo primero. La pantalla de login no ofrece un botón de "crear cuenta"; el flujo de signup se activa internamente solo cuando alguien invitado entra por primera vez (ver siguiente sección).

### Primer login de un usuario invitado
- Cuando Owner invita un correo (queda en `invitaciones` con su rol), esa persona necesita establecer su password la primera vez.
- Se maneja con una pantalla de "activar cuenta" separada del login normal: la persona entra su email + una password nueva, se llama `supabase.auth.signUp`, el trigger valida que esté invitada y crea su `profile`. A partir de ahí usa el login normal.
- El login (`/login`) tiene un link secundario "¿Tienes una invitación? Activa tu cuenta aquí" que lleva a esa pantalla.

### Ruta raíz protegida
- Toda la app actual (`VentasPlu`) queda detrás de un check de sesión: sin sesión activa → redirige a `/login`.
- Se usa `react-router-dom` (ya está en dependencies pero sin usar) para las rutas `/login`, `/activar-cuenta`, y `/` (protegida).
- Botón de logout visible en el header de `VentasPlu`.

### Pantalla de Usuarios (solo Owner)
- Nueva ruta protegida `/usuarios`, con un link visible en el header solo si `profile.rol === 'owner'`.
- Lista de usuarios actuales (email + rol) desde `profiles`.
- Lista de invitaciones pendientes (email + rol) desde `invitaciones`, con botón para cancelar una invitación.
- Formulario para invitar: email + selector de rol (owner/admin/rh) → insert en `invitaciones`.
- Botón para cambiar el rol de un usuario existente, y botón para revocar acceso (borra su fila en `profiles`; su cuenta de auth sigue existiendo pero sin perfil no puede leer/escribir nada por RLS).

## Alta de la primera cuenta (Owner)

No hay usuarios todavía, así que no se puede usar el flujo de invitación para el primer Owner (nadie puede invitar sin ya ser Owner). Se resuelve con un insert manual único que Giacomo corre en el SQL Editor de Supabase después de crear su propio usuario desde el Dashboard de Supabase (Authentication → Add User), insertando su fila correspondiente en `profiles` con `rol = 'owner'`. Este paso se documenta como parte de la migración, no como funcionalidad de la app.

## Fuera de alcance (explícito)

- Recuperación de password / "forgot password" flow.
- Roles de Proveedores/Pagos (no aplican a este módulo).
- Auditoría de accesos (quién entró cuándo).
- Edge Functions o backend propio — todo vive en RLS + triggers de Postgres.

## Testing

- Verificación manual: login con cuenta owner, admin y rh accediendo igual a Ventas por PLU.
- Verificación de que RLS bloquea lectura/escritura sin sesión (probar con la anon key directo, sin login, y confirmar que falla).
- Verificación de que un signup con email no invitado es rechazado por el trigger.
- Verificación de que Owner puede invitar, revocar, y cambiar roles desde `/usuarios`, y que Admin/RH no ven esa pantalla ni pueden acceder por URL directa (RLS bloquea las queries aunque se navegue ahí).
