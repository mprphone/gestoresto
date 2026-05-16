
import React, { useState, useEffect } from 'react';
import { CheckCircle, Clock, RefreshCcw, FileText, AlertTriangle, Check, X, ChevronUp, Save } from 'lucide-react';
import { PendingInvoice, ReviewInvoiceLine, listPendingInvoices, listReviewInvoiceLines, markReviewed, markUnreviewed, updateReviewExpenseCategory, updateReviewInvoiceLine } from '../data/reviewRepository';
import { listProductsPage } from '../data/productsRepository';
import { apiGet } from '../data/apiClient';
import { AppUser, Product } from '../types';
import AuthenticatedArchivePreview from './AuthenticatedArchivePreview';

interface InvoiceReviewProps {
  currentUser: AppUser;
  restaurantId?: string;
  onReviewed?: () => void;
}

const InvoiceReview: React.FC<InvoiceReviewProps> = ({ currentUser, restaurantId, onReviewed }) => {
  const [invoices, setInvoices] = useState<PendingInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [marking, setMarking] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expenseCategories, setExpenseCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [reviewLines, setReviewLines] = useState<Record<string, ReviewInvoiceLine[]>>({});
  const [loadingLines, setLoadingLines] = useState<Record<string, boolean>>({});

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      setInvoices(await listPendingInvoices());
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar faturas');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setExpandedId(null);
    load();
  }, [restaurantId]);

  useEffect(() => {
    apiGet<{ data: Array<{ id: string; name: string }> }>('/api/expense-categories')
      .then(result => setExpenseCategories(result.data))
      .catch(() => setExpenseCategories([]));
    listProductsPage({ pageSize: 500 })
      .then(result => setProducts(result.data))
      .catch(() => setProducts([]));
  }, []);

  const openInvoice = async (invoice: PendingInvoice) => {
    const nextId = expandedId === invoice.id ? null : invoice.id;
    setExpandedId(nextId);
    if (!nextId || invoice.line_count === 0 || reviewLines[invoice.id]) return;
    setLoadingLines(prev => ({ ...prev, [invoice.id]: true }));
    try {
      const lines = await listReviewInvoiceLines(invoice.id);
      setReviewLines(prev => ({ ...prev, [invoice.id]: lines }));
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar linhas da fatura.');
    } finally {
      setLoadingLines(prev => ({ ...prev, [invoice.id]: false }));
    }
  };

  const updateLineDraft = (invoiceId: string, lineId: string, patch: Partial<ReviewInvoiceLine>) => {
    setReviewLines(prev => ({
      ...prev,
      [invoiceId]: (prev[invoiceId] || []).map(line => {
        if (line.id !== lineId) return line;
        const next = { ...line, ...patch };
        if (patch.product_id) {
          const product = products.find(p => p.id === patch.product_id);
          if (product) {
            next.product_name = product.name;
            next.unit_stock = product.unit;
          }
        }
        if (patch.quantity_original !== undefined || patch.unit_price !== undefined) {
          next.total_price = Number(next.quantity_original || 0) * Number(next.unit_price || 0);
        }
        return next;
      })
    }));
  };

  const handleSaveLine = async (invoiceId: string, line: ReviewInvoiceLine) => {
    setMarking(prev => ({ ...prev, [line.id]: true }));
    setError(null);
    try {
      await updateReviewInvoiceLine(invoiceId, line.id, {
        productId: line.product_id || '',
        originalName: line.original_name,
        quantityOriginal: line.quantity_original,
        unitOriginal: line.unit_original,
        conversionFactor: line.conversion_factor,
        quantityStock: line.quantity_stock,
        unitStock: line.unit_stock,
        unitPrice: line.unit_price,
        totalPrice: line.total_price,
        notes: line.notes
      });
      const lines = await listReviewInvoiceLines(invoiceId);
      setReviewLines(prev => ({ ...prev, [invoiceId]: lines }));
    } catch (e: any) {
      setError(e.message || 'Erro ao guardar linha.');
    } finally {
      setMarking(prev => ({ ...prev, [line.id]: false }));
    }
  };

  const handleMark = async (invoice: PendingInvoice) => {
    if (!invoice.reviewed_at && invoice.line_count === 0 && !invoice.expense_category) {
      setError('Classifique o tipo de despesa antes de marcar como revista.');
      setExpandedId(invoice.id);
      return;
    }
    setMarking(prev => ({ ...prev, [invoice.id]: true }));
    try {
      if (invoice.reviewed_at) {
        await markUnreviewed(invoice.id);
      } else {
        await markReviewed(invoice.id, currentUser.id);
      }
      if (!invoice.reviewed_at) onReviewed?.();
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setMarking(prev => ({ ...prev, [invoice.id]: false }));
    }
  };

  const handleExpenseCategory = async (invoice: PendingInvoice, expenseCategory: string) => {
    setMarking(prev => ({ ...prev, [invoice.id]: true }));
    try {
      await updateReviewExpenseCategory(invoice.id, expenseCategory || undefined);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setMarking(prev => ({ ...prev, [invoice.id]: false }));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <RefreshCcw className="animate-spin text-orange-500" size={40} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-32">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black uppercase italic tracking-tight">Faturas por Rever</h2>
          <p className="text-sm text-slate-400 font-bold mt-1">
            {invoices.length === 0 ? 'Tudo revisto ✓' : `${invoices.length} fatura${invoices.length !== 1 ? 's' : ''} aguarda${invoices.length === 1 ? '' : 'm'} revisão`}
          </p>
        </div>
        <button onClick={load} className="p-3 bg-white border border-slate-200 rounded-2xl hover:border-orange-300 transition-all">
          <RefreshCcw size={18} className="text-slate-400" />
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-red-600 text-sm font-bold">{error}</div>
      )}

      {invoices.length === 0 && !error && (
        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-16 text-center">
          <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="text-emerald-500" size={40} />
          </div>
          <h3 className="text-xl font-black uppercase text-slate-800 mb-2">Tudo revisto!</h3>
          <p className="text-slate-400 font-bold text-sm">Não há faturas pendentes de revisão.</p>
        </div>
      )}

      <div className="space-y-3">
        {invoices.map(inv => {
          const isMarking = marking[inv.id];
          const validationOk = !inv.total_validation_status || inv.total_validation_status === 'VALIDO';

          const isExpanded = expandedId === inv.id;
          const archiveUrl = inv.archive_id ? true : undefined;
          const isPdf = inv.archive_mime_type === 'application/pdf';
          const isCreditNote = (() => {
            if (inv.document_type === 'NC') return true;
            const dn = (inv.doc_number || '').toUpperCase().trim();
            if (dn.startsWith('NC') || dn.startsWith('N/C')) return true;
            const qr = inv.qr_code_text || '';
            const m = qr.match(/\*?D:([^*]+)/);
            return m ? m[1].trim().toUpperCase() === 'NC' : false;
          })();

          return (
            <div
              key={inv.id}
              className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden"
            >
              <div className="p-5 flex items-start gap-4">
                {/* Status icon — click to toggle preview */}
                <div className="flex-shrink-0 pt-1">
                  <button
                    onClick={() => openInvoice(inv)}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${validationOk ? 'bg-slate-100 hover:bg-slate-200' : 'bg-orange-50 hover:bg-orange-100'}`}
                    title="Ver documento"
                  >
                    {isExpanded
                      ? <ChevronUp size={16} className="text-slate-500" />
                      : validationOk
                        ? <FileText size={18} className="text-slate-500" />
                        : <AlertTriangle size={18} className="text-orange-500" />}
                  </button>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openInvoice(inv)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-black text-slate-900 truncate">{inv.supplier_name || 'Fornecedor'}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">
                        {inv.doc_number || 'S/N'} · {new Date(inv.created_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {isCreditNote && (
                        <p className="text-[9px] font-black uppercase text-red-500 tracking-wide mb-0.5">Nota de Crédito</p>
                      )}
                      <p className={`font-black text-lg ${isCreditNote ? 'text-red-600' : 'text-slate-900'}`}>
                        {isCreditNote ? '−' : ''}€ {Number(inv.total_amount || 0).toFixed(2)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mt-3 flex-wrap">
                    {isCreditNote && (
                      <span className="text-[9px] font-black uppercase px-2 py-1 rounded-lg bg-red-50 text-red-600 border border-red-200">
                        NC - Abate stock
                      </span>
                    )}
                    <span className="text-[9px] font-black uppercase px-2 py-1 rounded-lg bg-slate-50 text-slate-500">
                      {inv.line_count} artigo{inv.line_count !== 1 ? 's' : ''}
                    </span>
                    {inv.line_count === 0 && (
                      <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-lg ${inv.expense_category ? 'bg-purple-50 text-purple-600' : 'bg-orange-50 text-orange-600'}`}>
                        {inv.expense_category || 'Despesa por classificar'}
                      </span>
                    )}
                    {inv.has_qr_code && (
                      <span className="text-[9px] font-black uppercase px-2 py-1 rounded-lg bg-emerald-50 text-emerald-600">
                        QR ✓
                      </span>
                    )}
                    {!validationOk && (
                      <span className="text-[9px] font-black uppercase px-2 py-1 rounded-lg bg-orange-50 text-orange-600">
                        Verificar totais
                      </span>
                    )}
                    {inv.is_missing_pages && (
                      <span className="text-[9px] font-black uppercase px-2 py-1 rounded-lg bg-red-50 text-red-600">
                        Páginas em falta
                      </span>
                    )}
                    {archiveUrl && (
                      <span className="text-[9px] font-black uppercase px-2 py-1 rounded-lg bg-slate-50 text-slate-400">
                        {isPdf ? 'PDF' : 'Foto'} ↗
                      </span>
                    )}
                    {(inv.ai_input_tokens || inv.ai_output_tokens) && (
                      <span className="text-[9px] font-black uppercase px-2 py-1 rounded-lg bg-slate-50 text-slate-500">
                        IA {inv.ai_input_tokens || 0} in · {inv.ai_output_tokens || 0} out
                      </span>
                    )}
                  </div>
                </div>

                {/* Mark as reviewed button */}
                <div className="flex-shrink-0">
                  <button
                    onClick={() => handleMark(inv)}
                    disabled={isMarking || !!inv.is_missing_pages}
                    className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                      inv.is_missing_pages
                        ? 'bg-red-100 cursor-not-allowed'
                        : isMarking
                        ? 'bg-slate-100 cursor-wait'
                        : 'bg-emerald-500 hover:bg-emerald-400 active:scale-95 shadow-lg shadow-emerald-200'
                    }`}
                    title={inv.is_missing_pages ? 'Não pode aprovar: páginas em falta' : 'Marcar como revisto'}
                  >
                    {inv.is_missing_pages
                      ? <X size={20} className="text-red-500" strokeWidth={3} />
                      : isMarking
                      ? <RefreshCcw size={18} className="animate-spin text-slate-400" />
                      : <Check size={20} className="text-white" strokeWidth={3} />}
                  </button>
                </div>
              </div>

              {/* Expandable document preview */}
              {isExpanded && (inv.ai_input_tokens || inv.ai_output_tokens || inv.ai_total_tokens) && (
                <div className="border-t border-slate-100 bg-white p-4">
                  <table className="w-full text-left text-[10px]">
                    <thead className="text-slate-400 uppercase">
                      <tr>
                        <th className="pb-2 font-black">Modelo</th>
                        <th className="pb-2 font-black">Leitura</th>
                        <th className="pb-2 font-black">Escrita</th>
                        <th className="pb-2 font-black">Pensamento</th>
                        <th className="pb-2 font-black">Total</th>
                        <th className="pb-2 font-black">Tentativas</th>
                      </tr>
                    </thead>
                    <tbody className="font-bold text-slate-700">
                      <tr>
                        <td className="py-1">{inv.ai_model || '-'}</td>
                        <td className="py-1">{inv.ai_input_tokens || 0}</td>
                        <td className="py-1">{inv.ai_output_tokens || 0}</td>
                        <td className="py-1">{inv.ai_thinking_tokens || 0}</td>
                        <td className="py-1">{inv.ai_total_tokens || 0}</td>
                        <td className="py-1">{inv.ai_attempts || 1}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
              {isExpanded && inv.line_count > 0 && (
                <div className="border-t border-slate-100 bg-white p-4" onClick={event => event.stopPropagation()}>
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div>
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Linhas de stock movimentadas</p>
                      <p className="text-xs font-bold text-slate-500 mt-1">Altere artigo ou quantidade antes de aprovar.</p>
                    </div>
                    {loadingLines[inv.id] && <RefreshCcw size={16} className="animate-spin text-orange-500" />}
                  </div>
                  <div className="space-y-3">
                    {(reviewLines[inv.id] || []).map(line => {
                      const isSavingLine = marking[line.id];
                      return (
                        <div key={line.id} className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr_0.75fr_0.75fr_auto] gap-2 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                          <div className="space-y-1">
                            <label className="text-[9px] font-black uppercase text-slate-400">Descrição</label>
                            <input
                              value={line.original_name || ''}
                              onChange={event => updateLineDraft(inv.id, line.id, { original_name: event.target.value })}
                              className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-black uppercase text-slate-400">Artigo</label>
                            <select
                              value={line.product_id || ''}
                              onChange={event => updateLineDraft(inv.id, line.id, { product_id: event.target.value })}
                              className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold"
                            >
                              <option value="">Sem artigo</option>
                              {products.map(product => (
                                <option key={product.id} value={product.id}>{product.name}</option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-black uppercase text-slate-400">Qtd stock</label>
                            <input
                              type="number"
                              min="0.001"
                              step="0.001"
                              value={line.quantity_stock}
                              onChange={event => updateLineDraft(inv.id, line.id, { quantity_stock: Number(event.target.value) })}
                              className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-black uppercase text-slate-400">Unidade</label>
                            <input
                              value={line.unit_stock || ''}
                              onChange={event => updateLineDraft(inv.id, line.id, { unit_stock: event.target.value })}
                              className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold"
                            />
                          </div>
                          <div className="flex md:flex-col items-end md:items-stretch gap-2">
                            <p className="text-[9px] font-black uppercase text-slate-400 md:text-right">
                              {line.movement_type || 'Mov.'}<br />
                              <span className="text-slate-700">{Number(line.movement_quantity || line.quantity_stock || 0).toFixed(3)}</span>
                            </p>
                            <button
                              onClick={() => handleSaveLine(inv.id, line)}
                              disabled={isSavingLine || !line.product_id}
                              className={`px-3 py-2 rounded-xl text-xs font-black uppercase flex items-center justify-center gap-2 ${
                                isSavingLine || !line.product_id
                                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                  : 'bg-slate-900 text-white hover:bg-orange-500'
                              }`}
                            >
                              {isSavingLine ? <RefreshCcw size={14} className="animate-spin" /> : <Save size={14} />}
                              Guardar
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {!loadingLines[inv.id] && (reviewLines[inv.id] || []).length === 0 && (
                      <p className="text-xs font-bold text-slate-400 p-3">Sem linhas de stock nesta fatura.</p>
                    )}
                  </div>
                </div>
              )}
              {isExpanded && inv.line_count === 0 && (
                <div className="border-t border-slate-100 bg-white p-4">
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-2">Tipo de despesa</label>
                  <select
                    value={inv.expense_category || ''}
                    onChange={event => handleExpenseCategory(inv, event.target.value)}
                    disabled={isMarking}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold"
                  >
                    <option value="">Por classificar</option>
                    {expenseCategories.map(category => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {isExpanded && archiveUrl && (
                <div className="border-t border-slate-100 bg-slate-50" style={{ height: '70vh' }}>
                  <AuthenticatedArchivePreview
                    archiveDocumentId={inv.archive_id}
                    mimeType={inv.archive_mime_type}
                    className={`w-full h-full ${isPdf ? '' : 'object-contain p-4'}`}
                    title={`Fatura ${inv.doc_number}`}
                    alt={`Fatura ${inv.doc_number}`}
                  />
                </div>
              )}
              {isExpanded && !archiveUrl && (
                <div className="border-t border-slate-100 bg-slate-50 p-8 text-center text-slate-400 text-sm font-bold">
                  Sem documento arquivado para esta fatura.
                </div>
              )}
            </div>
          );
        })}
      </div>

      {invoices.length > 0 && (
        <div className="text-center pt-2">
          <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest flex items-center justify-center gap-2">
            <Clock size={12} /> Toca no ✓ verde para marcar como revisto
          </p>
        </div>
      )}
    </div>
  );
};

export default InvoiceReview;
