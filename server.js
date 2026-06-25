require('dotenv').config();
const express = require('express');
const cors = require('cors');

const pagespeedRoute = require('./routes/pagespeed');
const seoScanRoute = require('./routes/seo-scan');
const shopifyRoute = require('./routes/shopify');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static('public'));
app.use(express.json());
app.use(express.static('public'));

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ShopScan Pro API',
    endpoints: [
      'GET /api/pagespeed?url=https://example.com',
      'GET /api/seo-scan?url=https://example.com',
      'GET /api/shopify/products (requires Shopify credentials)',
      'GET /api/score?url=https://example.com'
    ]
  });
});

app.use('/api/pagespeed', pagespeedRoute);
app.use('/api/seo-scan', seoScanRoute);
app.use('/api/shopify', shopifyRoute);
app.use('/api/score', require('./routes/score'));

// ← Esta línea es la que faltaba
app.listen(PORT, () => console.log(`ShopScan Pro corriendo en puerto ${PORT}`));
