import { InvoiceExtractedData } from '../../geminiService';
import { Category, Product, ProductAlias, Supplier } from '../../types';

export const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const normalizeNif = (value: string) => String(value || '').replace(/\D/g, '');

const textTokens = (value: string) => normalizeText(value).split(' ').filter(token => token.length > 1);

const diceCoefficient = (a: string, b: string) => {
  const left = normalizeText(a).replace(/\s+/g, '');
  const right = normalizeText(b).replace(/\s+/g, '');
  if (!left || !right) return 0;
  if (left === right) return 1;
  const grams = (value: string) => {
    const result: string[] = [];
    for (let i = 0; i < value.length - 1; i++) result.push(value.slice(i, i + 2));
    return result.length > 0 ? result : [value];
  };
  const aGrams = grams(left);
  const bGrams = grams(right);
  const counts = new Map<string, number>();
  aGrams.forEach(gram => counts.set(gram, (counts.get(gram) || 0) + 1));
  let overlap = 0;
  bGrams.forEach(gram => {
    const count = counts.get(gram) || 0;
    if (count > 0) {
      overlap += 1;
      counts.set(gram, count - 1);
    }
  });
  return (2 * overlap) / (aGrams.length + bGrams.length);
};

const tokenSimilarity = (a: string, b: string) => {
  const aTokens = new Set(textTokens(a));
  const bTokens = new Set(textTokens(b));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  const intersection = [...aTokens].filter(token => bTokens.has(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size;
  return intersection / union;
};

const numericTokens = (value: string) => textTokens(value).filter(token => /\d/.test(token));

export const smartNameScore = (invoiceName: string, productName: string) => {
  const normalizedInvoice = normalizeText(invoiceName);
  const normalizedProduct = normalizeText(productName);
  if (!normalizedInvoice || !normalizedProduct) return 0;
  if (normalizedInvoice === normalizedProduct) return 100;
  const tokenScore = tokenSimilarity(invoiceName, productName);
  const diceScore = diceCoefficient(invoiceName, productName);
  const invoiceNumbers = numericTokens(invoiceName);
  const productNumbers = new Set(numericTokens(productName));
  const numericScore = invoiceNumbers.length === 0
    ? 0.6
    : invoiceNumbers.filter(token => productNumbers.has(token)).length / invoiceNumbers.length;
  const containsBoost = normalizedInvoice.includes(normalizedProduct) || normalizedProduct.includes(normalizedInvoice) ? 0.08 : 0;
  return Math.round(Math.min(1, (tokenScore * 0.48) + (diceScore * 0.34) + (numericScore * 0.18) + containsBoost) * 100);
};

export const confidenceStyle = (score?: number) => {
  const value = score ?? 0;
  if (value >= 90) return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (value >= 70) return 'bg-amber-50 text-amber-700 border-amber-100';
  return 'bg-red-50 text-red-700 border-red-100';
};

interface BuildProductMatchesInput {
  extractedData: InvoiceExtractedData;
  products: Product[];
  suppliers: Supplier[];
  productAliases: ProductAlias[];
  categories: Category[];
  onQuickCreateProduct: (data: any) => Product | Promise<Product>;
}

export async function buildProductMatches({
  extractedData,
  products,
  suppliers,
  productAliases,
  categories,
  onQuickCreateProduct
}: BuildProductMatchesInput) {
  const autoMap: Record<number, string> = {};
  const confidenceMap: Record<number, number> = {};
  const createdProducts: Record<string, Product> = {};
  const initialFamilies: Record<number, Category> = {};
  const aliasMap: Record<number, string> = {};
  const unitMap: Record<number, string> = {};
  const factorMap: Record<number, number> = {};

  for (const [idx, item] of extractedData.items.entries()) {
    let family: Category = 'Outros';
    const catLower = (item.category || '').toLowerCase();
    const existingCat = categories.find(c => catLower.includes(c.toLowerCase()) || c.toLowerCase().includes(catLower));
    if (existingCat) family = existingCat;
    initialFamilies[idx] = family;

    const currentSupplier = suppliers.find(s => normalizeNif(s.nif) === normalizeNif(extractedData.supplierNif || ''));
    const aliasMatch = currentSupplier
      ? productAliases
          .filter(alias => alias.supplierId === currentSupplier.id)
          .map(alias => ({
            alias,
            score: Math.max(
              normalizeText(alias.supplierItemName) === normalizeText(item.name || '') ? 100 : 0,
              smartNameScore(item.name || '', alias.supplierItemName || '') * ((alias.confidence || 100) / 100)
            )
          }))
          .sort((a, b) => b.score - a.score)[0]
      : undefined;
    const aliasProduct = aliasMatch && aliasMatch.score >= 76
      ? products.find(p => p.id === aliasMatch.alias.productId)
      : undefined;
    const productCandidates = [...products, ...Object.values(createdProducts)]
      .map(product => ({
        product,
        score: Math.max(
          normalizeText(product.name || '') === normalizeText(item.name || '') ? 100 : 0,
          smartNameScore(item.name || '', product.name || '')
        )
      }))
      .sort((a, b) => b.score - a.score);
    const productMatch = productCandidates[0]?.score >= 82 ? productCandidates[0] : undefined;
    const match = aliasProduct || productMatch?.product;
    const matchScore = aliasProduct ? Math.round(aliasMatch?.score || 100) : (productMatch?.score || 0);

    if (match) {
      autoMap[idx] = match.id;
      confidenceMap[idx] = matchScore;
      initialFamilies[idx] = match.category;
      if (aliasProduct && aliasMatch) {
        aliasMap[idx] = aliasMatch.alias.id;
        factorMap[idx] = aliasMatch.alias.conversionFactor || 1;
      }
    } else {
      const created = await onQuickCreateProduct({
        name: item.name || 'Artigo sem nome',
        category: family,
        unit: item.unit || 'un',
        minStock: 0
      });
      autoMap[idx] = created.id;
      confidenceMap[idx] = 55;
      createdProducts[created.id] = created;
      initialFamilies[idx] = created.category;
    }
    unitMap[idx] = item.unit || match?.unit || 'un';
    factorMap[idx] = factorMap[idx] || 1;
  }

  return {
    autoMap,
    confidenceMap,
    createdProducts,
    initialFamilies,
    aliasMap,
    unitMap,
    factorMap
  };
}
