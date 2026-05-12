
import React, { useState, useRef } from 'react';
import { Product, MovementType, Category, Movement } from '../types';
import { 
  ShoppingCart, 
  Trash2, 
  Plus, 
  ArrowRightLeft,
  ChevronRight,
  Beef,
  Fish,
  Carrot,
  Wine,
  Coffee,
  Package,
  Layers,
  History,
  Clock,
  Eye,
  Scale,
  Camera,
  X
} from 'lucide-react';

interface StockMovementProps {
  products: Product[];
  movements: Movement[];
  categories: Category[];
  onTransfer: (productId: string, qty: number, type: MovementType, photoUrl?: string) => void;
}

const getCategoryIcon = (cat: string) => {
  const c = cat.toLowerCase();
  if (c.includes('carne')) return <Beef size={20} />;
  if (c.includes('peixe')) return <Fish size={20} />;
  if (c.includes('legume')) return <Carrot size={20} />;
  if (c.includes('vinho')) return <Wine size={20} />;
  if (c.includes('bebi')) return <Coffee size={20} />;
  return <Layers size={20} />;
};

const StockMovement: React.FC<StockMovementProps> = ({ products, movements, categories, onTransfer }) => {
  const [isCreating, setIsCreating] = useState(false);
  const [step, setStep] = useState<'TYPE' | 'CATEGORY' | 'PRODUCT' | 'ENTRY'>('TYPE');
  const [movementType, setMovementType] = useState<MovementType>(MovementType.EXIT);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cart, setCart] = useState<{ productId: string, name: string, qty: number, unit: string, photoUrl?: string }[]>([]);
  const [tempQty, setTempQty] = useState<string>('');
  const [tempPhoto, setTempPhoto] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setTempPhoto(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const addItemToCart = () => {
    if (!selectedProduct || !tempQty) return;
    const qty = parseFloat(tempQty);
    if (movementType !== MovementType.ENTRY && selectedProduct.currentStock < qty) {
      alert("Stock insuficiente!");
      return;
    }
    setCart([...cart, { productId: selectedProduct.id, name: selectedProduct.name, qty, unit: selectedProduct.unit, photoUrl: tempPhoto || undefined }]);
    setTempQty('');
    setTempPhoto(null);
    setSelectedProduct(null);
    setStep('CATEGORY'); 
  };

  const handleFinalize = () => {
    cart.forEach(item => onTransfer(item.productId, item.qty, movementType, item.photoUrl));
    setCart([]);
    setIsCreating(false);
    setStep('TYPE');
  };

  if (!isCreating) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           <div className="bg-slate-900 text-white p-8 rounded-[2.5rem] shadow-2xl flex flex-col justify-center items-center text-center">
                <ArrowRightLeft size={48} className="text-orange-500 mb-6" />
                <h3 className="text-2xl font-black mb-3 italic">Movimentação</h3>
                <p className="text-slate-400 text-sm mb-8 px-4">Saídas para cozinha, bar ou registo de quebras.</p>
                <button 
                  onClick={() => setIsCreating(true)}
                  className="w-full bg-orange-500 text-white py-5 rounded-2xl font-black uppercase tracking-widest shadow-xl active:scale-95"
                >
                  <Plus size={24} className="inline mr-2" /> Nova Saída
                </button>
           </div>
           <div className="md:col-span-2 bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm">
              <h3 className="font-black text-slate-800 uppercase text-xs tracking-widest mb-8 flex items-center gap-2"><History size={16}/> Histórico de Reposições</h3>
              <div className="space-y-4 max-h-[400px] overflow-y-auto no-scrollbar">
                {movements.filter(m => m.type !== MovementType.ENTRY).slice(0, 10).map(m => (
                  <div key={m.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-transparent hover:border-slate-100 transition-all">
                    <div className="flex items-center gap-4">
                       <div className={`p-3 rounded-xl ${m.type === MovementType.EXIT ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'}`}>
                         {m.type === MovementType.EXIT ? <ShoppingCart size={20} /> : <Trash2 size={20} />}
                       </div>
                       <div>
                          <p className="font-black text-slate-800 text-sm">{products.find(p => p.id === m.productId)?.name || 'Artigo'}</p>
                          <p className="text-[10px] font-black uppercase text-slate-400">{new Date(m.date).toLocaleString()} • {m.quantity} unidades</p>
                       </div>
                    </div>
                  </div>
                ))}
              </div>
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-in slide-in-from-bottom-4">
      <div className="lg:col-span-8 bg-white p-8 rounded-[3rem] shadow-sm border border-slate-200 min-h-[500px]">
        <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2 no-scrollbar">
          <button onClick={() => setStep('TYPE')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase ${step === 'TYPE' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400'}`}>Tipo</button>
          <button disabled={step === 'TYPE'} onClick={() => setStep('CATEGORY')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase ${step === 'CATEGORY' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400'}`}>Família</button>
          <button disabled={step !== 'ENTRY'} onClick={() => setStep('PRODUCT')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase ${step === 'PRODUCT' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400'}`}>Artigo</button>
        </div>

        {step === 'TYPE' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <button onClick={() => { setMovementType(MovementType.EXIT); setStep('CATEGORY'); }} className="p-10 bg-slate-50 border-2 border-transparent hover:border-slate-900 rounded-[2.5rem] transition-all text-center">
              <ShoppingCart size={32} className="mx-auto mb-4" />
              <h4 className="font-black text-xl">Reposição Balcão</h4>
              <p className="text-slate-500 text-sm mt-2">Saída para consumo cozinha/bar.</p>
            </button>
            <button onClick={() => { setMovementType(MovementType.WASTE); setStep('CATEGORY'); }} className="p-10 bg-red-50 border-2 border-transparent hover:border-red-500 rounded-[2.5rem] transition-all text-center">
              <Trash2 size={32} className="mx-auto mb-4 text-red-600" />
              <h4 className="font-black text-xl text-red-600">Registo de Quebra</h4>
              <p className="text-red-400 text-sm mt-2">Desperdício ou danos.</p>
            </button>
          </div>
        )}

        {step === 'CATEGORY' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {categories.map(cat => (
              <button key={cat} onClick={() => { setSelectedCategory(cat); setStep('PRODUCT'); }} className="p-6 bg-slate-50 rounded-3xl hover:bg-white hover:shadow-xl transition-all border border-transparent hover:border-slate-100 flex flex-col items-center">
                <div className="p-4 bg-white rounded-2xl mb-4 text-orange-500">{getCategoryIcon(cat)}</div>
                <span className="font-black text-[10px] uppercase tracking-wider">{cat}</span>
              </button>
            ))}
          </div>
        )}

        {step === 'PRODUCT' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {products.filter(p => p.category === selectedCategory).map(p => (
              <button key={p.id} onClick={() => { setSelectedProduct(p); setStep('ENTRY'); }} className="p-5 bg-white border border-slate-200 rounded-2xl flex justify-between items-center hover:border-slate-900 transition-all text-left">
                <div>
                  <p className="font-black text-slate-800">{p.name}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Disponível: {p.currentStock} {p.unit}</p>
                </div>
                <ChevronRight size={18} className="text-slate-300" />
              </button>
            ))}
          </div>
        )}

        {step === 'ENTRY' && selectedProduct && (
          <div className="max-w-md mx-auto text-center space-y-8">
            <h4 className="text-2xl font-black text-slate-800">{selectedProduct.name}</h4>
            <div className="space-y-6">
              <div className="relative">
                <Scale className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={24} />
                <input type="number" className="w-full pl-16 pr-8 py-6 bg-slate-50 border-2 border-slate-100 rounded-[2rem] text-3xl font-black outline-none" placeholder="0.00" value={tempQty} onChange={(e) => setTempQty(e.target.value)} />
              </div>
              <div className="relative border-2 border-dashed border-slate-200 rounded-[2rem] aspect-video flex flex-col items-center justify-center bg-slate-50 cursor-pointer overflow-hidden" onClick={() => fileInputRef.current?.click()}>
                {tempPhoto ? <img src={tempPhoto} className="w-full h-full object-cover" /> : <><Camera size={40} className="text-slate-300 mb-2"/><span className="text-[10px] font-black text-slate-400 uppercase">Foto do Peso</span></>}
                <input type="file" accept="image/*" capture="environment" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
              </div>
              <div className="flex gap-4">
                <button onClick={() => setStep('PRODUCT')} className="flex-1 py-5 font-black text-slate-400 uppercase text-[10px]">Voltar</button>
                <button disabled={!tempQty} onClick={addItemToCart} className="flex-[2] bg-slate-900 text-white py-5 rounded-2xl font-black uppercase text-xs shadow-xl active:scale-95 disabled:opacity-30">Adicionar à Guia</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="lg:col-span-4 sticky top-28">
        <div className="bg-slate-900 text-white p-8 rounded-[3rem] shadow-2xl">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-lg font-black uppercase">Guia Atual</h3>
            <span className="px-3 py-1 bg-orange-500 rounded-lg text-[9px] font-black">{movementType}</span>
          </div>
          <div className="space-y-4 mb-10 max-h-[300px] overflow-y-auto no-scrollbar">
            {cart.map((item, idx) => (
              <div key={idx} className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl">
                <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center overflow-hidden">{item.photoUrl ? <img src={item.photoUrl} className="w-full h-full object-cover" /> : <Package size={16}/>}</div>
                <div className="flex-1 min-w-0"><p className="text-xs font-black truncate">{item.name}</p><p className="text-[10px] text-white/40">{item.qty} {item.unit}</p></div>
                <button onClick={() => setCart(cart.filter((_, i) => i !== idx))}><X size={16} className="text-white/20 hover:text-red-400"/></button>
              </div>
            ))}
          </div>
          <button disabled={cart.length === 0} onClick={handleFinalize} className="w-full bg-white text-slate-900 py-6 rounded-3xl font-black uppercase text-xs shadow-lg hover:bg-orange-500 hover:text-white transition-all disabled:opacity-20 active:scale-95">Finalizar Guia</button>
          <button onClick={() => setIsCreating(false)} className="w-full py-4 text-white/40 text-[10px] font-black uppercase mt-4">Cancelar</button>
        </div>
      </div>
    </div>
  );
};

export default StockMovement;
