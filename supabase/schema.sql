-- =============================================
-- TABLA 1: productos (catálogo PLU)
-- =============================================
CREATE TABLE IF NOT EXISTS productos (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre       text NOT NULL,
  subcategoria text NOT NULL,
  categoria    text NOT NULL CHECK (categoria IN ('Bebidas', 'Alimentos')),
  activo       boolean DEFAULT true,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_productos_categoria    ON productos(categoria);
CREATE INDEX IF NOT EXISTS idx_productos_subcategoria ON productos(subcategoria);

-- =============================================
-- TABLA 2: precios (historial de precios)
-- =============================================
CREATE TABLE IF NOT EXISTS precios (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  producto_id   uuid REFERENCES productos(id) ON DELETE CASCADE,
  precio        numeric(10,2) NOT NULL,
  vigente_desde date NOT NULL DEFAULT CURRENT_DATE,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_precios_producto_fecha ON precios(producto_id, vigente_desde DESC);

CREATE OR REPLACE VIEW precio_vigente AS
SELECT DISTINCT ON (producto_id)
  producto_id,
  precio,
  vigente_desde
FROM precios
ORDER BY producto_id, vigente_desde DESC;

-- =============================================
-- TABLA 3: ventas_plu (registros diarios)
-- =============================================
CREATE TABLE IF NOT EXISTS ventas_plu (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  producto_id    uuid REFERENCES productos(id) ON DELETE RESTRICT,
  fecha          date NOT NULL,
  unidades       integer NOT NULL CHECK (unidades >= 0),
  monto          numeric(12,2) NOT NULL CHECK (monto >= 0),
  costo_unitario numeric(10,2),
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  UNIQUE (producto_id, fecha)
);

CREATE INDEX IF NOT EXISTS idx_ventas_fecha          ON ventas_plu(fecha);
CREATE INDEX IF NOT EXISTS idx_ventas_producto        ON ventas_plu(producto_id);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha_producto  ON ventas_plu(fecha, producto_id);

-- =============================================
-- FUNCIÓN: ventas por subcategoría MTD vs MTD anterior
-- Compara del día 1 al último día CON DATOS de cada subcategoría
-- contra los mismos días del mes anterior (capped per subcategory).
-- =============================================
CREATE OR REPLACE FUNCTION ventas_por_subcategoria(
  p_categoria text,
  p_year      int,
  p_month     int
)
RETURNS TABLE (
  subcategoria text,
  unidades     bigint,
  monto        numeric,
  mom_pct      numeric
) AS $$
DECLARE
  v_inicio_actual   date;
  v_inicio_anterior date;
  v_ultimo_mes_ant  int;
BEGIN
  v_inicio_actual   := make_date(p_year, p_month, 1);
  v_inicio_anterior := (v_inicio_actual - INTERVAL '1 month')::date;
  v_ultimo_mes_ant  := EXTRACT(DAY FROM (v_inicio_actual - INTERVAL '1 day'))::int;

  IF NOT EXISTS (
    SELECT 1 FROM ventas_plu v
    JOIN productos p ON p.id = v.producto_id
    WHERE p.categoria = p_categoria
      AND EXTRACT(YEAR  FROM v.fecha) = p_year
      AND EXTRACT(MONTH FROM v.fecha) = p_month
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH ultimo_dia_subcat AS (
    -- Last day with data per subcategory in the current month
    SELECT
      p.subcategoria,
      MAX(EXTRACT(DAY FROM v.fecha))::int AS ultimo_dia
    FROM ventas_plu v
    JOIN productos p ON p.id = v.producto_id
    WHERE p.categoria = p_categoria
      AND EXTRACT(YEAR  FROM v.fecha) = p_year
      AND EXTRACT(MONTH FROM v.fecha) = p_month
    GROUP BY p.subcategoria
  ),
  mes_actual AS (
    SELECT
      p.subcategoria,
      SUM(v.unidades)::bigint AS unidades,
      SUM(v.monto)            AS monto
    FROM ventas_plu v
    JOIN productos p ON p.id = v.producto_id
    WHERE p.categoria = p_categoria
      AND EXTRACT(YEAR  FROM v.fecha) = p_year
      AND EXTRACT(MONTH FROM v.fecha) = p_month
    GROUP BY p.subcategoria
  ),
  mes_anterior AS (
    -- Each subcategory compared against its own day range in the prior month
    SELECT
      p.subcategoria,
      SUM(v.monto) AS monto
    FROM ventas_plu v
    JOIN productos p ON p.id = v.producto_id
    JOIN ultimo_dia_subcat u ON u.subcategoria = p.subcategoria
    WHERE p.categoria = p_categoria
      AND v.fecha BETWEEN v_inicio_anterior
                      AND make_date(
                            EXTRACT(YEAR  FROM v_inicio_anterior)::int,
                            EXTRACT(MONTH FROM v_inicio_anterior)::int,
                            LEAST(u.ultimo_dia, v_ultimo_mes_ant)
                          )
    GROUP BY p.subcategoria
  )
  SELECT
    a.subcategoria,
    a.unidades,
    a.monto,
    CASE
      WHEN b.monto IS NULL OR b.monto = 0 THEN NULL
      ELSE ROUND(((a.monto - b.monto) / b.monto * 100)::numeric, 1)
    END AS mom_pct
  FROM mes_actual a
  LEFT JOIN mes_anterior b ON b.subcategoria = a.subcategoria
  ORDER BY a.monto DESC;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- FUNCIÓN: días faltantes por producto
-- =============================================
CREATE OR REPLACE FUNCTION dias_faltantes(
  p_fecha_inicio date DEFAULT date_trunc('month', CURRENT_DATE)::date,
  p_fecha_fin    date DEFAULT (CURRENT_DATE - 1)
)
RETURNS TABLE (
  subcategoria text,
  producto     text,
  registros    bigint,
  faltantes    bigint
) AS $$
  WITH dias AS (
    SELECT generate_series(p_fecha_inicio, p_fecha_fin, '1 day'::interval)::date AS fecha
  ),
  esperados AS (
    SELECT p.id, p.nombre, p.subcategoria, d.fecha
    FROM productos p CROSS JOIN dias d
    WHERE p.activo = true
  ),
  registrados AS (
    SELECT producto_id, fecha FROM ventas_plu
    WHERE fecha BETWEEN p_fecha_inicio AND p_fecha_fin
  )
  SELECT
    e.subcategoria,
    e.nombre                           AS producto,
    COUNT(r.fecha)                     AS registros,
    COUNT(*) - COUNT(r.fecha)          AS faltantes
  FROM esperados e
  LEFT JOIN registrados r ON r.producto_id = e.id AND r.fecha = e.fecha
  GROUP BY e.id, e.subcategoria, e.nombre
  HAVING COUNT(*) - COUNT(r.fecha) > 0
  ORDER BY faltantes DESC, e.subcategoria, e.nombre;
$$ LANGUAGE sql;

-- =============================================
-- RLS (Row Level Security)
-- =============================================
ALTER TABLE productos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE precios    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas_plu ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all" ON productos;
DROP POLICY IF EXISTS "allow_all" ON precios;
DROP POLICY IF EXISTS "allow_all" ON ventas_plu;

CREATE POLICY "allow_all" ON productos  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON precios    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON ventas_plu FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- SEED: 58 productos de La Trattoria
-- =============================================
INSERT INTO productos (nombre, subcategoria, categoria) VALUES
('Limonada',               'Limonada',    'Bebidas'),
('Naranjada',              'Naranjada',   'Bebidas'),
('Clericot',               'Clericot',    'Bebidas'),
('Sangria',                'Sangría',     'Bebidas'),
('Agua de Piedra',         'Agua Mineral','Bebidas'),
('Perrier',                'Agua Mineral','Bebidas'),
('Agua Embotellada',       'Agua',        'Bebidas'),
('Jarra Limonada',         'Jarra',       'Bebidas'),
('Jarra Naranjada',        'Jarra',       'Bebidas'),
('Jarra Sangria',          'Jarra',       'Bebidas'),
('Espresso',               'Café',        'Bebidas'),
('Capuccino',              'Café',        'Bebidas'),
('Corona',                 'Cerveza',     'Bebidas'),
('Modelo Especial',        'Cerveza',     'Bebidas'),
('Negra Modelo',           'Cerveza',     'Bebidas'),
('Victoria',               'Cerveza',     'Bebidas'),
('Copa Vino Importado',    'Copa de Vino','Bebidas'),
('Copa VBco',              'Copa de Vino','Bebidas'),
('Copa Domenico',          'Copa de Vino','Bebidas'),
('Copa Cabernet',          'Copa de Vino','Bebidas'),
('Calamares Fritos',       'Antipasto',   'Alimentos'),
('Carpaccio Salmon',       'Antipasto',   'Alimentos'),
('Carpaccio Res',          'Antipasto',   'Alimentos'),
('Pay Queso Manzana',      'Postre',      'Alimentos'),
('Surtido Pastel',         'Postre',      'Alimentos'),
('Postre Moda',            'Postre',      'Alimentos'),
('Focaccia Barese',        'Focaccia',    'Alimentos'),
('Focaccia 3051',          'Focaccia',    'Alimentos'),
('Botinelli',              'Pizza',       'Alimentos'),
('Quatro Formaggi',        'Pizza',       'Alimentos'),
('Hawaiana',               'Pizza',       'Alimentos'),
('Funghi Pepperoni',       'Pizza',       'Alimentos'),
('Mediterranea',           'Pizza',       'Alimentos'),
('Capricciosa',            'Pizza',       'Alimentos'),
('Margherita',             'Pizza',       'Alimentos'),
('Calabrese',              'Pizza',       'Alimentos'),
('Pepperoni',              'Pizza',       'Alimentos'),
('Fussilli Bizzarro',      'Pasta',       'Alimentos'),
('Spaghetti Ragu',         'Pasta',       'Alimentos'),
('Spaghetti Pomodoro',     'Pasta',       'Alimentos'),
('Spaghetti Arrabiata',    'Pasta',       'Alimentos'),
('Linguini Maratea',       'Pasta',       'Alimentos'),
('Linguini Frutti Mare',   'Pasta',       'Alimentos'),
('Fettuccini Alfredo',     'Pasta',       'Alimentos'),
('Fettuccini Panna e Pollo','Pasta',      'Alimentos'),
('Ravioli',                'Pasta',       'Alimentos'),
('Combinación',            'Pasta',       'Alimentos'),
('Lasagna',                'Pasta',       'Alimentos'),
('Ravioli Fiorentina',     'Pasta',       'Alimentos'),
('Vitello al gusto',       'Carne',       'Alimentos'),
('Carne al gusto',         'Carne',       'Alimentos'),
('Pollo al gusto',         'Pollo',       'Alimentos'),
('Camarón al gusto',       'Camarón',     'Alimentos'),
('Salmon Rosetta',         'Salmón',      'Alimentos'),
('Salmon Plancha',         'Salmón',      'Alimentos'),
('Pescado Plancha',        'Pescado',     'Alimentos'),
('Pescado Empanizado',     'Pescado',     'Alimentos'),
('Pescado Romina',         'Pescado',     'Alimentos')
ON CONFLICT DO NOTHING;
