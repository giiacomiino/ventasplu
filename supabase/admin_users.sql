-- =============================================
-- Cambia el alta de usuarios de "invitación por correo" a
-- "el Owner los crea directo desde la app" (vía Edge Function admin-users).
-- Correr esto completo en el SQL Editor de Supabase.
-- =============================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nombre text;

-- Ya no hay auto-registro: se quitan los triggers de invitación y la tabla.
DROP TRIGGER IF EXISTS before_signup_check_invitacion ON auth.users;
DROP TRIGGER IF EXISTS after_signup_create_profile ON auth.users;
DROP FUNCTION IF EXISTS check_invitacion();
DROP FUNCTION IF EXISTS handle_new_user();
DROP TABLE IF EXISTS invitaciones;

-- =============================================
-- IMPORTANTE (manual, una sola vez):
-- En Supabase Dashboard → Authentication → Providers → Email,
-- desactiva "Allow new users to sign up".
-- A partir de ahora todos los usuarios se crean solo desde /usuarios
-- (Owner) vía la Edge Function admin-users, con la service role key.
-- =============================================
