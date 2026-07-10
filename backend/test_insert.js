require('dotenv').config();
const { getAdminClient } = require('./src/config/supabase');

async function testInsert() {
  try {
    console.log('Inserting...');
    const { data, error } = await getAdminClient()
      .from('telegram_subscriptions')
      .insert({
        id_cliente: null,
        chat_id: '123456789',
        consent_status: 'pending',
      })
      .select()
      .single();
      
    if (error) {
      console.error('Error:', error);
    } else {
      console.log('Success:', data);
      await getAdminClient().from('telegram_subscriptions').delete().eq('id', data.id);
    }
  } catch (e) {
    console.error('Caught:', e);
  }
}
testInsert();
