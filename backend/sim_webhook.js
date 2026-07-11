

async function simulateConsentAccept() {
  const payload = {
    update_id: 123456789,
    callback_query: {
      id: '438232323',
      from: {
        id: 1111111,
        is_bot: false,
        first_name: 'Test',
        username: 'testuser'
      },
      message: {
        message_id: 555,
        chat: {
          id: 1111111,
          type: 'private'
        },
        date: Math.floor(Date.now() / 1000),
        text: 'Please read terms...'
      },
      chat_instance: '12345',
      data: 'consent:accept'
    }
  };

  try {
    const res = await fetch('http://localhost:3001/api/telegram/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-bot-api-secret-token': 'change-this-local-telegram-webhook-secret'
      },
      body: JSON.stringify(payload)
    });
    console.log('Status:', res.status);
    console.log('Body:', await res.text());
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

simulateConsentAccept();
