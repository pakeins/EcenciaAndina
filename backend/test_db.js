require('dotenv').config();
const { getAdminClient } = require('./src/config/supabase');

async function testInsert() {
  try {
    const payload = {
      id_cliente: null,
      chat_id: '123456789',
      telegram_user_id: '123456789',
      telegram_username: 'test',
      consent_status: 'pending',
      is_active: false,
      consent_notice_version: '1.0',
      consent_notice_text: 'Privacy Text',
    };

    console.log('Intentando insertar...', payload);
    const { data, error } = await getAdminClient()
      .from('telegram_subscriptions')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Error insertando:', error);
    } else {
      console.log('Insert exitoso:', data);
      
      // Cleanup
      await getAdminClient().from('telegram_subscriptions').delete().eq('id', data.id);
      console.log('Cleanup exitoso');
    }
  } catch (err) {
    console.error('Catch error:', err);
  }
}

testInsert();
