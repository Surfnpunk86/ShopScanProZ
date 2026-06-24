# ShopScan Pro — Backend API

API que potencia el frontend de ShopScan Pro con datos reales de:

- **Google PageSpeed Insights** → Core Web Vitals reales (LCP, CLS, TBT, etc.)
- **SEO técnico** → scraping y análisis on-page (meta tags, headings, schema, alt text, etc.)
- **Shopify Admin API** → auditoría de catálogo de productos (cuando se cuenta con token de la tienda)

---

## 1. Requisitos previos

- Cuenta en [Render](https://render.com) (gratis para empezar)
- Cuenta en [GitHub](https://github.com) para subir este código
- API Key de Google PageSpeed Insights (ver paso 3)

---

## 2. Estructura del proyecto

```
shopscan-backend/
├── server.js              # punto de entrada
├── routes/
│   ├── pagespeed.js        # GET /api/pagespeed?url=...
│   ├── seo-scan.js          # GET /api/seo-scan?url=...
│   └── shopify.js           # GET /api/shopify/products?shop=...&token=...
├── package.json
├── .env.example
└── .gitignore
```

---

## 3. Obtener la API Key de Google PageSpeed Insights

1. Ir a [Google Cloud Console](https://console.cloud.google.com/)
2. Crear un proyecto nuevo (o usar uno existente)
3. Ir a **APIs y servicios → Biblioteca**
4. Buscar **"PageSpeed Insights API"** y hacer clic en **Habilitar**
5. Ir a **APIs y servicios → Credenciales → Crear credenciales → Clave de API**
6. Copiar la clave generada (la usarás como `PAGESPEED_API_KEY`)

Cuota gratuita: 25,000 consultas/día — más que suficiente para uso de agencia.

---

## 4. Probar localmente (opcional)

```bash
cd shopscan-backend
npm install
cp .env.example .env
# Edita .env y pega tu PAGESPEED_API_KEY
npm start
```

Prueba en el navegador:
```
http://localhost:3000/api/seo-scan?url=https://tutienda.myshopify.com
http://localhost:3000/api/pagespeed?url=https://tutienda.myshopify.com
```

---

## 5. Desplegar en Render

### Paso 1: Subir el código a GitHub
1. Crea un repositorio nuevo en GitHub (puede ser privado)
2. Sube esta carpeta `shopscan-backend` al repositorio

### Paso 2: Crear el servicio en Render
1. Entra a [render.com](https://render.com) y crea cuenta / inicia sesión
2. Clic en **New + → Web Service**
3. Conecta tu cuenta de GitHub y selecciona el repositorio
4. Configura:
   - **Name**: `shopscan-pro-api` (o el nombre que prefieras)
   - **Region**: la más cercana (Oregon o similar)
   - **Branch**: `main`
   - **Root Directory**: déjalo vacío si el repo solo contiene este backend
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free` (para empezar)

### Paso 3: Configurar variables de entorno
En la sección **Environment** del servicio, agrega:
- `PAGESPEED_API_KEY` = tu clave de Google
- (opcional) `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_SCOPES` si vas a usar la integración de Shopify

### Paso 4: Deploy
Clic en **Create Web Service**. Render instalará dependencias y arrancará el servidor automáticamente. Te dará una URL pública como:

```
https://shopscan-pro-api.onrender.com
```

> **Nota**: el plan Free de Render "duerme" el servicio tras 15 minutos de inactividad. La primera llamada después de inactividad puede tardar ~30 segundos en responder. Para uso de producción con clientes, considera el plan Starter (~$7/mes) que mantiene el servicio siempre activo.

---

## 6. Conectar con el frontend (shopscan-pro.html)

En el archivo `shopscan-pro.html`, dentro de la función `startScan()`, reemplaza la generación de datos simulados (`generateMockData`) por llamadas reales:

```javascript
const API_BASE = 'https://shopscan-pro-api.onrender.com';

async function fetchRealData(storeUrl) {
  const [seoRes, speedRes] = await Promise.all([
    fetch(`${API_BASE}/api/seo-scan?url=${encodeURIComponent(storeUrl)}`),
    fetch(`${API_BASE}/api/pagespeed?url=${encodeURIComponent(storeUrl)}`)
  ]);

  const seoData = await seoRes.json();
  const speedData = await speedRes.json();

  return { seoData, speedData };
}
```

Luego mapea `seoData` y `speedData` a la estructura que usan las funciones `renderIssues()`, `renderSeo()`, `renderSpeed()`, etc.

---

## 7. Integración con Shopify (cuando esté lista)

Para analizar la tienda de un cliente real:

1. En el admin de Shopify del cliente: **Configuración → Apps y canales de venta → Desarrollar apps**
2. Crear una **Custom App**
3. Configurar scopes: `read_products`, `read_themes`, `read_content`
4. Instalar la app y copiar el **Admin API access token**
5. Llamar:
```
GET /api/shopify/products?shop=clientestore.myshopify.com&token=shpat_xxxxx
```

Esto requiere que el cliente te dé acceso — ideal para incluirlo como parte del onboarding de tu servicio de auditoría.

---

## 8. Próximos pasos sugeridos

- [ ] Agregar caché (Redis o memoria) para no repetir llamadas a PageSpeed en la misma URL durante X minutos
- [ ] Agregar rate limiting para evitar abuso del endpoint público
- [ ] Endpoint de exportación a PDF con branding de LaFête América
- [ ] Guardar historial de escaneos por cliente (base de datos: PostgreSQL en Render o Supabase)
