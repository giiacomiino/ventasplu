# RH: asistencia semanal, rotación desglosada y nómina real

## Contexto

`/rh` hoy (`src/pages/bi/RH.jsx` + `supabase/functions/resumen-rh`) es una sola
página plana: headcount activo, rotación global, antigüedad promedio, nómina
estimada mensual, y dos tablas (headcount por área, headcount por puesto). Todo
de solo lectura desde Bubble (`Empleado`, `Área`, `Puestos`).

Este proyecto agrega tres piezas nuevas y reestructura `/rh` al mismo patrón
overview + bloques ya usado en Ventas y Pagos:

1. **Asistencia semanal** — capturar por empleado/día si trabajó, descansó,
   tomó vacaciones, faltó, etc., y ver el saldo de vacaciones por ley.
2. **Rotación por área → puesto + lista de colaboradores** — desglose de
   solo lectura, inspirado en el modal equivalente del Bubble original.
3. **Pagos de nómina reales** — registrar el pago semanal real (fecha +
   monto) para tener un YTD real, no solo estimado.

Ningún módulo de VURA BI escribe de vuelta a Bubble; esto no cambia esa regla
— las tres piezas nuevas son datos nativos de Supabase o lecturas de Bubble.

## 1. Asistencia semanal

### Modelo de datos

```sql
CREATE TABLE rh_asistencias (
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
CREATE INDEX idx_rh_asistencias_fecha ON rh_asistencias(fecha);
ALTER TABLE rh_asistencias ENABLE ROW LEVEL SECURITY;
```

Sin fila = día sin registrar (celda vacía). `empleado_bubble_id` referencia
`Empleado._id`; `empleado_nombre` es una copia al momento de registrar, para
que la vista no dependa de una consulta a Bubble para nombres históricos.

### Saldo de vacaciones (calculado, no almacenado)

Tabla LFT (días por año de servicio cumplido):

| Año de servicio | Días |
|---|---|
| 1 | 12 |
| 2 | 14 |
| 3 | 16 |
| 4 | 18 |
| 5 | 20 |
| 6–10 | 22 |
| 11–15 | 24 |
| 16–20 | 26 |
| (+2 cada 5 años adicionales) | ... |

Por cada empleado activo: se toma `FechaIngreso`, se calcula el año de
servicio en curso (aniversario, no año calendario) y los días que le
corresponden en ese periodo. Se restan las filas `estado = 'vacaciones'` de
`rh_asistencias` cuya `fecha` cae dentro del periodo aniversario actual
(de la fecha de ingreso a la misma fecha al año siguiente). No hay acarreo
entre periodos — es una simplificación explícita, documentada aquí para que
quede claro si más adelante se pide lo contrario.

### Backend

Un edge function `rh-asistencia` con dos acciones (mismo patrón que
`config-formas-pago`):

- `obtener` — recibe `{ lunes }` (fecha ISO del lunes de la semana). Trae
  empleados activos de Bubble (`_id`, nombre, área, puesto, FechaIngreso),
  las filas de `rh_asistencias` de esa semana, y el saldo de vacaciones por
  empleado. Devuelve `{ empleados: [{ id, nombre, area, puesto, dias: [7],
  saldoVacaciones: {correspondientes, tomados, restantes} }], resumenSemana:
  {trabajo, descanso, vacaciones, falta, incapacidad, permiso} }`.
- `guardar` — recibe `{ empleadoBubbleId, empleadoNombre, fecha, estado }`
  (`estado: null` para borrar/limpiar la celda). Hace upsert (o delete si
  `estado` es null) en `rh_asistencias` con `onConflict:
  'empleado_bubble_id,fecha'`.

Permiso requerido: `rh` (`requirePermiso(req, 'rh')`).

### UI — `/rh/asistencia`

- Selector de semana: reutiliza `useSemanaSeleccionada` (de
  `src/pages/bi/useSemanaSeleccionada.js`), igual que Reporte Semanal.
- KPIs del resumen de la semana (trabajando, descanso, vacaciones, faltas,
  incapacidades — conteos).
- Cuadrícula: filas = empleados activos, columnas Lun–Dom. Cada celda es un
  badge de color según estado (o vacía si no hay registro); click abre un
  mini-selector con las 6 opciones + "Sin registrar" y guarda al instante
  (llama a `guardar`, actualiza el estado local de forma optimista). Sin
  botón de guardar global.
- Junto al nombre de cada empleado, un badge con su saldo de vacaciones
  restante (`X/Y días`).

## 2. Rotación por área → puesto + lista de colaboradores

Solo lectura. Sin tabla nueva — extiende la misma lectura de Bubble que ya
hace `resumen-rh`.

### Backend

Nuevo edge function `rh-rotacion`, sin acciones (una sola respuesta): trae
`Empleado`, `Área`, `Puestos` de Bubble (igual que `resumen-rh`) y calcula,
por área:

- `activos`, `bajasDelAnio`, `rotacion` (= bajasDelAnio / activos)
- `porPuesto`: `[{ puesto, activos, bajasDelAnio, rotacion }]` dentro de esa
  área
- `colaboradores`: `[{ nombre, puesto, antiguedadMeses, estatus }]` — todos
  los empleados de esa área (activos y de baja), no solo activos, para que
  la lista sea útil como historial.

Devuelve un array con una entrada por área. Rotación por puesto usa la misma
fórmula que la rotación global existente (bajas del año / headcount activo),
aplicada al subconjunto del puesto.

Permiso: `rh`.

### UI — `/rh/rotacion`

- Selector de área (dropdown, default: la primera por headcount).
- KPIs de esa área: Activos, Bajas del año, Rotación%.
- Tarjetas de rotación por puesto dentro del área seleccionada.
- Tabla "Lista de colaboradores": Nombre, Puesto, Antigüedad (meses),
  Estatus (badge, no editable — ninguna acción de edición/borrado, a
  diferencia del Bubble original).

## 3. Pagos de nómina reales

### Modelo de datos

```sql
CREATE TABLE rh_pagos_nomina (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha_pago date NOT NULL,
  monto numeric(12,2) NOT NULL CHECK (monto >= 0),
  registrado_por uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_rh_pagos_nomina_fecha ON rh_pagos_nomina(fecha_pago);
ALTER TABLE rh_pagos_nomina ENABLE ROW LEVEL SECURITY;
```

Un registro simple por pago semanal (normalmente lunes), sin desglose —
igual que el Bubble original.

### Backend

Edge function `rh-pagos-nomina`, dos acciones:

- `listar` — devuelve `{ nominaYtd, ultimoPago: {fecha, monto} | null,
  pagos: [...últimos N] }`. `nominaYtd` suma `monto` de filas con
  `fecha_pago` en el año en curso (calendario, consistente con el resto del
  dashboard que ya es YTD calendario).
- `registrar` — recibe `{ fechaPago, monto }`, inserta la fila.

Permiso: `rh`.

### UI

Sin página dedicada. En el overview de `/rh`:

- Botón "Registrar Pago Nómina" en el header, abre un modal simple (fecha +
  monto), guarda y refresca el KPI.
- KPI "Nómina YTD" (real, de `rh-pagos-nomina`) con sub-label "último
  registro: {fecha}".

## Reestructuración de `/rh`

`/rh` pasa a ser un overview (mismo patrón que `VentasOverview.jsx` /
`Overview.jsx`):

- Fila de KPIs: Headcount activo, Rotación YTD, Nómina YTD real, Nómina
  estimada/mes (se conserva — la estimada es proyección hacia adelante, la
  real es histórica; no son redundantes), Antigüedad promedio.
- Botón "Registrar Pago Nómina" en el header.
- Bloques clicables: "Rotación por área" → `/rh/rotacion`, "Asistencia
  semanal" → `/rh/asistencia`.

`resumen-rh` se mantiene para los KPIs base del overview (headcount,
rotación global, antigüedad, nómina estimada); `rh-rotacion` es la fuente
del desglose en la página dedicada.

## Rutas nuevas

- `/rh` — overview (reemplaza el contenido actual de `RH.jsx`)
- `/rh/rotacion` — nueva página
- `/rh/asistencia` — nueva página

Todas bajo el permiso `rh` ya existente (`SoloPermiso seccion="rh"` en
`App.jsx`), sin permisos nuevos.

## Fuera de alcance (explícitamente pospuesto)

- Chat de IA "Pregunta sobre el equipo" — requiere integrar un LLM, se
  aborda como proyecto aparte si se pide después.
- Editar estatus / dar de baja empleados desde VURA BI — se sigue haciendo
  en Bubble.
- Desglose de nómina por concepto/área/empleado — el registro sigue siendo
  un total simple, como en Bubble.
- Acarreo de días de vacaciones no usados entre periodos aniversario.
