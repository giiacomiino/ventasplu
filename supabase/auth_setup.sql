-- =============================================
-- LOGIN Y ROLES: profiles, invitaciones, triggers, RLS
-- Correr esto completo en el SQL Editor de Supabase.
-- =============================================

-- TABLA: profiles (un perfil por usuario de auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      text NOT NULL,
  rol        text NOT NULL CHECK (rol IN ('owner', 'admin', 'rh')),
  created_at timestamptz DEFAULT now()
);

-- TABLA: invitaciones (correos autorizados a registrarse, con su rol)
CREATE TABLE IF NOT EXISTS invitaciones (
  email        text PRIMARY KEY,
  rol          text NOT NULL CHECK (rol IN ('owner', 'admin', 'rh')),
  invitado_por uuid REFERENCES profiles(id),
  created_at   timestamptz DEFAULT now()
);

-- TRIGGER: bloquear signup de correos no invitados
-- (search_path explícito: los triggers en auth.users no heredan "public")
CREATE OR REPLACE FUNCTION check_invitacion()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.invitaciones WHERE email = NEW.email) THEN
    RAISE EXCEPTION 'Este correo no tiene invitación';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS before_signup_check_invitacion ON auth.users;
CREATE TRIGGER before_signup_check_invitacion
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION check_invitacion();

-- TRIGGER: crear profile con el rol invitado y consumir la invitación
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_rol text;
BEGIN
  SELECT rol INTO v_rol FROM public.invitaciones WHERE email = NEW.email;
  INSERT INTO public.profiles (id, email, rol) VALUES (NEW.id, NEW.email, v_rol);
  DELETE FROM public.invitaciones WHERE email = NEW.email;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS after_signup_create_profile ON auth.users;
CREATE TRIGGER after_signup_create_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- FUNCIONES AUXILIARES (SECURITY DEFINER evita la recursión infinita que da
-- Postgres cuando una política de RLS de "profiles" vuelve a consultar "profiles").
CREATE OR REPLACE FUNCTION public.has_profile()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rol = 'owner');
$$;

-- RLS: profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ver propio perfil"    ON profiles;
DROP POLICY IF EXISTS "owner ve todo"        ON profiles;
DROP POLICY IF EXISTS "owner actualiza roles" ON profiles;
DROP POLICY IF EXISTS "owner borra perfiles"  ON profiles;

CREATE POLICY "ver propio perfil" ON profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "owner ve todo" ON profiles
  FOR SELECT USING (is_owner());

CREATE POLICY "owner actualiza roles" ON profiles
  FOR UPDATE USING (is_owner());

CREATE POLICY "owner borra perfiles" ON profiles
  FOR DELETE USING (is_owner());

-- RLS: invitaciones (solo owner)
ALTER TABLE invitaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner administra invitaciones" ON invitaciones;

CREATE POLICY "owner administra invitaciones" ON invitaciones
  FOR ALL USING (is_owner()) WITH CHECK (is_owner());

-- RLS: cerrar el acceso público en productos/precios/ventas_plu,
-- ahora requiere tener un profile (cualquier rol).
DROP POLICY IF EXISTS "allow_all" ON productos;
DROP POLICY IF EXISTS "allow_all" ON precios;
DROP POLICY IF EXISTS "allow_all" ON ventas_plu;
DROP POLICY IF EXISTS "usuarios con perfil" ON productos;
DROP POLICY IF EXISTS "usuarios con perfil" ON precios;
DROP POLICY IF EXISTS "usuarios con perfil" ON ventas_plu;

CREATE POLICY "usuarios con perfil" ON productos
  FOR ALL USING (has_profile()) WITH CHECK (has_profile());

CREATE POLICY "usuarios con perfil" ON precios
  FOR ALL USING (has_profile()) WITH CHECK (has_profile());

CREATE POLICY "usuarios con perfil" ON ventas_plu
  FOR ALL USING (has_profile()) WITH CHECK (has_profile());

-- =============================================
-- ALTA DEL PRIMER OWNER (correr una sola vez)
-- El trigger de invitación bloquea CUALQUIER alta en auth.users, incluida
-- la del Dashboard, así que primero te "invitas" a ti mismo por SQL:
--
-- INSERT INTO invitaciones (email, rol) VALUES ('tu-email@ejemplo.com', 'owner');
--
-- Luego ve a Supabase Dashboard → Authentication → Add User, crea tu usuario
-- con ESE MISMO email y una password. El trigger crea tu profile
-- automáticamente con rol 'owner' y borra la invitación.
-- =============================================
