require('dotenv').config();
const { getAdminClient } = require('./src/config/supabase');
const telegramApi = require('./src/services/telegramApi');

async function testAccept() {
  const chatId = '123456789';
  const telegramUserId = '123';
  const telegramUsername = 'testuser';

  // Simulate beginConsent
  console.log('Simulating beginConsent...');
  const consentKey = `consent:${chatId}`;
  
  let { data: subscription } = await getAdminClient()
    .from('telegram_subscriptions')
    .upsert({
      id_cliente: null,
      chat_id: chatId,
      consent_status: 'pending',
    })
    .select()
    .single();

  await getAdminClient()
    .from('telegram_bot_state')
    .upsert({
      key: consentKey,
      value: { status: 'awaiting_decision', subscriptionId: subscription.id, promptMessageIds: [] }
    });

  // Simulate acceptConsent
  console.log('Simulating acceptConsent...');
  const consentState = { status: 'awaiting_decision', subscriptionId: subscription.id, promptMessageIds: [] };

  try {
    const { data, error } = await getAdminClient()
      .from('telegram_subscriptions')
      .update({
        telegram_user_id: telegramUserId || subscription.telegram_user_id,
        telegram_username: telegramUsername || subscription.telegram_username,
      })
      .eq('id', subscription.id)
      .select();
      
    if (error) {
      console.error('Update error:', error);
    } else {
      console.log('Update success:', data);
    }
  } catch (e) {
    console.error('Crash:', e);
  }
}
testAccept();
