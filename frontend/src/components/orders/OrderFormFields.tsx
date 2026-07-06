import { useEffect, useState, useMemo } from 'react';
import { OrderProduct } from '@/types';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Minus, Trash2, ShoppingCart, Utensils } from 'lucide-react';
import { toast } from 'sonner';
import { useMenu } from '@/data/menuStore';
import { FIELD_LIMITS } from '@/lib/validation';

export interface OrderItem {
  id_producto: string;
  nombre: string;
  precio: number;
  cantidad: number;
  opciones?: Record<string, string>;
  id_categoria: number;
}

export interface OrderFormState {
  items: OrderItem[];
  observaciones: string;
}

interface OrderFormFieldsProps {
  state: OrderFormState;
  onChange: (next: OrderFormState) => void;
  showProductos?: boolean;
  availableBalances?: Record<string, number> | null;
  isFrecuente?: boolean;
}

interface Category {
  id_categoria: number;
  nombre_categoria: string;
}

interface Product {
  id: string;
  nombre: string;
  precio: number;
  id_categoria: number;
  categoria_nombre: string;
}

export function OrderFormFields({ state, onChange, showProductos = true, availableBalances = null, isFrecuente = false }: OrderFormFieldsProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [currentCategory, setCurrentCategory] = useState<string>('');
  const [currentProduct, setCurrentProduct] = useState<Product | null>(null);
  const [currentCantidad, setCurrentCantidad] = useState(1);
  const [currentOpciones, setCurrentOpciones] = useState<Record<string, string>>({});
  const [isCustomOpcion, setIsCustomOpcion] = useState<Record<string, boolean>>({});
  const [formMode, setFormMode] = useState<'almuerzo' | 'extra'>('almuerzo');

  interface MenuCategoryData {
    id_categoria_menu: number;
    nombre_categoria: string;
    opciones: string[];
  }
  const [activeMenuCategories, setActiveMenuCategories] = useState<MenuCategoryData[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [catRes, prodRes, menuRes, catMenuRes] = await Promise.all([
          apiFetch('/categorias'),
          apiFetch('/productos'),
          apiFetch('/menu'),
          apiFetch('/alimentos/categorias')
        ]);
        if (catRes.ok) setCategories(await catRes.json());
        if (prodRes.ok) setAllProducts(await prodRes.json());
        
        if (menuRes.ok && catMenuRes.ok) {
          const menuData = await menuRes.json();
          const catMenuData = await catMenuRes.json();
          
          const menus = Array.isArray(menuData) ? menuData : (menuData.menus || []);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const active = menus.find((m: any) => m.estado === 'activo') || menus[0];
          
          if (active && active.opciones) {
            const parsedCategories: MenuCategoryData[] = [];
            for (const cat of catMenuData) {
              const opts = active.opciones[cat.id_categoria_menu] || [];
              if (opts.length > 0) {
                parsedCategories.push({
                  id_categoria_menu: cat.id_categoria_menu,
                  nombre_categoria: cat.nombre_categoria,
                  opciones: opts.filter((o: string) => o.trim() !== '')
                });
              }
            }
            setActiveMenuCategories(parsedCategories);
          }
        }
      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const filteredProducts = useMemo(() => {
    let prods = allProducts.filter(p => p.id_categoria.toString() === currentCategory);
    if (availableBalances !== null) {
      prods = prods.filter(p => (availableBalances[p.id.toString()] || 0) > 0);
    }
    return prods;
  }, [allProducts, currentCategory, availableBalances]);

  const filteredCategories = useMemo(() => {
    let cats = categories;

    if (formMode === 'almuerzo') {
      cats = cats.filter(c => c.nombre_categoria.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('almuerzo'));
    } else {
      cats = cats.filter(c => !c.nombre_categoria.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('almuerzo'));
    }

    if (availableBalances === null) return cats;
    
    const validCategoryIds = new Set();
    allProducts.forEach(p => {
      if ((availableBalances[p.id.toString()] || 0) > 0) {
        validCategoryIds.add(p.id_categoria);
      }
    });
    return cats.filter(c => validCategoryIds.has(c.id_categoria));
  }, [categories, allProducts, availableBalances, formMode]);

  useEffect(() => {
    if (formMode === 'almuerzo' && filteredCategories.length > 0 && !currentCategory) {
      setCurrentCategory(filteredCategories[0].id_categoria.toString());
    }
  }, [formMode, filteredCategories, currentCategory]);

  const handleAddItem = () => {
    if (!currentProduct) {
      toast.error('Seleccione un producto');
      return;
    }

    const normName = currentProduct.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const isAlmuerzo = currentProduct.categoria_nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('almuerzo');
    
    const visibleMenuCategories = activeMenuCategories.filter(cat => {
      const catName = cat.nombre_categoria.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      
      if (!isAlmuerzo) {
        const productCat = currentProduct.categoria_nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return catName === productCat || catName.includes(productCat) || productCat.includes(catName);
      }
      
      const isEntrada = catName.includes('entrada');
      const isSopa = catName.includes('sopa');
      const isPlatoFuerte = catName.includes('segundo') || catName.includes('fuerte') || catName.includes('guarnicion') || catName.includes('arroz');
      const isBebida = catName.includes('bebida') || catName.includes('jugo');
      const isPostre = catName.includes('postre');
      
      if (normName.includes('ejecutivo completo')) {
        return isEntrada || isSopa || isPlatoFuerte || isBebida || isPostre;
      }
      if (normName.includes('ejecutivo sin sopa')) {
        return isEntrada || isPlatoFuerte || isBebida || isPostre;
      }
      if (normName.includes('ejecutivo simple')) {
        return isPlatoFuerte || isBebida || isPostre;
      }
      if (normName.includes('del dia simple') || normName.includes('solo segundo')) {
        return isPlatoFuerte || isBebida;
      }
      if (normName.includes('del dia')) {
        return isSopa || isPlatoFuerte || isBebida;
      }
      
      // Fallback generico
      if (isSopa && (normName.includes('sin sopa') || normName.includes('solo segundo'))) return false;
      if (isPlatoFuerte && (normName.includes('solo sopa') || normName.includes('sin segundo'))) return false;
      
      return true;
    });

    for (const cat of visibleMenuCategories) {
      const val = currentOpciones[cat.nombre_categoria] || '';
      if (!val.trim()) {
        toast.error(`Por favor especifique: ${cat.nombre_categoria}`);
        return;
      }
      if (val.trim().length > FIELD_LIMITS.menuOption) {
        toast.error(`Cada opcion de menu debe tener maximo ${FIELD_LIMITS.menuOption} caracteres`);
        return;
      }
    }

    if (currentCantidad < 1 || currentCantidad > 20) {
      toast.error('La cantidad debe estar entre 1 y 20');
      return;
    }

    if (availableBalances !== null) {
      const addedQuantity = state.items.filter(i => i.id_producto === currentProduct.id).reduce((acc, curr) => acc + curr.cantidad, 0);
      const totalWanted = addedQuantity + currentCantidad;
      const allowed = availableBalances[currentProduct.id.toString()] || 0;
      if (totalWanted > allowed) {
        toast.error(`Solo tiene ${allowed} disponibles en su monedero para este producto`);
        return;
      }
    }

    const opcionesParaGuardar: Record<string, string> = {};
    for (const cat of visibleMenuCategories) {
      opcionesParaGuardar[cat.nombre_categoria] = currentOpciones[cat.nombre_categoria];
    }

    const newItem: OrderItem = {
      id_producto: currentProduct.id,
      nombre: currentProduct.nombre,
      precio: currentProduct.precio,
      cantidad: currentCantidad,
      id_categoria: currentProduct.id_categoria,
      opciones: Object.keys(opcionesParaGuardar).length > 0 ? opcionesParaGuardar : undefined
    };

    onChange({
      ...state,
      items: [...state.items, newItem]
    });

    // Reset local form
    setCurrentCategory('');
    setCurrentProduct(null);
    setCurrentOpciones({});
    setCurrentCantidad(1);
    setIsCustomOpcion({});
    toast.success(`${newItem.nombre} agregado al pedido`);
  };

  const handleRemoveItem = (index: number) => {
    const newItems = [...state.items];
    newItems.splice(index, 1);
    onChange({ ...state, items: newItems });
  };

  const totalPedido = state.items.reduce((sum, item) => sum + item.precio * item.cantidad, 0);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Selector de Productos */}
      <Card className="border-border bg-muted/20 shadow-sm">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Plus className="h-4 w-4 text-primary" />
            <span className="text-sm font-bold text-foreground uppercase tracking-wider">
              {formMode === 'almuerzo' ? 'Agregar Almuerzo' : 'Agregar Adicionales'}
            </span>
          </div>

          {state.items.length > 0 && (
            <div className="flex gap-2 mb-4 animate-in fade-in">
              <Button 
                type="button" 
                variant={formMode === 'almuerzo' ? 'default' : 'outline'} 
                onClick={() => { setFormMode('almuerzo'); setCurrentCategory(''); setCurrentProduct(null); }}
                className={formMode === 'almuerzo' ? 'bg-cafe hover:bg-cafe/90 flex-1 text-xs' : 'flex-1 text-xs'}
              >
                🍽️ Agregar otro almuerzo
              </Button>
              <Button 
                type="button" 
                variant={formMode === 'extra' ? 'default' : 'outline'} 
                onClick={() => { setFormMode('extra'); setCurrentCategory(''); setCurrentProduct(null); }}
                className={formMode === 'extra' ? 'bg-cafe hover:bg-cafe/90 flex-1 text-xs' : 'flex-1 text-xs'}
              >
                🥤 Añadir adicionales
              </Button>
            </div>
          )}

          <div className={`grid gap-4 ${formMode === 'almuerzo' ? 'md:grid-cols-1' : 'md:grid-cols-2'}`}>
            {formMode !== 'almuerzo' && (
              <div className="space-y-1.5">
                <Label className="text-xs text-cafe/70">Categoría</Label>
                <Select value={currentCategory} onValueChange={(v) => {
                  setCurrentCategory(v);
                  setCurrentProduct(null);
                }}>
                  <SelectTrigger className="bg-background text-cafe">
                    <SelectValue placeholder="Elija categoría" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-border shadow-xl">
                    {filteredCategories.map((c) => (
                      <SelectItem key={c.id_categoria} value={c.id_categoria.toString()}>
                        {c.nombre_categoria}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs text-cafe/70">
                {formMode === 'almuerzo' ? 'Almuerzo' : 'Producto'}
              </Label>
              <Select 
                value={currentProduct?.id?.toString() || ''} 
                onValueChange={(v) => setCurrentProduct(allProducts.find(p => p.id.toString() === v) || null)}
                disabled={!currentCategory}
              >
                <SelectTrigger className="bg-background text-cafe">
                  <SelectValue placeholder={formMode === 'almuerzo' ? 'Seleccionar almuerzo' : 'Elija producto'} />
                </SelectTrigger>
                <SelectContent className="bg-white border-border shadow-xl">
                  {filteredProducts.map((p) => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {(() => {
            if (!currentProduct) return null;

            const normName = currentProduct.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const isAlmuerzo = currentProduct.categoria_nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('almuerzo');
            
            const visibleMenuCategories = activeMenuCategories.filter(cat => {
              const catName = cat.nombre_categoria.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
              
              if (!isAlmuerzo) {
                const productCat = currentProduct?.categoria_nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') || '';
                return catName === productCat || catName.includes(productCat) || productCat.includes(catName);
              }
              
              const isEntrada = catName.includes('entrada');
              const isSopa = catName.includes('sopa');
              const isPlatoFuerte = catName.includes('segundo') || catName.includes('fuerte') || catName.includes('guarnicion') || catName.includes('arroz');
              const isBebida = catName.includes('bebida') || catName.includes('jugo');
              const isPostre = catName.includes('postre');
              
              if (normName.includes('ejecutivo completo')) {
                return isEntrada || isSopa || isPlatoFuerte || isBebida || isPostre;
              }
              if (normName.includes('ejecutivo sin sopa')) {
                return isEntrada || isPlatoFuerte || isBebida || isPostre;
              }
              if (normName.includes('ejecutivo simple')) {
                return isPlatoFuerte || isBebida || isPostre;
              }
              if (normName.includes('del dia simple') || normName.includes('solo segundo')) {
                return isPlatoFuerte || isBebida;
              }
              if (normName.includes('del dia')) {
                return isSopa || isPlatoFuerte || isBebida;
              }
              
              // Fallback generico
              if (isSopa && (normName.includes('sin sopa') || normName.includes('solo segundo'))) return false;
              if (isPlatoFuerte && (normName.includes('solo sopa') || normName.includes('sin segundo'))) return false;
              
              return true;
            });

            if (visibleMenuCategories.length === 0) return null;

            const categoryOrder = ['entrada', 'sopa', 'segundo', 'fuerte', 'bebida', 'jugo', 'postre'];
            const sortedCategories = [...visibleMenuCategories].sort((a, b) => {
              const nameA = a.nombre_categoria.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
              const nameB = b.nombre_categoria.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
              
              const idxA = categoryOrder.findIndex(c => nameA.includes(c));
              const idxB = categoryOrder.findIndex(c => nameB.includes(c));
              
              const finalA = idxA === -1 ? 999 : idxA;
              const finalB = idxB === -1 ? 999 : idxB;
              
              return finalA - finalB;
            });

            return (
              <div className={`grid gap-4 ${sortedCategories.length > 1 ? 'md:grid-cols-2' : 'md:grid-cols-1'} p-4 bg-primary/5 rounded-xl border border-primary/10 animate-in slide-in-from-top-2 duration-300`}>
                {sortedCategories.map(cat => {
                  const catName = cat.nombre_categoria;
                  const isCustom = isCustomOpcion[catName] || false;
                  const val = currentOpciones[catName] || '';
                  
                  return (
                    <div key={cat.id_categoria_menu} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-cafe/70">¿Qué {catName.toLowerCase()} desea?</Label>
                        {isCustom && cat.opciones.length > 0 && (
                          <button type="button" onClick={() => setIsCustomOpcion({...isCustomOpcion, [catName]: false})} className="text-[10px] text-primary hover:underline">
                            Ver menú
                          </button>
                        )}
                      </div>
                      {(!isCustom && cat.opciones.length > 0) ? (
                        <Select value={val} onValueChange={(v) => {
                          if (v === 'custom') {
                            setIsCustomOpcion({...isCustomOpcion, [catName]: true});
                            setCurrentOpciones({...currentOpciones, [catName]: ''});
                          } else {
                            setCurrentOpciones({...currentOpciones, [catName]: v});
                          }
                        }}>
                          <SelectTrigger className="bg-background text-cafe">
                            <SelectValue placeholder="Elegir del menú..." />
                          </SelectTrigger>
                          <SelectContent className="bg-white">
                            {cat.opciones.map((opt, idx) => (
                              <SelectItem key={`opt-${cat.id_categoria_menu}-${idx}`} value={opt}>{opt}</SelectItem>
                            ))}
                            <SelectItem value="custom" className="font-bold text-primary">Otra opción...</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input 
                          value={val} 
                          onChange={(e) => setCurrentOpciones({...currentOpciones, [catName]: e.target.value})} 
                          placeholder={`Escriba su ${catName.toLowerCase()}`}
                          className="bg-background"
                          maxLength={FIELD_LIMITS.menuOption}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          <div className="flex items-end justify-between gap-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-cafe/70">Cantidad</Label>
              <div className="flex items-center gap-2">
                <Button 
                  type="button"
                  variant="outline" 
                  size="icon" 
                  className="h-9 w-9 bg-background"
                  onClick={() => setCurrentCantidad(Math.max(1, currentCantidad - 1))}
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="w-10 text-center font-bold">{currentCantidad}</span>
                <Button 
                  type="button"
                  variant="outline" 
                  size="icon" 
                  className="h-9 w-9 bg-background"
                  onClick={() => setCurrentCantidad(Math.min(20, currentCantidad + 1))}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>

            <Button type="button" onClick={handleAddItem} className="gap-2 px-6 bg-cafe hover:bg-cafe/90 shadow-md shadow-cafe/20">
              <Plus className="h-4 w-4" />
              Agregar Producto
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Carrito / Lista de Pedido */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <ShoppingCart className="h-5 w-5 text-primary" />
          <h3 className="font-bold text-foreground">Productos en este Pedido</h3>
        </div>

        {state.items.length === 0 ? (
          <div className="h-32 flex flex-col items-center justify-center border-2 border-dashed rounded-xl text-muted-foreground bg-muted/5">
            <Utensils className="h-8 w-8 mb-2 opacity-20" />
            <p className="text-sm">No hay productos agregados</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[300px] rounded-xl border border-border bg-background shadow-inner">
            <div className="divide-y divide-border">
              {state.items.map((item, index) => (
                <div key={index} className="p-4 hover:bg-muted/30 transition-colors group">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-primary">{item.cantidad}x</span>
                        <p className="font-semibold text-foreground truncate">{item.nombre}</p>
                      </div>
                      {(item.opciones && Object.keys(item.opciones).length > 0) && (
                        <div className="mt-1 flex flex-wrap gap-2">
                          {Object.entries(item.opciones).map(([k, v]) => (
                            <span key={k} className="text-xs font-medium bg-accent/60 px-2.5 py-0.5 rounded-full text-foreground border capitalize">
                              {k}: {v}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className="font-bold text-foreground">${(item.precio * item.cantidad).toFixed(2)}</span>
                      <Button 
                        type="button"
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleRemoveItem(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {state.items.length > 0 && (
          <div className="bg-primary/10 p-4 rounded-xl flex items-center justify-between border border-primary/20">
            <span className="font-bold text-primary">TOTAL DEL PEDIDO:</span>
            <span className="text-2xl font-black text-primary">${totalPedido.toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* Observaciones */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold flex items-center gap-2">
          Observaciones Generales
        </Label>
        <Textarea
          placeholder="Ej: Sin cebolla, entregar en recepción, etc..."
          value={state.observaciones}
          onChange={(e) => onChange({ ...state, observaciones: e.target.value })}
          className="min-h-[100px] resize-none border-muted-foreground/20"
          maxLength={FIELD_LIMITS.observaciones}
        />
      </div>
    </div>
  );
}
