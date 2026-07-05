import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { menuStore, useMenu } from '@/data/menuStore';
import {
  Soup,
  ChefHat,
  Send,
  CalendarDays,
  Image as ImageIcon,
  Plus,
  Trash2,
  Utensils,
  Cake,
  Wine,
  Cookie,
} from 'lucide-react';
import { toast } from 'sonner';
import { FoodSelector } from '@/components/menu/FoodSelector';
import { RegisteredMenuList } from '@/components/menu/RegisteredMenuList';
import { CategoryManager } from '@/components/menu/CategoryManager';
import { ProductManager } from '@/components/menu/ProductManager';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import type { DailyMenu } from '@/components/menu/RegisteredMenuList';
import { apiFetch } from '@/lib/api';
import { buildTelegramMenuImage } from '@/lib/menuImage';
import type { Alimento } from '@/types';
import { FIELD_LIMITS } from '@/lib/validation';
import { dateInBogota } from '@/lib/date';
import { BRAND_COLORS } from '@/lib/brand';
import type { MenuCategory } from '@/lib/menuCatalog';

const CATEGORY_ICONS: Record<string, typeof Soup> = {
  entrada: Utensils,
  sopa: Soup,
  segundo: ChefHat,
  'plato fuerte': ChefHat,
  'platos fuertes': ChefHat,
  postre: Cookie,
  bebida: Wine,
};

const getCategoryIcon = (name: string) => {
  const norm = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [key, Icon] of Object.entries(CATEGORY_ICONS)) {
    if (norm.includes(key)) return Icon;
  }
  return Utensils;
};

const CATEGORY_ORDER = ['entradas', 'sopas', 'platos fuertes', 'bebidas', 'postres'];

const sortCategories = (cats: CategoryWithCode[]) => {
  const orderMap = new Map(CATEGORY_ORDER.map((name, i) => {
    const norm = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return [norm, i];
  }));
  return [...cats].sort((a, b) => {
    const aNorm = a.nombre_categoria.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const bNorm = b.nombre_categoria.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return (orderMap.get(aNorm) ?? 999) - (orderMap.get(bNorm) ?? 999);
  });
};

const CATEGORY_IMAGE_COLORS: Record<string, string> = {
  entrada: BRAND_COLORS.verdeProfundo,
  sopa: BRAND_COLORS.oro,
  segundo: BRAND_COLORS.terracota,
  'plato fuerte': BRAND_COLORS.terracota,
  'platos fuertes': BRAND_COLORS.terracota,
  postre: BRAND_COLORS.cafe,
  bebida: BRAND_COLORS.olivo,
};

const getCategoryIconColor = (name: string) => {
  const norm = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [key, color] of Object.entries(CATEGORY_IMAGE_COLORS)) {
    if (norm.includes(key)) return color;
  }
  return BRAND_COLORS.cafe;
};

const getImageAccent = (name: string) => {
  const norm = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [key, color] of Object.entries(CATEGORY_IMAGE_COLORS)) {
    if (norm.includes(key)) return color;
  }
  return BRAND_COLORS.piedra;
};

const cleanOptions = (options: string[]) => options.map(option => option.trim()).filter(Boolean);

const normalizeOption = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

interface CategoryWithCode extends MenuCategory {
  codigo?: string;
}

export default function Menu() {
  const { categoryOptions, image } = useMenu();
  const [isSending, setIsSending] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isActivating, setIsActivating] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryWithCode[]>([]);
  const [allAlimentos, setAllAlimentos] = useState<Alimento[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [menus, setMenus] = useState<DailyMenu[]>([]);
  const [isLoadingMenus, setIsLoadingMenus] = useState(true);
  const [menuLoadError, setMenuLoadError] = useState<string | null>(null);
  const [selectedMenuDate, setSelectedMenuDate] = useState<string | null>(null);

  const getCatOptions = useCallback(
    (catId: number) => categoryOptions[catId] ?? [''],
    [categoryOptions],
  );

  const getCategoryIdByName = useCallback(
    (...searchTerms: string[]) => {
      const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      for (const term of searchTerms) {
        const t = norm(term);
        for (const cat of categories) {
          if (norm(cat.nombre_categoria).includes(t)) return cat.id_categoria_menu;
        }
      }
      return 0;
    },
    [categories],
  );

  const buildSections = useCallback(() => {
    return categories
      .filter(cat => cleanOptions(categoryOptions[cat.id_categoria_menu] ?? []).length > 0)
      .map(cat => ({
        title: cat.nombre_categoria,
        items: cleanOptions(categoryOptions[cat.id_categoria_menu] ?? []),
        accent: getImageAccent(cat.nombre_categoria),
      }));
  }, [categories, categoryOptions]);

  const generatedMenuImage = useMemo(() => {
    const sections = buildSections();
    if (!sections.length) return '';
    return buildTelegramMenuImage({ sections });
  }, [buildSections]);

  const applyMenu = (menu: DailyMenu) => {
    if (menu.opciones) {
      for (const [catId, options] of Object.entries(menu.opciones)) {
        menuStore.setCategoryOptions(Number(catId), options.length ? options : ['']);
      }
    }
    menuStore.setDailyImage(menu.imagen_url);
    setSelectedMenuDate(menu.fecha);
  };

  const fetchMenus = async (applyActive = false) => {
    setIsLoadingMenus(true);
    setMenuLoadError(null);
    try {
      const response = await apiFetch('/menu');
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'No se pudieron cargar los menus registrados.');
      }
      const loadedMenus: DailyMenu[] = Array.isArray(data.menus) ? data.menus : [];
      setMenus(loadedMenus);

      if (applyActive && loadedMenus.length) {
        const active = loadedMenus.find(menu => menu.estado === 'activo') || loadedMenus[0];
        applyMenu(active);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudieron cargar los menus registrados.';
      setMenuLoadError(message);
      toast.error('No se pudieron cargar los menus registrados');
    } finally {
      setIsLoadingMenus(false);
    }
  };

  const fetchCatalogs = useCallback(async () => {
    setIsLoadingCatalog(true);
    setCatalogError(null);
    try {
      const [catRes, alimRes] = await Promise.all([
        apiFetch('/alimentos/categorias'),
        apiFetch('/alimentos')
      ]);

      const categoryData = await catRes.json().catch(() => ({}));
      const foodData = await alimRes.json().catch(() => ({}));
      if (!catRes.ok) throw new Error(categoryData.error || 'No se pudieron cargar las categorías del menú.');
      if (!alimRes.ok) throw new Error(foodData.error || 'No se pudieron cargar los alimentos.');

      const loadedCats: CategoryWithCode[] = Array.isArray(categoryData) ? categoryData : [];
      setCategories(sortCategories(loadedCats));
      setAllAlimentos(Array.isArray(foodData) ? foodData : []);

      // Initialize store with empty arrays for all categories
      for (const cat of loadedCats) {
        if (!(cat.id_categoria_menu in categoryOptions)) {
          menuStore.setCategoryOptions(cat.id_categoria_menu, ['']);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo cargar el catálogo del menú.';
      setCatalogError(message);
      toast.error('No se pudo cargar el catálogo del menú', { description: message });
    } finally {
      setIsLoadingCatalog(false);
    }
  }, []);

  useEffect(() => {
    fetchCatalogs();
    fetchMenus(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildOpcionesPayload = () => {
    const opciones: Record<string, string[]> = {};
    for (const cat of categories) {
      const opts = cleanOptions(categoryOptions[cat.id_categoria_menu] ?? []);
      if (opts.length) opciones[String(cat.id_categoria_menu)] = opts;
    }
    return opciones;
  };

  const handleSendMenu = async () => {
    const opciones = buildOpcionesPayload();
    const sopaCatId = getCategoryIdByName('sopa');
    const segundoCatId = getCategoryIdByName('segundo', 'plato');

    if (!sopaCatId || !cleanOptions(categoryOptions[sopaCatId] ?? []).length) {
      return toast.error('Debe haber al menos una sopa configurada');
    }
    if (!segundoCatId || !cleanOptions(categoryOptions[segundoCatId] ?? []).length) {
      return toast.error('Debe haber al menos un segundo/plato fuerte configurado');
    }

    const allOptions = Object.values(opciones).flat();
    if (allOptions.some(option => option.length > FIELD_LIMITS.menuOption)) {
      return toast.error(`Cada opcion debe tener maximo ${FIELD_LIMITS.menuOption} caracteres`);
    }

    setIsSending(true);
    try {
      const sections = buildSections();
      const response = await apiFetch('/menu/enviar', {
        method: 'POST',
        body: JSON.stringify({
          opciones,
          image: sections.length ? buildTelegramMenuImage({ sections }) : undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'No se pudo disparar el flujo de Telegram');
      }

      toast.success('Menu enviado a n8n correctamente', {
        description: data.mensaje || 'Telegram enviara el menu a los chats vinculados.'
      });
      fetchMenus(false);
    } catch (error) {
      toast.error('No se pudo enviar el menu', {
        description: error instanceof Error ? error.message : 'Revisa n8n y vuelve a intentarlo.'
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleSaveMenu = async (force = false) => {
    const opciones = buildOpcionesPayload();
    const sopaCatId = getCategoryIdByName('sopa');
    const segundoCatId = getCategoryIdByName('segundo', 'plato');

    if (!sopaCatId || !cleanOptions(categoryOptions[sopaCatId] ?? []).length) {
      return toast.error('Debe haber al menos una sopa configurada');
    }
    if (!segundoCatId || !cleanOptions(categoryOptions[segundoCatId] ?? []).length) {
      return toast.error('Debe haber al menos un segundo/plato fuerte configurado');
    }

    const allOptions = Object.values(opciones).flat();
    if (allOptions.some(option => option.length > FIELD_LIMITS.menuOption)) {
      return toast.error(`Cada opcion debe tener maximo ${FIELD_LIMITS.menuOption} caracteres`);
    }

    const fecha = selectedMenuDate || dateInBogota();
    setIsSaving(true);
    try {
      const sections = buildSections();
      const response = await apiFetch(`/menu/${fecha}`, {
        method: 'PUT',
        body: JSON.stringify({
          opciones,
          image: sections.length ? buildTelegramMenuImage({ sections }) : undefined,
          confirmarEdicion: force,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.status === 409 && data.requireConfirmation) {
        const confirmed = window.confirm(data.error || 'Este menu esta activo. Confirma la edicion.');
        if (confirmed) await handleSaveMenu(true);
        return;
      }

      if (!response.ok) throw new Error(data.error || 'No se pudo guardar el menu');

      toast.success('Menu guardado correctamente');
      setSelectedMenuDate(fecha);
      fetchMenus(false);
    } catch (error) {
      toast.error('No se pudo guardar el menu', {
        description: error instanceof Error ? error.message : 'Revisa los datos e intenta otra vez.'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleActivateMenu = async (menu: DailyMenu) => {
    setIsActivating(menu.fecha);
    try {
      const response = await apiFetch(`/menu/${menu.fecha}/activar`, { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo activar el menu');
      toast.success('Menu activado correctamente');
      setSelectedMenuDate(menu.fecha);
      fetchMenus(false);
    } catch (error) {
      toast.error('No se pudo activar el menu', {
        description: error instanceof Error ? error.message : 'Intenta otra vez.'
      });
    } finally {
      setIsActivating(null);
    }
  };

  const handleFoodCreated = (food: Alimento) => {
    setAllAlimentos((current) => {
      if (current.some(item => item.id === food.id)) return current;
      return [...current, food];
    });
  };

  const updateOption = (catId: number, index: number, value: string) => {
    const current = [...(categoryOptions[catId] ?? [''])];
    current[index] = value;
    menuStore.setCategoryOptions(catId, current);
  };

  const addOption = (catId: number) => {
    const current = [...(categoryOptions[catId] ?? [''])];
    current.push('');
    menuStore.setCategoryOptions(catId, current);
  };

  const removeOption = (catId: number, index: number) => {
    const current = [...(categoryOptions[catId] ?? [''])];
    if (current.length <= 1) return;
    current.splice(index, 1);
    menuStore.setCategoryOptions(catId, current);
  };

  const getCategoryExclude = (catId: number, currentIndex: number) => {
    const options = categoryOptions[catId] ?? [''];
    return options.filter((_, i) => i !== currentIndex);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground bg-clip-text text-transparent bg-gradient-to-r from-cafe to-terracota">
            Gestión de Menú
          </h1>
          <p className="text-muted-foreground text-lg">
            Configura los platos disponibles para el día de hoy.
          </p>
        </div>
        <div
          style={{ backgroundColor: 'rgba(191, 93, 48, 0.1)', borderColor: 'rgba(191, 93, 48, 0.2)' }}
          className="px-4 py-2 rounded-2xl flex items-center gap-2 border backdrop-blur-sm"
        >
          <CalendarDays style={{ color: '#BF5D30' }} className="h-5 w-5" />
          <span style={{ color: '#BF5D30' }} className="text-sm font-semibold capitalize">
            {new Date().toLocaleDateString('es-ES', {
              timeZone: 'America/Bogota',
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </span>
        </div>
      </div>

      {catalogError && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {catalogError}
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2 mb-4">
        <CategoryManager onCategoriesChanged={fetchCatalogs} />
        <ProductManager onProductsChanged={fetchCatalogs} />
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" className="border-cafe text-cafe hover:bg-cafe/10 font-semibold shadow-sm">
              <CalendarDays className="h-4 w-4 mr-2" />
              Ver Historial de Menús
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5" />
                Historial de Menús
              </DialogTitle>
            </DialogHeader>
            <RegisteredMenuList
              menus={menus}
              isLoading={isLoadingMenus}
              error={menuLoadError}
              isActivating={isActivating}
              onLoad={applyMenu}
              onActivate={handleActivateMenu}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          {categories.map((cat) => {
            const catOptions = getCatOptions(cat.id_categoria_menu);
            const IconComponent = getCategoryIcon(cat.nombre_categoria);

            return (
              <Card
                key={cat.id_categoria_menu}
                className="border-border shadow-md border-l-4 overflow-hidden bg-muted/5 border-l-secondary"
                style={{ borderLeftColor: getImageAccent(cat.nombre_categoria) }}
              >
                <CardHeader className="pb-4 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-2xl flex items-center gap-3 text-cafe">
                      <div
                        className="text-white w-10 h-10 rounded-xl flex items-center justify-center shadow-md"
                        style={{ background: `linear-gradient(135deg, ${getCategoryIconColor(cat.nombre_categoria)}, ${getCategoryIconColor(cat.nombre_categoria)}cc)` }}
                      >
                        <IconComponent className="h-6 w-6" />
                      </div>
                      {cat.nombre_categoria}
                    </CardTitle>
                    <CardDescription className="mt-1 font-medium">
                      Define las opciones de {cat.nombre_categoria.toLowerCase()} para hoy
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => addOption(cat.id_categoria_menu)}
                    className="gap-2 border-secondary/30 bg-background hover:bg-secondary/10 text-secondary font-bold"
                  >
                    <Plus className="h-4 w-4" />
                    Añadir Opción
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4 pt-2">
                  <div className="grid gap-4 md:grid-cols-2">
                    {catOptions.map((option, index) => (
                      <div key={index} className="space-y-2 relative group">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                            Opción {index + 1}
                          </Label>
                          {catOptions.length > 1 && (
                            <button
                              onClick={() => removeOption(cat.id_categoria_menu, index)}
                              className="text-destructive opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-destructive/10 rounded"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                        <FoodSelector
                          value={option}
                          onChange={(val) => updateOption(cat.id_categoria_menu, index, val)}
                          idCategoria={cat.id_categoria_menu}
                          alimentos={allAlimentos}
                          placeholder={`Seleccionar ${cat.nombre_categoria.toLowerCase()}...`}
                          exclude={getCategoryExclude(cat.id_categoria_menu, index)}
                          disabled={isLoadingCatalog || Boolean(catalogError)}
                          onFoodCreated={handleFoodCreated}
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="lg:col-span-4 space-y-8">
          <Card className="border-border shadow-sm h-fit overflow-hidden">
            <CardHeader className="bg-muted/30 border-b">
              <CardTitle className="text-xl flex items-center gap-2 text-cafe">
                <ImageIcon style={{ color: '#C2803A' }} className="h-5 w-5" />
                Imagen para Telegram
              </CardTitle>
              <CardDescription>Vista previa generada con las opciones del dia</CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              <div className="overflow-hidden rounded-lg border bg-background shadow-sm">
                {generatedMenuImage && (
                  <img
                    src={generatedMenuImage}
                    alt="Vista previa del menu para Telegram"
                    className="w-full object-contain max-h-[720px]"
                  />
                )}
              </div>
            </CardContent>
          </Card>

          <Button
            size="lg"
            className="w-full h-16 text-xl font-bold gap-4 shadow-xl shadow-primary/20 hover:shadow-primary/40 transition-all hover:-translate-y-1 active:translate-y-0.5 rounded-2xl bg-primary hover:bg-primary/90"
            onClick={handleSendMenu}
            disabled={isSending}
          >
            {isSending ? (
              <div className="animate-spin rounded-full h-6 w-6 border-3 border-primary-foreground border-t-transparent" />
            ) : (
              <Send className="h-6 w-6" />
            )}
            {isSending ? 'Enviando...' : 'ENVIAR MENÚ'}
          </Button>

          <Button
            size="lg"
            variant="outline"
            className="w-full h-12 font-bold gap-3 border-cafe text-cafe hover:bg-cafe/10"
            onClick={() => handleSaveMenu(false)}
            disabled={isSaving}
          >
            {isSaving ? 'Guardando...' : 'Guardar cambios'}
          </Button>

          <p className="text-center text-sm text-muted-foreground px-4">
            Al presionar enviar, n8n compartira el menu con los chats de Telegram vinculados.
          </p>
        </div>
      </div>
    </div>
  );
}
