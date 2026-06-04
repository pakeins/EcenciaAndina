import { useState, useEffect, useMemo } from 'react';
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
  Utensils
} from 'lucide-react';
import { toast } from 'sonner';
import { FoodSelector } from '@/components/menu/FoodSelector';
import { apiFetch } from '@/lib/api';
import { buildTelegramMenuImage } from '@/lib/menuImage';
import { Alimento } from '@/types';
import { FIELD_LIMITS } from '@/lib/validation';

interface Category {
  id_categoria_menu: number;
  nombre_categoria: string;
}

interface DailyMenu {
  fecha: string;
  estado: 'activo' | 'inactivo';
  imagen_url: string | null;
  sopas: string[];
  segundos: string[];
  guarniciones: string[];
  opciones: number;
}

export default function Menu() {
  const { sopas, segundos, guarniciones } = useMenu();
  const [isSending, setIsSending] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isActivating, setIsActivating] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [allAlimentos, setAllAlimentos] = useState<Alimento[]>([]);
  const [menus, setMenus] = useState<DailyMenu[]>([]);
  const [selectedMenuDate, setSelectedMenuDate] = useState<string | null>(null);

  const cleanOptions = (options: string[]) => options.map(option => option.trim()).filter(Boolean);

  const generatedMenuImage = useMemo(() => {
    return buildTelegramMenuImage({
      sopas: cleanOptions(sopas),
      segundos: cleanOptions(segundos),
      guarniciones: cleanOptions(guarniciones),
    });
  }, [sopas, segundos, guarniciones]);

  const applyMenu = (menu: DailyMenu) => {
    menuStore.setSopas(menu.sopas.length ? menu.sopas : ['']);
    menuStore.setSegundos(menu.segundos.length ? menu.segundos : ['']);
    menuStore.setGuarniciones(menu.guarniciones.length ? menu.guarniciones : ['']);
    menuStore.setDailyImage(menu.imagen_url);
    setSelectedMenuDate(menu.fecha);
  };

  const fetchMenus = async (applyActive = false) => {
    try {
      const response = await apiFetch('/menu');
      if (!response.ok) return;
      const data = await response.json();
      const loadedMenus: DailyMenu[] = Array.isArray(data.menus) ? data.menus : [];
      setMenus(loadedMenus);

      if (applyActive && loadedMenus.length) {
        const active = loadedMenus.find(menu => menu.estado === 'activo') || loadedMenus[0];
        applyMenu(active);
      }
    } catch (error) {
      toast.error('No se pudieron cargar los menus registrados');
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [catRes, alimRes] = await Promise.all([
          apiFetch('/alimentos/categorias'),
          apiFetch('/alimentos')
        ]);
        
        if (catRes.ok) setCategories(await catRes.json());
        if (alimRes.ok) setAllAlimentos(await alimRes.json());
      } catch (err) {
        // Error silenciado para limpieza
      }
    };
    fetchData();
    fetchMenus(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSendMenu = async () => {
    const menuPayload = {
      sopas: cleanOptions(sopas),
      segundos: cleanOptions(segundos),
      guarniciones: cleanOptions(guarniciones),
    };
    
    if (!menuPayload.sopas.length || !menuPayload.segundos.length || !menuPayload.guarniciones.length) {
      return toast.error('Debe haber al menos una sopa, un segundo y una guarnicion configurados');
    }
    if ([...menuPayload.sopas, ...menuPayload.segundos, ...menuPayload.guarniciones].some(option => option.length > FIELD_LIMITS.menuOption)) {
      return toast.error(`Cada opcion debe tener maximo ${FIELD_LIMITS.menuOption} caracteres`);
    }
    
    setIsSending(true);
    try {
      const response = await apiFetch('/menu/enviar', {
        method: 'POST',
        body: JSON.stringify({
          ...menuPayload,
          image: buildTelegramMenuImage(menuPayload),
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

  const currentPayload = () => ({
    sopas: cleanOptions(sopas),
    segundos: cleanOptions(segundos),
    guarniciones: cleanOptions(guarniciones),
  });

  const handleSaveMenu = async (force = false) => {
    const menuPayload = currentPayload();
    if (!menuPayload.sopas.length || !menuPayload.segundos.length || !menuPayload.guarniciones.length) {
      return toast.error('Debe haber al menos una sopa, un segundo y una guarnicion configurados');
    }
    if ([...menuPayload.sopas, ...menuPayload.segundos, ...menuPayload.guarniciones].some(option => option.length > FIELD_LIMITS.menuOption)) {
      return toast.error(`Cada opcion debe tener maximo ${FIELD_LIMITS.menuOption} caracteres`);
    }

    const fecha = selectedMenuDate || new Date().toISOString().split('T')[0];
    setIsSaving(true);
    try {
      const response = await apiFetch(`/menu/${fecha}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...menuPayload,
          image: buildTelegramMenuImage(menuPayload),
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

  const getCategoryId = (name: string) => {
    const search = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const cat = categories.find(c => {
      const catName = c.nombre_categoria.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return catName.includes(search);
    });
    return cat ? cat.id_categoria_menu : 0;
  };

  const updateOption = (type: 'sopas' | 'segundos' | 'guarniciones', index: number, value: string) => {
    const current = type === 'sopas' ? [...sopas] : type === 'segundos' ? [...segundos] : [...guarniciones];
    current[index] = value;
    if (type === 'sopas') menuStore.setSopas(current);
    else if (type === 'segundos') menuStore.setSegundos(current);
    else menuStore.setGuarniciones(current);
  };

  const addOption = (type: 'sopas' | 'segundos' | 'guarniciones') => {
    const current = type === 'sopas' ? [...sopas] : type === 'segundos' ? [...segundos] : [...guarniciones];
    current.push('');
    if (type === 'sopas') menuStore.setSopas(current);
    else if (type === 'segundos') menuStore.setSegundos(current);
    else menuStore.setGuarniciones(current);
  };

  const removeOption = (type: 'sopas' | 'segundos' | 'guarniciones', index: number) => {
    const current = type === 'sopas' ? [...sopas] : type === 'segundos' ? [...segundos] : [...guarniciones];
    if (current.length <= 1) return;
    current.splice(index, 1);
    if (type === 'sopas') menuStore.setSopas(current);
    else if (type === 'segundos') menuStore.setSegundos(current);
    else menuStore.setGuarniciones(current);
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
            {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          
          {/* MODULO SOPAS */}
          <Card className="border-border shadow-md border-l-4 border-l-secondary overflow-hidden bg-secondary/5">
            <CardHeader className="pb-4 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-2xl flex items-center gap-3 text-cafe">
                  <div className="bg-secondary text-white w-10 h-10 rounded-xl flex items-center justify-center shadow-md">
                    <Soup className="h-6 w-6" />
                  </div>
                  Sopas
                </CardTitle>
                <CardDescription className="mt-1 font-medium">Define las opciones de sopas para hoy</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => addOption('sopas')} className="gap-2 border-secondary/30 bg-background hover:bg-secondary/10 text-secondary font-bold">
                <Plus className="h-4 w-4" />
                Añadir Opción
              </Button>
            </CardHeader>
            <CardContent className="space-y-4 pt-2">
              <div className="grid gap-4 md:grid-cols-2">
                {sopas.map((sopa, index) => (
                  <div key={index} className="space-y-2 relative group">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Opción {index + 1}</Label>
                      {sopas.length > 1 && (
                        <button 
                          onClick={() => removeOption('sopas', index)}
                          className="text-destructive opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-destructive/10 rounded"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <FoodSelector 
                      value={sopa}
                      onChange={(val) => updateOption('sopas', index, val)}
                      idCategoria={getCategoryId('Sopa')}
                      alimentos={allAlimentos}
                      placeholder="Seleccionar sopa..."
                      exclude={sopas.filter((_, i) => i !== index)}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* MODULO SEGUNDOS */}
          <Card className="border-border shadow-md border-l-4 border-l-terracota overflow-hidden bg-terracota/5">
            <CardHeader className="pb-4 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-2xl flex items-center gap-3 text-cafe">
                  <div 
                    style={{ backgroundColor: '#BF5D30' }} 
                    className="text-white w-10 h-10 rounded-xl flex items-center justify-center shadow-md"
                  >
                    <ChefHat className="h-6 w-6" />
                  </div>
                  Almuerzos (Segundos)
                </CardTitle>
                <CardDescription className="mt-1 font-medium">Platos fuertes disponibles para hoy</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => addOption('segundos')} className="gap-2 border-terracota/30 bg-background hover:bg-terracota/10 text-terracota font-bold">
                <Plus className="h-4 w-4" />
                Añadir Opción
              </Button>
            </CardHeader>
            <CardContent className="space-y-4 pt-2">
              <div className="grid gap-4 md:grid-cols-2">
                {segundos.map((segundo, index) => (
                  <div key={index} className="space-y-2 relative group">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Opción {index + 1}</Label>
                      {segundos.length > 1 && (
                        <button 
                          onClick={() => removeOption('segundos', index)}
                          className="text-destructive opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-destructive/10 rounded"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <FoodSelector 
                      value={segundo}
                      onChange={(val) => updateOption('segundos', index, val)}
                      idCategoria={getCategoryId('Segundo')}
                      alimentos={allAlimentos}
                      placeholder="Seleccionar plato fuerte..."
                      exclude={segundos.filter((_, i) => i !== index)}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* MODULO GUARNICION */}
          <Card className="border-border shadow-md border-l-4 border-l-oro overflow-hidden bg-oro/5">
            <CardHeader className="pb-4 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-2xl flex items-center gap-3 text-cafe">
                  <div 
                    style={{ backgroundColor: '#C2803A' }} 
                    className="text-white w-10 h-10 rounded-xl flex items-center justify-center shadow-md"
                  >
                    <Utensils className="h-6 w-6" />
                  </div>
                  Guarniciones
                </CardTitle>
                <CardDescription className="mt-1 font-medium">Acompañamientos extras del día</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => addOption('guarniciones')} className="gap-2 border-oro/30 bg-background hover:bg-oro/10 text-oro font-bold">
                <Plus className="h-4 w-4" />
                Añadir Opción
              </Button>
            </CardHeader>
            <CardContent className="space-y-4 pt-2">
              <div className="grid gap-4 md:grid-cols-2">
                {guarniciones.map((guarnicion, index) => (
                  <div key={index} className="space-y-2 relative group">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Guarnición {index + 1}</Label>
                      {guarniciones.length > 1 && (
                        <button 
                          onClick={() => removeOption('guarniciones', index)}
                          className="text-destructive opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-destructive/10 rounded"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <FoodSelector 
                      value={guarnicion}
                      onChange={(val) => updateOption('guarniciones', index, val)}
                      idCategoria={getCategoryId('Guarni')}
                      alimentos={allAlimentos}
                      placeholder="Seleccionar guarnición..."
                      exclude={guarniciones.filter((_, i) => i !== index)}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-4 space-y-8">
          {/* Imagen del Menú */}
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
                    className="aspect-[4/5] w-full object-cover"
                  />
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm h-fit overflow-hidden">
            <CardHeader className="bg-muted/30 border-b">
              <CardTitle className="text-xl flex items-center gap-2 text-cafe">
                <CalendarDays style={{ color: '#4F6F52' }} className="h-5 w-5" />
                Menus registrados
              </CardTitle>
              <CardDescription>Fecha, estado y opciones guardadas</CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {menus.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No existen menus registrados.
                </div>
              ) : (
                menus.slice(0, 6).map(menu => (
                  <div key={menu.fecha} className="rounded-lg border bg-background p-3 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-cafe">{new Date(menu.fecha + 'T00:00:00').toLocaleDateString('es-EC')}</p>
                        <p className="text-xs text-muted-foreground">{menu.opciones} opciones</p>
                      </div>
                      <span className={menu.estado === 'activo' ? 'rounded-full bg-green-100 px-2 py-1 text-xs font-bold text-green-700' : 'rounded-full bg-muted px-2 py-1 text-xs font-bold text-muted-foreground'}>
                        {menu.estado === 'activo' ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => applyMenu(menu)}>
                        Cargar
                      </Button>
                      <Button
                        size="sm"
                        variant={menu.estado === 'activo' ? 'secondary' : 'default'}
                        className="flex-1"
                        disabled={menu.estado === 'activo' || isActivating === menu.fecha}
                        onClick={() => handleActivateMenu(menu)}
                      >
                        {isActivating === menu.fecha ? 'Activando...' : 'Activar'}
                      </Button>
                    </div>
                  </div>
                ))
              )}
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
