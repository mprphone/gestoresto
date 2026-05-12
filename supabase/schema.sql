-- GestoRestô | Esquema base para Supabase (Postgres)

create extension if not exists pgcrypto;

-- Suppliers
create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  nif text not null,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists suppliers_nif_idx on suppliers (nif);

-- Products
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  unit text not null,
  current_stock numeric not null default 0,
  average_price numeric not null default 0,
  min_stock numeric not null default 0,
  last_updated timestamptz not null default now()
);
create index if not exists products_category_idx on products (category);

-- Invoices
do $$ begin
  create type invoice_status as enum ('PENDENTE','PARCIAL','PAGO');
exception when duplicate_object then null;
end $$;

create table if not exists purchase_invoices (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references suppliers(id) on delete set null,
  supplier_name text not null,
  supplier_nif text not null,
  doc_number text not null,
  total_amount numeric not null,
  date_issued date not null,
  status invoice_status not null default 'PENDENTE',
  paid_amount numeric not null default 0,
  last_payment_date date,
  last_payment_method text,
  last_payment_account text,
  photo_url text,
  proof_url text,
  created_at timestamptz not null default now()
);
create index if not exists invoices_supplier_idx on purchase_invoices (supplier_nif);
create unique index if not exists invoices_unique_supplier_doc on purchase_invoices (supplier_nif, doc_number);

-- Payments (histórico)
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references purchase_invoices(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete set null,
  amount numeric not null,
  date_paid date not null,
  method text not null,
  account text,
  notes text,
  proof_url text,
  created_at timestamptz not null default now()
);
create index if not exists payments_invoice_idx on payments (invoice_id);

-- Movements (stock)
create table if not exists movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  type text not null,
  quantity numeric not null,
  price numeric,
  date_moved timestamptz not null default now(),
  photo_url text,
  notes text,
  supplier_id uuid references suppliers(id) on delete set null,
  supplier_name text
);
create index if not exists movements_product_idx on movements (product_id);

-- Nota sobre Storage:
-- Crie um bucket (ex: "gestoresto") e defina como público, OU use Signed URLs no frontend.
