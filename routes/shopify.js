const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const SHOPIFY_API_VERSION = '2024-10';
const API_KEY    = process.env.SHOPIFY_API_KEY;
const API_SECRET = process.env.SHOPIFY_API_SECRET;
const SCOPES     = process.env.SHOPIFY_SCOPES || 'read_products,read_content,read_themes';
const APP_URL    = process.env.SHOPIFY_APP_URL || 'https://shopscanproz.onrender.com';

// Guardamos tokens en memoria (temporal — funciona para pruebas)
const tokenStore = {};

function shopifyHeaders(token) {
  return { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' };
}

// ─── 1. INICIO DE OAUTH ───────────────────────────────────────────────────────
// El dueño de la tienda visita esta URL para instalar la app
// GET /api/shopify/auth?shop=mitienda.myshopify.com
router.get('/auth', (req, res) => {
  const { shop } = req.query;
  if (!shop) return res.status(400).json({ error: 'Falta el parámetro ?shop=' });

  const state = crypto.randomBytes(16).toString('hex');
  const redirectUri = `${APP_URL}/api/shopify/callback`;
  const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${API_KEY}&scope=${SCOPES}&redirect_uri=${redirectUri}&state=${state}`;

  res.redirect(installUrl);
});

// ─── 2. CALLBACK DE OAUTH ─────────────────────────────────────────────────────
// Shopify redirige aquí después de que el usuario acepta
// GET /api/shopify/callback
router.get('/callback', async (req, res) => {
  const { shop, code } = req.query;
  if (!shop || !code) return res.status(400).json({ error: 'Faltan parámetros de OAuth' });

  try {
    // Intercambiar code por access token
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: API_KEY, client_secret: API_SECRET, code })
    });

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return res.status(400).json({ error: 'No se pudo obtener el access token', detalle: tokenData });
    }

    // Guardar token (en memoria por ahora)
    tokenStore[shop] = accessToken;

    // Redirigir al usuario con su token para usar la API
    res.json({
      mensaje: '✅ Tienda conectada exitosamente',
      shop,
      accessToken,
      ejemplos: {
        productos: `${APP_URL}/api/shopify/products?shop=${shop}&token=${accessToken}`,
        scoreCompleto: `${APP_URL}/api/score?url=https://${shop}&shop=${shop}&token=${accessToken}`
      }
    });

  } catch (err) {
    res.status(500).json({ error: 'Error en OAuth callback', detalle: err.message });
  }
});

// ─── 3. PRODUCTOS ─────────────────────────────────────────────────────────────
// GET /api/shopify/products?shop=mitienda.myshopify.com&token=shpat_xxx
router.get('/products', async (req, res) => {
  const { shop, token, limit = 50 } = req.query;
  if (!shop || !token) {
    return res.status(400).json({
      error: 'Faltan parámetros: shop y token',
      hint: `Primero conecta tu tienda en: ${APP_URL}/api/shopify/auth?shop=mitienda.myshopify.com`
    });
  }

  try {
    const url = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/products.json?limit=${limit}`;
    const response = await fetch(url, { headers: shopifyHeaders(token) });

    if (!response.ok) {
      const errBody = await response.text();
      return res.status(response.status).json({ error: 'Shopify API error', details: errBody });
    }

    const data = await response.json();
    const products = data.products || [];

    const audit = products.map(p => ({
      id: p.id,
      title: p.title,
      status: p.status,
      hasDescription: !!(p.body_html && p.body_html.trim().length > 50),
      imageCount: p.images?.length || 0,
      imagesWithoutAlt: (p.images || []).filter(img => !img.alt).length,
      variantCount: p.variants?.length || 0,
      tags: p.tags
    }));

    res.json({
      shop,
      totalProducts: products.length,
      productsMissingDescription: audit.filter(p => !p.hasDescription).length,
      productsWithoutImages: audit.filter(p => p.imageCount === 0).length,
      audit,
      fetchedAt: new Date().toISOString()
    });

  } catch (err) {
    res.status(500).json({ error: 'Error al obtener productos', details: err.message });
  }
});

// ─── 4. INFO DE LA TIENDA ─────────────────────────────────────────────────────
// GET /api/shopify/shop-info?shop=mitienda.myshopify.com&token=shpat_xxx
router.get('/shop-info', async (req, res) => {
  const { shop, token } = req.query;
  if (!shop || !token) return res.status(400).json({ error: 'Faltan parámetros: shop y token' });

  try {
    const url = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/shop.json`;
    const response = await fetch(url, { headers: shopifyHeaders(token) });

    if (!response.ok) {
      const errBody = await response.text();
      return res.status(response.status).json({ error: 'Shopify API error', details: errBody });
    }

    const data = await response.json();
    res.json({ shop: data.shop, fetchedAt: new Date().toISOString() });

  } catch (err) {
    res.status(500).json({ error: 'Error al obtener info de tienda', details: err.message });
  }
});

module.exports = router;
