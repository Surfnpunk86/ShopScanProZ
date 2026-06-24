const express = require('express');
const router = express.Router();

/**
 * Shopify integration — base structure.
 *
 * To analyze a real client's store you need:
 *  1. A Shopify Partner account + Custom App (or Public App for multiple clients)
 *  2. The store's Admin API access token (OAuth flow for public apps,
 *     or a private/custom app token for single-store internal use)
 *  3. Scopes: read_products, read_themes, read_content, read_orders (as needed)
 *
 * Set these in your .env:
 *   SHOPIFY_API_KEY=
 *   SHOPIFY_API_SECRET=
 *   SHOPIFY_SCOPES=read_products,read_themes,read_content
 *   SHOPIFY_APP_URL=https://your-backend.onrender.com
 *
 * For a single internal store (LaFête analyzing its own dev store or a
 * client that gives you a Custom App token directly), you can skip OAuth
 * and just call the Admin API with a static token per request, e.g.:
 *
 *   GET /api/shopify/products?shop=mystore.myshopify.com&token=shpat_xxx
 */

const SHOPIFY_API_VERSION = '2024-10';

function shopifyHeaders(token) {
  return {
    'X-Shopify-Access-Token': token,
    'Content-Type': 'application/json'
  };
}

/**
 * GET /api/shopify/products?shop=mystore.myshopify.com&token=shpat_xxx
 * Returns basic product data for a quick catalog audit
 * (missing descriptions, images, alt text, etc.)
 */
router.get('/products', async (req, res) => {
  const { shop, token, limit = 50 } = req.query;

  if (!shop || !token) {
    return res.status(400).json({
      error: 'Missing required query params: shop and token',
      hint: 'shop = mystore.myshopify.com, token = Admin API access token from a Custom App'
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
    console.error('Shopify products error:', err);
    res.status(500).json({ error: 'Failed to fetch Shopify products', details: err.message });
  }
});

/**
 * GET /api/shopify/shop-info?shop=mystore.myshopify.com&token=shpat_xxx
 * Basic store metadata (plan, currency, domain, etc.)
 */
router.get('/shop-info', async (req, res) => {
  const { shop, token } = req.query;

  if (!shop || !token) {
    return res.status(400).json({ error: 'Missing required query params: shop and token' });
  }

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
    console.error('Shopify shop-info error:', err);
    res.status(500).json({ error: 'Failed to fetch shop info', details: err.message });
  }
});

module.exports = router;
