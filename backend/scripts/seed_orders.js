const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function run() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  
  const { data: clients, error: errClients } = await supabase
    .from('clientes')
    .select('id_cliente, nombre, apellido, id_tipo_cliente')
    .eq('esta_activo', true);
    
  if (errClients) {
    console.error("Error fetching clients:", errClients);
    return;
  }
  
  const { data: clientTypes } = await supabase.from('tipos_cliente').select('id_tipo_cliente, nombre_tipo');
  const convenioTypeId = clientTypes?.find(t => t.nombre_tipo.toLowerCase().includes('convenio'))?.id_tipo_cliente;
  
  const convenioClients = clients.filter(c => c.id_tipo_cliente === convenioTypeId);
  console.log(`Found ${convenioClients.length} convenio clients`);
  
  const { data: products, error: errProducts } = await supabase
    .from('productos')
    .select('id_producto, nombre_producto, precio_unitario')
    .eq('esta_activo', true)
    .limit(5);
    
  if (errProducts) {
    console.error("Error fetching products:", errProducts);
    return;
  }
  
  console.log(`Found ${products.length} products`);
  
  if (convenioClients.length === 0 || products.length === 0) {
    console.log("Not enough data to seed");
    return;
  }

  // Create dates for Thu and Fri
  const dates = [];
  for(let i=0; i<10; i++) {
    // Thursday (July 16, 2026) between 12:00 and 14:00
    dates.push(new Date(`2026-07-16T12:${Math.floor(Math.random() * 50) + 10}:00-05:00`));
    // Friday (July 17, 2026) between 12:00 and 14:00
    dates.push(new Date(`2026-07-17T12:${Math.floor(Math.random() * 50) + 10}:00-05:00`));
  }
  
  let insertedCount = 0;
  
  for (const date of dates) {
    // Pick random client and product
    const client = convenioClients[Math.floor(Math.random() * convenioClients.length)];
    const product = products[Math.floor(Math.random() * products.length)];
    
    // Insert order
    const { data: order, error: errOrder } = await supabase
      .from('ordenes')
      .insert({
        id_cliente: client.id_cliente,
        id_origen: 1, // Web/Local
        id_estado: 2, // Consumido
        observaciones: 'Pedido generado para la defensa',
        created_at: date.toISOString()
      })
      .select()
      .single();
      
    if (errOrder) {
      console.error("Error inserting order:", errOrder);
      continue;
    }
    
    // Insert order detail
    const { error: errDetail } = await supabase
      .from('detalle_orden')
      .insert({
        id_orden: order.id_orden,
        id_producto: product.id_producto,
        cantidad: 1,
        precio_aplicado: product.precio_unitario
      });
      
    if (errDetail) {
      console.error("Error inserting order detail:", errDetail);
    } else {
      insertedCount++;
    }
  }
  
  console.log(`Successfully inserted ${insertedCount} orders.`);
}

run();
