
import React, { useState, useRef, useEffect } from 'react';
import { Camera, Upload, Check, Loader2, X, QrCode, FileWarning, PlusCircle, RefreshCcw, Layers, AlertCircle, Copy, Image as ImageIcon, ChevronRight, Edit3 } from 'lucide-react';
import { processInvoiceImage, InvoiceExtractedData } from '../geminiService';
import { Product, Category, Supplier, PurchaseInvoice } from '../types';

interface StockEntryProps {
  products: Product[];
  suppliers: Supplier[];
  invoices: PurchaseInvoice[];
  categories: Category[];
  onComplete: (items: any[], photoUrl?: string, supplierData?: Partial<Supplier>, invoiceData?: any) => void;
  onQuickCreateProduct: (data: any) => Product;
}

const StockEntry: React.FC<StockEntryProps> = ({ products, suppliers, invoices, categories, onComplete, onQuickCreateProduct }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [pages, setPages] = useState<string[]>([]);
  const [extractedData, setExtractedData] = useState<InvoiceExtractedData | null>(null);
  const [mapping, setMapping] = useState<Record<number, string>>({}); 
  const [itemFamilies, setItemFamilies] = useState<Record<number, Category>>({});
  const [supplier, setSupplier] = useState('');
  const [nif, setNif] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [isDuplicate, setIsDuplicate] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (nif && docNumber) {
      const exists = invoices.some(inv => inv.docNumber.toLowerCase() === docNumber.toLowerCase() && inv.supplierNif === nif);
      setIsDuplicate(exists);
    }
  }, [nif, docNumber, invoices]);

  const compressImage = (base64: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200;
        const scale = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
      };
    });
  };

  const processAllPages = async (currentPages: string[]) => {
    setIsProcessing(true);
    const data = await processInvoiceImage(currentPages);
    if (data) {
      setExtractedData(data);
      setSupplier(data.supplierName || '');
      setNif(data.supplierNif || '');
      setDocNumber(data.invoiceNumber || '');
      
      const autoMap: Record<number, string> = {};
      const initialFamilies: Record<number, Category> = {};

      data.items.forEach((item, idx) => {
        let family = 'Outros';
        const catLower = (item.category || '').toLowerCase();
        const existingCat = categories.find(c => catLower.includes(c.toLowerCase()) || c.toLowerCase().includes(catLower));
        if (existingCat) family = existingCat;
        initialFamilies[idx] = family;

        const match = products.find(p => (p.name || '').toLowerCase() === (item.name || '').toLowerCase());
        if (match) {
          autoMap[idx] = match.id;
          initialFamilies[idx] = match.category;
        }
      });
      setMapping(autoMap);
      setItemFamilies(initialFamilies);
    }
    setIsProcessing(false);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsProcessing(true);
    const newPages: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const reader = new FileReader();
      const p = new Promise<string>(r => { reader.onload = () => r(reader.result as string); });
      reader.readAsDataURL(files[i]);
      newPages.push(await compressImage(await p));
    }
    const updated = [...pages, ...newPages];
    setPages(updated);
    await processAllPages(updated);
  };

  const confirmEntry = () => {
    if (extractedData && !isDuplicate) {
      const itemsToSubmit = extractedData.items.map((item, idx) => ({
        ...item,
        productId: mapping[idx],
        officialName: products.find(p => p.id === mapping[idx])?.name || item.name
      }));
      onComplete(itemsToSubmit, `data:image/jpeg;base64,${pages[0]}`, { name: supplier, nif }, { docNumber, totalAmount: extractedData.totalInvoiceAmount });
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20">
      <input type="file" accept="image/*" multiple className="hidden" ref={fileInputRef} onChange={(e) => handleFiles(e.target.files)} />
      <input type="file" accept="image/*" capture="environment" className="hidden" ref={cameraInputRef} onChange={(e) => handleFiles(e.target.files)} />

      {!extractedData && !isProcessing && pages.length === 0 && (
        <div className="bg-white p-12 rounded-[3rem] shadow-sm border border-slate-200 text-center animate-in fade-in zoom-in-95">
          <div className="w-24 h-24 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-8"><PlusCircle className="text-orange-500 w-12 h-12" /></div>
          <h3 className="text-3xl font-black mb-4 uppercase italic tracking-tight">Nova Fatura p/ Stock</h3>
          <p className="text-slate-500 max-w-md mx-auto mb-10 font-medium">Capture o documento para entrada automática no armazém central.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-xl mx-auto">
             <button onClick={() => cameraInputRef.current?.click()} className="bg-slate-900 text-white p-8 rounded-[2.5rem] font-black uppercase flex flex-col items-center gap-4 hover:bg-orange-500 transition-all shadow-2xl active:scale-95"><Camera size={32} /> Usar Câmara</button>
             <button onClick={() => fileInputRef.current?.click()} className="bg-white text-slate-900 p-8 rounded-[2.5rem] font-black uppercase flex flex-col items-center gap-4 border-2 border-slate-100 hover:border-orange-500 transition-all shadow-xl active:scale-95"><Upload size={32} /> Abrir Ficheiro</button>
          </div>
        </div>
      )}

      {(pages.length > 0 || isProcessing) && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-4 space-y-4">
             <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-6"><h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Digitalização</h4><span className="text-xs font-black text-orange-500">{pages.length} docs</span></div>
                <div className="grid grid-cols-2 gap-3 mb-6">
                   {pages.map((p, idx) => (
                     <div key={idx} className="relative group aspect-[3/4] rounded-2xl overflow-hidden border border-slate-200">
                        <img src={`data:image/jpeg;base64,${p}`} className="w-full h-full object-cover" />
                        <button onClick={() => setPages(prev => prev.filter((_, i) => i !== idx))} className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"><X size={14} /></button>
                     </div>
                   ))}
                   <button onClick={() => cameraInputRef.current?.click()} className="aspect-[3/4] rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-300 hover:border-orange-500 transition-all"><PlusCircle size={24} /><span className="text-[8px] font-black uppercase mt-1">Add Pág.</span></button>
                </div>
                {isProcessing && <div className="flex items-center gap-3 p-4 bg-orange-50 rounded-2xl border border-orange-100 animate-pulse"><RefreshCcw className="animate-spin text-orange-500" size={20} /><p className="text-[10px] font-black text-orange-600 uppercase">Lendo Artigos...</p></div>}
             </div>
             {extractedData && isDuplicate && <div className="bg-red-600 text-white p-6 rounded-[2.5rem] shadow-xl animate-bounce flex items-start gap-4"><Copy size={32} /><div><h5 className="font-black uppercase text-sm">Fatura Duplicada!</h5><p className="text-[10px] font-bold opacity-80 mt-1">Este Nº {docNumber} já foi inserido anteriormente.</p></div></div>}
          </div>

          <div className="lg:col-span-8 space-y-6">
             {extractedData ? (
               <div className="animate-in slide-in-from-right-4">
                 <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-200 space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                       <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fornecedor</label><input type="text" className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs" value={supplier} onChange={(e) => setSupplier(e.target.value)} /></div>
                       <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">NIF</label><input type="text" className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs" value={nif} onChange={(e) => setNif(e.target.value)} /></div>
                       <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nº Fatura</label><input type="text" className={`w-full px-5 py-3 border rounded-xl font-bold text-xs ${isDuplicate ? 'bg-red-50 border-red-500 text-red-600' : 'bg-slate-50 border-slate-200'}`} value={docNumber} onChange={(e) => setDocNumber(e.target.value)} /></div>
                    </div>
                    <div className="space-y-4">
                       <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b pb-4">Conferência Separada: Família e Artigo</h5>
                       <div className="space-y-6">
                          {extractedData.items.map((item, idx) => {
                            const isMapped = !!mapping[idx];
                            const currentFamily = itemFamilies[idx] || 'Outros';
                            const filteredProducts = products.filter(p => p.category === currentFamily);
                            return (
                              <div key={idx} className={`p-6 rounded-[2rem] border transition-all ${isMapped ? 'bg-white border-slate-100 shadow-sm' : 'bg-orange-50 border-orange-100'}`}>
                                <div className="flex flex-col md:flex-row gap-6">
                                  <div className="md:w-1/3"><p className="text-[8px] font-black text-slate-400 uppercase mb-1">Na Fatura:</p><p className="text-xs font-black text-slate-800 line-clamp-2">{item.name}</p><div className="mt-2 text-[10px] font-black text-slate-900">€ {item.totalPrice.toFixed(2)}</div></div>
                                  <div className="flex-1 space-y-4">
                                     <div className="space-y-1"><label className="text-[8px] font-black text-slate-400 uppercase">1. Escolher Família</label><select className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase outline-none" value={currentFamily} onChange={(e) => { setItemFamilies(prev => ({ ...prev, [idx]: e.target.value })); setMapping(prev => { const n = {...prev}; delete n[idx]; return n; }); }}>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                                     <div className="space-y-2"><label className="text-[8px] font-black text-slate-400 uppercase">2. Associar ao Inventário</label>
                                        {isMapped ? (
                                          <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-xl"><Check className="text-emerald-500" size={16} /><p className="text-[10px] font-black text-emerald-700 uppercase flex-1">{products.find(p => p.id === mapping[idx])?.name}</p><button onClick={() => setMapping(prev => { const n = {...prev}; delete n[idx]; return n; })} className="text-[8px] font-black text-emerald-400 uppercase hover:text-red-500">Trocar</button></div>
                                        ) : (
                                          <div className="flex flex-col sm:flex-row gap-2">
                                             <select className="flex-1 px-4 py-3 bg-white border border-orange-200 rounded-xl text-[10px] font-black uppercase outline-none" onChange={(e) => setMapping(prev => ({ ...prev, [idx]: e.target.value }))}><option value="">Selecionar Artigo Existente...</option>{filteredProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                                             <button onClick={() => setMapping(prev => ({ ...prev, [idx]: onQuickCreateProduct({ name: item.name, category: currentFamily }).id }))} className="px-4 py-3 bg-slate-900 text-white text-[10px] font-black uppercase rounded-xl hover:bg-orange-500 transition-all flex items-center gap-2"><PlusCircle size={14} /> Criar Novo</button>
                                          </div>
                                        )}
                                     </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                       </div>
                    </div>
                    <div className="pt-8 border-t flex flex-col md:flex-row justify-between items-center gap-6">
                       <div><p className="text-[10px] font-black text-slate-400 uppercase">Total do Documento</p><p className="text-4xl font-black italic text-slate-900">€ {extractedData.totalInvoiceAmount.toFixed(2)}</p></div>
                       <button onClick={confirmEntry} className={`w-full md:w-auto px-12 py-5 rounded-[2rem] font-black uppercase text-xs shadow-2xl transition-all ${isDuplicate || Object.keys(mapping).length < extractedData.items.length ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-slate-900 text-white hover:bg-orange-500'}`} disabled={Object.keys(mapping).length < extractedData.items.length || isDuplicate}>Adicionar ao Stock Central <Check size={20} className="inline ml-2" /></button>
                    </div>
                 </div>
               </div>
             ) : <div className="h-full flex flex-col items-center justify-center text-slate-300 py-32 space-y-6"><RefreshCcw className={`animate-spin ${isProcessing ? 'text-orange-500' : 'opacity-0'}`} size={48} /><p className="font-black text-[10px] uppercase">IA Analisando Documento...</p></div>}
          </div>
        </div>
      )}
    </div>
  );
};

export default StockEntry;
