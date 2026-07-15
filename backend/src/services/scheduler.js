const cron = require('node-cron');
const { getAdminClient } = require('../config/supabase');
const { cleanupOldMenuImages } = require('./menuImageCleanup');
const { sendOutlookMail } = require('./outlookMail');

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

const notifyExpiringConvenios = async () => {
  console.log('[Scheduler] Buscando convenios próximos a expirar...');
  try {
    const adminClient = getAdminClient();
    
    const { data: admins } = await adminClient
      .from('empleados')
      .select('correo, roles!inner(nombre_rol)')
      .eq('esta_activo', true)
      .eq('roles.nombre_rol', 'administrativo');
      
    if (!admins || admins.length === 0) {
      console.log('[Scheduler] No hay administradores activos para notificar.');
      return;
    }
    
    const adminEmails = admins.map(a => a.correo).filter(Boolean);
    if (adminEmails.length === 0) return;

    const { data: convenios } = await adminClient
      .from('convenios')
      .select('nombre_empresa, fecha_caducidad')
      .eq('esta_activo', true);
      
    if (!convenios) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiringSoon = convenios.filter(conv => {
      if (!conv.fecha_caducidad) return false;
      const expiryDate = new Date(conv.fecha_caducidad + 'T00:00:00');
      const diffTime = expiryDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays === 15 || diffDays === 7 || diffDays === 1;
    });

    for (const conv of expiringSoon) {
      const expiryDate = new Date(conv.fecha_caducidad + 'T00:00:00');
      const diffTime = expiryDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      for (const email of adminEmails) {
        await sendOutlookMail({
          to: email,
          subject: `⚠️ Alerta de Caducidad de Convenio: ${conv.nombre_empresa}`,
          html: `<p>Hola,</p><p>Te informamos que el convenio con <b>${conv.nombre_empresa}</b> caducará en <b>${diffDays} días</b> (el ${conv.fecha_caducidad}).</p><p>Por favor, gestiona su renovación a tiempo.</p>`,
          text: `El convenio con ${conv.nombre_empresa} caducará en ${diffDays} días (${conv.fecha_caducidad}).`
        }).catch(err => console.error(`[Scheduler] Error enviando correo a ${email}:`, err));
      }
      console.log(`[Scheduler] Notificación enviada para convenio: ${conv.nombre_empresa} (${diffDays} días)`);
    }
  } catch (error) {
    console.error('[Scheduler] Error notificando convenios:', error);
  }
};

const deactivateExpiredConvenios = async () => {
  console.log('[Scheduler] Buscando convenios caducados para desactivar...');
  try {
    const adminClient = getAdminClient();
    const { data: convenios } = await adminClient
      .from('convenios')
      .select('id, nombre_empresa, fecha_caducidad')
      .eq('esta_activo', true);

    if (!convenios) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let deactivatedCount = 0;
    for (const conv of convenios) {
      if (!conv.fecha_caducidad) continue;
      const expiryDate = new Date(conv.fecha_caducidad + 'T00:00:00');
      
      // Si la fecha ya pasó (es menor a hoy), lo desactivamos
      if (expiryDate < today) {
        await adminClient.from('convenios').update({ esta_activo: false }).eq('id', conv.id);
        
        // A PETICIÓN DEL NEGOCIO: No desvinculamos a los colaboradores ni los pasamos a Frecuentes.
        // Se quedan en el convenio, de manera que si la empresa renueva el contrato mañana, 
        // con solo activar el convenio de nuevo, todos sus usuarios recuperan el servicio sin tener que
        // vincularlos uno por uno manualmente.

        deactivatedCount++;
        console.log(`[Scheduler] Convenio desactivado automáticamente: ${conv.nombre_empresa} (Sus clientes se mantienen vinculados pero inhabilitados por el estado del convenio).`);
      }
    }
    console.log(`[Scheduler] Convenios caducados desactivados: ${deactivatedCount}`);
  } catch (error) {
    console.error('[Scheduler] Error desactivando convenios:', error);
  }
};

const initScheduler = () => {
  // Ejecutar todos los días a la medianoche (00:00)
  cron.schedule('0 0 * * *', async () => {
    await expireMenuAndCleanImages();
    await notifyExpiringConvenios();
    await deactivateExpiredConvenios();
  }, {
    scheduled: true,
    timezone: process.env.N8N_ECENCIA_TIMEZONE || 'America/Bogota'
  });
  console.log('[Scheduler] Cron job configurado para la medianoche (00:00).');
};

module.exports = {
  initScheduler,
  expireMenuAndCleanImages,
  notifyExpiringConvenios,
  deactivateExpiredConvenios
};
