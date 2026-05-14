
import React, { useState, useEffect } from 'react';
import { CheckCircle, Clock, RefreshCcw, FileText, AlertTriangle, Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import { PendingInvoice, listPendingInvoices, markReviewed, markUnreviewed } from '../data/reviewRepository';
import { apiUrl } from '../data/apiClient';
import { AppUser } from '../types';

interface InvoiceReviewProps {
  currentUser: AppUser;
  onReviewed?: () => void;
}

const InvoiceReview: React.FC<InvoiceReviewProps> = ({ currentUser, onReviewed }) => {
  const [invoices, setInvoices] = useState<PendingInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [marking, setMarking] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  useEffect(() => { load(); }, []);

  const handleMark = async (invoice: PendingInvoice) => {
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
          const archiveUrl = inv.archive_id
            ? apiUrl(`/api/archive/file/${inv.archive_id}`)
            : undefined;
          const isPdf = inv.archive_mime_type === 'application/pdf';
          const isCreditNote = (() => {
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
                    onClick={() => setExpandedId(isExpanded ? null : inv.id)}
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
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : inv.id)}>
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
                        ⚠ NC — Não entra em stock
                      </span>
                    )}
                    <span className="text-[9px] font-black uppercase px-2 py-1 rounded-lg bg-slate-50 text-slate-500">
                      {inv.line_count} artigo{inv.line_count !== 1 ? 's' : ''}
                    </span>
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
                    {archiveUrl && (
                      <span className="text-[9px] font-black uppercase px-2 py-1 rounded-lg bg-slate-50 text-slate-400">
                        {isPdf ? 'PDF' : 'Foto'} ↗
                      </span>
                    )}
                  </div>
                </div>

                {/* Mark as reviewed button */}
                <div className="flex-shrink-0">
                  <button
                    onClick={() => handleMark(inv)}
                    disabled={isMarking}
                    className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                      isMarking
                        ? 'bg-slate-100 cursor-wait'
                        : 'bg-emerald-500 hover:bg-emerald-400 active:scale-95 shadow-lg shadow-emerald-200'
                    }`}
                    title="Marcar como revisto"
                  >
                    {isMarking
                      ? <RefreshCcw size={18} className="animate-spin text-slate-400" />
                      : <Check size={20} className="text-white" strokeWidth={3} />}
                  </button>
                </div>
              </div>

              {/* Expandable document preview */}
              {isExpanded && archiveUrl && (
                <div className="border-t border-slate-100 bg-slate-50" style={{ height: '70vh' }}>
                  {isPdf ? (
                    <iframe
                      src={archiveUrl}
                      className="w-full h-full"
                      title={`Fatura ${inv.doc_number}`}
                    />
                  ) : (
                    <img
                      src={archiveUrl}
                      className="w-full h-full object-contain p-4"
                      alt={`Fatura ${inv.doc_number}`}
                    />
                  )}
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
