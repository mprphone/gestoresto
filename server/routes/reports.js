import { Router } from 'express';
import { query } from '../db.js';

export const reportsRouter = Router();

reportsRouter.get('/summary', async (req, res, next) => {
  try {
    const [stock, debt, waste, purchases, lowStock, recentPrices] = await Promise.all([
      query(`
        select coalesce(sum(current_stock * average_price), 0) as total_stock_value,
               count(*) filter (where current_stock <= min_stock and is_active = true) as low_stock_count
        from products
        where is_active = true and restaurant_id = $1
      `, [req.restaurantId]),
      query(`
        select coalesce(sum(total_amount - paid_amount), 0) as total_pending
        from purchase_invoices
        where status <> 'PAGO' and restaurant_id = $1
      `, [req.restaurantId]),
      query(`
        select coalesce(sum(quantity * coalesce(price, 0)), 0) as total_waste
        from movements
        where type = 'QUEBRA/DESPERDÍCIO'
          and restaurant_id = $1
          and date_moved >= date_trunc('month', now())
      `, [req.restaurantId]),
      query(`
        select coalesce(sum(total_amount), 0) as purchases_month
        from purchase_invoices
        where date_issued >= date_trunc('month', current_date) and restaurant_id = $1
      `, [req.restaurantId]),
      query(`
        select id, name, category, current_stock, min_stock, unit
        from products
        where is_active = true and restaurant_id = $1 and current_stock <= min_stock
        order by category asc, name asc
        limit 20
      `, [req.restaurantId]),
      query(`
        select pil.product_id, p.name, s.name as supplier_name,
               pil.unit_price, pi.date_issued, pil.unit_stock
        from purchase_invoice_lines pil
        join purchase_invoices pi on pi.id = pil.invoice_id
        left join products p on p.id = pil.product_id
        left join suppliers s on s.id = pi.supplier_id
        where pi.restaurant_id = $1
        order by pi.date_issued desc, pil.created_at desc
        limit 30
      `, [req.restaurantId])
    ]);

    res.json({
      totalStockValue: Number(stock.rows[0].total_stock_value || 0),
      lowStockCount: Number(stock.rows[0].low_stock_count || 0),
      totalPending: Number(debt.rows[0].total_pending || 0),
      totalWasteThisMonth: Number(waste.rows[0].total_waste || 0),
      purchasesThisMonth: Number(purchases.rows[0].purchases_month || 0),
      lowStock: lowStock.rows,
      recentPrices: recentPrices.rows
    });
  } catch (error) {
    next(error);
  }
});

reportsRouter.get('/supplier-debt', async (req, res, next) => {
  try {
    const result = await query(`
      select supplier_nif, supplier_name,
             count(*) filter (where status <> 'PAGO') as open_invoices,
             coalesce(sum(total_amount - paid_amount) filter (where status <> 'PAGO'), 0) as pending_amount
      from purchase_invoices
      where restaurant_id = $1
      group by supplier_nif, supplier_name
      order by pending_amount desc, supplier_name asc
      limit 100
    `, [req.restaurantId]);
    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});
