const crypto = require('node:crypto');

const secureEquals = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const requireInternalWebhookSecret = (req, res, next) => {
  const expectedSecret = process.env.N8N_MENU_WEBHOOK_SECRET;
  if (!expectedSecret) {
    return res.status(503).json({ error: 'El endpoint interno no esta configurado.' });
  }

  const receivedSecret = req.get('X-Ecencia-Webhook-Secret');
  if (!secureEquals(receivedSecret, expectedSecret)) {
    return res.status(401).json({ error: 'Endpoint interno no autorizado.' });
  }

  next();
};

module.exports = {
  requireInternalWebhookSecret,
  secureEquals,
};
