-- Actualiza ventas_por_subcategoria a lógica MTD vs MTD anterior.
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
  v_ultimo_dia      int;
  v_inicio_actual   date;
  v_fin_actual      date;
  v_inicio_anterior date;
  v_fin_anterior    date;
  v_ultimo_mes_ant  int;
BEGIN
  SELECT MAX(EXTRACT(DAY FROM v.fecha))::int
  INTO v_ultimo_dia
  FROM ventas_plu v
  JOIN productos p ON p.id = v.producto_id
  WHERE p.categoria = p_categoria
    AND EXTRACT(YEAR  FROM v.fecha) = p_year
    AND EXTRACT(MONTH FROM v.fecha) = p_month;

  IF v_ultimo_dia IS NULL THEN
    RETURN;
  END IF;

  v_inicio_actual   := make_date(p_year, p_month, 1);
  v_fin_actual      := make_date(p_year, p_month, v_ultimo_dia);
  v_inicio_anterior := (v_inicio_actual - INTERVAL '1 month')::date;
  v_ultimo_mes_ant  := EXTRACT(DAY FROM (v_inicio_actual - INTERVAL '1 day'))::int;
  v_fin_anterior    := make_date(
    EXTRACT(YEAR  FROM v_inicio_anterior)::int,
    EXTRACT(MONTH FROM v_inicio_anterior)::int,
    LEAST(v_ultimo_dia, v_ultimo_mes_ant)
  );

  RETURN QUERY
  WITH mes_actual AS (
    SELECT
      p.subcategoria,
      SUM(v.unidades)::bigint AS unidades,
      SUM(v.monto)            AS monto
    FROM ventas_plu v
    JOIN productos p ON p.id = v.producto_id
    WHERE p.categoria = p_categoria
      AND v.fecha BETWEEN v_inicio_actual AND v_fin_actual
    GROUP BY p.subcategoria
  ),
  mes_anterior AS (
    SELECT
      p.subcategoria,
      SUM(v.monto) AS monto
    FROM ventas_plu v
    JOIN productos p ON p.id = v.producto_id
    WHERE p.categoria = p_categoria
      AND v.fecha BETWEEN v_inicio_anterior AND v_fin_anterior
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
