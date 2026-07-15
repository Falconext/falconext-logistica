# Despliegue — Frontend + Backend en Vercel, Base de datos en Neon

Arquitectura:

```
Frontend (Next.js)  →  Backend NestJS (serverless)  →  PostgreSQL
   Vercel proyecto A      Vercel proyecto B               Neon
```

El repo ya quedó preparado para esto (URL del API por variable, bcryptjs, Prisma con
`directUrl`, handler serverless `apps/api/api/index.ts`, `vercel.json`, CORS por
`FRONTEND_URL`, y credenciales de Google Sheets por variable de entorno).

---

## 0. Requisitos
- Cuenta en **GitHub** con este repo subido.
- Cuenta en **Vercel** (gratis).
- Cuenta en **Neon** (gratis) — ya la tienes.

---

## 1. Base de datos en Neon
1. En Neon → **New Project** → nombre `logistica`, región **AWS US East 1** (la misma que el proyecto de Vercel, para baja latencia).
2. En el proyecto → **Connection Details**. Copia **dos** cadenas:
   - **Pooled** (la que trae `-pooler` en el host) → será `DATABASE_URL`.
   - **Direct** (sin `-pooler`) → será `DIRECT_URL`. (Si solo ves una, activa el switch "Connection pooling" para ver la pooled; la directa es la misma sin `-pooler`.)
   - Ambas deben terminar en `?sslmode=require`.

## 2. Cargar el esquema (y datos) en Neon
Desde tu máquina, apuntando el `.env` del API a Neon **temporalmente**:

```bash
cd apps/api
# Edita apps/api/.env y pon DATABASE_URL (pooled) y DIRECT_URL (direct) de Neon.
npx prisma db push        # crea todas las tablas en Neon
```

**Migrar tus datos actuales** (opcional, si quieres conservar lo que tienes en local):
```bash
# Volcar SOLO los datos del Postgres local
pg_dump "postgresql://logistica:logistica_dev@localhost:5439/logistica" \
  --data-only --no-owner --no-privileges --disable-triggers \
  -f datos.sql
# Cargarlos en Neon (usa la cadena DIRECT)
psql "TU_DIRECT_URL_DE_NEON" -f datos.sql
```
> Si prefieres empezar limpio, sáltate el volcado y crea el usuario admin desde la app.

Al terminar, vuelve a dejar tu `.env` local apuntando a `localhost:5439` para seguir desarrollando.

## 3. Subir el código a GitHub
```bash
git add -A
git commit -m "chore: preparar despliegue Vercel + Neon"
git push
```

## 4. Backend (NestJS) en Vercel
1. Vercel → **Add New → Project** → importa el repo.
2. **Root Directory:** `apps/api`  ← importante.
3. **Framework Preset:** Other. (El Build Command ya viene en `vercel.json`: `pnpm run vercel-build`.)
4. **Environment Variables** (Settings → Environment Variables):
   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | cadena **pooled** de Neon |
   | `DIRECT_URL` | cadena **direct** de Neon |
   | `JWT_SECRET` | una cadena larga y aleatoria |
   | `FRONTEND_URL` | *(la pones en el paso 6)* |
   | `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | tus valores |
   | `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | tus valores |
   | `GOOGLE_CREDENTIALS_JSON` | *(opcional)* el JSON de la service account, crudo o en base64 |
5. **Deploy.** Al terminar tendrás una URL tipo `https://logistica-api.vercel.app`.
6. Prueba: abre `https://logistica-api.vercel.app/api/gps/devices` → debe responder **401** (ruta viva, requiere token). Si responde 401, ¡el backend funciona!

## 5. Frontend (Next.js) en Vercel
1. Vercel → **Add New → Project** → el mismo repo otra vez.
2. **Root Directory:** `apps/web`.
3. **Framework Preset:** Next.js (se detecta solo).
4. **Environment Variables:**
   | Variable | Valor |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | `https://logistica-api.vercel.app/api` (la del paso 4 + `/api`) |
   | `NEXT_PUBLIC_MAPBOX_TOKEN` | tu token de Mapbox |
5. **Deploy.** Tendrás una URL tipo `https://logistica-web.vercel.app`.

## 6. Conectar CORS y redeploy
1. Vuelve al proyecto **backend** en Vercel → Environment Variables → pon
   `FRONTEND_URL = https://logistica-web.vercel.app` (sin `/` final).
2. **Redeploy** el backend (Deployments → ⋯ → Redeploy) para que tome la variable.

## 7. Verificar
- Entra a `https://logistica-web.vercel.app`, inicia sesión y navega. Todo debe cargar desde Neon.

---

## Notas y posibles problemas
- **Arranque en frío:** el backend serverless y Neon (que se duerme a los 5 min) hacen que la **primera** petición tras un rato tarde 1–3 s. Luego va normal. Para eliminarlo en producción real, subir Neon/Vercel a plan de pago.
- **Límites de Neon Free:** 100 CU-horas y 0.5 GB **por proyecto** al mes. Uso ligero va sobrado; si se supera, Neon **suspende** el cómputo hasta el mes siguiente.
- **Timeout de función:** está en 30 s (`vercel.json`). En plan Hobby el máximo es 60 s.
- **Subida de archivos:** las fotos/documentos van a Cloudinary. Si una subida (multipart) fallara en serverless, es el punto más delicado de Vercel; avísame y lo ajustamos.
- **Si algo del backend no arranca en Vercel** (Prisma engine, cold starts, multipart): el plan B más estable para NestJS es **Render** — el frontend seguiría en Vercel y la BD en Neon, sin cambiar casi nada.
