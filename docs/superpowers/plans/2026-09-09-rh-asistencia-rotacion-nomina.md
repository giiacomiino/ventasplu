# RH: Asistencia Semanal, Rotación Desglosada y Nómina Real — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add weekly attendance capture (with vacation balance by seniority), a read-only área→puesto rotation drill-down, and real payroll payment tracking to the RH module of VURA BI, restructuring `/rh` into an overview + dedicated pages (same pattern as Ventas/Pagos).

**Architecture:** Two new native Supabase tables (`rh_asistencias`, `rh_pagos_nomina`); three new Deno edge functions (`rh-rotacion` read-only from Bubble, `rh-asistencia` and `rh-pagos-nomina` with `action`-based list/save/create branching, mirroring `config-formas-pago`); two new React pages (`RHRotacion.jsx`, `RHAsistencia.jsx`); `RH.jsx` rewritten from a flat page into an overview with KPIs, a "Registrar Pago Nómina" modal, and two `DomainCard` blocks linking to the new pages. Spec: `docs/superpowers/specs/2026-09-09-rh-asistencia-rotacion-nomina-design.md`.

**Tech Stack:** React 19 + React Router v7 + Vite + Tailwind, Supabase (Postgres + Deno Edge Functions), Bubble as read-only source for `Empleado`/`Área`/`Puestos`.

## Global Constraints

- No test framework exists in this repo (`package.json` has no vitest/jest, no `*.test.*` files anywhere). Every task's verification step is `npm run build` (catches JS/JSX syntax and import errors) plus a manual check in the already-running dev server (`http://localhost:5173`, or `/ventasplu/...` depending on how the user has it open) — this replaces the "write failing test" cycle from the skill template, per "follow established patterns" when a codebase has no test infra.
- Every `npm run build` writes to `docs/`. After verifying a build succeeds, run `git checkout -- docs/ && git clean -fd docs/` to revert it — **unless** the task is the final one and the user has asked to deploy. None of the tasks below deploy to GitHub Pages; that's a separate step the user triggers explicitly.
- Edge functions deploy independently via `supabase functions deploy <name>` (already linked in this directory — confirmed working, no project-ref flag needed) and take effect immediately, regardless of git/GitHub Pages state.
- Bubble field names are exact and already established in `resumen-rh`/`reporte-semanal`: `Empleado.NombreEmpleado`, `Empleado.EstatusEmpleado`, `Empleado.FechaIngreso`, `Empleado.FechaSalida`, `Empleado['Área']` (FK), `Empleado.Puesto` (FK), `Área.NombreÁrea`, `Puestos.NombrePuesto`. Use these exact strings — typos here fail silently (Bubble just returns `undefined`, no error).
- VURA BI never writes back to Bubble. All new writes in this plan go to native Supabase tables only.
- Follow the existing direct-invoke-for-mutations pattern from `CxPDepositos.jsx`/`config-formas-pago`: frequently-mutated data (`rh-asistencia`, `rh-pagos-nomina`) is called via `supabase.functions.invoke(...)` directly, **not** through the cached `llamar()` helper — this avoids showing stale data right after a save. Read-only, rarely-changing data (`rh-rotacion`) uses `llamar()` for the 5-minute cache, same as `resumen-rh`.
- After any successful mutation via direct invoke, call `refrescarBI()` (from `./shared`) to clear the shared cache so other `llamar()`-cached pages (e.g. the RH overview's `resumen-rh` call) don't show stale data if revisited within the 5-minute window.

---

### Task 1: Database migration for `rh_pagos_nomina` (and documenting `rh_asistencias`)

**Files:**
- Modify: `supabase/schema.sql` (append at end of file)

**Interfaces:**
- Produces: table `rh_asistencias(id, empleado_bubble_id, empleado_nombre, fecha, estado, registrado_por, created_at, updated_at)` with `UNIQUE(empleado_bubble_id, fecha)` — **already created by the user directly in Supabase**, this task only documents it in the canonical schema file for history.
- Produces: table `rh_pagos_nomina(id, fecha_pago, monto, registrado_por, created_at)` — new, must be run by the user in the Supabase SQL editor.

- [ ] **Step 1: Append both table definitions to `supabase/schema.sql`**

Add this block at the end of the file:

```sql

-- =============================================
-- TABLA: rh_asistencias (asistencia semanal nativa de VURA BI)
-- Un registro por empleado por día. Sin fila = día sin registrar. El
-- empleado se referencia por su _id de Bubble (empleado_bubble_id), con el
-- nombre copiado al momento de registrar para que la vista no dependa de
-- una consulta a Bubble para nombres históricos.
-- =============================================
CREATE TABLE IF NOT EXISTS rh_asistencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_bubble_id text NOT NULL,
  empleado_nombre text NOT NULL,
  fecha date NOT NULL,
  estado text NOT NULL CHECK (estado IN ('trabajo','descanso','vacaciones','falta','incapacidad','permiso')),
  registrado_por uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (empleado_bubble_id, fecha)
);

CREATE INDEX IF NOT EXISTS idx_rh_asistencias_fecha ON rh_asistencias(fecha);

ALTER TABLE rh_asistencias ENABLE ROW LEVEL SECURITY;

-- =============================================
-- TABLA: rh_pagos_nomina (registro de pagos reales de nómina)
-- Un registro simple por pago semanal (normalmente lunes): fecha + monto
-- transferido, sin desglose — igual que el registro equivalente en Bubble.
-- =============================================
CREATE TABLE IF NOT EXISTS rh_pagos_nomina (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha_pago date NOT NULL,
  monto numeric(12,2) NOT NULL CHECK (monto >= 0),
  registrado_por uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rh_pagos_nomina_fecha ON rh_pagos_nomina(fecha_pago);

ALTER TABLE rh_pagos_nomina ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Hand the user only the new part to run**

`rh_asistencias` was already created earlier in the conversation. Give the user just this to run in the Supabase SQL editor:

```sql
CREATE TABLE IF NOT EXISTS rh_pagos_nomina (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha_pago date NOT NULL,
  monto numeric(12,2) NOT NULL CHECK (monto >= 0),
  registrado_por uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rh_pagos_nomina_fecha ON rh_pagos_nomina(fecha_pago);

ALTER TABLE rh_pagos_nomina ENABLE ROW LEVEL SECURITY;
```

Wait for confirmation it ran without error before moving to Task 6 (which depends on this table existing). Tasks 2–5 do not depend on it and can proceed in parallel with waiting.

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "Document rh_asistencias and add rh_pagos_nomina table to schema"
```

---

### Task 2: Edge function `rh-rotacion` (read-only área → puesto rotation breakdown)

**Files:**
- Create: `supabase/functions/rh-rotacion/index.ts`

**Interfaces:**
- Consumes: `requirePermiso`, `bubbleEnv`, `bubbleGetAll`, `conOrg`, `json`, `corsHeaders` from `../_shared/bubble.ts` (all already exist, used identically in `resumen-rh/index.ts`).
- Produces: `POST /functions/v1/rh-rotacion` (no body needed) →
  `{ areas: [{ area: string, activos: number, bajasDelAnio: number, rotacion: number|null, porPuesto: [{ puesto: string, activos: number, bajasDelAnio: number, rotacion: number|null }], colaboradores: [{ nombre: string, puesto: string, antiguedadMeses: number, estatus: string }] }] }`,
  sorted by `activos` descending at both the área and puesto level.

- [ ] **Step 1: Write `supabase/functions/rh-rotacion/index.ts`**

```ts
import { corsHeaders, json, bubbleEnv, bubbleGetAll, conOrg, requirePermiso } from '../_shared/bubble.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await requirePermiso(req, 'rh')
  if (!user) return json({ error: 'No autorizado' }, 401)

  const { bubbleUrl, bubbleToken } = bubbleEnv()

  try {
    const [empleados, areas, puestos] = await Promise.all([
      bubbleGetAll(bubbleUrl, bubbleToken, 'Empleado', conOrg()),
      bubbleGetAll(bubbleUrl, bubbleToken, 'Área', conOrg()),
      bubbleGetAll(bubbleUrl, bubbleToken, 'Puestos', conOrg()),
    ])

    const areaPorId = new Map(areas.map((a: any) => [a._id, a['NombreÁrea']]))
    const puestoPorId = new Map(puestos.map((p: any) => [p._id, p.NombrePuesto]))

    const ahora = new Date()
    const inicioAnio = new Date(Date.UTC(ahora.getUTCFullYear(), 0, 1))

    const nombreArea = (e: any) => areaPorId.get(e['Área']) ?? 'Sin área'
    const nombrePuesto = (e: any) => puestoPorId.get(e.Puesto) ?? 'Sin puesto'
    const antiguedadMeses = (e: any) => e.FechaIngreso
      ? Math.floor((ahora.getTime() - new Date(e.FechaIngreso).getTime()) / (30.44 * 24 * 60 * 60 * 1000))
      : 0
    const esBajaDelAnio = (e: any) =>
      e.EstatusEmpleado === 'Baja' && e.FechaSalida && new Date(e.FechaSalida) >= inicioAnio

    const porArea = new Map<string, any[]>()
    for (const e of empleados) {
      const area = nombreArea(e)
      if (!porArea.has(area)) porArea.set(area, [])
      porArea.get(area)!.push(e)
    }

    const areasRotacion = [...porArea.entries()].map(([area, empleadosArea]) => {
      const activos = empleadosArea.filter((e: any) => e.EstatusEmpleado === 'Activo')
      const bajasDelAnio = empleadosArea.filter(esBajaDelAnio).length
      const rotacion = activos.length > 0 ? bajasDelAnio / activos.length : null

      const porPuestoMap = new Map<string, any[]>()
      for (const e of empleadosArea) {
        const puesto = nombrePuesto(e)
        if (!porPuestoMap.has(puesto)) porPuestoMap.set(puesto, [])
        porPuestoMap.get(puesto)!.push(e)
      }
      const porPuesto = [...porPuestoMap.entries()].map(([puesto, empleadosPuesto]) => {
        const activosPuesto = empleadosPuesto.filter((e: any) => e.EstatusEmpleado === 'Activo')
        const bajasPuesto = empleadosPuesto.filter(esBajaDelAnio).length
        return {
          puesto,
          activos: activosPuesto.length,
          bajasDelAnio: bajasPuesto,
          rotacion: activosPuesto.length > 0 ? bajasPuesto / activosPuesto.length : null,
        }
      }).sort((a, b) => b.activos - a.activos)

      const colaboradores = empleadosArea
        .map((e: any) => ({
          nombre: e.NombreEmpleado || 'Sin nombre',
          puesto: nombrePuesto(e),
          antiguedadMeses: antiguedadMeses(e),
          estatus: e.EstatusEmpleado || 'Desconocido',
        }))
        .sort((a, b) => b.antiguedadMeses - a.antiguedadMeses)

      return { area, activos: activos.length, bajasDelAnio, rotacion, porPuesto, colaboradores }
    }).sort((a, b) => b.activos - a.activos)

    return json({ areas: areasRotacion })
  } catch (e) {
    return json({ error: e.message }, 502)
  }
})
```

- [ ] **Step 2: Deploy and verify**

```bash
supabase functions deploy rh-rotacion
```

Expected: deploy succeeds, status `ACTIVE` (matches the output style seen from `supabase functions list` earlier in this project). Full data-correctness verification happens visually in Task 3 once the frontend page exists — there's no test harness or easy authenticated curl available here, so this mirrors how every other edge function in this codebase has been verified.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/rh-rotacion/index.ts
git commit -m "Add rh-rotacion edge function for área/puesto rotation breakdown"
```

---

### Task 3: Frontend page `RHRotacion.jsx` + route

**Files:**
- Create: `src/pages/bi/RHRotacion.jsx`
- Modify: `src/App.jsx` (add import + route)

**Interfaces:**
- Consumes: `llamar` from `./shared`; `Card, PageHeader, KpiTile, SectionHeader, LoadingState, ErrorState, EmptyState` from `./ui`; response shape from Task 2 (`{ areas: [...] }`).
- Produces: route `/rh/rotacion`, default-exported component `BIRHRotacion`.

- [ ] **Step 1: Write `src/pages/bi/RHRotacion.jsx`**

```jsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { llamar, CRITICAL, GOOD } from './shared'
import { Card, PageHeader, KpiTile, SectionHeader, LoadingState, ErrorState, EmptyState } from './ui'

function colorRotacion(pct) {
  if (pct == null) return '#9ca3af'
  if (pct >= 0.5) return CRITICAL
  if (pct >= 0.25) return '#ec835a'
  return GOOD
}

export default function BIRHRotacion() {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [areaSel, setAreaSel] = useState(null)

  useEffect(() => {
    llamar('rh-rotacion').then(d => {
      setDatos(d)
      if (d.areas?.length) setAreaSel(d.areas[0].area)
    }).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [])

  const area = datos?.areas?.find(a => a.area === areaSel)

  return (
    <div className="w-full px-4 py-4 sm:px-8 sm:py-8 max-w-[1600px] mx-auto space-y-8">
      <div>
        <Link to="/rh" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-gray-700 mb-3 transition-colors">
          <ArrowLeft size={15} /> RH
        </Link>
        <PageHeader
          title="Rotación por área"
          sub="Desglose de rotación y colaboradores por área y puesto"
          right={datos?.areas?.length ? (
            <select
              value={areaSel ?? ''}
              onChange={e => setAreaSel(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 bg-white"
            >
              {datos.areas.map(a => <option key={a.area} value={a.area}>{a.area}</option>)}
            </select>
          ) : null}
        />
      </div>

      {loading && <LoadingState>Cargando...</LoadingState>}
      {error && <ErrorState message={error} />}

      {area && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <KpiTile label="Activos" value={area.activos} />
            <KpiTile label="Bajas del año" value={area.bajasDelAnio} />
            <KpiTile
              label="Rotación"
              value={area.rotacion != null ? `${(area.rotacion * 100).toFixed(1)}%` : '—'}
              sub="del año en curso"
            />
          </div>

          <Card>
            <SectionHeader title="Por puesto" sub={`Dentro de ${area.area}`} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {area.porPuesto.map(p => (
                <div key={p.puesto} className="rounded-xl bg-gray-50 px-4 py-3">
                  <p className="text-xs font-bold text-gray-700 truncate">{p.puesto}</p>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-lg font-bold text-gray-900 tabular-nums">{p.activos}</span>
                    <span className="text-xs font-semibold tabular-nums" style={{ color: colorRotacion(p.rotacion) }}>
                      {p.rotacion != null ? `${(p.rotacion * 100).toFixed(0)}%` : '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card padded={false}>
            <div className="p-6 pb-4">
              <SectionHeader title="Lista de colaboradores" sub={`${area.colaboradores.length} en ${area.area}`} />
            </div>
            {area.colaboradores.length === 0 ? (
              <EmptyState>Sin colaboradores registrados en esta área.</EmptyState>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Nombre</th>
                    <th className="text-left px-6 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Puesto</th>
                    <th className="text-right px-6 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Antigüedad</th>
                    <th className="text-right px-6 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Estatus</th>
                  </tr>
                </thead>
                <tbody>
                  {area.colaboradores.map((c, i) => (
                    <tr key={`${c.nombre}-${i}`} className="border-b border-gray-50 last:border-0">
                      <td className="px-6 py-3 text-gray-700 font-medium">{c.nombre}</td>
                      <td className="px-6 py-3 text-gray-500">{c.puesto}</td>
                      <td className="px-6 py-3 text-right text-gray-500 tabular-nums">{c.antiguedadMeses} meses</td>
                      <td className="px-6 py-3 text-right">
                        <span
                          className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold"
                          style={{
                            background: c.estatus === 'Activo' ? `${GOOD}1a` : '#f3f4f6',
                            color: c.estatus === 'Activo' ? GOOD : '#6b7280',
                          }}
                        >
                          {c.estatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire the route in `src/App.jsx`**

Add the import near the other RH-adjacent imports (after `import BIRH from './pages/bi/RH'`):

```jsx
import BIRHRotacion from './pages/bi/RHRotacion'
```

Add the route inside the existing `<Route element={<SoloPermiso seccion="rh" />}>` block (find it around line 164, next to `/rh` and `/rh/reporte-semanal`):

```jsx
        <Route element={<SoloPermiso seccion="rh" />}>
          <Route path="/rh" element={<BIRH />} />
          <Route path="/rh/rotacion" element={<BIRHRotacion />} />
          <Route path="/rh/reporte-semanal" element={<BIReporteSemanal />} />
        </Route>
```

- [ ] **Step 3: Build and manually verify**

```bash
npm run build
```

Expected: no errors. Then open `/rh/rotacion` in the browser (dev server already running) and confirm: an área dropdown appears, KPIs populate, puesto cards show headcount + rotación%, and the colaboradores table lists real employee names with antigüedad in months.

```bash
git checkout -- docs/ && git clean -fd docs/
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/bi/RHRotacion.jsx src/App.jsx
git commit -m "Add /rh/rotacion page: área/puesto rotation breakdown and employee list"
```

---

### Task 4: Edge function `rh-asistencia` (weekly grid data + vacation balance + cell save)

**Files:**
- Create: `supabase/functions/rh-asistencia/index.ts`

**Interfaces:**
- Consumes: `rh_asistencias` table (Task 1); Bubble `Empleado`/`Área`/`Puestos` via shared helpers.
- Produces:
  - `POST rh-asistencia` with `{ action: 'list', lunes: 'YYYY-MM-DD' }` →
    `{ empleados: [{ empleadoBubbleId: string, nombre: string, area: string, puesto: string, dias: [{ fecha: string, estado: string|null }] (7 entries, Lunes→Domingo), saldoVacaciones: { correspondientes: number, tomados: number, restantes: number } }], resumenSemana: { trabajo: number, descanso: number, vacaciones: number, falta: number, incapacidad: number, permiso: number } }`
  - `POST rh-asistencia` with `{ action: 'save', empleadoBubbleId: string, empleadoNombre: string, fecha: 'YYYY-MM-DD', estado: string|null }` → `{ ok: true }` (estado `null` deletes the row; otherwise upserts on `(empleado_bubble_id, fecha)`).

- [ ] **Step 1: Write `supabase/functions/rh-asistencia/index.ts`**

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, json, bubbleEnv, bubbleGetAll, conOrg, requirePermiso } from '../_shared/bubble.ts'

// Días de vacaciones por año de servicio cumplido, Ley Federal del
// Trabajo (art. 76): 12/14/16/18/20 los primeros 5 años, +2 cada 5 años
// después. El periodo de cada empleado corre por su aniversario de
// ingreso, no por año calendario.
const DIAS_VACACIONES_LFT = [12, 14, 16, 18, 20]

function diasVacacionesPorAnio(anioServicio: number): number {
  if (anioServicio <= 0) return 0
  if (anioServicio <= 5) return DIAS_VACACIONES_LFT[anioServicio - 1]
  const bloque = Math.ceil((anioServicio - 5) / 5)
  return 20 + bloque * 2
}

function periodoAniversarioActual(fechaIngreso: Date, hoy: Date) {
  const anioIngreso = fechaIngreso.getUTCFullYear()
  const mes = fechaIngreso.getUTCMonth()
  const dia = fechaIngreso.getUTCDate()

  let aniosCumplidos = hoy.getUTCFullYear() - anioIngreso
  let ultimoAniversario = new Date(Date.UTC(hoy.getUTCFullYear(), mes, dia))
  if (hoy < ultimoAniversario) {
    aniosCumplidos -= 1
    ultimoAniversario = new Date(Date.UTC(hoy.getUTCFullYear() - 1, mes, dia))
  }
  const siguienteAniversario = new Date(Date.UTC(ultimoAniversario.getUTCFullYear() + 1, mes, dia))
  return { aniosCumplidos, inicio: ultimoAniversario, fin: siguienteAniversario }
}

function fechaISO(d: Date) {
  return d.toISOString().slice(0, 10)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await requirePermiso(req, 'rh')
  if (!user) return json({ error: 'No autorizado' }, 401)

  const body = await req.json().catch(() => ({}))
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)

  try {
    if (body.action === 'list') {
      const lunes = body.lunes
      if (!lunes) return json({ error: 'Falta lunes' }, 400)

      const lunesDate = new Date(`${lunes}T00:00:00Z`)
      const dias7 = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(lunesDate)
        d.setUTCDate(d.getUTCDate() + i)
        return fechaISO(d)
      })
      const domingo = dias7[6]

      const { bubbleUrl, bubbleToken } = bubbleEnv()
      const [empleados, areas, puestos] = await Promise.all([
        bubbleGetAll(bubbleUrl, bubbleToken, 'Empleado', conOrg()),
        bubbleGetAll(bubbleUrl, bubbleToken, 'Área', conOrg()),
        bubbleGetAll(bubbleUrl, bubbleToken, 'Puestos', conOrg()),
      ])
      const activos = empleados.filter((e: any) => e.EstatusEmpleado === 'Activo')
      const areaPorId = new Map(areas.map((a: any) => [a._id, a['NombreÁrea']]))
      const puestoPorId = new Map(puestos.map((p: any) => [p._id, p.NombrePuesto]))

      const { data: registros, error } = await admin
        .from('rh_asistencias')
        .select('empleado_bubble_id, fecha, estado')
        .gte('fecha', lunes)
        .lte('fecha', domingo)
      if (error) return json({ error: error.message }, 400)

      const registroPorClave = new Map<string, string>()
      for (const r of registros ?? []) registroPorClave.set(`${r.empleado_bubble_id}:${r.fecha}`, r.estado)

      const hoy = new Date()
      const { data: vacacionesTomadas, error: errorVac } = await admin
        .from('rh_asistencias')
        .select('empleado_bubble_id, fecha')
        .eq('estado', 'vacaciones')
      if (errorVac) return json({ error: errorVac.message }, 400)

      const vacacionesPorEmpleado = new Map<string, string[]>()
      for (const v of vacacionesTomadas ?? []) {
        if (!vacacionesPorEmpleado.has(v.empleado_bubble_id)) vacacionesPorEmpleado.set(v.empleado_bubble_id, [])
        vacacionesPorEmpleado.get(v.empleado_bubble_id)!.push(v.fecha)
      }

      const resumenSemana: Record<string, number> = { trabajo: 0, descanso: 0, vacaciones: 0, falta: 0, incapacidad: 0, permiso: 0 }

      const empleadosResp = activos.map((e: any) => {
        const nombre = e.NombreEmpleado || 'Sin nombre'
        const dias = dias7.map(fecha => {
          const estado = registroPorClave.get(`${e._id}:${fecha}`) ?? null
          if (estado && estado in resumenSemana) resumenSemana[estado] += 1
          return { fecha, estado }
        })

        let saldoVacaciones = { correspondientes: 0, tomados: 0, restantes: 0 }
        if (e.FechaIngreso) {
          const { aniosCumplidos, inicio, fin } = periodoAniversarioActual(new Date(e.FechaIngreso), hoy)
          const correspondientes = diasVacacionesPorAnio(aniosCumplidos)
          const fechasVac = vacacionesPorEmpleado.get(e._id) ?? []
          const tomados = fechasVac.filter(f => f >= fechaISO(inicio) && f < fechaISO(fin)).length
          saldoVacaciones = { correspondientes, tomados, restantes: Math.max(correspondientes - tomados, 0) }
        }

        return {
          empleadoBubbleId: e._id,
          nombre,
          area: areaPorId.get(e['Área']) ?? 'Sin área',
          puesto: puestoPorId.get(e.Puesto) ?? 'Sin puesto',
          dias,
          saldoVacaciones,
        }
      }).sort((a, b) => a.nombre.localeCompare(b.nombre))

      return json({ empleados: empleadosResp, resumenSemana })
    }

    if (body.action === 'save') {
      const { empleadoBubbleId, empleadoNombre, fecha, estado } = body
      if (!empleadoBubbleId || !fecha) return json({ error: 'Faltan datos' }, 400)

      if (estado == null) {
        const { error } = await admin.from('rh_asistencias').delete()
          .eq('empleado_bubble_id', empleadoBubbleId).eq('fecha', fecha)
        if (error) return json({ error: error.message }, 400)
        return json({ ok: true })
      }

      const { error } = await admin.from('rh_asistencias').upsert({
        empleado_bubble_id: empleadoBubbleId,
        empleado_nombre: empleadoNombre || '',
        fecha,
        estado,
        registrado_por: user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'empleado_bubble_id,fecha' })
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    return json({ error: 'Acción no reconocida' }, 400)
  } catch (e) {
    return json({ error: e.message }, 502)
  }
})
```

- [ ] **Step 2: Deploy**

```bash
supabase functions deploy rh-asistencia
```

Expected: deploy succeeds. This requires `rh_asistencias` to already exist (it does — created earlier in the conversation, before this plan started).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/rh-asistencia/index.ts
git commit -m "Add rh-asistencia edge function: weekly grid data, vacation balance, cell save"
```

---

### Task 5: Frontend page `RHAsistencia.jsx` + route

**Files:**
- Create: `src/pages/bi/RHAsistencia.jsx`
- Modify: `src/App.jsx` (add import + route)

**Interfaces:**
- Consumes: `useSemanaSeleccionada` from `./useSemanaSeleccionada` (returns `{ lunes, lunesStr, esSemanaActual, anterior, siguiente, label }`); `supabase` from `../../lib/supabase`; `GOOD, WARNING, CRITICAL, GOLD_RAMP, refrescarBI` from `./shared`; `Card, PageHeader, KpiTile, LoadingState, ErrorState, EmptyState` from `./ui`; response shape from Task 4.
- Produces: route `/rh/asistencia`, default-exported component `BIRHAsistencia`.

- [ ] **Step 1: Write `src/pages/bi/RHAsistencia.jsx`**

```jsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { GOOD, WARNING, CRITICAL, GOLD_RAMP, refrescarBI } from './shared'
import { Card, PageHeader, KpiTile, LoadingState, ErrorState, EmptyState } from './ui'
import { useSemanaSeleccionada } from './useSemanaSeleccionada'

const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const ESTADOS = [
  { valor: 'trabajo', label: 'Trabajó', color: GOOD },
  { valor: 'descanso', label: 'Descanso', color: '#8a94a6' },
  { valor: 'vacaciones', label: 'Vacaciones', color: GOLD_RAMP[1] },
  { valor: 'falta', label: 'Falta', color: CRITICAL },
  { valor: 'incapacidad', label: 'Incapacidad', color: WARNING },
  { valor: 'permiso', label: 'Permiso', color: '#8a6fbd' },
]

function CeldaEstado({ estado, onChange, guardando }) {
  const cfg = ESTADOS.find(e => e.valor === estado)
  return (
    <select
      value={estado || ''}
      disabled={guardando}
      onChange={e => onChange(e.target.value || null)}
      className="w-full text-[11px] font-bold text-center rounded-md border-0 py-1.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50"
      style={{
        background: cfg ? `${cfg.color}22` : '#f3f4f6',
        color: cfg ? cfg.color : '#9ca3af',
      }}
    >
      <option value="">—</option>
      {ESTADOS.map(e => <option key={e.valor} value={e.valor}>{e.label}</option>)}
    </select>
  )
}

export default function BIRHAsistencia() {
  const { lunesStr, esSemanaActual, anterior, siguiente, label } = useSemanaSeleccionada()
  const [empleados, setEmpleados] = useState([])
  const [resumenSemana, setResumenSemana] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [guardandoCelda, setGuardandoCelda] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError('')
    supabase.functions.invoke('rh-asistencia', { body: { action: 'list', lunes: lunesStr } })
      .then(({ data, error }) => {
        if (error) throw new Error(error.message)
        if (data?.error) throw new Error(data.error)
        setEmpleados(data.empleados)
        setResumenSemana(data.resumenSemana)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [lunesStr])

  async function cambiarEstado(empleado, fecha, estado) {
    const clave = `${empleado.empleadoBubbleId}:${fecha}`
    const empleadosPrevios = empleados
    setGuardandoCelda(clave)
    setEmpleados(lista => lista.map(e => e.empleadoBubbleId !== empleado.empleadoBubbleId ? e : {
      ...e,
      dias: e.dias.map(d => d.fecha === fecha ? { ...d, estado } : d),
    }))
    try {
      const { error } = await supabase.functions.invoke('rh-asistencia', {
        body: { action: 'save', empleadoBubbleId: empleado.empleadoBubbleId, empleadoNombre: empleado.nombre, fecha, estado },
      })
      if (error) throw new Error(error.message)
      refrescarBI()
    } catch (e) {
      setEmpleados(empleadosPrevios)
      setError(`No se pudo guardar: ${e.message}`)
    }
    setGuardandoCelda(null)
  }

  return (
    <div className="w-full px-4 py-4 sm:px-8 sm:py-8 max-w-[1600px] mx-auto space-y-8">
      <div>
        <Link to="/rh" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-gray-700 mb-3 transition-colors">
          <ArrowLeft size={15} /> RH
        </Link>
        <PageHeader
          title="Asistencia semanal"
          sub="Trabajó, descanso, vacaciones y ausencias por empleado"
          right={
            <div className="flex items-center gap-2">
              <button onClick={anterior} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"><ChevronLeft size={16} /></button>
              <span className="text-sm font-semibold text-gray-700 min-w-[180px] text-center capitalize">{label}</span>
              <button onClick={siguiente} disabled={esSemanaActual} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"><ChevronRight size={16} /></button>
            </div>
          }
        />
      </div>

      {loading && <LoadingState>Cargando...</LoadingState>}
      {error && <ErrorState message={error} />}

      {!loading && resumenSemana && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {ESTADOS.map(e => (
            <KpiTile key={e.valor} label={e.label} value={resumenSemana[e.valor] ?? 0} />
          ))}
        </div>
      )}

      {!loading && empleados.length === 0 && <EmptyState>No hay empleados activos.</EmptyState>}

      {!loading && empleados.length > 0 && (
        <Card padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider sticky left-0 bg-white">Empleado</th>
                  {DIAS_CORTOS.map(d => (
                    <th key={d} className="px-2 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider text-center min-w-[110px]">{d}</th>
                  ))}
                  <th className="px-3 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider text-center">Vacaciones</th>
                </tr>
              </thead>
              <tbody>
                {empleados.map(emp => (
                  <tr key={emp.empleadoBubbleId} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-2 sticky left-0 bg-white">
                      <p className="font-medium text-gray-700 truncate max-w-[180px]">{emp.nombre}</p>
                      <p className="text-[11px] text-gray-400 truncate max-w-[180px]">{emp.puesto}</p>
                    </td>
                    {emp.dias.map(d => (
                      <td key={d.fecha} className="px-1.5 py-2">
                        <CeldaEstado
                          estado={d.estado}
                          guardando={guardandoCelda === `${emp.empleadoBubbleId}:${d.fecha}`}
                          onChange={estado => cambiarEstado(emp, d.fecha, estado)}
                        />
                      </td>
                    ))}
                    <td className="px-3 py-2 text-center">
                      <span className="text-xs font-bold text-gray-600 tabular-nums">
                        {emp.saldoVacaciones.restantes}/{emp.saldoVacaciones.correspondientes}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire the route in `src/App.jsx`**

Add the import next to the `BIRHRotacion` one from Task 3:

```jsx
import BIRHAsistencia from './pages/bi/RHAsistencia'
```

Add the route in the same `SoloPermiso seccion="rh"` block:

```jsx
        <Route element={<SoloPermiso seccion="rh" />}>
          <Route path="/rh" element={<BIRH />} />
          <Route path="/rh/rotacion" element={<BIRHRotacion />} />
          <Route path="/rh/asistencia" element={<BIRHAsistencia />} />
          <Route path="/rh/reporte-semanal" element={<BIReporteSemanal />} />
        </Route>
```

- [ ] **Step 3: Build and manually verify**

```bash
npm run build
```

Expected: no errors. Then open `/rh/asistencia` in the browser and confirm: the week selector matches the current Lun–Dom range, KPI tiles show 6 counts (likely all zero on first load), the grid lists active employees as rows with 7 day-selectors, and each employee shows a `restantes/correspondientes` vacation badge. Click a few cells, pick different estados, and confirm the selection persists after a page refresh (proves the save + upsert works). Also verify: setting a cell back to "—" removes the record (refresh again, cell should read "—", not revert to the last saved estado).

```bash
git checkout -- docs/ && git clean -fd docs/
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/bi/RHAsistencia.jsx src/App.jsx
git commit -m "Add /rh/asistencia page: weekly attendance grid with instant save"
```

---

### Task 6: Edge function `rh-pagos-nomina` (payroll payment list + create)

**Depends on:** Task 1 Step 2 confirmed (the `rh_pagos_nomina` table must exist).

**Files:**
- Create: `supabase/functions/rh-pagos-nomina/index.ts`

**Interfaces:**
- Consumes: `rh_pagos_nomina` table (Task 1).
- Produces:
  - `POST rh-pagos-nomina` with `{ action: 'list' }` → `{ nominaYtd: number, ultimoPago: { fecha: string, monto: number } | null, pagos: [{ fecha_pago: string, monto: number }] }` (up to 20 most recent, `nominaYtd` sums `monto` for the current calendar year).
  - `POST rh-pagos-nomina` with `{ action: 'create', fechaPago: 'YYYY-MM-DD', monto: number }` → `{ ok: true }`.

- [ ] **Step 1: Write `supabase/functions/rh-pagos-nomina/index.ts`**

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, json, requirePermiso } from '../_shared/bubble.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const user = await requirePermiso(req, 'rh')
  if (!user) return json({ error: 'No autorizado' }, 401)

  const body = await req.json().catch(() => ({}))
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)

  try {
    if (body.action === 'list') {
      const anio = new Date().getUTCFullYear()
      const inicioAnio = `${anio}-01-01`

      const { data: pagosAnio, error: errorAnio } = await admin
        .from('rh_pagos_nomina')
        .select('monto')
        .gte('fecha_pago', inicioAnio)
      if (errorAnio) return json({ error: errorAnio.message }, 400)

      const { data: pagos, error: errorPagos } = await admin
        .from('rh_pagos_nomina')
        .select('fecha_pago, monto')
        .order('fecha_pago', { ascending: false })
        .limit(20)
      if (errorPagos) return json({ error: errorPagos.message }, 400)

      const nominaYtd = (pagosAnio ?? []).reduce((s, p) => s + Number(p.monto), 0)
      const ultimoPago = pagos && pagos.length > 0
        ? { fecha: pagos[0].fecha_pago, monto: Number(pagos[0].monto) }
        : null

      return json({
        nominaYtd,
        ultimoPago,
        pagos: (pagos ?? []).map(p => ({ fecha_pago: p.fecha_pago, monto: Number(p.monto) })),
      })
    }

    if (body.action === 'create') {
      const { fechaPago, monto } = body
      if (!fechaPago || monto == null) return json({ error: 'Faltan datos' }, 400)
      const { error } = await admin.from('rh_pagos_nomina').insert({
        fecha_pago: fechaPago,
        monto: Number(monto),
        registrado_por: user.id,
      })
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    return json({ error: 'Acción no reconocida' }, 400)
  } catch (e) {
    return json({ error: e.message }, 502)
  }
})
```

- [ ] **Step 2: Deploy**

```bash
supabase functions deploy rh-pagos-nomina
```

Expected: deploy succeeds.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/rh-pagos-nomina/index.ts
git commit -m "Add rh-pagos-nomina edge function: payroll payment list and create"
```

---

### Task 7: Rewrite `RH.jsx` into an overview (KPIs, nómina modal, rotación/asistencia blocks)

**Files:**
- Modify: `src/pages/bi/RH.jsx` (full rewrite)

**Interfaces:**
- Consumes: `llamar('resumen-rh')` (existing, unchanged response shape); `rh-pagos-nomina` `action: 'list'`/`action: 'create'` from Task 6; `Modal` default export from `../../components/ui/Modal`; `refrescarBI` from `./shared`.
- Produces: default-exported component `BIRH`, still mounted at `/rh` (no route change needed — `App.jsx` already points here).

- [ ] **Step 1: Replace the full contents of `src/pages/bi/RH.jsx`**

```jsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Plus } from 'lucide-react'
import { formatMoney } from '../../utils/formatters'
import { supabase } from '../../lib/supabase'
import { llamar, GOLD_RAMP, refrescarBI } from './shared'
import { Card, PageHeader, KpiTile, LoadingState, ErrorState } from './ui'
import Modal from '../../components/ui/Modal'

function DomainCard({ to, titulo, sub, children }) {
  return (
    <Link to={to} className="block group">
      <Card className="h-full transition-all group-hover:border-gray-200 group-hover:shadow-md">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="text-base font-bold text-gray-900">{titulo}</h2>
          <ChevronRight size={18} className="text-gray-300 group-hover:text-gray-500 group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-0.5" />
        </div>
        {sub && <p className="text-xs text-gray-400 mb-4 leading-relaxed">{sub}</p>}
        {children}
      </Card>
    </Link>
  )
}

function ModalRegistrarPago({ onClose, onGuardado }) {
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [monto, setMonto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function guardar() {
    if (!monto || Number(monto) <= 0) { setError('Captura un monto válido'); return }
    setGuardando(true)
    setError('')
    try {
      const { error } = await supabase.functions.invoke('rh-pagos-nomina', {
        body: { action: 'create', fechaPago: fecha, monto: Number(monto) },
      })
      if (error) throw new Error(error.message)
      refrescarBI()
      onGuardado()
    } catch (e) {
      setError(e.message)
    }
    setGuardando(false)
  }

  return (
    <Modal onClose={onClose} maxWidth="max-w-sm">
      <div className="p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Registrar pago de nómina</h3>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Fecha</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Monto transferido</label>
            <input type="number" value={monto} onChange={e => setMonto(e.target.value)} placeholder="0.00" className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm tabular-nums" />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold text-gray-500 hover:bg-gray-50">Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[#7a6020] hover:bg-[#5c4718] disabled:opacity-50">
            {guardando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function BIRH() {
  const [rh, setRh] = useState(null)
  const [nomina, setNomina] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [modalPago, setModalPago] = useState(false)

  function cargar() {
    setLoading(true)
    Promise.allSettled([
      llamar('resumen-rh'),
      supabase.functions.invoke('rh-pagos-nomina', { body: { action: 'list' } }),
    ]).then(([r1, r2]) => {
      if (r1.status === 'fulfilled') setRh(r1.value)
      else setError(r1.reason.message)
      if (r2.status === 'fulfilled' && !r2.value.error && !r2.value.data?.error) setNomina(r2.value.data)
      setLoading(false)
    })
  }

  useEffect(cargar, [])

  return (
    <div className="w-full px-4 py-4 sm:px-8 sm:py-8 max-w-[1600px] mx-auto space-y-8">
      <PageHeader
        title="Recursos Humanos"
        sub="Headcount, rotación, asistencia y nómina"
        right={
          <button onClick={() => setModalPago(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-[#7a6020] text-white rounded-lg text-sm font-semibold hover:bg-[#5c4718] transition-colors shadow-sm">
            <Plus size={15} /> Registrar Pago Nómina
          </button>
        }
      />

      {loading && <LoadingState>Cargando...</LoadingState>}
      {error && <ErrorState message={error} />}

      {rh && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-5">
            <KpiTile label="Headcount activo" value={rh.headcountActivo} />
            <KpiTile
              label="Rotación del año"
              value={rh.rotacionAnual != null ? `${(rh.rotacionAnual * 100).toFixed(0)}%` : '—'}
              sub={`${rh.bajasDelAnio} bajas este año`}
            />
            <KpiTile
              label="Antigüedad promedio"
              value={rh.antiguedadPromedio != null ? `${rh.antiguedadPromedio.toFixed(1)} años` : '—'}
            />
            <KpiTile
              label="Nómina YTD (real)"
              value={nomina ? formatMoney(nomina.nominaYtd) : '—'}
              sub={nomina?.ultimoPago ? `último registro: ${nomina.ultimoPago.fecha}` : 'sin registros aún'}
            />
            <KpiTile
              label="Nómina estimada / mes"
              value={formatMoney(rh.nominaEstimadaMensual)}
              sub="Headcount activo × sueldo diario × 30"
            />
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            *Rotación aproximada: bajas cuyo último cambio de estatus fue este año — Bubble no expone una fecha de baja explícita.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <DomainCard to="/rh/rotacion" titulo="Rotación por área" sub="Desglose por área, puesto y lista de colaboradores">
              <div className="space-y-2.5">
                {rh.hcPorArea.slice(0, 4).map((a, i) => (
                  <div key={a.nombre}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-gray-700 truncate">{a.nombre}</span>
                      <span className="font-bold text-gray-800 flex-shrink-0 ml-2 tabular-nums">{a.headcount}</span>
                    </div>
                    <div className="h-1.5 bg-gray-50 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(a.headcount / rh.hcPorArea[0].headcount) * 100}%`, background: GOLD_RAMP[i % GOLD_RAMP.length] }} />
                    </div>
                  </div>
                ))}
              </div>
            </DomainCard>

            <DomainCard to="/rh/asistencia" titulo="Asistencia semanal" sub="Registra trabajo, descansos, vacaciones y faltas por empleado">
              <p className="text-sm text-gray-400">Cuadrícula semanal editable, con saldo de vacaciones por ley calculado por antigüedad.</p>
            </DomainCard>
          </div>
        </>
      )}

      {modalPago && (
        <ModalRegistrarPago
          onClose={() => setModalPago(false)}
          onGuardado={() => { setModalPago(false); cargar() }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Build and manually verify**

```bash
npm run build
```

Expected: no errors. Then open `/rh` and confirm: 5 KPI tiles render (including "Nómina YTD (real)" showing `—`/`sin registros aún` if no payments exist yet), the "Registrar Pago Nómina" button opens the modal, submitting a fecha+monto closes the modal and updates the KPI immediately, and the two `DomainCard` blocks link correctly to `/rh/rotacion` and `/rh/asistencia`.

```bash
git checkout -- docs/ && git clean -fd docs/
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/bi/RH.jsx
git commit -m "Rewrite /rh as an overview: real nómina YTD, rotación and asistencia blocks"
```

---

### Task 8: Final full-app verification

**Files:** none (verification only)

- [ ] **Step 1: Full build**

```bash
npm run build
```

Expected: no errors, no new warnings beyond the pre-existing chunk-size one.

- [ ] **Step 2: Manual smoke test in the browser**

Walk through: `/rh` (overview loads, KPIs correct, modal works) → click "Rotación por área" block → `/rh/rotacion` (switch the área dropdown, confirm puesto cards and colaboradores table update) → back to `/rh` → click "Asistencia semanal" → `/rh/asistencia` (mark a few days for a couple of employees across different estados, confirm the resumen KPIs update, confirm vacation badges look sane for at least one long-tenured employee) → navigate to a previous week and confirm it loads that week's data (should be empty/different from the current week) → navigate back to the current week.

- [ ] **Step 3: Revert build artifacts**

```bash
git checkout -- docs/ && git clean -fd docs/
```

- [ ] **Step 4: Confirm with the user**

Report: all 3 edge functions deployed and ACTIVE, all pages working end to end, `rh_pagos_nomina` table confirmed created. Ask whether they want this pushed to production now (git push origin main) — do not push without an explicit go-ahead, per this project's standing rule of only deploying the frontend when the user asks.

---

## Self-Review Notes

- **Spec coverage:** Asistencia semanal (Tasks 1, 4, 5) ✓. Rotación por área→puesto + lista de colaboradores, read-only (Tasks 2, 3) ✓. Pagos de nómina reales (Tasks 1, 6, 7) ✓. Overview restructure of `/rh` with KPIs + modal + blocks (Task 7) ✓. Routes under existing `rh` permission, no new permission (Tasks 3, 5) ✓. Explicitly-postponed items (AI chat, editable employee status, itemized nómina, vacation carry-over) are not implemented anywhere in this plan, matching the spec's "Fuera de alcance" section.
- **Type consistency check:** `empleadoBubbleId` (camelCase, used in JSON payloads) vs `empleado_bubble_id` (snake_case, DB column) — kept consistently separate across Tasks 4 and 5, translation happens only inside the edge function. `estado` values (`'trabajo'|'descanso'|'vacaciones'|'falta'|'incapacidad'|'permiso'`) match exactly across the DB CHECK constraint (Task 1), the edge function (Task 4), and the frontend `ESTADOS` array (Task 5). `rh-pagos-nomina` action names (`'list'`/`'create'`) match between Task 6 (backend) and Task 7 (frontend `ModalRegistrarPago` and `cargar()`).
- **No placeholders:** every step has complete, runnable code — no TODOs or "add error handling" left unexpanded.
