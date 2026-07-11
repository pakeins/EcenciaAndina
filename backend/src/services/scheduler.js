const cron = require('node-cron');
const { getAdminClient } = require('../config/supabase');
const { cleanupOldMenuImages } = require('./menuImageCleanup');

// Función que expira el menú activo y limpia imágenes viejas
const expireMenuAndCleanImages = async () => {
  console.log('[Scheduler] Iniciando limpieza automática de medianoche...');
  try {
    const adminClient = getAdminClient();
    
    // 1. Expirar menú activo
    await adminClient.from('menu_settings').update({ active_date: null }).eq('id', 1);
    await adminClient.from('telegram_bot_state').delete().eq('key', 'latest-menu:active');
    console.log('[Scheduler] Menú activo expirado.');

    // 2. Limpiar imágenes viejas
    const cleanupResult = await cleanupOldMenuImages(adminClient);
    console.log(`[Scheduler] Imágenes limpiadas: ${cleanupResult.deletedCount}`);
  } catch (error) {
    console.error('[Scheduler] Error en la limpieza automática:', error);
  }
};

const initScheduler = () => {
  // Ejecutar todos los días a la medianoche (00:00)
  cron.schedule('0 0 * * *', expireMenuAndCleanImages, {
    scheduled: true,
    timezone: process.env.N8N_ECENCIA_TIMEZONE || 'America/Bogota'
  });
  console.log('[Scheduler] Cron job configurado para la medianoche (00:00).');
};

module.exports = {
  initScheduler,
  expireMenuAndCleanImages
};
