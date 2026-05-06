-- Actualiza ventas_por_subcategoria a lógica MTD vs MTD anterior.
-- FIX: último día calculado por subcategoría (no por categoría entera).
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query

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
  -- Total days in previous month (cap for months shorter than current)
  v_ultimo_mes_ant  := EXTRACT(DAY FROM (v_inicio_actual - INTERVAL '1 day'))::int;

  -- Bail early if no data exists for this category/month
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
    -- Compare each subcategory vs the same day range it reached in the current month
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
