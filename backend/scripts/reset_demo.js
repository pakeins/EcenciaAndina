const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const args = process.argv.slice(2);
  const cedula = args[0] || '1726359670'; // Usa tu cédula por defecto

  if (!cedula || cedula === 'TU_CEDULA') {
    console.error('❌ Error: Debes proporcionar la cédula del cliente a eliminar.');
    console.error('Uso: npm run reset-demo 1790000000');
    process.exit(1);
  }

  console.log(`🔍 Buscando cliente con cédula: ${cedula}...`);
  
  // Buscar al cliente por cédula
  const { data: clientes, error: findError } = await supabase
    .from('clientes')
    .select('id, nombre, email')
    .eq('cedula', cedula);

  if (findError) {
    console.error('❌ Error buscando cliente:', findError.message);
    process.exit(1);
  }

  if (!clientes || clientes.length === 0) {
    console.log(`✅ ¡El cliente con cédula ${cedula} no existe en la base de datos! El sistema está limpio para tu ensayo.`);
    process.exit(0);
  }

  const clienteId = clientes[0].id;
  console.log(`🗑️ Eliminando cliente: ${clientes[0].nombre} (${clientes[0].email}) - ID: ${clienteId}`);

  // Como la base de datos de Supabase usualmente tiene eliminación en cascada, 
  // esto debería borrar sus relaciones (o si tu sistema tiene soft deletes, ajústalo aquí).
  
  console.log('🗑️ Limpiando también Pedidos y Convenios de Prueba (TEST)...');
  
  await supabase
    .from('pedidos')
    .delete()
    .ilike('observaciones', '%TEST%');
    
  await supabase
    .from('convenios')
    .delete()
    .ilike('nombre_empresa', '%TEST%');
  
  const { error: deleteError } = await supabase
    .from('clientes')
    .delete()
    .eq('id', clienteId);

  if (deleteError) {
    console.error('❌ Error al eliminar cliente:', deleteError.message);
    process.exit(1);
  }

  console.log(`🎉 ¡Éxito! El cliente ${cedula} fue eliminado completamente.`);
  console.log('El sistema está limpio y listo para que corras el Playwright nuevamente.');
}

run();
