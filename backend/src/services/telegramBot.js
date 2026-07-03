const DEFAULT_TELEGRAM_API_BASE = 'https://api.telegram.org';

const telegramRequest = async (method, body, options = {}) => {
  const token = options.token || process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    const error = new Error('TELEGRAM_BOT_TOKEN no esta configurado.');
    error.status = 503;
    throw error;
  }

  const fetchImpl = options.fetchImpl || fetch;
  const apiBase = (options.apiBase || DEFAULT_TELEGRAM_API_BASE).replace(/\/$/, '');
  const response = await fetchImpl(`${apiBase}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    const error = new Error(data.description || `Telegram respondio ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return data;
};

const sendTelegramMessage = async (chatId, text, replyMarkup = undefined, options = {}) => {
  const body = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  };

  if (replyMarkup) body.reply_markup = replyMarkup;
  return telegramRequest('sendMessage', body, options);
};

const answerTelegramCallback = async (callbackId, options = {}) => {
  if (!callbackId) return null;
  return telegramRequest('answerCallbackQuery', { callback_query_id: callbackId }, options);
};

module.exports = {
  answerTelegramCallback,
  sendTelegramMessage,
  telegramRequest,
};
