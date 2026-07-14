require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const TIPOS_ALMUERZO = [
  { id: 6, code: 'ejecutivo_completo', label: 'Almuerzo Ejecutivo Completo', shortLabel: 'Ejecutivo Completo', nombreProducto: 'Almuerzo Ejecutivo Completo' },
  { id: 7, code: 'ejecutivo_sin_sopa', label: 'Almuerzo Ejecutivo Sin Sopa', shortLabel: 'Ejecutivo Sin Sopa', nombreProducto: 'Almuerzo Ejecutivo Sin Sopa' },
  { id: 8, code: 'ejecutivo_simple', label: 'Almuerzo Ejecutivo Simple', shortLabel: 'Ejecutivo Simple', nombreProducto: 'Almuerzo Ejecutivo Simple' },
  { id: 9, code: 'almuerzo_dia', label: 'Almuerzo del Dia', shortLabel: 'Almuerzo del Dia', nombreProducto: 'Almuerzo del Dia' },
  { id: 10, code: 'almuerzo_dia_simple', label: 'Almuerzo del Dia Simple', shortLabel: 'Almuerzo del Dia Simple', nombreProducto: 'Almuerzo del Dia Simple' },
];

const inlineKeyboard = (rows) => ({ inline_keyboard: rows });

const tipoAlmuerzoKeyboard = (sid, permitidos) => {
  const options = TIPOS_ALMUERZO.filter((t) => {
    if (!permitidos || permitidos.length === 0) return true;
    const genCode = t.nombreProducto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_');
    return permitidos.includes(t.code) || permitidos.includes(genCode);
  });
  return inlineKeyboard(
    options.map((tipo) => [{ text: tipo.shortLabel, callback_data: `tipo:${tipo.code}:${sid}` }]),
  );
};

async function run() {
  const { data: client } = await supabase
    .from('clientes')
    .select('id_cliente, clientes_convenios(id_convenio, convenios(id_convenio, nombre_empresa, esta_activo, fecha_caducidad, tipos_almuerzo_permitidos))')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  console.log('Client:', JSON.stringify(client, null, 2));
  
  const convenios = client.clientes_convenios?.map((rel) => rel.convenios)?.filter((c) => c && c.esta_activo) || [];
  const today = new Date().toISOString().split('T')[0];
  const convenio = convenios.find((c) => !c.fecha_caducidad || new Date(c.fecha_caducidad) >= new Date(today)) || null;
  
  console.log('Active Convenio:', JSON.stringify(convenio, null, 2));
  
  const kb = tipoAlmuerzoKeyboard('test-sid', convenio?.tipos_almuerzo_permitidos);
  console.log('Keyboard:', JSON.stringify(kb, null, 2));
}
run();
