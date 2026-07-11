require('dotenv').config();
const { getAdminClient } = require('./src/config/supabase');

async function testEqNull() {
  try {
    const { data, error } = await getAdminClient()
      .from('telegram_subscriptions')
      .select('*')
      .eq('id_cliente', null)
      .maybeSingle();
      
    if (error) {
      console.error('Error fetching with null:', error.message, error.details, error.hint);
    } else {
      console.log('Success:', data);
    }
  } catch (e) {
    console.error('Caught error:', e);
  }
}
testEqNull();
