import React, { useMemo, useState } from 'react';
import { Link2, PlusCircle, Search, RefreshCcw } from 'lucide-react';
import { Product, ProductAlias, Supplier } from '../types';
import { learnProductAlias } from '../data/productAliasesRepository';
import { upsertProductConversion } from '../data/conversionsRepository';

interface Props {
  products: Product[];
  suppliers: Supplier[];
  aliases: ProductAlias[];
  onChanged: () => Promise<void>;
}

const EquivalencesManagement: React.FC<Props> = ({ products, suppliers, aliases, onChanged }) => {
  const [search, setSearch] = useState('');
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || '');
  const [productId, setProductId] = useState(products[0]?.id || '');
  const [supplierItemName, setSupplierItemName] = useState('');
  const [supplierItemCode, setSupplierItemCode] = useState('');
  const [supplierUnit, setSupplierUnit] = useState('un');
  const [conversionFactor, setConversionFactor] = useState(1);
  const [isSaving, setIsSaving] = useState(false);

  const filteredAliases = useMemo(() => {
    const term = search.toLowerCase();
    return aliases.filter(alias => {
      const product = products.find(p => p.id === alias.productId);
      const supplier = suppliers.find(s => s.id === alias.supplierId);
      return !term ||
        alias.supplierItemName.toLowerCase().includes(term) ||
        product?.name.toLowerCase().includes(term) ||
        supplier?.name.toLowerCase().includes(term);
    });
  }, [aliases, products, search, suppliers]);

  const selectedProduct = products.find(p => p.id === productId);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supplierId || !productId || !supplierItemName.trim() || !selectedProduct) return;
    setIsSaving(true);
    try {
      await learnProductAlias({
        id: crypto.randomUUID(),
        supplierId,
        productId,
        supplierItemName: supplierItemName.trim(),
        supplierItemCode: supplierItemCode.trim() || undefined,
        supplierUnit,
        productUnit: selectedProduct.unit,
        conversionFactor,
        confidence: 100,
        lastSeenAt: new Date().toISOString()
      });
      if (supplierUnit !== selectedProduct.unit) {
        await upsertProductConversion({
          id: crypto.randomUUID(),
          productId,
          supplierId,
          fromUnit: supplierUnit,
          toUnit: selectedProduct.unit,
          factor: conversionFactor,
          notes: `Equivalência criada manualmente para ${supplierItemName.trim()}`
        });
      }
      setSupplierItemName('');
      setSupplierItemCode('');
      setConversionFactor(1);
      await onChanged();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
      <section className="xl:col-span-4 bg-white border border-slate-200 rounded-[2rem] p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-orange-50 text-orange-600 rounded-2xl"><Link2 size={22} /></div>
          <div>
            <h3 className="text-lg font-black uppercase text-slate-900">Nova Equivalência</h3>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Fornecedor para Artigo Mestre</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fornecedor</label>
            <select className="w-full mt-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm" value={supplierId} onChange={e => setSupplierId(e.target.value)}>
              <option value="">Selecionar...</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Artigo Mestre</label>
            <select className="w-full mt-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm" value={productId} onChange={e => setProductId(e.target.value)}>
              <option value="">Selecionar...</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Designação na Fatura</label>
            <input className="w-full mt-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm" value={supplierItemName} onChange={e => setSupplierItemName(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Código</label>
              <input className="w-full mt-2 px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs" value={supplierItemCode} onChange={e => setSupplierItemCode(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Unid.</label>
              <input className="w-full mt-2 px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs" value={supplierUnit} onChange={e => setSupplierUnit(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fator</label>
              <input type="number" min="0.001" step="0.001" className="w-full mt-2 px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs" value={conversionFactor} onChange={e => setConversionFactor(Number(e.target.value) || 1)} />
            </div>
          </div>
          <button disabled={isSaving} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-orange-500 transition-all disabled:opacity-50">
            {isSaving ? <RefreshCcw className="inline animate-spin mr-2" size={16} /> : <PlusCircle className="inline mr-2" size={16} />} Guardar Equivalência
          </button>
        </form>
      </section>

      <section className="xl:col-span-8 bg-white border border-slate-200 rounded-[2rem] overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-100 bg-slate-50">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl font-bold text-sm" placeholder="Pesquisar equivalências..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <table className="w-full text-left">
          <thead className="text-[10px] uppercase tracking-widest font-black text-slate-400 border-b border-slate-100">
            <tr>
              <th className="px-5 py-4">Fornecedor</th>
              <th className="px-5 py-4">Designação</th>
              <th className="px-5 py-4">Artigo Mestre</th>
              <th className="px-5 py-4">Conversão</th>
              <th className="px-5 py-4">Visto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filteredAliases.map(alias => {
              const product = products.find(p => p.id === alias.productId);
              const supplier = suppliers.find(s => s.id === alias.supplierId);
              return (
                <tr key={alias.id} className="hover:bg-slate-50">
                  <td className="px-5 py-4 text-xs font-black text-slate-800">{supplier?.name || 'Fornecedor'}</td>
                  <td className="px-5 py-4">
                    <p className="text-xs font-black text-slate-900">{alias.supplierItemName}</p>
                    <p className="text-[9px] font-bold text-slate-400">{alias.supplierItemCode || 'sem código'}</p>
                  </td>
                  <td className="px-5 py-4 text-xs font-bold text-slate-700">{product?.name || 'Artigo removido'}</td>
                  <td className="px-5 py-4 text-xs font-black text-orange-600">1 {alias.supplierUnit || 'un'} = {alias.conversionFactor} {alias.productUnit}</td>
                  <td className="px-5 py-4 text-[10px] font-bold text-slate-400">{alias.lastSeenAt ? new Date(alias.lastSeenAt).toLocaleDateString() : 'manual'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredAliases.length === 0 && (
          <div className="p-16 text-center text-slate-300 font-black uppercase text-xs tracking-widest">Sem equivalências registadas.</div>
        )}
      </section>
    </div>
  );
};

export default EquivalencesManagement;
