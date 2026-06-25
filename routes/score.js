const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Falta el parámetro ?url=' });

  try {
    // 1. Llamar a PageSpeed
    const fetch = (await import('node-fetch')).default;

    const psUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${process.env.PAGESPEED_API_KEY}&strategy=mobile`;
    const psRes = await fetch(psUrl);
    const psData = await psRes.json();

    const audits = psData.lighthouseResult?.audits || {};
    const categories = psData.lighthouseResult?.categories || {};

    const lcp = (audits['largest-contentful-paint']?.numericValue || 0) / 1000;
    const fcp = (audits['first-contentful-paint']?.numericValue || 0) / 1000;
    const cls = audits['cumulative-layout-shift']?.numericValue || 0;
    const tbt = audits['total-blocking-time']?.numericValue || 0;
    const perfScore = Math.round((categories?.performance?.score || 0) * 100);

    // 2. Calcular score de Velocidad
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

    // 3. Llamar a SEO scan
    const seoRes = await fetch(`https://shopscanproz.onrender.com/api/seo-scan?url=${encodeURIComponent(url)}`);
    const seoData = await seoRes.json();

    let seo = 100;
    if (!seoData.metaDescription) {
      seo -= 25;
      issues.push({ tipo: 'Meta descripción faltante', categoria: 'SEO', severidad: 'CRÍTICO' });
    }
    if (!seoData.title) {
      seo -= 20;
      issues.push({ tipo: 'Title tag faltante', categoria: 'SEO', severidad: 'CRÍTICO' });
    }
    if (!seoData.h1) {
      seo -= 15;
      issues.push({ tipo: 'H1 faltante', categoria: 'SEO', severidad: 'ALERTA' });
    }
    if (seoData.imagesWithoutAlt > 0) {
      seo -= Math.min(20, seoData.imagesWithoutAlt * 4);
      issues.push({ tipo: `${seoData.imagesWithoutAlt} imágenes sin alt`, categoria: 'SEO', severidad: 'ALERTA' });
    }

    // 4. Score de Conversión y UX (base, sin Shopify aún)
    let conversion = 70; // base hasta conectar Shopify
    let ux = Math.max(0, 100 - (cls > 0.25 ? 30 : 0) - (tbt > 600 ? 20 : 0));

    // 5. Score global (ponderado)
    const scoreGlobal = Math.round(
      velocidad * 0.25 +
      seo * 0.25 +
      conversion * 0.30 +
      ux * 0.20
    );

    // 6. Etiqueta
    const estado = scoreGlobal >= 80 ? 'BUENO' : scoreGlobal >= 60 ? 'MEJORABLE' : 'CRÍTICO';
    const issuesCriticos = issues.filter(i => i.severidad === 'CRÍTICO').length;

    res.json({
      url,
      scoreGlobal,
      estado,
      issuesCriticos,
      categorias: {
        SEO: Math.max(0, seo),
        Conversion: conversion,
        Velocidad: Math.max(0, velocidad),
        UX_CRO: Math.max(0, ux)
      },
      issues,
      metricas: { lcp, fcp, cls, tbt, perfScore }
    });

  } catch (error) {
    res.status(500).json({ error: 'Error al calcular el score', detalle: error.message });
  }
});

module.exports = router;
