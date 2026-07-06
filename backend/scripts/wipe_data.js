const { Client } = require('pg');
require('dotenv').config();

const wipeData = async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    console.log('Connected to database. Executing wipe...');
    
    const query = `
      BEGIN;
      SET session_replication_role = 'replica';

      TRUNCATE TABLE 
        telegram_order_traces,
        orden_estado_auditoria,
        orden_notificacion_auditoria,
        detalle_ordenes,
        ordenes,
        recargas_saldo,
        monederos_cliente,
        telegram_privacy_requests,
        telegram_privacy_audits,
        telegram_consent_events,
        telegram_convenio_invitaciones,
        telegram_invitations,
        telegram_subscriptions,
        clientes_convenios,
        convenios,
        clientes
      CASCADE;

      SET session_replication_role = 'origin';
      COMMIT;
    `;
    
    await client.query(query);
    console.log('Database wipe completed successfully!');
  } catch (error) {
    console.error('Error wiping database:', error);
    try { await client.query('ROLLBACK;'); } catch (e) {}
  } finally {
    await client.end();
  }
};

wipeData();
