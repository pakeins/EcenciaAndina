// Using global fetch natively available in Node >= 18
const MICROSERVICE_URL = process.env.TELEGRAM_MICROSERVICE_URL || 'http://localhost:7071/api';
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || 'dev-internal-secret-123';

const callMicroservice = async (endpoint, payload = null, method = 'POST') => {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': INTERNAL_SECRET
    }
  };
  if (payload) {
    options.body = JSON.stringify(payload);
  }

  try {
    const response = await fetch(`${MICROSERVICE_URL}/${endpoint}`, options);
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Microservice error ${response.status}: ${errText}`);
    }
    return await response.json();
  } catch (error) {
    const safeEndpoint = String(endpoint).replace(/[\r\n]/g, '_');
    const safeMessage = String(error.message || error).replace(/[\r\n]/g, '_');
    console.error(`[Telegram Microservice] Failed to call ${safeEndpoint}:`, safeMessage);
    throw error;
  }
};

const getConsentVersion = async () => {
  const data = await callMicroservice('internal/constants', null, 'GET');
  return data.consentVersion;
};

const privacyText = async () => {
  const data = await callMicroservice('internal/constants', null, 'GET');
  return data.privacyText;
};

const createInvitation = async (idCliente, adminId) => {
  return await callMicroservice('internal/createInvitation', { idCliente, adminId });
};

const recordConsentEvent = async (payload) => {
  return await callMicroservice('internal/recordConsentEvent', payload);
};

const sendMessage = async (chatId, message, options = null, parseMode = 'HTML') => {
  return await callMicroservice('internal/sendMessage', { chatId, message, options, parseMode });
};

module.exports = {
  getConsentVersion,
  privacyText,
  createInvitation,
  recordConsentEvent,
  sendMessage
};
