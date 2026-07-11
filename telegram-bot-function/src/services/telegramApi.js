const telegramRequest = async (method, body) => {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) throw new Error('Falta TELEGRAM_BOT_TOKEN.');

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    const error = new Error(data.description || `Telegram respondio ${response.status}.`);
    error.status = 502;
    throw error;
  }
  return data.result;
};

const sendMessage = async (chatId, text, replyMarkup, parseMode) => {
  const body = {
    chat_id: String(chatId),
    text,
    disable_web_page_preview: true,
  };
  if (replyMarkup) body.reply_markup = replyMarkup;
  if (parseMode) body.parse_mode = parseMode;
  return telegramRequest('sendMessage', body);
};

const answerCallback = async (callbackId) => {
  if (!callbackId) return;
  try {
    await telegramRequest('answerCallbackQuery', { callback_query_id: callbackId });
  } catch (error) {
    console.warn('No se pudo responder callback Telegram:', error.message); // NOSONAR
  }
};

const deleteMessage = async (chatId, messageId) => {
  if (!chatId || !messageId) return false;
  try {
    await telegramRequest('deleteMessage', {
      chat_id: String(chatId),
      message_id: Number(messageId),
    });
    return true;
  } catch (error) {
    console.warn('No se pudo borrar un mensaje Telegram:', error.message); // NOSONAR
    return false;
  }
};

const removeInlineKeyboard = async (chatId, messageId) => {
  if (!chatId || !messageId) return false;
  try {
    await telegramRequest('editMessageReplyMarkup', {
      chat_id: String(chatId),
      message_id: Number(messageId),
      reply_markup: { inline_keyboard: [] },
    });
    return true;
  } catch (error) {
    console.warn('No se pudo retirar un teclado Telegram:', error.message); // NOSONAR
    return false;
  }
};

const sendPhoto = async (chatId, photoUrl, caption, replyMarkup, parseMode) => {
  const body = {
    chat_id: String(chatId),
    photo: photoUrl,
    caption: caption || '',
  };
  if (replyMarkup) body.reply_markup = replyMarkup;
  if (parseMode) body.parse_mode = parseMode;
  return telegramRequest('sendPhoto', body);
};

module.exports = {
  answerCallback,
  deleteMessage,
  removeInlineKeyboard,
  sendMessage,
  sendPhoto,
  telegramRequest,
};
