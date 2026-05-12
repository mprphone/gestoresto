
import React, { useState, useMemo } from 'react';
import { Product, Category, Movement, MovementType } from '../types';
import { 
  Search, 
  Package, 
  Wine, 
  Beef, 
  Fish, 
  Carrot, 
  Coffee, 
  Layers, 
  ArrowUpRight, 
  ArrowDownRight, 
  Trash2, 
  History,
  X,
  ChevronRight,
  TrendingUp,
  Building2,
  Euro
} from 'lucide-react';

interface InventoryListProps {
  products: Product[];
  movements: Movement[];
  categories: Category[];
}

const getCategoryIcon = (cat: string) => {
  const c = cat.toLowerCase();
  if (c.includes('carne')) return <Beef size={20} />;
  if (c.includes('peixe')) return <Fish size={20} />;
  if (c.includes('legume') || c.includes('vegetal')) return <Carrot size={20} />;
  if (c.includes('vinho')) return <Wine size={20} />;
  if (c.includes('bebi')) return <Coffee size={20} />;
  if (c.includes('latic')) return <Package size={20} />;
  return <Layers size={20} />;
};

const getCategoryColor = (cat: string) => {
  const c = cat.toLowerCase();
  if (c.includes('carne')) return 'bg-red-50 text-red-600 border-red-100';
  if (c.includes('peixe')) return 'bg-blue-50 text-blue-600 border-blue-100';
  if (c.includes('legume')) return 'bg-green-50 text-green-600 border-green-100';
  if (c.includes('vinho')) return 'bg-purple-50 text-purple-600 border-purple-100';
  if (c.includes('bebi')) return 'bg-amber-50 text-amber-600 border-amber-100';
  return 'bg-slate-50 text-slate-600 border-slate-100';
};

const InventoryList: React.FC<InventoryListProps> = ({ products, movements, categories }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | 'All'>('All');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const selectedProduct = products.find(p => p.id === selectedProductId);
  
  const allProductMovements = movements
    .filter(m => m.productId === selectedProductId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const purchaseHistory = allProductMovements
    .filter(m => m.type === MovementType.ENTRY)
    .slice(0, 10);

  const categoriesWithProducts = useMemo(() => {
    const filtered = products.filter(p => 
      (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) &&
      (activeCategory === 'All' || p.category === activeCategory)
    );

    const groups: Record<string, Product[]> = {};
    filtered.forEach(p => {
      const cat = p.category || 'Outros';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
    });
    return Object.entries(groups);
  }, [products, searchTerm, activeCategory]);

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start relative">
      <div className={`flex-1 space-y-6 transition-all duration-500 ${selectedProductId ? 'lg:w-[60%]' : 'w-full'}`}>
        <div className="flex overflow-x-auto pb-2 gap-4 no-scrollbar">
          <button 
            onClick={() => setActiveCategory('All')}
            className={`flex-shrink-0 px-6 py-4 rounded-2xl border transition-all ${activeCategory === 'All' ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-600 border-slate-200'}`}
          >
            <div className="flex items-center gap-3">
              <Layers size={20} />
              <div className="text-left">
                <p className="text-[10px] font-black uppercase opacity-50">Geral</p>
                <p className="font-bold text-sm">{products.length} Itens</p>
              </div>
            </div>
          </button>

          {categories.map(cat => (
            <button 
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex-shrink-0 px-6 py-4 rounded-2xl border transition-all ${activeCategory === cat ? 'bg-orange-500 text-white shadow-lg' : 'bg-white text-slate-600 border-slate-200'}`}
            >
              <div className="flex items-center gap-3">
                {getCategoryIcon(cat)}
                <div className="text-left">
                  <p className="text-[10px] font-black uppercase opacity-50">{cat}</p>
                  <p className="font-bold text-sm">{products.filter(p => p.category === cat).length} Itens</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Pesquisar artigo..."
              className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-medium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-8">
          {categoriesWithProducts.map(([category, items]) => (
            <div key={category} className="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden">
              <div className={`px-6 py-4 border-b flex items-center justify-between ${getCategoryColor(category)}`}>
                <div className="flex items-center gap-3">
                  {getCategoryIcon(category)}
                  <h3 className="font-black uppercase tracking-widest text-[10px]">{category}</h3>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50/50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                      <th className="px-6 py-4">Produto</th>
                      <th className="px-6 py-4">Stock</th>
                      <th className="px-6 py-4">PMP</th>
                      <th className="px-6 py-4 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map(p => (
                      <tr 
                        key={p.id} 
                        onClick={() => setSelectedProductId(selectedProductId === p.id ? null : p.id)}
                        className={`cursor-pointer transition-all ${selectedProductId === p.id ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'}`}
                      >
                        <td className="px-6 py-4">
                          <p className="font-black text-sm">{p.name}</p>
                          <p className={`text-[9px] font-bold uppercase ${selectedProductId === p.id ? 'text-white/40' : 'text-slate-400'}`}>ID: {p.id}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`font-black text-sm ${p.currentStock <= p.minStock && selectedProductId !== p.id ? 'text-red-600' : ''}`}>
                            {p.currentStock} {p.unit}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs font-black">€ {p.averagePrice.toFixed(2)}</td>
                        <td className="px-6 py-4 text-right">
                          <History size={18} className={selectedProductId === p.id ? 'text-orange-500' : 'text-slate-300'} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedProductId && selectedProduct && (
        <div className="lg:w-[40%] w-full animate-in slide-in-from-right-8 sticky top-28 h-[calc(100vh-140px)] overflow-y-auto no-scrollbar pb-10">
           <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl overflow-hidden flex flex-col">
              <div className="p-8 bg-slate-900 text-white flex-shrink-0">
                <div className="flex justify-between items-start mb-6">
                  <div className="p-4 bg-white/10 rounded-2xl">{getCategoryIcon(selectedProduct.category)}</div>
                  <button onClick={() => setSelectedProductId(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                    <X size={20} className="text-white/40" />
                  </button>
                </div>
                <h3 className="text-2xl font-black mb-1">{selectedProduct.name}</h3>
                <p className="text-[10px] font-black uppercase tracking-widest text-white/40">{selectedProduct.category}</p>
              </div>

              <div className="p-8 space-y-8 flex-1">
                <div className="grid grid-cols-2 gap-4">
                   <div className="bg-slate-50 p-5 rounded-[1.5rem] border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-1 tracking-widest">Preço Médio (PMP)</p>
                      <p className="text-xl font-black text-slate-900 italic">€ {selectedProduct.averagePrice.toFixed(2)}</p>
                   </div>
                   <div className="bg-slate-50 p-5 rounded-[1.5rem] border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-1 tracking-widest">Valor em Stock</p>
                      <p className="text-xl font-black text-orange-600 italic">€ {(selectedProduct.currentStock * selectedProduct.averagePrice).toFixed(2)}</p>
                   </div>
                </div>

                <div className="space-y-4">
                   <div className="flex items-center justify-between">
                      <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                         <Building2 size={14} className="text-orange-500" /> Histórico de Fornecedores
                      </h4>
                      <span className="text-[9px] font-bold text-slate-400 uppercase">Últimas 10 Compras</span>
                   </div>
                   
                   <div className="space-y-2">
                      {purchaseHistory.length > 0 ? purchaseHistory.map(m => (
                        <div key={m.id} className="p-4 bg-white border border-slate-100 rounded-2xl hover:border-orange-200 transition-all flex justify-between items-center group">
                           <div className="flex-1 min-w-0">
                              <p className="text-xs font-black text-slate-800 truncate uppercase tracking-tight">
                                 {m.supplierName || 'Fornecedor Manual'}
                              </p>
                              <p className="text-[9px] font-bold text-slate-400 uppercase">
                                 {new Date(m.date).toLocaleDateString()} • {m.notes?.replace('Entrada via ', '') || 'S/ Doc'}
                              </p>
                           </div>
                           <div className="text-right pl-4">
                              <p className="text-sm font-black text-slate-900 italic">€ {(m.price || 0).toFixed(2)}</p>
                              <p className="text-[9px] font-bold text-slate-400 uppercase">Qtd: {m.quantity} {selectedProduct.unit}</p>
                           </div>
                        </div>
                      )) : (
                        <div className="py-10 text-center border-2 border-dashed border-slate-50 rounded-2xl">
                           <Euro size={24} className="mx-auto mb-2 text-slate-200" />
                           <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Sem compras registadas</p>
                        </div>
                      )}
                   </div>
                </div>

                <div className="space-y-4">
                   <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                      <History size={14} className="text-slate-400" /> Atividade Recente
                   </h4>
                   <div className="space-y-2">
                      {allProductMovements.slice(0, 5).map(m => (
                        <div key={m.id} className="p-4 bg-slate-50 rounded-xl flex justify-between items-center">
                           <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-lg ${m.type === MovementType.ENTRY ? 'bg-emerald-100 text-emerald-600' : m.type === MovementType.EXIT ? 'bg-blue-100 text-blue-600' : 'bg-red-100 text-red-600'}`}>
                                 {m.type === MovementType.ENTRY ? <ArrowUpRight size={14}/> : m.type === MovementType.EXIT ? <ArrowDownRight size={14}/> : <Trash2 size={14}/>}
                              </div>
                              <div>
                                 <p className="text-[10px] font-black text-slate-800 uppercase tracking-tight">{m.type}</p>
                                 <p className="text-[9px] font-bold text-slate-400 uppercase">{new Date(m.date).toLocaleDateString()}</p>
                              </div>
                           </div>
                           <p className={`text-xs font-black ${m.type === MovementType.ENTRY ? 'text-emerald-600' : 'text-slate-900'}`}>
                              {m.type === MovementType.ENTRY ? '+' : '-'}{m.quantity} {selectedProduct.unit}
                           </p>
                        </div>
                      ))}
                   </div>
                </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default InventoryList;
