require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function seed() {
  console.log('Iniciando carga de platos típicos de almuerzo ecuatoriano...');

  const categorias = [
    { nombre_categoria: 'Entradas' },
    { nombre_categoria: 'Sopas' },
    { nombre_categoria: 'Platos fuertes' },
    { nombre_categoria: 'Guarniciones' },
    { nombre_categoria: 'Postres' },
    { nombre_categoria: 'Bebidas' }
  ];

  console.log('Insertando categorías...');
  const catIds = {};
  for (const cat of categorias) {
    const { data, error } = await supabase
      .from('categorias_menu')
      .insert(cat)
      .select()
      .single();
    
    if (error) {
      if (error.code === '23505') {
        const { data: existing } = await supabase
          .from('categorias_menu')
          .select('id_categoria_menu')
          .eq('nombre_categoria', cat.nombre_categoria)
          .single();
        catIds[cat.nombre_categoria] = existing.id_categoria_menu;
      } else {
        console.error('Error insertando categoría', cat.nombre_categoria, error.message);
      }
    } else {
      catIds[cat.nombre_categoria] = data.id_categoria_menu;
    }
  }

  const alimentos = [
    { nombre_alimento: 'Cevichocho', id_categoria_menu: catIds['Entradas'] },
    { nombre_alimento: 'Empanada de verde', id_categoria_menu: catIds['Entradas'] },
    { nombre_alimento: 'Patacones con queso', id_categoria_menu: catIds['Entradas'] },
    
    { nombre_alimento: 'Locro de papa', id_categoria_menu: catIds['Sopas'] },
    { nombre_alimento: 'Sopa de fideo con carne', id_categoria_menu: catIds['Sopas'] },
    { nombre_alimento: 'Sopa de pollo', id_categoria_menu: catIds['Sopas'] },
    { nombre_alimento: 'Crema de zapallo', id_categoria_menu: catIds['Sopas'] },
    { nombre_alimento: 'Sancocho de carne', id_categoria_menu: catIds['Sopas'] },

    { nombre_alimento: 'Seco de pollo con arroz', id_categoria_menu: catIds['Platos fuertes'] },
    { nombre_alimento: 'Churrasco ecuatoriano', id_categoria_menu: catIds['Platos fuertes'] },
    { nombre_alimento: 'Guatita con arroz', id_categoria_menu: catIds['Platos fuertes'] },
    { nombre_alimento: 'Fritada con mote', id_categoria_menu: catIds['Platos fuertes'] },
    { nombre_alimento: 'Encocado de pescado', id_categoria_menu: catIds['Platos fuertes'] },
    { nombre_alimento: 'Pollo a la plancha con puré', id_categoria_menu: catIds['Platos fuertes'] },
    { nombre_alimento: 'Carne frita con menestra', id_categoria_menu: catIds['Platos fuertes'] },
    
    { nombre_alimento: 'Porción de arroz', id_categoria_menu: catIds['Guarniciones'] },
    { nombre_alimento: 'Ensalada fresca', id_categoria_menu: catIds['Guarniciones'] },

    { nombre_alimento: 'Gelatina', id_categoria_menu: catIds['Postres'] },
    { nombre_alimento: 'Flan de caramelo', id_categoria_menu: catIds['Postres'] },
    { nombre_alimento: 'Dulce de higos', id_categoria_menu: catIds['Postres'] },
    
    { nombre_alimento: 'Jugo de mora', id_categoria_menu: catIds['Bebidas'] },
    { nombre_alimento: 'Jugo de tomate de árbol', id_categoria_menu: catIds['Bebidas'] },
    { nombre_alimento: 'Limonada', id_categoria_menu: catIds['Bebidas'] }
  ];

  console.log('Insertando platos...');
  let agregados = 0;
  for (const al of alimentos) {
    const { data: existe } = await supabase
      .from('alimentos')
      .select('id_alimento')
      .eq('nombre_alimento', al.nombre_alimento)
      .maybeSingle();

    if (!existe) {
      const { error } = await supabase
        .from('alimentos')
        .insert(al);
      if (error) {
        console.error('Error insertando', al.nombre_alimento, error.message);
      } else {
        agregados++;
      }
    }
  }

  console.log(`¡Listo! Se agregaron ${agregados} platos típicos a la base de datos.`);
}

seed().catch(console.error);
