require('dotenv').config();
const { getAdminClient } = require('./src/config/supabase');

async function testSetState() {
  try {
    const key = 'consent:test';
    const value = { status: 'awaiting_decision', foo: 'bar' };
    
    console.log('Intentando setState...');
    const { error, data } = await getAdminClient()
      .from('telegram_bot_state')
      .upsert(
        { key, value: { ...(value || {}), updatedAt: new Date().toISOString() } },
        { onConflict: 'key' },
      ).select();

    if (error) {
      console.error('Error setState:', error);
    } else {
      console.log('setState exitoso:', data);
      await getAdminClient().from('telegram_bot_state').delete().eq('key', key);
    }
  } catch (err) {
    console.error('Catch error:', err);
  }
}

testSetState();
