import { Router } from 'express';
import { query } from '../db.js';

export const expenseCategoriesRouter = Router();

expenseCategoriesRouter.get('/', async (req, res, next) => {
  try {
    const result = await query(
      'SELECT id, name, sort_order FROM expense_categories WHERE is_active = true ORDER BY sort_order ASC, name ASC'
    );
    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});
