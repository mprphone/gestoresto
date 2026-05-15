import { query, withTransaction } from './db.js';

export async function runMigrations() {
  // ── 0. Enum additions ────────────────────────────────────────────────────────
  await query(`
    do $$ begin
      if not exists (select 1 from pg_enum where enumlabel = 'gerente' and enumtypid = 'app_role'::regtype) then
        alter type app_role add value 'gerente';
      end if;
    end $$
  `).catch(() => {});

  // ── 1. New tables ────────────────────────────────────────────────────────────
  await query(`
    create table if not exists companies (
      id            uuid primary key default gen_random_uuid(),
      name          text not null,
      nif           text,
      email         text,
      phone         text,
      address       text,
      postal_code   text,
      city          text,
      country       text not null default 'Portugal',
      is_active     boolean not null default true,
      created_at    timestamptz not null default now(),
      updated_at    timestamptz not null default now()
    )
  `);

  await query(`
    create table if not exists restaurants (
      id                  uuid primary key default gen_random_uuid(),
      company_id          uuid not null references companies(id),
      name                text not null,
      nif                 text,
      legal_name          text,
      email               text,
      phone               text,
      address             text,
      postal_code         text,
      city                text,
      country             text not null default 'Portugal',
      notification_emails text[] not null default '{}',
      is_active           boolean not null default true,
      created_at          timestamptz not null default now(),
      updated_at          timestamptz not null default now()
    )
  `);

  await query(`
    create table if not exists user_restaurant_access (
      id            uuid primary key default gen_random_uuid(),
      user_id       uuid not null references app_users(id) on delete cascade,
      company_id    uuid not null references companies(id),
      restaurant_id uuid not null references restaurants(id),
      role          text not null default 'funcionario',
      is_active     boolean not null default true,
      created_at    timestamptz not null default now(),
      unique(user_id, restaurant_id)
    )
  `);

  await query(`
    create table if not exists expense_categories (
      id          text primary key,
      name        text not null,
      sort_order  int not null default 0,
      is_active   boolean not null default true,
      created_at  timestamptz not null default now()
    )
  `).catch(() => {});

  await query(`
    insert into expense_categories (id, name, sort_order) values
      ('Eletricidade',     'Eletricidade',       1),
      ('Água',             'Água',               2),
      ('Gás',              'Gás',                3),
      ('Telecomunicações', 'Telecom / Internet',  4),
      ('Seguros',          'Seguros',            5),
      ('Rendas',           'Rendas',             6),
      ('Contabilidade',    'Contabilidade',      7),
      ('Outros',           'Outros',             8)
    on conflict (id) do nothing
  `).catch(() => {});

  await query(`grant select on expense_categories to ubuntu`).catch(() => {});

  // ── 2. Workspace columns and scoped uniqueness ─────────────────────────────
  for (const sql of [
    `alter table app_users add column if not exists last_company_id uuid`,
    `alter table app_users add column if not exists last_restaurant_id uuid`,
    `alter table products add column if not exists restaurant_id uuid`,
    `alter table suppliers add column if not exists restaurant_id uuid`,
    `alter table purchase_invoices add column if not exists restaurant_id uuid`,
    `alter table purchase_invoices add column if not exists ai_model text`,
    `alter table purchase_invoices add column if not exists ai_input_tokens integer`,
    `alter table purchase_invoices add column if not exists ai_output_tokens integer`,
    `alter table purchase_invoices add column if not exists ai_total_tokens integer`,
    `alter table purchase_invoices add column if not exists ai_thinking_tokens integer`,
    `alter table purchase_invoices add column if not exists ai_attempts integer`,
    `alter table movements add column if not exists restaurant_id uuid`,
    `alter table digital_archive_documents add column if not exists restaurant_id uuid`
  ]) {
    await query(sql).catch(() => {});
  }

  await query(`drop index if exists products_name_unit_unique`).catch(() => {});
  await query(`
    create unique index if not exists products_restaurant_name_unit_unique
    on products (restaurant_id, normalized_name, unit)
    where restaurant_id is not null and is_active = true
  `).catch(() => {});

  await query(`drop index if exists suppliers_nif_unique`).catch(() => {});
  await query(`drop index if exists suppliers_normalized_nif_unique`).catch(() => {});
  await query(`
    create unique index if not exists suppliers_restaurant_normalized_nif_unique
    on suppliers (restaurant_id, normalized_nif)
    where restaurant_id is not null and normalized_nif <> ''
  `).catch(() => {});

  await query(`drop index if exists invoices_unique_supplier_doc`).catch(() => {});
  await query(`
    create unique index if not exists invoices_restaurant_supplier_doc_unique
    on purchase_invoices (restaurant_id, supplier_nif, doc_number)
    where restaurant_id is not null
  `).catch(() => {});

  // ── 3. Add FK constraints if missing ───────────────────────────────────────
  const fkMigrations = [
    `do $$ begin
       if not exists (select 1 from pg_constraint where conname = 'app_users_last_company_id_fkey') then
         alter table app_users add constraint app_users_last_company_id_fkey foreign key (last_company_id) references companies(id);
       end if; end $$`,
    `do $$ begin
       if not exists (select 1 from pg_constraint where conname = 'app_users_last_restaurant_id_fkey') then
         alter table app_users add constraint app_users_last_restaurant_id_fkey foreign key (last_restaurant_id) references restaurants(id);
       end if; end $$`,
    `do $$ begin
       if not exists (select 1 from pg_constraint where conname = 'products_restaurant_id_fkey') then
         alter table products add constraint products_restaurant_id_fkey foreign key (restaurant_id) references restaurants(id);
       end if; end $$`,
    `do $$ begin
       if not exists (select 1 from pg_constraint where conname = 'suppliers_restaurant_id_fkey') then
         alter table suppliers add constraint suppliers_restaurant_id_fkey foreign key (restaurant_id) references restaurants(id);
       end if; end $$`,
    `do $$ begin
       if not exists (select 1 from pg_constraint where conname = 'purchase_invoices_restaurant_id_fkey') then
         alter table purchase_invoices add constraint purchase_invoices_restaurant_id_fkey foreign key (restaurant_id) references restaurants(id);
       end if; end $$`,
    `do $$ begin
       if not exists (select 1 from pg_constraint where conname = 'movements_restaurant_id_fkey') then
         alter table movements add constraint movements_restaurant_id_fkey foreign key (restaurant_id) references restaurants(id);
       end if; end $$`,
  ];
  for (const sql of fkMigrations) await query(sql).catch(() => {});

  // ── 4. Seed default company + restaurant if none exist ─────────────────────
  const existingCompanies = await query('select id from companies limit 1');
  if (existingCompanies.rows.length > 0) return; // already migrated

  await withTransaction(async (client) => {
    // Get restaurant_profile data (may or may not exist)
    const profileRes = await client.query(`
      select name, nif, legal_name, email, phone, address, postal_code, city, notification_emails
      from restaurant_profile where is_active = true limit 1
    `).catch(() => ({ rows: [] }));
    const profile = profileRes.rows[0] || {};

    // Create default company
    const companyRes = await client.query(`
      insert into companies (name, nif, email, phone, address, postal_code, city)
      values ($1, $2, $3, $4, $5, $6, $7)
      returning id
    `, [
      profile.name || 'Empresa Principal',
      profile.nif  || null,
      profile.email || null,
      profile.phone || null,
      profile.address || null,
      profile.postal_code || null,
      profile.city || null
    ]);
    const companyId = companyRes.rows[0].id;

    // Create default restaurant
    const restaurantRes = await client.query(`
      insert into restaurants (company_id, name, nif, legal_name, email, phone, address, postal_code, city, notification_emails)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      returning id
    `, [
      companyId,
      profile.name || 'Restaurante Principal',
      profile.nif  || null,
      profile.legal_name || null,
      profile.email || null,
      profile.phone || null,
      profile.address || null,
      profile.postal_code || null,
      profile.city || null,
      profile.notification_emails || []
    ]);
    const restaurantId = restaurantRes.rows[0].id;

    // Grant all existing users access to the default restaurant
    await client.query(`
      insert into user_restaurant_access (user_id, company_id, restaurant_id, role)
      select id, $1, $2, role from app_users
      on conflict (user_id, restaurant_id) do nothing
    `, [companyId, restaurantId]);

    // Set last_restaurant_id on all users
    await client.query(`
      update app_users
      set last_company_id = $1, last_restaurant_id = $2
      where last_restaurant_id is null
    `, [companyId, restaurantId]);

    // Backfill restaurant_id on existing data
    for (const table of ['products', 'suppliers', 'purchase_invoices', 'movements', 'digital_archive_documents']) {
      await client.query(`update ${table} set restaurant_id = $1 where restaurant_id is null`, [restaurantId]);
    }

    console.log(`[migrate] Default company (${companyId}) and restaurant (${restaurantId}) created.`);
  });
}
