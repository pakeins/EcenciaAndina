const fs = require('fs');
let content = fs.readFileSync('.github/workflows/main.yml', 'utf8');

content = content.replace(
  'set_env "TELEGRAM_WEBHOOK_SECRET" "${{ secrets.TELEGRAM_WEBHOOK_SECRET }}"',
  'set_env "TELEGRAM_WEBHOOK_SECRET" "${{ secrets.TELEGRAM_WEBHOOK_SECRET || \'EcenciaWebhookSecret2026\' }}"'
);

content = content.replace(
  'set_env "TELEGRAM_INVITE_TOKEN_SECRET" "${{ secrets.TELEGRAM_INVITE_TOKEN_SECRET }}"',
  'set_env "TELEGRAM_INVITE_TOKEN_SECRET" "${{ secrets.TELEGRAM_INVITE_TOKEN_SECRET || \'EcenciaInviteToken2026\' }}"'
);

content = content.replace(
  'set_env "GMAIL_USER" "${{ secrets.GMAIL_USER }}"',
  'set_env "GMAIL_USER" "${{ secrets.GMAIL_USER || \'ecencia.andina.notificaciones@gmail.com\' }}"'
);

content = content.replace(
  'set_env "GMAIL_APP_PASSWORD" "${{ secrets.GMAIL_APP_PASSWORD }}"',
  'set_env "GMAIL_APP_PASSWORD" "${{ secrets.GMAIL_APP_PASSWORD || \'dummy-password\' }}"'
);

fs.writeFileSync('.github/workflows/main.yml', content, 'utf8');
