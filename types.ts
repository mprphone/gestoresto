
export type Category = string;

export const DefaultCategories = [
  'Carnes',
  'Peixe',
  'Legumes',
  'Vinhos',
  'Outras Bebidas',
  'Laticínios',
  'Outros'
];

export enum MovementType {
  ENTRY = 'ENTRADA',
  EXIT = 'SAÍDA (REPOSIÇÃO)',
  WASTE = 'QUEBRA/DESPERDÍCIO'
}

export enum InvoiceStatus {
  PENDING = 'PENDENTE',
  PAID = 'PAGO',
  PARTIAL = 'PARCIAL'
}

export interface Supplier {
  id: string;
  name: string;
  nif: string;
  email?: string;
  phone?: string;
}

export interface PurchaseInvoice {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierNif: string;
  docNumber: string;
  totalAmount: number;
  date: string;
  status: InvoiceStatus;
  /** URL da foto/scan da fatura (ideal: Supabase Storage) */
  photoUrl?: string;
  /** Total já liquidado (para pagamentos parciais) */
  paidAmount?: number;
  /** Metadados do último pagamento */
  lastPaymentDate?: string;
  lastPaymentMethod?: 'Dinheiro' | 'Banco' | 'MBWay' | 'Cartão' | 'Cheque' | 'Outro';
  lastPaymentAccount?: string;
  /** URL do comprovativo (transferência, recibo, etc.) */
  proofUrl?: string;
}

export interface Payment {
  id: string;
  invoiceId: string;
  supplierId: string;
  amount: number;
  date: string;
  method: NonNullable<PurchaseInvoice['lastPaymentMethod']>;
  account?: string;
  notes?: string;
  proofUrl?: string;
}

export interface Product {
  id: string;
  name: string;
  category: Category;
  unit: string;
  currentStock: number;
  averagePrice: number;
  minStock: number;
  lastUpdated: string;
}

export interface Batch {
  id: string;
  productId: string;
  quantity: number;
  expiryDate: string;
  entryDate: string;
  price: number;
}

export interface Movement {
  id: string;
  productId: string;
  type: MovementType;
  quantity: number;
  price?: number;
  date: string;
  photoUrl?: string;
  notes?: string;
  supplierName?: string;
  supplierId?: string;
}
