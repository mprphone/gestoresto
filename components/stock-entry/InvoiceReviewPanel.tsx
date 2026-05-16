import React from 'react';
import { Check, PlusCircle, RefreshCcw } from 'lucide-react';
import { InvoiceExtractedData } from '../../geminiService';
import { Category, Product } from '../../types';
import { PortugueseQrData } from './invoiceProcessor';
import { confidenceStyle } from './productMatcher';

interface InvoiceReviewPanelProps {
  extractedData: InvoiceExtractedData;
  matchedItemsCount: number;
  totalItemsCount: number;
  nifMismatch: string | null;
  qrData: PortugueseQrData | null;
  currentDocumentType: string;
  isCreditDocument: boolean;
  supplier: string;
  nif: string;
  docNumber: string;
  isDuplicate: boolean;
  isSubmitting: boolean;
  products: Product[];
  categories: Category[];
  mapping: Record<number, string>;
  matchConfidences: Record<number, number>;
  itemFamilies: Record<number, Category>;
  unitOriginals: Record<number, string>;
  conversionFactors: Record<number, number>;
  autoCreatedProducts: Record<string, Product>;
  setSupplier: React.Dispatch<React.SetStateAction<string>>;
  setNif: React.Dispatch<React.SetStateAction<string>>;
  setDocNumber: React.Dispatch<React.SetStateAction<string>>;
  setMapping: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  setMatchConfidences: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  setItemFamilies: React.Dispatch<React.SetStateAction<Record<number, Category>>>;
  setUnitOriginals: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  setConversionFactors: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  onQuickCreateProduct: (data: any) => Product | Promise<Product>;
  confirmEntry: () => void | Promise<void>;
}

export const InvoiceReviewPanel: React.FC<InvoiceReviewPanelProps> = ({
  extractedData,
  matchedItemsCount,
  totalItemsCount,
  nifMismatch,
  qrData,
  currentDocumentType,
  isCreditDocument,
  supplier,
  nif,
  docNumber,
  isDuplicate,
  isSubmitting,
  products,
  categories,
  mapping,
  matchConfidences,
  itemFamilies,
  unitOriginals,
  conversionFactors,
  autoCreatedProducts,
  setSupplier,
  setNif,
  setDocNumber,
  setMapping,
  setMatchConfidences,
  setItemFamilies,
  setUnitOriginals,
  setConversionFactors,
  onQuickCreateProduct,
  confirmEntry
}) => (
  <div className="animate-in slide-in-from-right-4">
    <div className="bg-white p-4 sm:p-8 rounded-[1.5rem] sm:rounded-[3rem] shadow-sm border border-slate-200 space-y-4 sm:space-y-8">
      <div className="sticky top-0 z-20 -mx-4 -mt-4 sm:mx-0 sm:mt-0 p-4 sm:p-0 bg-white/95 sm:bg-transparent backdrop-blur border-b border-slate-100 sm:border-0">
        <div className="grid grid-cols-3 gap-2">
          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
            <p className="text-[8px] font-black text-slate-400 uppercase">Total</p>
            <p className="text-lg font-black text-slate-900">€ {extractedData.totalInvoiceAmount.toFixed(2)}</p>
          </div>
          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
            <p className="text-[8px] font-black text-slate-400 uppercase">Artigos</p>
            <p className="text-lg font-black text-orange-600">{matchedItemsCount}/{totalItemsCount}</p>
          </div>
          <div className={`p-3 rounded-2xl border ${confidenceStyle(extractedData.digitalCompliance?.confidenceScore)}`}>
            <p className="text-[8px] font-black uppercase">Conf.</p>
            <p className="text-lg font-black">{extractedData.digitalCompliance?.confidenceScore ?? 0}%</p>
          </div>
        </div>
      </div>

      {nifMismatch && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl">
          <span className="text-red-500 text-lg leading-none shrink-0">⚠</span>
          <p className="text-xs font-bold text-red-700">{nifMismatch}</p>
        </div>
      )}

      {qrData && (
        <div className={`p-4 rounded-2xl border ${nifMismatch ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-100 text-emerald-700'}`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest">QR fiscal</p>
              <p className="text-[10px] font-bold opacity-80 mt-1">
                Estes dados vêm diretamente do QR da Autoridade Tributária.
              </p>
            </div>
            <span className={`self-start sm:self-auto px-3 py-1.5 rounded-xl text-[9px] font-black uppercase ${nifMismatch ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
              {nifMismatch ? 'NIF comprador inválido' : 'NIF comprador OK'}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-bold">
            <p>Fornecedor<br /><span className="font-black">{qrData.supplierNif || '-'}</span></p>
            <p>Empresa<br /><span className="font-black">{qrData.customerNif || 'sem NIF'}</span></p>
            <p>Documento<br /><span className="font-black">{qrData.documentNumber || '-'}</span></p>
            <p>Total QR<br /><span className="font-black">{qrData.totalAmount ? `€ ${qrData.totalAmount.toFixed(2)}` : '-'}</span></p>
          </div>
        </div>
      )}

      {currentDocumentType && (
        <div className={`p-4 rounded-2xl border ${isCreditDocument ? 'bg-red-50 border-red-200 text-red-700' : 'bg-slate-50 border-slate-100 text-slate-700'}`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest">Tipo de documento</p>
              <p className="text-[10px] font-bold opacity-80 mt-1">
                {isCreditDocument ? 'Nota de crédito detetada. Ao confirmar, o stock será abatido.' : 'Tipo detetado por QR/OCR/número do documento.'}
              </p>
            </div>
            <span className={`px-3 py-1.5 rounded-xl text-sm font-black ${isCreditDocument ? 'bg-red-100 text-red-700' : 'bg-white text-slate-900 border border-slate-200'}`}>
              {currentDocumentType}
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6">
        <div className="space-y-1"><label className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Fornecedor</label><input type="text" className="w-full px-4 sm:px-5 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs" value={supplier} onChange={(e) => setSupplier(e.target.value)} /></div>
        <div className="space-y-1"><label className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">NIF</label><input type="text" className="w-full px-4 sm:px-5 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs" value={nif} onChange={(e) => setNif(e.target.value)} /></div>
        <div className="space-y-1"><label className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Nº Fatura</label><input type="text" className={`w-full px-4 sm:px-5 py-3 border rounded-xl font-bold text-xs ${isDuplicate ? 'bg-red-50 border-red-500 text-red-600' : 'bg-slate-50 border-slate-200'}`} value={docNumber} onChange={(e) => setDocNumber(e.target.value)} /></div>
      </div>

      <div className={`hidden sm:flex p-4 rounded-2xl border flex-col sm:flex-row sm:items-center justify-between gap-3 ${confidenceStyle(extractedData.digitalCompliance?.confidenceScore)}`}>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest">Confiança da validação</p>
          <p className="text-[10px] font-bold opacity-80 mt-1">
            QR {extractedData.qrTotalAmount ? `€ ${extractedData.qrTotalAmount.toFixed(2)}` : 'não verificado'} · Linhas € {(extractedData.calculatedLinesTotal || 0).toFixed(2)}
          </p>
        </div>
        <p className="text-2xl font-black">{extractedData.digitalCompliance?.confidenceScore ?? 0}%</p>
      </div>

      <div className="space-y-3 sm:space-y-4">
        <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b pb-3 sm:pb-4">Conferência rápida</h5>
        <div className="space-y-3 sm:space-y-6">
          {extractedData.items.map((item, idx) => {
            const isMapped = !!mapping[idx];
            const currentFamily = itemFamilies[idx] || 'Outros';
            const filteredProducts = products.filter(p => p.category === currentFamily);
            const selectedProduct = products.find(p => p.id === mapping[idx]) || autoCreatedProducts[mapping[idx]];
            const factor = conversionFactors[idx] || 1;
            const stockQty = item.quantity * factor;
            const stockActionLabel = isCreditDocument ? 'Abate' : 'Entra';
            return (
              <div key={idx} className={`p-3 sm:p-6 rounded-2xl sm:rounded-[2rem] border transition-all ${isMapped ? 'bg-white border-slate-100 shadow-sm' : 'bg-orange-50 border-orange-100'}`}>
                <div className="flex flex-col md:flex-row gap-3 sm:gap-6">
                  <div className="md:w-1/3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-black text-slate-800 leading-snug">{item.name}</p>
                        <p className="text-[10px] font-bold text-slate-400 mt-1">{item.quantity} {item.unit || 'un'} · € {item.totalPrice.toFixed(2)}</p>
                      </div>
                      <span className={`shrink-0 px-2 py-1 rounded-lg border text-[8px] font-black ${confidenceStyle(matchConfidences[idx])}`}>{matchConfidences[idx] || 0}%</span>
                    </div>
                  </div>
                  <div className="flex-1 space-y-3 sm:space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="space-y-1"><label className="text-[8px] font-black text-slate-400 uppercase">Família</label><select className="w-full px-3 sm:px-4 py-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase outline-none" value={currentFamily} onChange={(e) => { setItemFamilies(prev => ({ ...prev, [idx]: e.target.value as Category })); setMapping(prev => { const n = {...prev}; delete n[idx]; return n; }); }}>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                      <div className="space-y-1 sm:hidden">
                        <label className="text-[8px] font-black text-slate-400 uppercase">{stockActionLabel}</label>
                        <div className={`px-3 py-3 text-white rounded-xl text-[10px] font-black uppercase ${isCreditDocument ? 'bg-red-700' : 'bg-slate-900'}`}>{stockQty.toFixed(3)} {selectedProduct?.unit || 'un'}</div>
                      </div>
                    </div>
                    <div className="space-y-2"><label className="text-[8px] font-black text-slate-400 uppercase">Inventário</label>
                      {isMapped ? (
                        <div className="flex items-center gap-2 px-3 sm:px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-xl"><Check className="text-emerald-500 shrink-0" size={16} /><p className="text-[10px] font-black text-emerald-700 uppercase flex-1 leading-snug">{selectedProduct?.name}</p><button onClick={() => setMapping(prev => { const n = {...prev}; delete n[idx]; return n; })} className="text-[8px] font-black text-emerald-500 uppercase hover:text-red-500">Trocar</button></div>
                      ) : (
                        <div className="flex flex-col sm:flex-row gap-2">
                          <select className="flex-1 px-3 sm:px-4 py-3 bg-white border border-orange-200 rounded-xl text-[10px] font-black uppercase outline-none" onChange={(e) => { setMapping(prev => ({ ...prev, [idx]: e.target.value })); setMatchConfidences(prev => ({ ...prev, [idx]: 100 })); }}><option value="">Selecionar Artigo Existente...</option>{filteredProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                          <button onClick={async () => {
                            const created = await onQuickCreateProduct({ name: item.name, category: currentFamily, unit: unitOriginals[idx] || item.unit || 'un' });
                            setMapping(prev => ({ ...prev, [idx]: created.id }));
                            setMatchConfidences(prev => ({ ...prev, [idx]: 100 }));
                          }} className="px-4 py-3 bg-slate-900 text-white text-[10px] font-black uppercase rounded-xl hover:bg-orange-500 transition-all flex items-center gap-2"><PlusCircle size={14} /> Criar Novo</button>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <div className="space-y-1 hidden sm:block">
                        <label className="text-[8px] font-black text-slate-400 uppercase">Unid. Fatura</label>
                        <input className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase outline-none" value={unitOriginals[idx] || item.unit || 'un'} onChange={(e) => setUnitOriginals(prev => ({ ...prev, [idx]: e.target.value }))} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-slate-400 uppercase">Fator</label>
                        <input type="number" step="0.001" min="0.001" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase outline-none" value={factor} onChange={(e) => setConversionFactors(prev => ({ ...prev, [idx]: Number(e.target.value) || 1 }))} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-slate-400 uppercase">{stockActionLabel} Stock</label>
                        <div className={`px-3 py-2 text-white rounded-xl text-[10px] font-black uppercase ${isCreditDocument ? 'bg-red-700' : 'bg-slate-900'}`}>{stockQty.toFixed(3)} {selectedProduct?.unit || 'un'}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="sticky bottom-0 z-30 -mx-4 -mb-4 sm:mx-0 sm:mb-0 p-4 sm:p-0 bg-white/95 sm:bg-transparent backdrop-blur border-t sm:border-t pt-4 sm:pt-8 flex flex-col md:flex-row justify-between items-center gap-3 sm:gap-6">
        <div className="hidden sm:block"><p className="text-[10px] font-black text-slate-400 uppercase">Total do Documento</p><p className="text-4xl font-black italic text-slate-900">€ {extractedData.totalInvoiceAmount.toFixed(2)}</p></div>
        <button onClick={confirmEntry} className={`w-full md:w-auto px-8 sm:px-12 py-4 sm:py-5 rounded-2xl sm:rounded-[2rem] font-black uppercase text-xs shadow-2xl transition-all ${isDuplicate || isSubmitting || nifMismatch ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : isCreditDocument ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-orange-500 text-white hover:bg-orange-600 sm:bg-slate-900 sm:hover:bg-orange-500'}`} disabled={!!(isDuplicate || isSubmitting || nifMismatch)}>
          {isSubmitting ? 'A guardar automaticamente...' : isCreditDocument ? 'Confirmar Nota de Crédito' : 'Confirmar Entrada'} {isSubmitting ? <RefreshCcw size={18} className="inline ml-2 animate-spin" /> : <Check size={20} className="inline ml-2" />}
        </button>
      </div>
    </div>
  </div>
);
