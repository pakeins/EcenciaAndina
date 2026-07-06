const cron = require('node-cron');
const { getAdminClient } = require('../config/supabase');

const startCronJobs = () => {
  // Ejecutar todos los días a la medianoche (00:00) hora de Ecuador
  cron.schedule('0 0 * * *', async () => {
    console.log('[Cron] Ejecutando expiración automática del menú diario...');
    try {
      const adminClient = getAdminClient();
      
      // Limpiar en la base de datos
      await adminClient.from('menu_settings').update({ active_date: null }).eq('id', 1);
      await adminClient.from('telegram_bot_state').delete().eq('key', 'latest-menu:active');
      
      console.log('[Cron] Menú diario expirado correctamente.');
    } catch (error) {
      console.error('[Cron] Error expirando el menú diario:', error);
    }
  }, {
    scheduled: true,
    timezone: 'America/Bogota'
  });
};

module.exports = { startCronJobs };
