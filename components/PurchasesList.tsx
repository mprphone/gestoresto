
import React, { useMemo, useRef, useState } from 'react';
import { DigitalArchiveDocument, Payment, Product, PurchaseInvoice, PurchaseInvoiceLine, InvoiceStatus } from '../types';
import { 
  Calendar, 
  CreditCard, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  FileText, 
  X, 
  Landmark, 
  Banknote,
  CheckSquare,
  Square,
  Layers,
  ArrowRight,
  Eye,
  Image as ImageIcon
} from 'lucide-react';

interface PurchasesListProps {
  invoices: PurchaseInvoice[];
  invoiceLines: PurchaseInvoiceLine[];
  products: Product[];
  archiveDocuments: DigitalArchiveDocument[];
  payments: Payment[];
  onMarkAsPaid: (ids: string[], paymentDetails: { date: string, method: Payment['method'], account?: string, amount?: number, notes?: string, proofDataUrl?: string }) => void;
}

const PurchasesList: React.FC<PurchasesListProps> = ({ invoices, invoiceLines, products, archiveDocuments, payments, onMarkAsPaid }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | InvoiceStatus>('ALL');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detailInvoiceId, setDetailInvoiceId] = useState<string | null>(null);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  
  // Payment Form States
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<Payment['method']>('Banco');
  const [paymentAccount, setPaymentAccount] = useState('BPI');
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [proofDataUrl, setProofDataUrl] = useState<string | undefined>(undefined);
  const proofInputRef = useRef<HTMLInputElement>(null);

  const filtered = invoices.filter(inv => {
    const matchesSearch = inv.supplierName.toLowerCase().includes(searchTerm.toLowerCase()) || inv.docNumber.includes(searchTerm);
    const matchesStatus = statusFilter === 'ALL' || inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const selectedInvoices = invoices.filter(inv => selectedIds.includes(inv.id));
  const detailInvoice = invoices.find(inv => inv.id === detailInvoiceId);
  const detailLines = detailInvoice ? invoiceLines.filter(line => line.invoiceId === detailInvoice.id).sort((a, b) => a.lineNumber - b.lineNumber) : [];
  const detailDocument = detailInvoice ? archiveDocuments.find(doc => doc.id === detailInvoice.primaryArchiveDocumentId || doc.invoiceId === detailInvoice.id) : undefined;
  const totalSelectedAmount = selectedInvoices.reduce((acc, curr) => acc + curr.totalAmount, 0);

  const totalPending = useMemo(() => {
    return invoices
      .filter(i => i.status !== InvoiceStatus.PAID)
      .reduce((acc, curr) => acc + Math.max(0, curr.totalAmount - (curr.paidAmount || 0)), 0);
  }, [invoices]);

  const toggleSelect = (id: string) => {
    const invoice = invoices.find(inv => inv.id === id);
    if (!invoice || invoice.status === InvoiceStatus.PAID) return;

    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleConfirmPayment = () => {
    if (selectedIds.length > 0) {
      onMarkAsPaid(selectedIds, {
        date: paymentDate,
        method: paymentMethod,
        account: paymentMethod === 'Dinheiro' ? 'Caixa' : paymentAccount,
        amount: paymentAmount ? Number(paymentAmount) : undefined,
        notes: paymentNotes || undefined,
        proofDataUrl
      });
      setSelectedIds([]);
      setIsPayModalOpen(false);
      setPaymentAmount('');
      setPaymentNotes('');
      setProofDataUrl(undefined);
    }
  };

  const handleProofFile = async (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    const p = new Promise<string>(r => { reader.onload = () => r(reader.result as string); });
    reader.readAsDataURL(file);
    setProofDataUrl(await p);
  };

  const handleSelectAll = () => {
    const allPendingIds = filtered
      .filter(inv => inv.status !== InvoiceStatus.PAID)
      .map(inv => inv.id);
    
    if (selectedIds.length === allPendingIds.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(allPendingIds);
    }
  };

  return (
    <div className="space-y-6 relative">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 p-6 rounded-[2rem] text-white shadow-xl">
          <p className="text-[10px] font-black uppercase opacity-40 tracking-widest mb-1">Total em Dívida</p>
          <p className="text-3xl font-black italic">€ {totalPending.toFixed(2)}</p>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 col-span-2 flex flex-col md:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Pesquisar por fornecedor ou doc..."
              className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-medium text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-2 p-1.5 bg-slate-100 rounded-2xl">
             <button 
              onClick={() => setStatusFilter('ALL')}
              className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${statusFilter === 'ALL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
             >Tudo</button>
             <button 
              onClick={() => setStatusFilter(InvoiceStatus.PENDING)}
              className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${statusFilter === InvoiceStatus.PENDING ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-500'}`}
             >Pendentes</button>
             <button 
              onClick={() => setStatusFilter(InvoiceStatus.PARTIAL)}
              className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${statusFilter === InvoiceStatus.PARTIAL ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500'}`}
             >Parcial</button>
             <button 
              onClick={() => setStatusFilter(InvoiceStatus.PAID)}
              className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${statusFilter === InvoiceStatus.PAID ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-500'}`}
             >Pagos</button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
           <div className="flex items-center gap-4">
              <button 
                onClick={handleSelectAll}
                className="p-2 text-slate-400 hover:text-slate-900 transition-colors flex items-center gap-2"
              >
                {selectedIds.length > 0 && selectedIds.length === filtered.filter(f => f.status !== InvoiceStatus.PAID).length ? 
                  <CheckSquare size={20} className="text-orange-500" /> : <Square size={20} />
                }
                <span className="text-[10px] font-black uppercase tracking-widest">Selecionar Tudo</span>
              </button>
           </div>
           <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{filtered.length} Faturas Registadas</span>
        </div>

        <table className="w-full text-left">
          <thead className="bg-white border-b border-slate-100">
            <tr className="text-slate-400 text-[10px] font-black uppercase tracking-widest">
              <th className="px-6 py-5 w-10"></th>
              <th className="px-6 py-5">Fornecedor / Doc</th>
              <th className="px-6 py-5">Data Emissão</th>
              <th className="px-6 py-5">Valor</th>
              <th className="px-6 py-5">Estado / Pagamento</th>
              <th className="px-6 py-5 text-right">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.map(inv => {
              const isSelected = selectedIds.includes(inv.id);
              const isPaid = inv.status === InvoiceStatus.PAID;
              return (
                <tr 
                  key={inv.id} 
                  onClick={() => !isPaid && toggleSelect(inv.id)}
                  className={`group transition-colors cursor-pointer ${isSelected ? 'bg-orange-50/50' : 'hover:bg-slate-50/50'}`}
                >
                  <td className="px-6 py-4">
                    {!isPaid && (
                      <div className={`transition-colors ${isSelected ? 'text-orange-500' : 'text-slate-200 group-hover:text-slate-300'}`}>
                        {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-black text-slate-800 text-sm">{inv.supplierName}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">{inv.docNumber}</p>
                  </td>
                  <td className="px-6 py-4">
                     <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                        <Calendar size={14} />
                        {new Date(inv.date).toLocaleDateString()}
                     </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-black text-slate-900">€ {inv.totalAmount.toFixed(2)}</p>
                  </td>
                  <td className="px-6 py-4">
                    {inv.status === InvoiceStatus.PAID ? (
                      <div>
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 text-emerald-600 text-[9px] font-black uppercase mb-1">
                          <CheckCircle2 size={10} /> Pago
                        </span>
                        {inv.lastPaymentDate && (
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">
                            {new Date(inv.lastPaymentDate).toLocaleDateString()} • {inv.lastPaymentAccount || '—'}
                          </p>
                        )}
                      </div>
                    ) : inv.status === InvoiceStatus.PARTIAL ? (
                      <div>
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-900 text-white text-[9px] font-black uppercase mb-1">
                          <AlertCircle size={10} /> Parcial
                        </span>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">
                          € {(inv.paidAmount || 0).toFixed(2)} / € {inv.totalAmount.toFixed(2)}
                        </p>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-orange-50 text-orange-600 text-[9px] font-black uppercase">
                        <AlertCircle size={10} /> Pendente
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); setDetailInvoiceId(inv.id); }}
                      className="p-2.5 bg-white text-slate-500 border border-slate-200 rounded-xl hover:border-orange-500 hover:text-orange-600 transition-all shadow-sm"
                      title="Ver fatura"
                    >
                      <Eye size={16} />
                    </button>
                    {!isPaid ? (
                      <button 
                        onClick={(e) => { e.stopPropagation(); setSelectedIds([inv.id]); setIsPayModalOpen(true); }}
                        className="p-2.5 bg-slate-900 text-white rounded-xl hover:bg-orange-500 transition-all shadow-md group-hover:scale-105"
                      >
                        <CreditCard size={16} />
                      </button>
                    ) : (
                      <button className="p-2 text-slate-200 cursor-default"><CheckCircle2 size={20} /></button>
                    )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-24 text-center text-slate-300">
             <FileText size={64} className="mx-auto mb-6 opacity-10" />
             <p className="text-xs font-black uppercase tracking-widest">Nenhuma fatura encontrada.</p>
          </div>
        )}
      </div>

      {detailInvoice && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-8 bg-slate-900 text-white flex justify-between items-start gap-6">
              <div>
                <h3 className="text-2xl font-black italic tracking-tight uppercase">{detailInvoice.supplierName}</h3>
                <p className="text-xs font-bold text-white/40 uppercase tracking-widest mt-1">{detailInvoice.docNumber} - {new Date(detailInvoice.date).toLocaleDateString()}</p>
              </div>
              <button onClick={() => setDetailInvoiceId(null)} className="p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 overflow-y-auto">
              <div className="lg:col-span-7 p-8 space-y-5">
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total</p>
                    <p className="text-xl font-black text-slate-900">€ {detailInvoice.totalAmount.toFixed(2)}</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Pago</p>
                    <p className="text-xl font-black text-emerald-600">€ {(detailInvoice.paidAmount || 0).toFixed(2)}</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Linhas</p>
                    <p className="text-xl font-black text-orange-600">{detailLines.length}</p>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-3xl overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                      <tr>
                        <th className="px-4 py-4">Linha</th>
                        <th className="px-4 py-4">Artigo</th>
                        <th className="px-4 py-4">Original</th>
                        <th className="px-4 py-4">Stock</th>
                        <th className="px-4 py-4 text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {detailLines.map(line => {
                        const product = products.find(p => p.id === line.productId);
                        return (
                          <tr key={line.id}>
                            <td className="px-4 py-4 text-xs font-black text-slate-400">{line.lineNumber}</td>
                            <td className="px-4 py-4">
                              <p className="text-xs font-black text-slate-900">{product?.name || 'Artigo removido'}</p>
                              <p className="text-[9px] font-bold text-slate-400 uppercase">{product?.category || 'Sem família'}</p>
                            </td>
                            <td className="px-4 py-4">
                              <p className="text-xs font-bold text-slate-700">{line.originalName}</p>
                              <p className="text-[9px] font-bold text-slate-400">{line.quantityOriginal} {line.unitOriginal} x {line.conversionFactor}</p>
                            </td>
                            <td className="px-4 py-4 text-xs font-black text-slate-900">{line.quantityStock.toFixed(3)} {line.unitStock}</td>
                            <td className="px-4 py-4 text-right text-xs font-black text-slate-900">€ {line.totalPrice.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {detailLines.length === 0 && (
                    <div className="p-12 text-center text-slate-300">
                      <FileText size={40} className="mx-auto mb-3 opacity-20" />
                      <p className="text-[10px] font-black uppercase tracking-widest">Sem linhas estruturadas guardadas.</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="lg:col-span-5 bg-slate-50 p-8 border-l border-slate-100">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><ImageIcon size={14} /> Arquivo Digital</h4>
                {detailDocument?.publicUrl || detailInvoice.photoUrl ? (
                  <div className="space-y-4">
                    <div className="aspect-[3/4] rounded-3xl overflow-hidden border border-slate-200 bg-white">
                      <img src={detailDocument?.publicUrl || detailInvoice.photoUrl} className="w-full h-full object-contain" />
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-2">
                      <p className="text-[10px] font-bold text-slate-500"><span className="font-black uppercase text-slate-400">Storage:</span> {detailDocument?.storageProvider || 'local'}</p>
                      <p className="text-[10px] font-bold text-slate-500 break-all"><span className="font-black uppercase text-slate-400">Caminho:</span> {detailDocument?.storagePath || 'sem caminho'}</p>
                    </div>
                  </div>
                ) : (
                  <div className="p-16 text-center bg-white rounded-3xl border border-dashed border-slate-200 text-slate-300">
                    <ImageIcon size={48} className="mx-auto mb-4 opacity-20" />
                    <p className="text-[10px] font-black uppercase tracking-widest">Sem documento arquivado.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FLOATING ACTION BAR FOR MULTIPLE SELECTION */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-10 py-6 rounded-[2.5rem] shadow-2xl flex items-center gap-10 animate-in slide-in-from-bottom-10 duration-500 z-[90]">
           <div className="flex items-center gap-4 border-r border-white/10 pr-10">
              <div className="p-3 bg-orange-500 rounded-2xl">
                 <Layers size={20} />
              </div>
              <div className="text-left">
                 <p className="text-[10px] font-black uppercase opacity-40">Documentos</p>
                 <p className="text-lg font-black">{selectedIds.length} Faturas</p>
              </div>
           </div>
           <div className="text-left flex-1 min-w-[150px]">
              <p className="text-[10px] font-black uppercase opacity-40">Total a Pagar</p>
              <p className="text-2xl font-black italic text-orange-500">€ {totalSelectedAmount.toFixed(2)}</p>
           </div>
           <button 
             onClick={() => setIsPayModalOpen(true)}
             className="bg-white text-slate-900 px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-orange-500 hover:text-white transition-all shadow-lg active:scale-95"
           >
             Liquidar Seleção
           </button>
           <button 
            onClick={() => setSelectedIds([])}
            className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/40 hover:text-white"
           >
             <X size={20} />
           </button>
        </div>
      )}

      {/* Agregated Liquidation Modal */}
      {isPayModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-10 bg-slate-50 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div>
                <h3 className="text-2xl font-black italic tracking-tight uppercase text-slate-900">Liquidação Agrupada</h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Registo de pagamento em conta corrente</p>
              </div>
              <div className="bg-orange-500 px-8 py-5 rounded-[2rem] text-white shadow-xl shadow-orange-500/20 text-center">
                 <p className="text-[10px] font-black uppercase opacity-60">Total Agregado</p>
                 <p className="text-3xl font-black italic">€ {totalSelectedAmount.toFixed(2)}</p>
              </div>
            </div>

            <div className="p-10 grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-6">
                 <div>
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                       <FileText size={14} /> Faturas a Liquidar
                    </h4>
                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 no-scrollbar">
                       {selectedInvoices.map(inv => (
                         <div key={inv.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center group">
                            <div>
                               <p className="text-xs font-black text-slate-800">{inv.supplierName}</p>
                               <p className="text-[9px] font-bold text-slate-400">{inv.docNumber}</p>
                            </div>
                            <p className="text-xs font-black text-slate-900">€ {inv.totalAmount.toFixed(2)}</p>
                         </div>
                       ))}
                    </div>
                 </div>
              </div>

              <div className="space-y-8">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Data da Liquidação</label>
                  <div className="relative">
                    <Calendar className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                    <input 
                      type="date" 
                      className="w-full pl-14 pr-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:ring-4 focus:ring-orange-500/5 transition-all"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Valor (opcional)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Deixe vazio para liquidar 100%..."
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:ring-4 focus:ring-orange-500/5 transition-all"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                  />
                  <p className="text-[10px] text-slate-400 font-bold mt-2">Se indicar um valor e tiver várias faturas selecionadas, o pagamento é aplicado por ordem (FIFO) até esgotar.</p>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Método de Saída</label>
                  <div className="grid grid-cols-2 gap-4">
                    <button 
                      onClick={() => setPaymentMethod('Banco')}
                      className={`flex flex-col items-center gap-2 p-5 rounded-3xl border-2 transition-all font-black text-[10px] uppercase ${
                        paymentMethod === 'Banco' ? 'border-slate-900 bg-slate-900 text-white shadow-xl' : 'border-slate-100 bg-slate-50 text-slate-400'
                      }`}
                    >
                      <Landmark size={24} /> Banco
                    </button>
                    <button 
                      onClick={() => setPaymentMethod('Dinheiro')}
                      className={`flex flex-col items-center gap-2 p-5 rounded-3xl border-2 transition-all font-black text-[10px] uppercase ${
                        paymentMethod === 'Dinheiro' ? 'border-orange-500 bg-orange-50 text-orange-600 shadow-xl shadow-orange-500/10' : 'border-slate-100 bg-slate-50 text-slate-400'
                      }`}
                    >
                      <Banknote size={24} /> Dinheiro
                    </button>
                  </div>
                </div>

                {paymentMethod === 'Banco' && (
                  <div className="animate-in slide-in-from-top-4 duration-500">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Conta de Origem</label>
                    <div className="flex gap-2">
                      {['BPI', 'SANTANDER', 'CGD'].map(bank => (
                        <button 
                          key={bank}
                          onClick={() => setPaymentAccount(bank)}
                          className={`flex-1 py-3 rounded-xl border-2 transition-all font-black text-[9px] uppercase tracking-widest ${
                            paymentAccount === bank ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-100 bg-slate-50 text-slate-400 hover:border-slate-200'
                          }`}
                        >
                          {bank}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Comprovativo (opcional)</label>
                  <input
                    ref={proofInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleProofFile(e.target.files?.[0] || null)}
                  />
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => proofInputRef.current?.click()}
                      className="px-5 py-3 bg-white border border-slate-200 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:border-orange-500 transition-all"
                    >
                      Upload
                    </button>
                    {proofDataUrl ? (
                      <div className="flex items-center gap-3">
                        <img src={proofDataUrl} className="w-12 h-12 rounded-2xl object-cover border border-slate-200" />
                        <button type="button" onClick={() => setProofDataUrl(undefined)} className="text-[10px] font-black uppercase text-red-500">Remover</button>
                      </div>
                    ) : (
                      <p className="text-[10px] font-bold text-slate-400">Ex: screenshot da transferência, recibo, etc.</p>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Notas (opcional)</label>
                  <textarea
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:ring-4 focus:ring-orange-500/5 transition-all min-h-[110px]"
                    placeholder="Referência, observações, nº de transferência..."
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="p-10 bg-slate-50 border-t border-slate-100 flex gap-4">
               <button 
                 onClick={() => setIsPayModalOpen(false)}
                 className="flex-1 py-5 font-black text-slate-400 uppercase tracking-widest text-[10px]"
               >
                 Cancelar
               </button>
               <button 
                onClick={handleConfirmPayment}
                className="flex-[2] bg-slate-900 hover:bg-orange-500 text-white py-5 rounded-3xl font-black uppercase tracking-widest text-xs transition-all shadow-2xl active:scale-95 flex items-center justify-center gap-3"
              >
                Confirmar Pagamento Agrupado <ArrowRight size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchasesList;
