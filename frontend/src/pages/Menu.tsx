import { useState, useEffect } from 'react';
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
import { ImageUpload } from '@/components/ImageUpload';
import { FoodSelector } from '@/components/menu/FoodSelector';
import { apiFetch } from '@/lib/api';
import { Alimento } from '@/types';

interface Category {
  id_categoria_menu: number;
  nombre_categoria: string;
}

export default function Menu() {
  const { sopas, segundos, guarniciones, image } = useMenu();
  const [isSending, setIsSending] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [allAlimentos, setAllAlimentos] = useState<Alimento[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [catRes, alimRes, menuRes] = await Promise.all([
          apiFetch('/alimentos/categorias'),
          apiFetch('/alimentos'),
          apiFetch('/alimentos/menu-diario/hoy')
        ]);
        let fetchedCats: Category[] = [];
        if (catRes.ok) {
          fetchedCats = await catRes.json();
          setCategories(fetchedCats);
        }
        
        let fetchedAlimentos = [];
        if (alimRes.ok) {
          fetchedAlimentos = await alimRes.json();
          setAllAlimentos(fetchedAlimentos);
        }

        if (menuRes.ok) {
          const menuHoy = await menuRes.json();
          // Cargar datos en el store global
          if (menuHoy.imagen_url) menuStore.setDailyImage(menuHoy.imagen_url);
          
          if (menuHoy.alimentos && menuHoy.alimentos.length > 0) {
            const loadedSopas = menuHoy.alimentos.filter((a: Alimento) => a.id_categoria === getCategoryId('Sopa', fetchedCats)).map((a: { nombre: string }) => a.nombre);
            const loadedSegundos = menuHoy.alimentos.filter((a: Alimento) => a.id_categoria === getCategoryId('Segundo', fetchedCats)).map((a: { nombre: string }) => a.nombre);
            const loadedGuarniciones = menuHoy.alimentos.filter((a: Alimento) => a.id_categoria === getCategoryId('Guarni', fetchedCats)).map((a: { nombre: string }) => a.nombre);
            
            if (loadedSopas.length > 0) menuStore.setSopas(loadedSopas);
            if (loadedSegundos.length > 0) menuStore.setSegundos(loadedSegundos);
            if (loadedGuarniciones.length > 0) menuStore.setGuarniciones(loadedGuarniciones);
          }
        }
      } catch (err) {
        // Error silenciado para limpieza
      }
    };
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSendMenu = async () => {
    const hasSopa = sopas.some(s => s.trim() !== '');
    const hasSegundo = segundos.some(s => s.trim() !== '');
    
    if (!hasSopa || !hasSegundo) {
      return toast.error('Debe haber al menos una sopa y un segundo configurados');
    }
    
    setIsSending(true);
    
    // Convertir strings a ids para enviar
    const alimentosIds: number[] = [];
    [...sopas, ...segundos, ...guarniciones].filter(s => s.trim() !== '').forEach(nombre => {
      const found = allAlimentos.find(a => a.nombre === nombre);
      if (found) alimentosIds.push(found.id);
    });

    try {
      const res = await apiFetch('/alimentos/menu-diario', {
        method: 'POST',
        body: JSON.stringify({
          fecha: new Date().toISOString().split('T')[0],
          alimentos_ids: alimentosIds,
          imagen_url: image
        })
      });

      if (res.ok) {
        toast.success('¡Menú del día guardado correctamente!', {
          description: 'El menú está listo y disponible para tomar pedidos.'
        });
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Error al guardar el menú en la base de datos');
      }
    } catch (err) {
      toast.error('Error de red al guardar el menú');
    } finally {
      setIsSending(false);
    }
  };

  const getCategoryId = (name: string, overrideCategories?: Category[]) => {
    const search = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const catsToUse = overrideCategories || categories;
    const cat = catsToUse.find(c => {
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
                Foto del Menú
              </CardTitle>
              <CardDescription>Sube la imagen del menú impreso</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <ImageUpload 
                value={image}
                onChange={(val) => menuStore.setDailyImage(val)}
                className="min-h-[300px]"
              />
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
          
          <p className="text-center text-sm text-muted-foreground px-4">
            Al presionar enviar, el menú se compartirá con todos los contactos de la app de mensajería registrados.
          </p>
        </div>
      </div>
    </div>
  );
}
