# Ventas por PLU — La Trattoria

## Setup

1. Instalar dependencias:
   ```bash
   npm install
   ```

2. Configurar Supabase:
   - Copia `.env.example` a `.env`
   - Rellena `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`
   - En Supabase Dashboard → SQL Editor → ejecuta el contenido de `supabase/schema.sql`

3. Correr en desarrollo:
   ```bash
   npm run dev
   ```

4. Build para producción:
   ```bash
   npm run build
   ```

## Funcionalidades

- **Registrar día**: ingresa ventas diarias por producto (PLU)
- **Lista de productos**: ve y edita precios con historial de cambios
- **Ver errores**: detecta productos sin datos en días del mes actual
- **Auditar por día**: revisa y elimina registros de cualquier día

## Deploy (Vercel)

```bash
npm i -g vercel
vercel --prod
```
Agrega las variables de entorno en el dashboard de Vercel.
