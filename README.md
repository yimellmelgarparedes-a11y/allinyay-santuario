# ALLINYAY · Santuarios digitales para amigurumis conmemorativos

Plataforma completa (landing + panel administrador + santuario público
multi-tenant) para que cada amigurumi ALLINYAY tenga su propio santuario
digital, accesible al escanear un código QR.

- **Frontend:** HTML5 + CSS3 + JavaScript ES6 puro (sin frameworks, sin build step)
- **Backend:** Supabase (PostgreSQL + Auth + Storage)
- **Hosting:** GitHub Pages (sitio 100% estático)

No hay un HTML por cliente: **una sola plataforma** carga dinámicamente
cualquier santuario a partir de su `slug` (`/s/{slug}`).

---

## 1. Estructura del proyecto

```
/
├── index.html          Landing page
├── login.html           Login del panel (Supabase Auth)
├── dashboard.html        Panel administrador
├── santuario.html        Página pública del santuario (multi-tenant)
├── 404.html              Error 404 + redirección de /s/{slug}
├── robots.txt
├── sitemap.xml
├── css/
│   ├── style.css          Sistema de diseño base (toda la plataforma)
│   ├── animations.css     Keyframes y utilidades de animación
│   ├── dashboard.css      Layout del panel (sidebar, stats, grilla)
│   └── admin.css          Editor de un santuario (tabs, uploader, QR)
├── js/
│   ├── app.js             Entrypoint de index.html
│   ├── dashboard.js       Entrypoint de dashboard.html
│   ├── gallery.js         Entrypoint de santuario.html
│   ├── supabase.js        Cliente único de Supabase
│   ├── config.js          ⚠️ ÚNICO archivo que debes editar para conectar tu proyecto
│   ├── auth.js            Login/logout/sesión
│   ├── storage.js         Subida/compresión/borrado de archivos
│   ├── qr.js               Generación y descarga del QR
│   └── utils.js            Helpers puros
├── components/
│   ├── navbar.js, footer.js, modal.js, toast.js, loader.js
├── sql/
│   └── database.sql        Esquema completo (tablas, índices, triggers, vista pública)
├── policies/
│   ├── rls.sql              Row Level Security de todas las tablas
│   └── storage.sql          Policies del bucket de Storage
└── assets/
    ├── icons/favicon.svg
    ├── backgrounds/         ⚠️ agrega aquí tu og-cover.jpg (ver sección 7)
    ├── logos/
    └── fonts/
```

---

## 2. Crear el proyecto en Supabase

1. Ve a [app.supabase.com](https://app.supabase.com) → **New project**.
2. Elige nombre, contraseña de base de datos y región (la más cercana a tus
   clientes, p. ej. `South America (São Paulo)`).
3. Espera a que el proyecto termine de aprovisionarse (1-2 minutos).

---

## 3. Importar el esquema SQL

En **SQL Editor → New query**, pega y ejecuta, **en este orden exacto**:

1. `sql/database.sql` — crea las 10 tablas, índices, triggers y la vista
   pública `santuarios_publicos`.
2. `policies/rls.sql` — activa Row Level Security y crea todas las políticas.
3. `policies/storage.sql` — políticas del bucket (requiere que el bucket ya
   exista, ver paso 4).

> Ejecuta cada archivo completo de una vez ("Run"). Si algo falla, revisa el
> mensaje de error: normalmente es porque un paso anterior no se ejecutó.

---

## 4. Crear el bucket de Storage

1. **Storage → New bucket**.
2. Nombre exacto: `allinyay-storage` (debe coincidir con `STORAGE_BUCKET` en
   `js/config.js`).
3. **Public bucket: NO.** El acceso se controla con las políticas de
   `policies/storage.sql`, no haciendo el bucket público.
4. Ahora sí, ejecuta `policies/storage.sql` (paso 3.3) si no lo hiciste aún.

---

## 5. Crear tu primer usuario administrador

Supabase no expone un formulario público de registro en esta plataforma (el
registro es solo por invitación del equipo ALLINYAY). Para crear tu primera
cuenta:

1. **Authentication → Users → Add user → Create new user**.
2. Ingresa tu correo y una contraseña. Marca **Auto Confirm User**.
3. Un trigger (`handle_new_user`) crea automáticamente tu fila en
   `public.usuarios` con rol `admin`.
4. (Opcional) Si quieres que sea **superadmin** (ve todos los santuarios de
   todos los usuarios), edita esa fila en **Table Editor → usuarios** y
   cambia `rol` a `superadmin`.

---

## 6. Configurar `js/config.js`

Este es el **único archivo que debes editar** para conectar la plataforma a
tu proyecto:

```js
export const CONFIG = {
  SUPABASE_URL: 'https://TU-PROYECTO.supabase.co',
  SUPABASE_ANON_KEY: 'TU_ANON_KEY_PUBLICA_AQUI',
  ...
};
```

Encuentra estos valores en **Project Settings → API** dentro de tu proyecto
de Supabase:
- **Project URL** → `SUPABASE_URL`
- **anon public key** → `SUPABASE_ANON_KEY`

Esta clave es segura de exponer en el navegador porque **todo** el acceso
real a los datos está controlado por las políticas RLS que ya instalaste —
sin esas políticas, ninguna anon key es segura, así que no te saltes el
paso 3.

---

## 7. Assets pendientes de reemplazar

La carpeta `/assets/` trae la estructura lista, pero **las imágenes reales
son tuyas** (fotos de producto, logo, fuentes si no usas Google Fonts):

- `assets/icons/favicon.svg` → ya incluido, puedes reemplazarlo por tu logo.
- `assets/backgrounds/og-cover.jpg` → imagen 1200×630px usada al compartir
  la landing en redes (Open Graph). Agrégala o cambia las rutas en
  `index.html` y `santuario.html` si usas otro nombre.
- `assets/logos/` → variantes de tu logo si las necesitas en otras piezas.
- `assets/fonts/` → solo si decides auto-alojar tipografías en vez de usar
  Google Fonts (ya configurado vía `@import` en `css/style.css`).

---

## 8. Cómo funciona el QR y las URLs `/s/{slug}`

GitHub Pages es 100% estático: no puede crear una ruta `/s/{slug}` real por
cada santuario. La solución (ya implementada) es:

1. Cada santuario tiene un `slug` único generado automáticamente en la base
   de datos (`generar_slug()` en `database.sql`).
2. El QR (generado desde el panel, `js/qr.js`) codifica
   `https://tu-dominio/s/{slug}`.
3. Como esa ruta no existe como archivo, GitHub Pages sirve `404.html`.
4. `404.html` detecta el patrón `/s/{slug}` y redirige inmediatamente a
   `/santuario.html?slug={slug}`, que sí sabe cargar el santuario desde
   Supabase.

No necesitas hacer nada para que esto funcione — solo asegúrate de que
**"404.html" esté en la raíz del repositorio**, que es donde GitHub Pages lo
busca automáticamente.

---

## 9. Desplegar en GitHub Pages

1. Crea un repositorio en GitHub (público o privado, ambos sirven con
   GitHub Pages si tienes plan que lo permita) y sube **todo** el contenido
   de esta carpeta a la raíz del repositorio (no dentro de una subcarpeta).
2. **Settings → Pages**:
   - **Source:** `Deploy from a branch`
   - **Branch:** `main` (o la que uses) → carpeta `/ (root)`
3. Guarda. GitHub te dará una URL como
   `https://tu-usuario.github.io/tu-repo/`.
4. (Opcional) **Dominio propio:** en **Settings → Pages → Custom domain**,
   escribe tu dominio y configura un registro `CNAME` en tu proveedor de DNS
   apuntando a `tu-usuario.github.io`. GitHub crea automáticamente un
   archivo `CNAME` en el repo.
5. Actualiza `robots.txt` y `sitemap.xml` reemplazando `TU-DOMINIO` por tu
   dominio real.

> Nota: si tu repo se llama distinto a tu usuario (`tu-usuario.github.io`),
> tus rutas absolutas (`/css/style.css`, `/js/app.js`, etc.) solo funcionan
> tal cual con un dominio propio o con `usuario.github.io` como raíz. Si
> publicas en `usuario.github.io/nombre-repo/`, tendrás que ajustar todas
> las rutas absolutas a relativas o usar un dominio propio (recomendado
> para un producto comercial).

---

## 10. Probarlo en local antes de publicar

Como los módulos JS usan `type="module"` e imports con rutas absolutas
(`/js/...`), necesitas un servidor local simple (abrir el HTML directo con
`file://` no funciona por CORS de módulos):

```bash
# Con Python (ya viene instalado en la mayoría de sistemas)
python3 -m http.server 8080

# o con Node
npx serve .
```

Abre `http://localhost:8080/index.html`.

---

## 11. Actualizar el sitio

Cada vez que quieras publicar cambios:

```bash
git add .
git commit -m "Describe tu cambio"
git push
```

GitHub Pages reconstruye el sitio automáticamente en 1-2 minutos.

---

## 12. Backups

- **Base de datos:** Supabase hace backups automáticos diarios en los
  planes de pago; en el plan gratuito, exporta manualmente desde
  **Database → Backups**, o corre `pg_dump` con las credenciales de
  conexión (**Project Settings → Database**).
- **Storage:** no tiene backup automático incluido; puedes sincronizar el
  bucket periódicamente con `rclone` o el CLI de Supabase
  (`supabase storage cp` en bucle sobre las rutas de `archivos`).
- **Código:** ya vive en GitHub, que es tu backup de código.

---

## 13. Resumen de tablas (ver `sql/database.sql` para el detalle completo)

| Tabla | Propósito |
|---|---|
| `usuarios` | Perfil extendido de cada administrador |
| `familias` | Cliente/familia dueña de uno o más santuarios |
| `santuarios` | El corazón del sistema: un amigurumi = un santuario |
| `archivos` | Metadatos de cada archivo subido a Storage |
| `recuerdos` | Fotos, videos, audios, frases y eventos del santuario |
| `comentarios` | Mensajes de visitantes, sujetos a moderación |
| `visitas` | Registro de cada visita, para estadísticas |
| `qr` | Metadatos del QR de cada santuario (URL, contador de escaneos) |
| `estadisticas` | Agregados diarios por santuario |
| `configuracion` | Ajustes globales de la plataforma |

---

## 14. Seguridad

- Row Level Security está activo en **todas** las tablas (`policies/rls.sql`).
- Un administrador solo ve y edita sus propios santuarios (o todos, si es
  `superadmin`).
- El público (`anon`) solo puede leer santuarios `activo` + `publicado`, e
  insertar comentarios/recuerdos de visitante si `comentarios_activos = true`.
- Los mensajes de visitantes nunca se muestran públicamente sin que un
  administrador los apruebe (`comentarios.aprobado`).

---

¿Dudas sobre un módulo específico? Cada archivo `.js` trae un bloque de
comentario en la cabecera explicando su responsabilidad.
