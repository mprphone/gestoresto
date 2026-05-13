-- GestoResto | Esquema PostgreSQL local do servidor
-- Preparado para centenas/milhares de artigos, arquivo digital e paginação.

create extension if not exists pgcrypto;
create extension if not exists unaccent;
create extension if not exists pg_trgm;

do $$ begin
  create type invoice_status as enum ('PENDENTE','PARCIAL','PAGO');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type archive_document_type as enum ('FATURA','COMPROVATIVO','GUIA','OUTRO');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type movement_type as enum ('ENTRADA','SAÍDA (REPOSIÇÃO)','QUEBRA/DESPERDÍCIO');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type app_role as enum ('admin','funcionario','compras','cozinha','financeiro');
exception when duplicate_object then null;
end $$;

alter type app_role add value if not exists 'funcionario';

do $$ begin
  create type email_status as enum ('PENDENTE','ENVIADO','FALHOU','SIMULADO');
exception when duplicate_object then null;
end $$;

-- Texto normalizado para chaves de pesquisa/alias.
create or replace function normalize_search_text(value text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(lower(unaccent(coalesce(value, ''))), '[^a-z0-9]+', ' ', 'g'));
$$;

create or replace function normalize_invoice_doc_number(value text)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(unaccent(coalesce(value, ''))), '[^a-z0-9]+', '', 'g');
$$;

create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text generated always as (normalize_search_text(name)) stored,
  nif text not null,
  normalized_nif text generated always as (regexp_replace(coalesce(nif, ''), '\D', '', 'g')) stored,
  email text,
  phone text,
  payment_terms_days integer not null default 30 check (payment_terms_days >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table suppliers
  add column if not exists normalized_nif text generated always as (regexp_replace(coalesce(nif, ''), '\D', '', 'g')) stored;

create unique index if not exists suppliers_nif_unique on suppliers (nif);
create unique index if not exists suppliers_normalized_nif_unique
  on suppliers (normalized_nif)
  where normalized_nif <> '';
create index if not exists suppliers_name_trgm_idx on suppliers using gin (normalized_name gin_trgm_ops);

drop trigger if exists suppliers_touch_updated_at on suppliers;
create trigger suppliers_touch_updated_at
before update on suppliers
for each row execute function touch_updated_at();

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text generated always as (normalize_search_text(name)) stored,
  created_at timestamptz not null default now()
);
create unique index if not exists categories_name_unique on categories (normalized_name);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text generated always as (normalize_search_text(name)) stored,
  category_id uuid references categories(id) on delete set null,
  category text not null,
  unit text not null,
  current_stock numeric(14,3) not null default 0,
  average_price numeric(14,4) not null default 0,
  min_stock numeric(14,3) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (current_stock >= 0),
  check (average_price >= 0),
  check (min_stock >= 0)
);
create index if not exists products_category_idx on products (category);
create index if not exists products_active_category_idx on products (is_active, category, name);
create index if not exists products_name_trgm_idx on products using gin (normalized_name gin_trgm_ops);
create unique index if not exists products_name_unit_unique on products (normalized_name, unit);

drop trigger if exists products_touch_updated_at on products;
create trigger products_touch_updated_at
before update on products
for each row execute function touch_updated_at();

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  password_hash text not null,
  role app_role not null default 'funcionario',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists app_users_email_unique on app_users (lower(email));
create index if not exists app_users_active_role_idx on app_users (is_active, role);

alter table app_users
  add column if not exists phone text;
alter table app_users
  alter column role set default 'funcionario';

drop trigger if exists app_users_touch_updated_at on app_users;
create trigger app_users_touch_updated_at
before update on app_users
for each row execute function touch_updated_at();

create table if not exists audit_log (
  id bigserial primary key,
  user_id uuid references app_users(id) on delete set null,
  actor_name text,
  action text not null,
  entity_table text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  request_id uuid default gen_random_uuid(),
  created_at timestamptz not null default now()
);
create index if not exists audit_log_entity_idx on audit_log (entity_table, entity_id, created_at desc);
create index if not exists audit_log_user_date_idx on audit_log (user_id, created_at desc);
create index if not exists audit_log_action_date_idx on audit_log (action, created_at desc);

create table if not exists email_messages (
  id uuid primary key default gen_random_uuid(),
  recipient text not null,
  subject text not null,
  body text not null,
  status email_status not null default 'PENDENTE',
  related_entity_table text,
  related_entity_id text,
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists email_messages_status_date_idx on email_messages (status, created_at desc);
create index if not exists email_messages_recipient_date_idx on email_messages (recipient, created_at desc);
create index if not exists email_messages_related_idx on email_messages (related_entity_table, related_entity_id);

create table if not exists restaurant_profile (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  nif text not null,
  legal_name text,
  email text,
  phone text,
  address text,
  postal_code text,
  city text,
  country text not null default 'Portugal',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists restaurant_profile_active_unique
  on restaurant_profile (is_active)
  where is_active;

drop trigger if exists restaurant_profile_touch_updated_at on restaurant_profile;
create trigger restaurant_profile_touch_updated_at
before update on restaurant_profile
for each row execute function touch_updated_at();

-- Conversões genéricas entre unidades. Ex: cx -> un com fator 6.
create table if not exists unit_conversions (
  id uuid primary key default gen_random_uuid(),
  from_unit text not null,
  to_unit text not null,
  factor numeric(18,6) not null check (factor > 0),
  description text,
  created_at timestamptz not null default now()
);
create unique index if not exists unit_conversions_unique on unit_conversions (from_unit, to_unit);

-- Conversões específicas têm precedência sobre conversões globais.
-- Ex: fornecedor A vende "cx" de vinho com 6 un, fornecedor B vende "cx" de cerveja com 24 un.
create table if not exists product_unit_conversions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete cascade,
  from_unit text not null,
  to_unit text not null,
  factor numeric(18,6) not null check (factor > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists product_unit_conversions_unique
  on product_unit_conversions (product_id, coalesce(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid), from_unit, to_unit);
create index if not exists product_unit_conversions_lookup_idx on product_unit_conversions (product_id, supplier_id, from_unit, to_unit);

drop trigger if exists product_unit_conversions_touch_updated_at on product_unit_conversions;
create trigger product_unit_conversions_touch_updated_at
before update on product_unit_conversions
for each row execute function touch_updated_at();

-- Equivalências por fornecedor. É aqui que "Tomate Cherry 250g" aprende que é "Tomate Cereja".
create table if not exists product_aliases (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references suppliers(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  supplier_item_name text not null,
  normalized_supplier_item_name text generated always as (normalize_search_text(supplier_item_name)) stored,
  supplier_item_code text,
  supplier_unit text,
  product_unit text not null,
  conversion_factor numeric(18,6) not null default 1 check (conversion_factor > 0),
  confidence numeric(5,2) not null default 100 check (confidence >= 0 and confidence <= 100),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists product_aliases_supplier_name_unique
  on product_aliases (supplier_id, normalized_supplier_item_name, coalesce(supplier_item_code, ''));
create index if not exists product_aliases_product_idx on product_aliases (product_id);
create index if not exists product_aliases_supplier_lookup_idx on product_aliases (supplier_id, normalized_supplier_item_name);
create index if not exists product_aliases_name_trgm_idx on product_aliases using gin (normalized_supplier_item_name gin_trgm_ops);

drop trigger if exists product_aliases_touch_updated_at on product_aliases;
create trigger product_aliases_touch_updated_at
before update on product_aliases
for each row execute function touch_updated_at();

create table if not exists purchase_invoices (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references suppliers(id) on delete set null,
  supplier_name text not null,
  supplier_nif text not null,
  normalized_supplier_nif text generated always as (regexp_replace(coalesce(supplier_nif, ''), '\D', '', 'g')) stored,
  customer_name text,
  customer_nif text,
  restaurant_profile_id uuid references restaurant_profile(id) on delete set null,
  restaurant_match_status text not null default 'NAO_VERIFICADO'
    check (restaurant_match_status in ('VALIDO','ALERTA','NAO_VERIFICADO')),
  restaurant_match_notes text,
  doc_number text not null,
  normalized_doc_number text generated always as (normalize_invoice_doc_number(doc_number)) stored,
  total_amount numeric(14,2) not null check (total_amount >= 0),
  date_issued date not null,
  due_date date,
  status invoice_status not null default 'PENDENTE',
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0),
  last_payment_date date,
  last_payment_method text,
  last_payment_account text,
  photo_url text,
  primary_archive_document_id uuid,
  has_qr_code boolean,
  has_atcud boolean,
  atcud text,
  image_quality_ok boolean,
  is_missing_pages boolean,
  qr_code_text text,
  qr_total_amount numeric(14,2),
  calculated_lines_total numeric(14,2),
  total_validation_status text not null default 'NAO_VERIFICADO'
    check (total_validation_status in ('VALIDO','ALERTA','NAO_VERIFICADO')),
  total_validation_notes text,
  compliance_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (paid_amount <= total_amount)
);
alter table purchase_invoices
  add column if not exists normalized_supplier_nif text generated always as (regexp_replace(coalesce(supplier_nif, ''), '\D', '', 'g')) stored,
  add column if not exists normalized_doc_number text generated always as (normalize_invoice_doc_number(doc_number)) stored;

create index if not exists invoices_supplier_date_idx on purchase_invoices (supplier_nif, date_issued desc, id desc);
create index if not exists invoices_status_due_idx on purchase_invoices (status, due_date, id desc);
create index if not exists invoices_date_pagination_idx on purchase_invoices (date_issued desc, id desc);
create unique index if not exists invoices_unique_supplier_doc on purchase_invoices (supplier_nif, doc_number);
create index if not exists invoices_supplier_doc_normalized_idx
  on purchase_invoices (normalized_supplier_nif, normalized_doc_number)
  where normalized_supplier_nif <> '' and normalized_doc_number <> '';
create index if not exists invoices_duplicate_fingerprint_idx
  on purchase_invoices (normalized_supplier_nif, total_amount, date_issued desc)
  where normalized_supplier_nif <> '';

alter table purchase_invoices
  add column if not exists customer_name text,
  add column if not exists customer_nif text,
  add column if not exists restaurant_profile_id uuid references restaurant_profile(id) on delete set null,
  add column if not exists restaurant_match_status text not null default 'NAO_VERIFICADO',
  add column if not exists restaurant_match_notes text,
  add column if not exists qr_code_text text,
  add column if not exists qr_total_amount numeric(14,2),
  add column if not exists calculated_lines_total numeric(14,2),
  add column if not exists total_validation_status text not null default 'NAO_VERIFICADO',
  add column if not exists total_validation_notes text;

alter table purchase_invoices
  drop constraint if exists purchase_invoices_restaurant_match_status_check;
alter table purchase_invoices
  add constraint purchase_invoices_restaurant_match_status_check
  check (restaurant_match_status in ('VALIDO','ALERTA','NAO_VERIFICADO'));

alter table purchase_invoices
  drop constraint if exists purchase_invoices_total_validation_status_check;
alter table purchase_invoices
  add constraint purchase_invoices_total_validation_status_check
  check (total_validation_status in ('VALIDO','ALERTA','NAO_VERIFICADO'));

drop trigger if exists purchase_invoices_touch_updated_at on purchase_invoices;
create trigger purchase_invoices_touch_updated_at
before update on purchase_invoices
for each row execute function touch_updated_at();

-- Linhas reais da fatura, com designação original, artigo mestre e conversão.
create table if not exists purchase_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references purchase_invoices(id) on delete cascade,
  line_number integer not null,
  product_id uuid references products(id) on delete set null,
  product_alias_id uuid references product_aliases(id) on delete set null,
  original_name text not null,
  normalized_original_name text generated always as (normalize_search_text(original_name)) stored,
  supplier_item_code text,
  quantity_original numeric(14,3) not null check (quantity_original >= 0),
  unit_original text not null default 'un',
  conversion_factor numeric(18,6) not null default 1 check (conversion_factor > 0),
  quantity_stock numeric(14,3) not null check (quantity_stock >= 0),
  unit_stock text not null,
  unit_price numeric(14,4) not null default 0 check (unit_price >= 0),
  total_price numeric(14,2) not null default 0 check (total_price >= 0),
  vat_rate numeric(5,2),
  expiry_date date,
  notes text,
  created_at timestamptz not null default now(),
  unique (invoice_id, line_number)
);
create index if not exists invoice_lines_invoice_idx on purchase_invoice_lines (invoice_id, line_number);
create index if not exists invoice_lines_product_date_idx on purchase_invoice_lines (product_id, created_at desc, id desc);
create index if not exists invoice_lines_name_trgm_idx on purchase_invoice_lines using gin (normalized_original_name gin_trgm_ops);

create table if not exists digital_archive_documents (
  id uuid primary key default gen_random_uuid(),
  document_type archive_document_type not null,
  invoice_id uuid references purchase_invoices(id) on delete cascade,
  payment_id uuid,
  supplier_id uuid references suppliers(id) on delete set null,
  original_filename text,
  mime_type text,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  sha256 text,
  storage_provider text not null default 'bunker',
  storage_bucket text,
  storage_path text not null,
  public_url text,
  local_root text not null default '/mnt/bunker/resto',
  page_count integer not null default 1 check (page_count > 0),
  quality_ok boolean,
  has_qr_code boolean,
  has_atcud boolean,
  atcud text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists archive_invoice_idx on digital_archive_documents (invoice_id, created_at desc);
create index if not exists archive_supplier_type_idx on digital_archive_documents (supplier_id, document_type, created_at desc);
create unique index if not exists archive_sha256_unique on digital_archive_documents (sha256) where sha256 is not null;

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references purchase_invoices(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete set null,
  amount numeric(14,2) not null check (amount > 0),
  date_paid date not null,
  method text not null,
  account text,
  notes text,
  proof_url text,
  archive_document_id uuid references digital_archive_documents(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists payments_invoice_idx on payments (invoice_id);
create index if not exists payments_supplier_date_idx on payments (supplier_id, date_paid desc, id desc);

alter table digital_archive_documents
  drop constraint if exists digital_archive_documents_payment_id_fkey;
alter table digital_archive_documents
  add constraint digital_archive_documents_payment_id_fkey
  foreign key (payment_id) references payments(id) on delete cascade;

alter table purchase_invoices
  drop constraint if exists purchase_invoices_primary_archive_document_id_fkey;
alter table purchase_invoices
  add constraint purchase_invoices_primary_archive_document_id_fkey
  foreign key (primary_archive_document_id) references digital_archive_documents(id) on delete set null;

create table if not exists movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  invoice_line_id uuid references purchase_invoice_lines(id) on delete set null,
  type movement_type not null,
  quantity numeric(14,3) not null check (quantity > 0),
  price numeric(14,4),
  date_moved timestamptz not null default now(),
  photo_url text,
  archive_document_id uuid references digital_archive_documents(id) on delete set null,
  notes text,
  supplier_id uuid references suppliers(id) on delete set null,
  supplier_name text
);
create index if not exists movements_product_date_idx on movements (product_id, date_moved desc, id desc);
create index if not exists movements_type_date_idx on movements (type, date_moved desc, id desc);

-- Helpers para paginação por cursor (date/id), usados pelo frontend.
-- Exemplo: where (date_issued, id) < (:cursor_date, :cursor_id) order by date_issued desc, id desc limit 50

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'ubuntu') then
    grant all privileges on all tables in schema public to ubuntu;
    grant all privileges on all sequences in schema public to ubuntu;
    grant execute on all functions in schema public to ubuntu;
  end if;
end $$;
