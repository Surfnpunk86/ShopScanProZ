const express = require('express');
const router = express.Router();

/**
 * GET /api/pagespeed?url=https://example.com&strategy=mobile
 *
 * Calls Google PageSpeed Insights API and returns a normalized
 * summary with Core Web Vitals (LCP, FID/INP, CLS, TTFB, TBT)
 * plus the overall performance, SEO, accessibility and best
 * practices scores.
 */
router.get('/', async (req, res) => {
  const { url, strategy = 'mobile' } = req.query;
  const apiKey = process.env.PAGESPEED_API_KEY;

  if (!url) {
    return res.status(400).json({ error: 'Missing required query param: url' });
  }
  if (!apiKey) {
    return res.status(500).json({ error: 'PAGESPEED_API_KEY is not configured on the server' });
  }

  const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed`;
  const params = new URLSearchParams({
    url,
    key: apiKey,
    strategy, // 'mobile' or 'desktop'
    category: 'performance'
  });
  // Add multiple categories
  ['accessibility', 'best-practices', 'seo'].forEach(c => params.append('category', c));

  try {
    const response = await fetch(`${endpoint}?${params.toString()}`);

    if (!response.ok) {
      const errBody = await response.text();
      return res.status(response.status).json({
        error: 'PageSpeed Insights API error',
        details: errBody
      });
    }

    const data = await response.json();
    const audits = data.lighthouseResult?.audits || {};
    const categories = data.lighthouseResult?.categories || {};

    const metric = (key) => audits[key]?.numericValue ?? null;
    const score = (key) => categories[key]?.score != null ? Math.round(categories[key].score * 100) : null;

    const result = {
      url,
      strategy,
      scores: {
        performance: score('performance'),
        accessibility: score('accessibility'),
        bestPractices: score('best-practices'),
        seo: score('seo')
      },
      coreWebVitals: {
        lcp: metric('largest-contentful-paint'), // ms
        fid: metric('max-potential-fid'),         // ms (proxy; real FID needs field data)
        cls: audits['cumulative-layout-shift']?.numericValue ?? null,
        ttfb: metric('server-response-time'),     // ms
        tbt: metric('total-blocking-time'),       // ms
        speedIndex: metric('speed-index')         // ms
      },
      opportunities: Object.values(audits)
        .filter(a => a.score !== null && a.score < 0.9 && a.details?.type === 'opportunity')
        .map(a => ({
          id: a.id,
          title: a.title,
          description: a.description,
          savingsMs: a.details?.overallSavingsMs ?? null
        })),
      fetchedAt: new Date().toISOString()
    };

    res.json(result);
  } catch (err) {
    console.error('PageSpeed fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch PageSpeed data', details: err.message });
  }
});

module.exports = router;
