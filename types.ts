
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
  paymentTermsDays?: number;
  notes?: string;
}

export interface RestaurantProfile {
  id?: string;
  name: string;
  nif: string;
  legalName?: string;
  email?: string;
  phone?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  notificationEmails?: string[];
}

export type AppUserRole = 'admin' | 'funcionario' | 'compras' | 'cozinha' | 'financeiro';

export interface Company {
  id: string;
  name: string;
  nif?: string;
  email?: string;
  phone?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  isActive?: boolean;
  restaurantCount?: number;
}

export interface Restaurant {
  id: string;
  companyId: string;
  companyName?: string;
  name: string;
  nif?: string;
  legalName?: string;
  email?: string;
  phone?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  notificationEmails?: string[];
  isActive?: boolean;
  userRole?: AppUserRole;
}

export interface UserRestaurantAccess {
  id: string;
  userId: string;
  companyId: string;
  restaurantId: string;
  role: AppUserRole;
  isActive?: boolean;
}

export interface AppUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: AppUserRole;
  isActive?: boolean;
}

export interface PurchaseInvoice {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierNif: string;
  customerName?: string;
  customerNif?: string;
  restaurantProfileId?: string;
  restaurantMatchStatus?: 'VALIDO' | 'ALERTA' | 'NAO_VERIFICADO';
  restaurantMatchNotes?: string;
  docNumber: string;
  totalAmount: number;
  date: string;
  dueDate?: string;
  status: InvoiceStatus;
  /** URL local servida pela API para foto/scan da fatura */
  photoUrl?: string;
  primaryArchiveDocumentId?: string;
  digitalCompliance?: InvoiceDigitalCompliance;
  /** Total já liquidado (para pagamentos parciais) */
  paidAmount?: number;
  /** Metadados do último pagamento */
  lastPaymentDate?: string;
  lastPaymentMethod?: 'Dinheiro' | 'Banco' | 'MBWay' | 'Cartão' | 'Cheque' | 'Outro';
  lastPaymentAccount?: string;
  /** URL do comprovativo (transferência, recibo, etc.) */
  proofUrl?: string;
  /** Categoria de despesa (Eletricidade, Água, etc.) — quando definida é uma despesa sem stock */
  expenseCategory?: string;
}

export interface InvoiceDigitalCompliance {
  hasQrCode?: boolean;
  hasAtcud?: boolean;
  atcud?: string;
  isCompliant?: boolean;
  imageQualityOk?: boolean;
  complianceNotes?: string;
  isMissingPages?: boolean;
  qrCodeText?: string;
  qrTotalAmount?: number;
  calculatedLinesTotal?: number;
  totalValidationStatus?: 'VALIDO' | 'ALERTA' | 'NAO_VERIFICADO';
  totalValidationNotes?: string;
  confidenceScore?: number;
  aiModel?: string;
  aiInputTokens?: number;
  aiOutputTokens?: number;
  aiTotalTokens?: number;
  aiThinkingTokens?: number;
  aiAttempts?: number;
}

export interface PurchaseInvoiceLine {
  id: string;
  invoiceId: string;
  lineNumber: number;
  productId: string;
  productAliasId?: string;
  originalName: string;
  supplierItemCode?: string;
  quantityOriginal: number;
  unitOriginal: string;
  conversionFactor: number;
  quantityStock: number;
  unitStock: string;
  unitPrice: number;
  totalPrice: number;
  vatRate?: number;
  expiryDate?: string;
  notes?: string;
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
  archiveDocumentId?: string;
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

export interface UnitConversion {
  id: string;
  fromUnit: string;
  toUnit: string;
  factor: number;
  description?: string;
}

export interface ProductAlias {
  id: string;
  supplierId: string;
  productId: string;
  supplierItemName: string;
  supplierItemCode?: string;
  supplierUnit?: string;
  productUnit: string;
  conversionFactor: number;
  confidence?: number;
  lastSeenAt?: string;
}

export enum ArchiveDocumentType {
  INVOICE = 'FATURA',
  PAYMENT_PROOF = 'COMPROVATIVO',
  GUIDE = 'GUIA',
  OTHER = 'OUTRO'
}

export interface DigitalArchiveDocument {
  id: string;
  documentType: ArchiveDocumentType;
  invoiceId?: string;
  paymentId?: string;
  supplierId?: string;
  originalFilename?: string;
  mimeType?: string;
  byteSize?: number;
  sha256?: string;
  storageProvider: 'bunker';
  storageBucket?: string;
  storagePath: string;
  publicUrl?: string;
  localRoot: string;
  pageCount: number;
  qualityOk?: boolean;
  hasQrCode?: boolean;
  hasAtcud?: boolean;
  atcud?: string;
  notes?: string;
  createdAt: string;
}

export interface StockEntryLineInput {
  productId: string;
  aliasId?: string;
  name: string;
  officialName?: string;
  supplierItemCode?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  category?: string;
  unitOriginal?: string;
  conversionFactor?: number;
  quantityStock?: number;
  unitStock?: string;
  vatRate?: number;
  confidence?: number;
  expiryDate?: string;
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
