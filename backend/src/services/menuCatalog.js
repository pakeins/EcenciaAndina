const normalizeFoodName = (value) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

const formatFood = (food, created = false) => ({
  id: food.id_alimento,
  nombre: food.nombre_alimento,
  id_categoria: food.id_categoria_menu,
  categoria_nombre: food.categorias_menu?.nombre_categoria,
  created,
});

const findFood = async (adminClient, categoryId, normalizedName) => {
  const { data, error } = await adminClient
    .from('alimentos')
    .select('id_alimento,nombre_alimento,id_categoria_menu,categorias_menu(nombre_categoria)')
    .eq('id_categoria_menu', categoryId)
    .eq('nombre_normalizado', normalizedName)
    .maybeSingle();

  if (error) throw error;
  return data;
};

const findOrCreateFood = async (adminClient, { categoryId, name, userId }) => {
  const normalizedName = normalizeFoodName(name);
  const existing = await findFood(adminClient, categoryId, normalizedName);
  if (existing) return formatFood(existing);

  const { data, error } = await adminClient
    .from('alimentos')
    .insert({
      id_categoria_menu: categoryId,
      nombre_alimento: String(name).trim().replace(/\s+/g, ' '),
      created_by: userId,
    })
    .select('id_alimento,nombre_alimento,id_categoria_menu,categorias_menu(nombre_categoria)')
    .single();

  if (!error) return formatFood(data, true);
  if (error.code !== '23505') throw error;

  const concurrent = await findFood(adminClient, categoryId, normalizedName);
  if (!concurrent) throw error;
  return formatFood(concurrent);
};

module.exports = {
  findOrCreateFood,
  normalizeFoodName,
};
