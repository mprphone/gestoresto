# GestoResto PostgreSQL

Base local no servidor:

```bash
sudo -u postgres createdb gestoresto
sudo -u postgres psql -d gestoresto -f database/schema.sql
```

O arquivo físico fica em `/mnt/bunker/resto`; a tabela `digital_archive_documents` guarda os metadados e caminhos.

Tabelas centrais:

- `products`
- `suppliers`
- `product_aliases`
- `product_unit_conversions`
- `purchase_invoices`
- `purchase_invoice_lines`
- `digital_archive_documents`
- `payments`
- `movements`
- `app_users`
- `audit_log`
