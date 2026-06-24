const express = require('express');
const cheerio = require('cheerio');
const router = express.Router();

/**
 * GET /api/seo-scan?url=https://example.com
 *
 * Fetches the page HTML and runs a basic technical/on-page SEO audit:
 * meta tags, headings, images alt text, canonical, robots, schema, etc.
 */
router.get('/', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing required query param: url' });
  }

  let targetUrl = url;
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = `https://${targetUrl}`;
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ShopScanPro/1.0; +https://shopscanpro.example.com)'
      },
      redirect: 'follow'
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Failed to fetch target URL (status ${response.status})`
      });
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // --- Basic meta ---
    const title = $('title').first().text().trim() || null;
    const metaDescription = $('meta[name="description"]').attr('content') || null;
    const canonical = $('link[rel="canonical"]').attr('href') || null;
    const robotsMeta = $('meta[name="robots"]').attr('content') || null;
    const viewport = $('meta[name="viewport"]').attr('content') || null;

    // --- Open Graph / social ---
    const og = {
      title: $('meta[property="og:title"]').attr('content') || null,
      description: $('meta[property="og:description"]').attr('content') || null,
      image: $('meta[property="og:image"]').attr('content') || null,
      type: $('meta[property="og:type"]').attr('content') || null
    };
    const hasOpenGraph = !!(og.title || og.description || og.image);

    // --- Headings ---
    const h1Count = $('h1').length;
    const h1Texts = $('h1').map((i, el) => $(el).text().trim()).get().slice(0, 5);

    // --- Images / alt text ---
    const images = $('img');
    const totalImages = images.length;
    let imagesWithoutAlt = 0;
    images.each((i, el) => {
      const alt = $(el).attr('alt');
      if (!alt || alt.trim() === '') imagesWithoutAlt++;
    });

    // --- Schema markup (JSON-LD) ---
    const jsonLdBlocks = $('script[type="application/ld+json"]');
    const schemaTypes = [];
    jsonLdBlocks.each((i, el) => {
      try {
        const parsed = JSON.parse($(el).html());
        const items = Array.isArray(parsed) ? parsed : [parsed];
        items.forEach(item => {
          if (item['@type']) schemaTypes.push(item['@type']);
        });
      } catch (e) {
        // ignore malformed JSON-LD
      }
    });

    // --- Links ---
    const totalLinks = $('a[href]').length;

    // --- HTTPS check ---
    const isHttps = targetUrl.startsWith('https://');

    // --- Word count (rough content length) ---
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
    const wordCount = bodyText.split(' ').filter(Boolean).length;

    // --- Build checklist ---
    const checks = [
      { name: 'SSL / HTTPS', status: isHttps ? 'pass' : 'fail' },
      { name: 'Title tag presente', status: title ? 'pass' : 'fail', value: title },
      { name: 'Meta description', status: metaDescription ? 'pass' : 'fail', value: metaDescription },
      { name: 'Exactamente un H1', status: h1Count === 1 ? 'pass' : (h1Count === 0 ? 'fail' : 'warn'), value: `${h1Count} encontrados` },
      { name: 'URL canónica', status: canonical ? 'pass' : 'warn', value: canonical },
      { name: 'Meta viewport (mobile)', status: viewport ? 'pass' : 'fail' },
      { name: 'Open Graph tags', status: hasOpenGraph ? 'pass' : 'fail' },
      { name: 'Schema markup (JSON-LD)', status: schemaTypes.length > 0 ? 'pass' : 'fail', value: schemaTypes.join(', ') || null },
      {
        name: 'Alt text en imágenes',
        status: totalImages === 0 ? 'warn' : (imagesWithoutAlt === 0 ? 'pass' : (imagesWithoutAlt < totalImages / 2 ? 'warn' : 'fail')),
        value: `${imagesWithoutAlt}/${totalImages} sin alt`
      },
      { name: 'Robots meta no bloquea indexación', status: (robotsMeta && /noindex/i.test(robotsMeta)) ? 'fail' : 'pass', value: robotsMeta },
      { name: 'Contenido > 300 palabras', status: wordCount > 300 ? 'pass' : 'warn', value: `${wordCount} palabras` }
    ];

    const passCount = checks.filter(c => c.status === 'pass').length;
    const seoScore = Math.round((passCount / checks.length) * 100);

    res.json({
      url: targetUrl,
      seoScore,
      title,
      metaDescription,
      canonical,
      h1Count,
      h1Texts,
      openGraph: og,
      schemaTypes,
      images: { total: totalImages, withoutAlt: imagesWithoutAlt },
      totalLinks,
      wordCount,
      checks,
      fetchedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('SEO scan error:', err);
    res.status(500).json({ error: 'Failed to analyze URL', details: err.message });
  }
});

module.exports = router;
