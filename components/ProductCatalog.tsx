
import React, { useState } from 'react';
import { Product, Category } from '../types';
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Package, 
  ChevronRight, 
  Beef, 
  Fish, 
  Carrot, 
  Wine, 
  Coffee, 
  Layers,
  TrendingUp,
  AlertTriangle,
  X,
  PlusCircle,
  FolderPlus
} from 'lucide-react';

interface ProductCatalogProps {
  products: Product[];
  categories: Category[];
  onAddProduct: (product: any) => void;
  onUpdateProduct: (id: string, data: Partial<Product>) => void;
  onDeleteProduct: (id: string) => void;
  onAddCategory: (name: string) => void;
}

const CategoryIcons: Record<string, React.ReactNode> = {
  'Carnes': <Beef size={20} />,
  'Peixe': <Fish size={20} />,
  'Legumes': <Carrot size={20} />,
  'Vinhos': <Wine size={20} />,
  'Outras Bebidas': <Coffee size={20} />,
  'Outros': <Layers size={20} />,
  'Laticínios': <Package size={20} />
};

const CategoryColors: Record<string, string> = {
  'Carnes': 'bg-red-50 text-red-600',
  'Peixe': 'bg-blue-50 text-blue-600',
  'Legumes': 'bg-emerald-50 text-emerald-600',
  'Vinhos': 'bg-purple-50 text-purple-600',
  'Outras Bebidas': 'bg-amber-50 text-amber-600',
  'Laticínios': 'bg-orange-50 text-orange-600',
  'Outros': 'bg-slate-50 text-slate-600'
};

const ProductCatalog: React.FC<ProductCatalogProps> = ({ products, categories, onAddProduct, onUpdateProduct, onDeleteProduct, onAddCategory }) => {
  const [modalType, setModalType] = useState<'NONE' | 'ADD_PRODUCT' | 'EDIT_PRODUCT' | 'ADD_CATEGORY'>('NONE');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | 'All'>('All');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  
  const [newCategoryName, setNewCategoryName] = useState('');
  const [productForm, setProductForm] = useState({
    name: '',
    category: 'Outros',
    unit: 'kg',
    minStock: 0
  });

  const resetForm = () => {
    setProductForm({ name: '', category: 'Outros', unit: 'kg', minStock: 0 });
    setNewCategoryName('');
    setEditingProduct(null);
    setModalType('NONE');
  };

  const handleProductSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (modalType === 'ADD_PRODUCT') {
      onAddProduct(productForm);
    } else if (modalType === 'EDIT_PRODUCT' && editingProduct) {
      onUpdateProduct(editingProduct.id, productForm);
    }
    resetForm();
  };

  const handleCategorySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCategoryName.trim()) {
      onAddCategory(newCategoryName.trim());
      resetForm();
    }
  };

  const startEdit = (p: Product) => {
    setEditingProduct(p);
    setProductForm({
      name: p.name,
      category: p.category,
      unit: p.unit,
      minStock: p.minStock
    });
    setModalType('EDIT_PRODUCT');
  };

  const filtered = products.filter(p => {
    const matchesSearch = (p.name || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = selectedCategory === 'All' || p.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header & Controls */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
        <div className="flex-1 w-full space-y-4">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-orange-500 transition-colors" size={20} />
            <input 
              type="text" 
              placeholder="Pesquisar no catálogo..."
              className="w-full pl-12 pr-6 py-4 bg-white border border-slate-200 rounded-[1.5rem] outline-none shadow-sm focus:ring-4 focus:ring-orange-500/5 focus:border-orange-500 transition-all font-medium text-slate-800"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="flex overflow-x-auto pb-2 gap-2 no-scrollbar">
            <button 
              onClick={() => setSelectedCategory('All')}
              className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${selectedCategory === 'All' ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'}`}
            >
              Todos
            </button>
            {categories.map(cat => (
              <button 
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border flex items-center gap-2 ${selectedCategory === cat ? 'bg-orange-500 text-white border-orange-500 shadow-lg' : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'}`}
              >
                {CategoryIcons[cat] || <Layers size={14} />} {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-4">
          <button 
            onClick={() => setModalType('ADD_CATEGORY')}
            className="bg-white text-slate-900 px-6 py-4 rounded-[1.5rem] font-black uppercase tracking-widest flex items-center gap-3 border-2 border-slate-100 hover:border-orange-500 transition-all active:scale-95 whitespace-nowrap text-xs"
          >
            <FolderPlus size={18} /> Nova Família
          </button>
          <button 
            onClick={() => setModalType('ADD_PRODUCT')}
            className="bg-slate-900 text-white px-8 py-4 rounded-[1.5rem] font-black uppercase tracking-widest flex items-center gap-3 shadow-2xl hover:bg-orange-500 transition-all active:scale-95 whitespace-nowrap text-xs"
          >
            <Plus size={20} /> Novo Artigo
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
        {filtered.map(p => (
          <div key={p.id} className="bg-white rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-xl hover:translate-y-[-4px] transition-all group overflow-hidden flex flex-col">
            <div className="p-6 flex-1">
              <div className="flex justify-between items-start mb-6">
                <div className={`p-3 rounded-2xl ${CategoryColors[p.category] || 'bg-slate-50 text-slate-400'}`}>
                  {CategoryIcons[p.category] || <Package size={24} />}
                </div>
                <span className="text-[9px] font-black text-slate-300 uppercase tracking-tighter">ID: {p.id}</span>
              </div>

              <h3 className="text-xl font-black text-slate-800 mb-2 group-hover:text-orange-600 transition-colors line-clamp-1">{p.name || 'Sem Nome'}</h3>
              
              <div className="flex items-center gap-2 mb-6">
                <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${CategoryColors[p.category] || 'bg-slate-50 text-slate-400'}`}>
                  {p.category}
                </span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Unidade: {p.unit}</span>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-slate-50 pt-6 mt-auto">
                <div className="space-y-1">
                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">PMP Atual</p>
                   <p className="text-lg font-black text-slate-900">€ {(p.averagePrice || 0).toFixed(2)}</p>
                </div>
                <div className="space-y-1">
                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Stock Mín.</p>
                   <p className="text-lg font-black text-orange-600">{(p.minStock || 0)} {p.unit}</p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-2">
              <button 
                onClick={() => startEdit(p)}
                className="flex-1 py-3 bg-white text-slate-600 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all flex items-center justify-center gap-2"
              >
                <Edit2 size={14} /> Editar
              </button>
              <button 
                onClick={() => onDeleteProduct(p.id)}
                className="p-3 bg-white text-slate-300 border border-slate-200 rounded-xl hover:text-red-500 hover:border-red-200 transition-all"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal Genérico */}
      {modalType !== 'NONE' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-black italic tracking-tight uppercase">
                  {modalType === 'ADD_PRODUCT' ? 'Novo Artigo' : modalType === 'EDIT_PRODUCT' ? 'Editar Artigo' : 'Nova Família'}
                </h3>
                <p className="text-white/40 text-[10px] font-black uppercase mt-1">
                  {modalType === 'ADD_CATEGORY' ? 'Organize o catálogo por grupos' : 'Configure o artigo no sistema central'}
                </p>
              </div>
              <button onClick={resetForm} className="p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            {modalType === 'ADD_CATEGORY' ? (
              <form onSubmit={handleCategorySubmit} className="p-8 space-y-6">
                 <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome da Nova Família</label>
                    <input 
                      required autoFocus
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-orange-500 font-bold"
                      placeholder="Ex: Sobremesas, Limpeza, etc."
                      value={newCategoryName}
                      onChange={e => setNewCategoryName(e.target.value)}
                    />
                 </div>
                 <div className="flex gap-4 pt-4">
                    <button type="button" onClick={resetForm} className="flex-1 py-5 font-black text-slate-400 uppercase text-[10px]">Cancelar</button>
                    <button type="submit" className="flex-[2] bg-slate-900 text-white rounded-2xl py-5 font-black uppercase text-xs shadow-2xl hover:bg-orange-500 transition-all">Criar Família</button>
                 </div>
              </form>
            ) : (
              <form onSubmit={handleProductSubmit} className="p-8 space-y-6">
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome do Artigo</label>
                  <input 
                    required type="text" autoFocus
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-orange-500 font-bold transition-all"
                    value={productForm.name}
                    onChange={e => setProductForm({...productForm, name: e.target.value})}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Família</label>
                    <select 
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold cursor-pointer"
                      value={productForm.category}
                      onChange={e => setProductForm({...productForm, category: e.target.value})}
                    >
                      {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Unidade</label>
                    <select 
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold cursor-pointer"
                      value={productForm.unit}
                      onChange={e => setProductForm({...productForm, unit: e.target.value})}
                    >
                      <option value="kg">Quilograma (kg)</option>
                      <option value="un">Unidade (un)</option>
                      <option value="lt">Litro (lt)</option>
                      <option value="cx">Caixa (cx)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">Stock Mínimo</label>
                  <div className="relative">
                     <TrendingUp className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                     <input 
                      type="number" step="0.01"
                      className="w-full pl-16 pr-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold"
                      value={productForm.minStock}
                      onChange={e => setProductForm({...productForm, minStock: parseFloat(e.target.value) || 0})}
                    />
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={resetForm} className="flex-1 py-5 font-black text-slate-400 uppercase text-[10px]">Cancelar</button>
                  <button type="submit" className="flex-[2] bg-slate-900 text-white rounded-2xl py-5 font-black uppercase text-xs shadow-2xl hover:bg-orange-500 transition-all">
                    {modalType === 'ADD_PRODUCT' ? 'Adicionar ao Catálogo' : 'Atualizar Artigo'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductCatalog;
