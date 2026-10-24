const express = require('express');
const router  = express.Router();
const MauticAdapter      = require('../adapters/MauticAdapter');
const RudderStackAdapter = require('../adapters/RudderStackAdapter');

router.get('/', async (_req, res) => {
  const useMock = process.env.USE_MOCK === 'true';

  const mautic      = new MauticAdapter();
  const rudderstack = new RudderStackAdapter();

  const [mauticOk, rsOk] = useMock
    ? [null, null]
    : await Promise.all([
        mautic.healthCheck(),
        rudderstack.healthCheck(),
      ]);

  res.json({
    status:    'ok',
    service:   'phs-cdp-bff',
    version:   '1.0.0',
    timestamp: new Date().toISOString(),
    mode:      useMock ? 'MOCK' : 'LIVE',
    integrations: {
      mautic: {
        url:    process.env.MAUTIC_BASE_URL,
        status: useMock ? 'skipped' : (mauticOk ? 'connected' : 'error'),
      },
      rudderstack: {
        url:    process.env.RUDDERSTACK_DATA_PLANE_URL,
        status: useMock ? 'skipped' : (rsOk ? 'connected' : 'error'),
      },
    },
  });
});

module.exports = router;