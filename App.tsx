
import React, { useState, useEffect } from 'react';
import { ArchiveDocumentType, Category, Product, Movement, MovementType, Batch, Supplier, PurchaseInvoice, InvoiceStatus, DefaultCategories, Payment, ProductAlias, PurchaseInvoiceLine, DigitalArchiveDocument, StockEntryLineInput } from './types';
import { uploadDataUrlToSupabase } from './supabaseStorage';
import Dashboard from './components/Dashboard';
import InventoryList from './components/InventoryList';
import StockEntry from './components/StockEntry';
import StockMovement from './components/StockMovement';
import Reports from './components/Reports';
import AlertsPanel from './components/AlertsPanel';
import ProductCatalog from './components/ProductCatalog';
import SupplierManagement from './components/SupplierManagement';
import PurchasesList from './components/PurchasesList';
import { 
  LayoutDashboard, 
  Package, 
  PlusCircle, 
  ArrowRightLeft, 
  BarChart3, 
  UtensilsCrossed,
  BookOpen,
  Building2,
  Wallet
} from 'lucide-react';

const App: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>(DefaultCategories);
  const [products, setProducts] = useState<Product[]>([
    { id: '1', name: 'Picanha Black Angus', category: 'Carnes', unit: 'kg', currentStock: 15, averagePrice: 22.50, minStock: 20, lastUpdated: new Date().toISOString() },
    { id: '2', name: 'Vinho Tinto Reserva Douro', category: 'Vinhos', unit: 'un', currentStock: 48, averagePrice: 12.00, minStock: 24, lastUpdated: new Date().toISOString() },
    { id: '3', name: 'Tomate Cereja', category: 'Legumes', unit: 'kg', currentStock: 8, averagePrice: 3.20, minStock: 5, lastUpdated: new Date().toISOString() },
  ]);

  const [suppliers, setSuppliers] = useState<Supplier[]>([
    { id: 's1', name: 'Carnes do Talho Lda', nif: '500123456', email: 'vendas@talho.pt', phone: '210000000' }
  ]);

  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [invoiceLines, setInvoiceLines] = useState<PurchaseInvoiceLine[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [productAliases, setProductAliases] = useState<ProductAlias[]>([]);
  const [archiveDocuments, setArchiveDocuments] = useState<DigitalArchiveDocument[]>([]);
  const [activeTab, setActiveTab] = useState<'dash' | 'inv' | 'entry' | 'move' | 'rep' | 'catalog' | 'suppliers' | 'finance'>('dash');

  const handleCreateProduct = (data: any) => {
    const newProduct: Product = { 
      name: data.name || 'Novo Artigo Sem Nome',
      category: data.category || 'Outros',
      unit: data.unit || 'un',
      minStock: data.minStock || 0,
      id: Math.random().toString(36).substr(2, 9), 
      currentStock: 0, 
      averagePrice: 0, 
      lastUpdated: new Date().toISOString() 
    };
    setProducts(prev => [...prev, newProduct]);
    return newProduct;
  };

  const handleUpdateProduct = (id: string, data: Partial<Product>) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...data, lastUpdated: new Date().toISOString() } : p));
  };

  const handleDeleteProduct = (id: string) => {
    if(confirm("Tem a certeza que deseja remover este artigo do catálogo?")) {
      setProducts(prev => prev.filter(p => p.id !== id));
    }
  };

  const handleAddCategory = (name: string) => {
    if (!categories.includes(name)) {
      setCategories(prev => [...prev, name]);
    }
  };

  const handleStockEntry = async (items: StockEntryLineInput[], photoUrl?: string, supplierData?: Partial<Supplier>, invoiceData?: any) => {
    const isDup = invoices.some(inv => inv.docNumber === invoiceData.docNumber && inv.supplierNif === supplierData.nif);
    if (isDup) {
      alert("Aviso: Esta fatura já foi registada anteriormente!");
      return;
    }

    let targetSupplier = suppliers.find(s => s.nif === supplierData?.nif);
    if (!targetSupplier && supplierData?.nif) {
      targetSupplier = {
        id: Math.random().toString(36).substr(2, 9),
        name: supplierData.name || 'Novo Fornecedor',
        nif: supplierData.nif
      };
      setSuppliers(prev => [...prev, targetSupplier!]);
    }

    // Se houver Supabase configurado, tentamos subir a foto para Storage e guardar URL.
    const storedInvoicePhotoUrl = photoUrl ? await uploadDataUrlToSupabase(photoUrl, `invoices/${invoiceData?.docNumber || 'sn'}-${Date.now()}.jpg`) : undefined;

    const invoiceId = Math.random().toString(36).substr(2, 9);
    const archiveDocumentId = photoUrl ? Math.random().toString(36).substr(2, 9) : undefined;
    const newInvoice: PurchaseInvoice = {
      id: invoiceId,
      supplierId: targetSupplier?.id || 'manual',
      supplierName: targetSupplier?.name || supplierData?.name || 'Manual',
      supplierNif: supplierData?.nif || '',
      docNumber: invoiceData?.docNumber || 'S/N',
      totalAmount: invoiceData?.totalAmount || 0,
      date: new Date().toISOString(),
      dueDate: new Date(Date.now() + ((targetSupplier?.paymentTermsDays || 30) * 86400000)).toISOString(),
      status: InvoiceStatus.PENDING,
      photoUrl: storedInvoicePhotoUrl || photoUrl,
      primaryArchiveDocumentId: archiveDocumentId,
      digitalCompliance: invoiceData?.digitalCompliance,
      paidAmount: 0
    };
    setInvoices(prev => [newInvoice, ...prev]);

    if (photoUrl && archiveDocumentId) {
      const archiveDoc: DigitalArchiveDocument = {
        id: archiveDocumentId,
        documentType: ArchiveDocumentType.INVOICE,
        invoiceId,
        supplierId: targetSupplier?.id,
        originalFilename: `${invoiceData?.docNumber || 'sn'}.jpg`,
        mimeType: 'image/jpeg',
        storageProvider: storedInvoicePhotoUrl ? 'supabase' : 'bunker',
        storageBucket: storedInvoicePhotoUrl ? (((import.meta as any).env.VITE_SUPABASE_BUCKET as string | undefined) || 'gestoresto') : undefined,
        storagePath: storedInvoicePhotoUrl ? `invoices/${invoiceData?.docNumber || 'sn'}-${Date.now()}.jpg` : `/mnt/bunker/resto/faturas/${supplierData?.nif || 'sem-nif'}-${invoiceData?.docNumber || 'sn'}.jpg`,
        publicUrl: storedInvoicePhotoUrl || photoUrl,
        localRoot: '/mnt/bunker/resto',
        pageCount: 1,
        qualityOk: invoiceData?.digitalCompliance?.imageQualityOk,
        hasQrCode: invoiceData?.digitalCompliance?.hasQrCode,
        hasAtcud: invoiceData?.digitalCompliance?.hasAtcud,
        atcud: invoiceData?.digitalCompliance?.atcud,
        notes: invoiceData?.digitalCompliance?.complianceNotes,
        createdAt: new Date().toISOString()
      };
      setArchiveDocuments(prev => [archiveDoc, ...prev]);
    }

    const newLines: PurchaseInvoiceLine[] = items.map((item, idx) => {
      const product = products.find(p => p.id === item.productId);
      return {
        id: Math.random().toString(36).substr(2, 9),
        invoiceId,
        lineNumber: idx + 1,
        productId: item.productId,
        productAliasId: item.aliasId,
        originalName: item.name,
        supplierItemCode: item.supplierItemCode,
        quantityOriginal: item.quantity,
        unitOriginal: item.unitOriginal || item.unitStock || product?.unit || 'un',
        conversionFactor: item.conversionFactor || 1,
        quantityStock: item.quantityStock ?? item.quantity,
        unitStock: item.unitStock || product?.unit || 'un',
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        vatRate: item.vatRate,
        expiryDate: item.expiryDate
      };
    });
    setInvoiceLines(prev => [...newLines, ...prev]);

    const learnedAliases = items.reduce<ProductAlias[]>((acc, item) => {
      const product = products.find(p => p.id === item.productId);
      if (!targetSupplier || !product) return acc;
      const exists = productAliases.some(alias =>
        alias.supplierId === targetSupplier!.id &&
        alias.supplierItemName.trim().toLowerCase() === item.name.trim().toLowerCase()
      );
      if (!exists) {
        acc.push({
          id: Math.random().toString(36).substr(2, 9),
          supplierId: targetSupplier.id,
          productId: product.id,
          supplierItemName: item.name,
          supplierItemCode: item.supplierItemCode,
          supplierUnit: item.unitOriginal,
          productUnit: product.unit,
          conversionFactor: item.conversionFactor || 1,
          confidence: 100,
          lastSeenAt: new Date().toISOString()
        });
      }
      return acc;
    }, []);
    if (learnedAliases.length) {
      setProductAliases(prev => [...learnedAliases, ...prev]);
    }

    const newMovements: Movement[] = [];
    setProducts(prevProducts => {
      const updated = [...prevProducts];
      items.forEach(item => {
        const idx = updated.findIndex(p => p.id === item.productId);
        if (idx > -1) {
          const p = updated[idx];
          const quantityStock = item.quantityStock ?? item.quantity;
          const currentTotalValue = p.currentStock * p.averagePrice;
          const newItemsValue = item.quantity * item.unitPrice;
          const totalQty = p.currentStock + quantityStock;
          const newPMP = totalQty > 0 ? (currentTotalValue + newItemsValue) / totalQty : item.unitPrice;
          
          updated[idx] = { 
            ...p, 
            currentStock: totalQty,
            averagePrice: newPMP, 
            lastUpdated: new Date().toISOString() 
          };
          
          newMovements.push({
            id: Math.random().toString(36).substr(2, 9),
            productId: p.id,
            type: MovementType.ENTRY,
            quantity: quantityStock,
            price: item.unitPrice,
            date: new Date().toISOString(),
            notes: `Entrada via Fatura ${invoiceData?.docNumber || ''}`,
            supplierName: targetSupplier?.name || supplierData?.name || 'Fornecedor Desconhecido',
            supplierId: targetSupplier?.id
          });
        }
      });
      return updated;
    });

    setMovements(prev => [...newMovements, ...prev]);
    setActiveTab('inv');
  };

  const handleStockMovement = (productId: string, qty: number, type: MovementType, photoUrl?: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    if (type !== MovementType.ENTRY && product.currentStock < qty) {
      alert(`Erro: Stock insuficiente de ${product.name}!`);
      return;
    }

    setProducts(prev => prev.map(p => {
      if (p.id === productId) {
        const factor = type === MovementType.ENTRY ? 1 : -1;
        return { 
          ...p, 
          currentStock: Math.max(0, p.currentStock + (qty * factor)), 
          lastUpdated: new Date().toISOString() 
        };
      }
      return p;
    }));

    setMovements(prev => [{
      id: Math.random().toString(36).substr(2, 9),
      productId,
      type,
      quantity: qty,
      price: product.averagePrice,
      date: new Date().toISOString(),
      photoUrl
    }, ...prev]);
  };

  const handleMarkAsPaid = async (
    ids: string[],
    paymentDetails: { date: string; method: Payment['method']; account?: string; amount?: number; notes?: string; proofDataUrl?: string }
  ) => {
    // Distribuição simples: se amount não for fornecido, assume pagamento total de cada fatura.
    // Se for fornecido e houver múltiplas faturas, aplica ao total por ordem (FIFO) até esgotar.
    let remaining = typeof paymentDetails.amount === 'number' ? paymentDetails.amount : undefined;
    const createdPayments: Payment[] = [];

    // Upload opcional do comprovativo
    const proofUrl = paymentDetails.proofDataUrl
      ? await uploadDataUrlToSupabase(paymentDetails.proofDataUrl, `payments/proof-${Date.now()}.jpg`)
      : undefined;

    setInvoices(prev => prev.map(inv => {
      if (!ids.includes(inv.id)) return inv;
      if (inv.status === InvoiceStatus.PAID) return inv;

      const alreadyPaid = inv.paidAmount || 0;
      const due = Math.max(0, inv.totalAmount - alreadyPaid);
      const payThis = remaining === undefined ? due : Math.min(due, Math.max(0, remaining));
      if (remaining !== undefined) remaining = Math.max(0, remaining - payThis);

      const newPaid = alreadyPaid + payThis;
      const newStatus = newPaid >= inv.totalAmount ? InvoiceStatus.PAID : (newPaid > 0 ? InvoiceStatus.PARTIAL : InvoiceStatus.PENDING);

      if (payThis > 0) {
        createdPayments.push({
          id: Math.random().toString(36).substr(2, 9),
          invoiceId: inv.id,
          supplierId: inv.supplierId,
          amount: payThis,
          date: new Date(paymentDetails.date).toISOString(),
          method: paymentDetails.method,
          account: paymentDetails.account,
          notes: paymentDetails.notes,
          proofUrl
        });
      }

      return {
        ...inv,
        paidAmount: newPaid,
        status: newStatus,
        lastPaymentDate: new Date(paymentDetails.date).toISOString(),
        lastPaymentMethod: paymentDetails.method,
        lastPaymentAccount: paymentDetails.account,
        proofUrl: proofUrl || inv.proofUrl
      };
    }));

    if (createdPayments.length) {
      setPayments(prev => [...createdPayments, ...prev]);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      <aside className="hidden md:flex w-72 bg-slate-900 text-white flex-col sticky top-0 h-screen overflow-y-auto no-scrollbar">
        <div className="p-8 flex items-center gap-3">
          <UtensilsCrossed className="text-orange-500 w-8 h-8" />
          <h1 className="font-black text-2xl tracking-tighter uppercase italic">GestoRestô</h1>
        </div>
        <nav className="flex-1 px-6 space-y-1">
          <NavItem icon={<LayoutDashboard />} label="Dashboard" active={activeTab === 'dash'} onClick={() => setActiveTab('dash')} />
          <NavItem icon={<Package />} label="Stock Central" active={activeTab === 'inv'} onClick={() => setActiveTab('inv')} />
          <NavItem icon={<ArrowRightLeft />} label="Saída / Quebra" active={activeTab === 'move'} onClick={() => setActiveTab('move')} />
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-8 mb-2 px-5 text-center">Gestão IA</p>
          <NavItem icon={<PlusCircle />} label="Nova Fatura" active={activeTab === 'entry'} onClick={() => setActiveTab('entry')} />
          <NavItem icon={<Wallet />} label="Pagamentos" active={activeTab === 'finance'} onClick={() => setActiveTab('finance')} />
          <NavItem icon={<Building2 />} label="Fornecedores" active={activeTab === 'suppliers'} onClick={() => setActiveTab('suppliers')} />
          <NavItem icon={<BookOpen />} label="Catálogo" active={activeTab === 'catalog'} onClick={() => setActiveTab('catalog')} />
          <NavItem icon={<BarChart3 />} label="Análises" active={activeTab === 'rep'} onClick={() => setActiveTab('rep')} />
        </nav>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 p-6 flex justify-between items-center sticky top-0 z-50">
          <h2 className="text-2xl font-black text-slate-800 tracking-tight uppercase">
            {activeTab === 'entry' ? "Entrada IA no Stock" : activeTab.toUpperCase()}
          </h2>
          <AlertsPanel products={products} batches={[]} />
        </header>

        <div className="p-6 md:p-10 flex-1 pb-32">
          {activeTab === 'dash' && <Dashboard products={products} movements={movements} />}
          {activeTab === 'inv' && <InventoryList products={products} movements={movements} categories={categories} />}
          {activeTab === 'move' && <StockMovement products={products} movements={movements} onTransfer={handleStockMovement} categories={categories} />}
          {activeTab === 'entry' && <StockEntry products={products} suppliers={suppliers} invoices={invoices} productAliases={productAliases} onComplete={handleStockEntry} onQuickCreateProduct={handleCreateProduct} categories={categories} />}
          {activeTab === 'suppliers' && <SupplierManagement suppliers={suppliers} />}
          {activeTab === 'finance' && <PurchasesList invoices={invoices} invoiceLines={invoiceLines} products={products} archiveDocuments={archiveDocuments} payments={payments} onMarkAsPaid={handleMarkAsPaid} />}
          {activeTab === 'catalog' && (
            <ProductCatalog 
              products={products} 
              onAddProduct={handleCreateProduct} 
              onUpdateProduct={handleUpdateProduct}
              onDeleteProduct={handleDeleteProduct}
              categories={categories}
              onAddCategory={handleAddCategory}
            />
          )}
          {activeTab === 'rep' && <Reports products={products} movements={movements} />}
        </div>
      </main>
    </div>
  );
};

const NavItem = ({ icon, label, active, onClick }: any) => (
  <button onClick={onClick} className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all font-bold text-sm ${active ? 'bg-orange-500 text-white shadow-xl' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
    {React.cloneElement(icon as React.ReactElement, { size: 22 })}
    <span>{label}</span>
  </button>
);

export default App;
