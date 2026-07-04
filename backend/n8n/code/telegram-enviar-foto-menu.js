function cfg(name, fallback = '') {
  const vars = typeof $vars === 'undefined' ? {} : $vars;
  const env = typeof process === 'undefined' ? {} : process.env;
  return env[name] || vars[name] || fallback;
}

const TELEGRAM_BOT_TOKEN = cfg('TELEGRAM_BOT_TOKEN');
if (!TELEGRAM_BOT_TOKEN) {
  throw new Error('Falta TELEGRAM_BOT_TOKEN en n8n.');
}

const SUPABASE_URL = cfg('SUPABASE_URL').replace(/\/$/, '');
const SUPABASE_KEY = cfg('SUPABASE_SERVICE_ROLE_KEY') || cfg('SUPABASE_KEY');

function cleanInlineReplyMarkup(markup) {
  const keyboard = markup?.inline_keyboard || [];
  const rows = keyboard
    .map((row) => (Array.isArray(row) ? row : []))
    .map((row) => row.filter((button) => button?.text && button?.callback_data))
    .filter((row) => row.length);
  return rows.length ? { inline_keyboard: rows } : null;
}

async function markMenuSent(subscriptionId) {
  if (!subscriptionId || !SUPABASE_URL || !SUPABASE_KEY) return;

  await helpers.httpRequest({
    method: 'PATCH',
    url: SUPABASE_URL + '/rest/v1/telegram_subscriptions?id=eq.' + encodeURIComponent(subscriptionId),
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: { last_menu_sent_at: new Date().toISOString() },
    json: true,
  });
}

const output = [];
for (const item of items) {
  const data = item.json || {};
  const body = {
    chat_id: data.chatId,
    photo: data.photoUrl,
    caption: data.caption || '',
  };
  const replyMarkup = cleanInlineReplyMarkup(data.inlineKeyboard);
  if (replyMarkup) body.reply_markup = replyMarkup;

  const response = await helpers.httpRequest({
    method: 'POST',
    url: 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendPhoto',
    body,
    json: true,
  });

  if (response.ok === true) await markMenuSent(data.subscriptionId);

  output.push({
    json: {
      ...data,
      telegramOk: response.ok === true,
      telegramMessageId: response.result?.message_id || null,
    },
  });
}

return output;
