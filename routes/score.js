const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Falta el parámetro ?url=https://tutienda.com' });

  try {
    // --- PASO 1: PageSpeed ---
    const psUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${process.env.PAGESPEED_API_KEY}&strategy=mobile`;
    const psRes = await fetch(psUrl);
    const psData = await psRes.json();

    const audits   = psData.lighthouseResult?.audits || {};
    const cats     = psData.lighthouseResult?.categories || {};
    const lcp      = (audits['largest-contentful-paint']?.numericValue || 0) / 1000;
    const fcp      = (audits['first-contentful-paint']?.numericValue || 0) / 1000;
    const cls      = audits['cumulative-layout-shift']?.numericValue || 0;
    const tbt      = audits['total-blocking-time']?.numericValue || 0;

    // --- PASO 2: Score Velocidad ---
    let velocidad = 100;
    const issues = [];

    if (lcp > 4.0) {
      velocidad -= 40;
      issues.push({ tipo: `LCP > ${lcp.toFixed(1)}s`, categoria: 'Velocidad', severidad: 'CRÍTICO' });
    } else if (lcp > 2.5) {
      velocidad -= 20;
      issues.push({ tipo: `LCP ${lcp.toFixed(1)}s mejorable`, categoria: 'Velocidad', severidad: 'ALERTA' });
    }
    if (cls > 0.25) {
      velocidad -= 20;
      issues.push({ tipo: 'Layout shift alto (CLS)', categoria: 'UX', severidad: 'CRÍTICO' });
    }
    if (tbt > 600) {
      velocidad -= 15;
      issues.push({ tipo: 'Tiempo de bloqueo alto (TBT)', categoria: 'UX', severidad: 'ALERTA' });
    }

    // --- PASO 3: SEO scan (usa tu ruta existente) ---
    const seoRes  = await fetch(`https://shopscanproz.onrender.com/api/seo-scan?url=${encodeURIComponent(url)}`);
    const seoData = await seoRes.json();

    // Estos nombres vienen exactamente de tu seo-scan.js
    const tieneTitle       = !!seoData.title;
    const tieneMeta        = !!seoData.metaDescription;
    const tieneH1          = seoData.h1Count >= 1;
    const tieneViewport    = seoData.checks?.find(c => c.name === 'Meta viewport (mobile)')?.status === 'pass';
    const tieneOG          = seoData.checks?.find(c => c.name === 'Open Graph tags')?.status === 'pass';
    const imgSinAlt        = seoData.images?.withoutAlt || 0;

    let seo = 100;
    if (!tieneTitle) {
      seo -= 20;
      issues.push({ tipo: 'Title tag faltante', categoria: 'SEO', severidad: 'CRÍTICO' });
    }
    if (!tieneMeta) {
      seo -= 25;
      issues.push({ tipo: 'Meta descripción faltante', categoria: 'SEO', severidad: 'CRÍTICO' });
    }
    if (!tieneH1) {
      seo -= 15;
      issues.push({ tipo: 'H1 faltante', categoria: 'SEO', severidad: 'ALERTA' });
    }
    if (!tieneViewport) {
      seo -= 15;
      issues.push({ tipo: 'Sin meta viewport (no mobile-friendly)', categoria: 'SEO', severidad: 'CRÍTICO' });
    }
    if (!tieneOG) {
      seo -= 10;
      issues.push({ tipo: 'Sin Open Graph tags', categoria: 'SEO', severidad: 'ALERTA' });
    }
    if (imgSinAlt > 0) {
      seo -= Math.min(15, imgSinAlt * 3);
      issues.push({ tipo: `${imgSinAlt} imágenes sin alt text`, categoria: 'SEO', severidad: 'ALERTA' });
    }

// --- PASO 4: Conversión con datos reales de Shopify ---
let conversion = 100;

const { shop, token } = req.query;

if (shop && token) {
  try {
    const SHOPIFY_API_VERSION = '2024-10';
    const shopifyRes = await fetch(
      `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/products.json?limit=50`,
      { headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' } }
    );
    const shopifyData = await shopifyRes.json();
    const products = shopifyData.products || [];

    const sinDescripcion = products.filter(p => !p.body_html || p.body_html.trim().length < 50).length;
    const sinImagen = products.filter(p => !p.images || p.images.length === 0).length;

    if (sinDescripcion > 0) {
      conversion -= Math.min(30, sinDescripcion * 5);
      issues.push({
        tipo: `${sinDescripcion} productos sin descripción`,
        categoria: 'CRO',
        severidad: sinDescripcion > 3 ? 'CRÍTICO' : 'ALERTA'
      });
    }

    if (sinImagen > 0) {
      conversion -= Math.min(25, sinImagen * 5);
      issues.push({
        tipo: `${sinImagen} productos sin imagen`,
        categoria: 'CRO',
        severidad: 'CRÍTICO'
      });
    }

    if (products.length === 0) {
      conversion -= 20;
      issues.push({
        tipo: 'Tienda sin productos publicados',
        categoria: 'CRO',
        severidad: 'CRÍTICO'
      });
    }

  } catch (e) {
    console.log('Error Shopify en score:', e.message);
    conversion = 70;
  }
}

conversion = Math.max(0, conversion);

conversion = Math.max(0, conversion);
    const ux = Math.max(0, 100 - (cls > 0.25 ? 30 : 0) - (tbt > 600 ? 20 : 0) - (!tieneViewport ? 25 : 0));

    // --- PASO 5: Score global ponderado ---
    const scoreGlobal = Math.round(
      Math.max(0, velocidad) * 0.25 +
      Math.max(0, seo)       * 0.25 +
      conversion             * 0.30 +
      ux                     * 0.20
    );

    const estado = scoreGlobal >= 80 ? 'BUENO' : scoreGlobal >= 60 ? 'MEJORABLE' : 'CRÍTICO';

    res.json({
      url,
      scoreGlobal,
      estado,
      issuesCriticos: issues.filter(i => i.severidad === 'CRÍTICO').length,
      categorias: {
        SEO:        Math.max(0, seo),
        Conversion: conversion,
        Velocidad:  Math.max(0, velocidad),
        UX_CRO:     ux
      },
      issues,
      metricas: { lcp, fcp, cls, tbt }
    });

  } catch (error) {
    res.status(500).json({ error: 'Error al calcular el score', detalle: error.message });
  }
});

module.exports = router;
