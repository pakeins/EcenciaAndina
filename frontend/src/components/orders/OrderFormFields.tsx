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
  sopa?: string;
  segundo?: string;
  guarnicion?: string;
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

  // Local state for the item currently being configured
  const [currentCategory, setCurrentCategory] = useState<string>('');
  const [currentProduct, setCurrentProduct] = useState<Product | null>(null);
  const [currentSopa, setCurrentSopa] = useState('');
  const [currentSegundo, setCurrentSegundo] = useState('');
  const [currentGuarnicion, setCurrentGuarnicion] = useState('');
  const [currentCantidad, setCurrentCantidad] = useState(1);

  const { sopas: menuSopas, segundos: menuSegundos, guarniciones: menuGuarniciones } = useMenu();
  const validSopas = useMemo(() => menuSopas.filter(s => s.trim() !== ''), [menuSopas]);
  const validSegundos = useMemo(() => menuSegundos.filter(s => s.trim() !== ''), [menuSegundos]);
  const validGuarniciones = useMemo(() => menuGuarniciones.filter(s => s.trim() !== ''), [menuGuarniciones]);

  const [isCustomSopa, setIsCustomSopa] = useState(false);
  const [isCustomSegundo, setIsCustomSegundo] = useState(false);
  const [isCustomGuarnicion, setIsCustomGuarnicion] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [catRes, prodRes] = await Promise.all([
          apiFetch('/categorias'),
          apiFetch('/productos')
        ]);
        if (catRes.ok) setCategories(await catRes.json());
        if (prodRes.ok) setAllProducts(await prodRes.json());
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
    
    // Si es frecuente, solo mostrar almuerzos
    if (isFrecuente) {
      cats = cats.filter(c => c.nombre_categoria.toLowerCase().includes('almuerzo'));
    }

    if (availableBalances === null) return cats;
    
    const validCategoryIds = new Set();
    allProducts.forEach(p => {
      if ((availableBalances[p.id.toString()] || 0) > 0) {
        validCategoryIds.add(p.id_categoria);
      }
    });
    return cats.filter(c => validCategoryIds.has(c.id_categoria));
  }, [categories, allProducts, availableBalances, isFrecuente]);

  const handleAddItem = () => {
    if (!currentProduct) {
      toast.error('Seleccione un producto');
      return;
    }

    const isAlmuerzo = currentProduct.categoria_nombre.toLowerCase().includes('almuerzo');
    const productNameLower = currentProduct.nombre.toLowerCase();
    const isCompleto = productNameLower.includes('completo');
    const isSinSopa = productNameLower.includes('sin sopa') || productNameLower.includes('solo segundo') || (productNameLower.includes('segundo') && !productNameLower.includes('sopa') && !isCompleto);
    const isSoloSopa = !isSinSopa && (productNameLower.includes('solo sopa') || (productNameLower.includes('sopa') && !productNameLower.includes('segundo') && !isCompleto));
    const requireSopa = isAlmuerzo && !isSinSopa;
    const requireSegundo = isAlmuerzo && !isSoloSopa;
    
    if (requireSopa && !currentSopa.trim()) {
      toast.error('Por favor especifique la sopa');
      return;
    }
    if (requireSegundo && !currentSegundo.trim()) {
      toast.error('Por favor especifique el segundo');
      return;
    }
    if (currentCantidad < 1 || currentCantidad > 20) {
      toast.error('La cantidad debe estar entre 1 y 20');
      return;
    }
    if ([currentSopa, currentSegundo, currentGuarnicion].some((value) => value.trim().length > FIELD_LIMITS.menuOption)) {
      toast.error(`Cada opcion de menu debe tener maximo ${FIELD_LIMITS.menuOption} caracteres`);
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

    const newItem: OrderItem = {
      id_producto: currentProduct.id,
      nombre: currentProduct.nombre,
      precio: currentProduct.precio,
      cantidad: currentCantidad,
      id_categoria: currentProduct.id_categoria,
      ...(requireSopa ? { sopa: currentSopa } : {}),
      ...(requireSegundo ? { segundo: currentSegundo } : {}),
      ...(requireSegundo ? { guarnicion: currentGuarnicion } : {})
    };

    onChange({
      ...state,
      items: [...state.items, newItem]
    });

    // Reset local form
    setCurrentCategory('');
    setCurrentProduct(null);
    setCurrentSopa('');
    setCurrentSegundo('');
    setCurrentGuarnicion('');
    setCurrentCantidad(1);
    setIsCustomSopa(false);
    setIsCustomSegundo(false);
    setIsCustomGuarnicion(false);
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
            <span className="text-sm font-bold text-foreground uppercase tracking-wider">Agregar al Pedido</span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
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

            <div className="space-y-1.5">
              <Label className="text-xs text-cafe/70">Producto</Label>
              <Select 
                value={currentProduct?.id?.toString() || ''} 
                onValueChange={(v) => setCurrentProduct(allProducts.find(p => p.id.toString() === v) || null)}
                disabled={!currentCategory}
              >
                <SelectTrigger className="bg-background text-cafe">
                  <SelectValue placeholder="Elija producto" />
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
            const isAlmuerzo = currentProduct?.categoria_nombre.toLowerCase().includes('almuerzo');
            const productNameLower = currentProduct?.nombre.toLowerCase() || '';
            const isCompleto = productNameLower.includes('completo');
            const isSinSopa = productNameLower.includes('sin sopa') || productNameLower.includes('solo segundo') || (productNameLower.includes('segundo') && !productNameLower.includes('sopa') && !isCompleto);
            const isSoloSopa = !isSinSopa && (productNameLower.includes('solo sopa') || (productNameLower.includes('sopa') && !productNameLower.includes('segundo') && !isCompleto));
            const showSopaField = isAlmuerzo && !isSinSopa;
            const showSegundoField = isAlmuerzo && !isSoloSopa;

            if (!isAlmuerzo || (!showSopaField && !showSegundoField)) return null;

            return (
              <div className={`grid gap-4 ${showSopaField && showSegundoField ? 'md:grid-cols-2' : 'md:grid-cols-1'} p-4 bg-primary/5 rounded-xl border border-primary/10 animate-in slide-in-from-top-2 duration-300`}>
                {showSopaField && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-cafe/70">¿Qué sopa desea?</Label>
                      {isCustomSopa && validSopas.length > 0 && (
                        <button type="button" onClick={() => setIsCustomSopa(false)} className="text-[10px] text-primary hover:underline">
                          Ver menú
                        </button>
                      )}
                    </div>
                    {(!isCustomSopa && validSopas.length > 0) ? (
                      <Select value={currentSopa} onValueChange={(v) => {
                        if (v === 'custom') {
                          setIsCustomSopa(true);
                          setCurrentSopa('');
                        } else {
                          setCurrentSopa(v);
                        }
                      }}>
                        <SelectTrigger className="bg-background text-cafe">
                          <SelectValue placeholder="Elegir del menú..." />
                        </SelectTrigger>
                        <SelectContent className="bg-white">
                          {validSopas.map((s, idx) => (
                            <SelectItem key={`sopa-${idx}`} value={s}>{s}</SelectItem>
                          ))}
                          <SelectItem value="custom" className="font-bold text-primary">Otra opción...</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input 
                        placeholder="Ej: Crema de Zapallo" 
                        value={currentSopa} 
                        onChange={e => setCurrentSopa(e.target.value)}
                        className="bg-background"
                        maxLength={FIELD_LIMITS.menuOption}
                      />
                    )}
                  </div>
                )}
                {showSegundoField && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-cafe/70">¿Qué segundo desea?</Label>
                      {isCustomSegundo && validSegundos.length > 0 && (
                        <button type="button" onClick={() => setIsCustomSegundo(false)} className="text-[10px] text-primary hover:underline">
                          Ver menú
                        </button>
                      )}
                    </div>
                    {(!isCustomSegundo && validSegundos.length > 0) ? (
                      <Select value={currentSegundo} onValueChange={(v) => {
                        if (v === 'custom') {
                          setIsCustomSegundo(true);
                          setCurrentSegundo('');
                        } else {
                          setCurrentSegundo(v);
                        }
                      }}>
                        <SelectTrigger className="bg-background text-cafe">
                          <SelectValue placeholder="Elegir del menú..." />
                        </SelectTrigger>
                        <SelectContent className="bg-white">
                          {validSegundos.map((s, idx) => (
                            <SelectItem key={`seg-${idx}`} value={s}>{s}</SelectItem>
                          ))}
                          <SelectItem value="custom" className="font-bold text-primary">Otra opción...</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input 
                        placeholder="Ej: Pollo al Horno" 
                        value={currentSegundo} 
                        onChange={e => setCurrentSegundo(e.target.value)}
                        className="bg-background"
                        maxLength={FIELD_LIMITS.menuOption}
                      />
                    )}
                  </div>
                )}
                {showSegundoField && (
                  <div className="space-y-1.5 md:col-span-2 lg:col-span-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-cafe/70">¿Qué guarnición desea?</Label>
                      {isCustomGuarnicion && validGuarniciones.length > 0 && (
                        <button type="button" onClick={() => setIsCustomGuarnicion(false)} className="text-[10px] text-primary hover:underline">
                          Ver menú
                        </button>
                      )}
                    </div>
                    {(!isCustomGuarnicion && validGuarniciones.length > 0) ? (
                      <Select value={currentGuarnicion} onValueChange={(v) => {
                        if (v === 'custom') {
                          setIsCustomGuarnicion(true);
                          setCurrentGuarnicion('');
                        } else {
                          setCurrentGuarnicion(v);
                        }
                      }}>
                        <SelectTrigger className="bg-background text-cafe">
                          <SelectValue placeholder="Elegir del menú..." />
                        </SelectTrigger>
                        <SelectContent className="bg-white">
                          {validGuarniciones.map((s, idx) => (
                            <SelectItem key={`guarn-${idx}`} value={s}>{s}</SelectItem>
                          ))}
                          <SelectItem value="custom" className="font-bold text-primary">Otra opción...</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input 
                        placeholder="Ej: Porción de Arroz" 
                        value={currentGuarnicion} 
                        onChange={e => setCurrentGuarnicion(e.target.value)}
                        className="bg-background"
                        maxLength={FIELD_LIMITS.menuOption}
                      />
                    )}
                  </div>
                )}
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
                      {(item.sopa || item.segundo) && (
                        <div className="mt-1 flex flex-wrap gap-2">
                          {item.sopa && <span className="text-xs font-medium bg-accent/60 px-2.5 py-0.5 rounded-full text-foreground border">Sopa: {item.sopa}</span>}
                          {item.segundo && <span className="text-xs font-medium bg-accent/60 px-2.5 py-0.5 rounded-full text-foreground border">Segundo: {item.segundo}</span>}
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
