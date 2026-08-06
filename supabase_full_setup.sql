-- ═══════════════════════════════════════════════════════════════════════════════
--  StationPro — Schéma complet PostgreSQL / Supabase
--  Gestion intégrée d'une station-service Naftal
-- ───────────────────────────────────────────────────────────────────────────────
--  À exécuter UNE SEULE FOIS, en entier, dans :
--      Supabase Dashboard → SQL Editor → New query → Run
--
--  Le script est IDEMPOTENT : le relancer ne détruit aucune donnée
--  (create if not exists / add column if not exists / drop policy if exists).
--
--  Ce qu'il installe :
--    1.  Extensions et fonctions utilitaires
--    2.  Comptes : administrateurs + travailleurs dans auth.users
--    3.  Toutes les tables métier, avec leurs relations
--    4.  Les fonctions RPC appelées par l'application
--    5.  Row Level Security sur chaque table
--    6.  Les buckets de stockage (toutes les images de l'application)
--    7.  Le temps réel (realtime) sur les tables suivies par l'interface
--
--  Connexion : chaque compte — administrateur comme employé — se connecte
--  avec SON EMAIL **OU** SON NOM D'UTILISATEUR, plus son mot de passe.
--
--  Permissions : la colonne `permissions` (jsonb) de chaque table de
--  travailleurs pilote à la fois les interfaces visibles dans SA barre latérale
--  et les boutons d'action affichés sur chacune. Un employé sans permissions ne
--  voit rien d'autre que son tableau de bord.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — EXTENSIONS & UTILITAIRES
-- ═══════════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto"  with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

-- Horodatage automatique de la dernière modification d'une ligne.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- L'utilisateur est-il simplement authentifié ?
create or replace function public.is_authenticated()
returns boolean
language sql
stable
as $$
  select auth.uid() is not null;
$$;

grant execute on function public.is_authenticated() to anon, authenticated;

-- NOTE : `is_admin()` interroge `admin_profiles` ; une fonction `language sql`
-- voit son corps résolu DÈS SA CRÉATION, elle ne peut donc pas être définie
-- avant la table. Elle l'est en section 2.1, juste après celle-ci.


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — COMPTES & IDENTITÉ
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 2.1  Profils administrateurs ─────────────────────────────────────────────
-- Une ligne ici = un administrateur. `id` est l'identifiant du compte
-- auth.users : c'est cette table qui fait foi pour accorder le rôle admin.
create table if not exists public.admin_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  username    text unique,
  email       text,
  role        text not null default 'admin' check (role in ('admin')),
  avatar_url  text,
  permissions jsonb not null default '{}'::jsonb,
  status      text  not null default 'Actif' check (status in ('Actif', 'Inactif')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- L'utilisateur connecté est-il un administrateur ?
-- SECURITY DEFINER : la fonction lit `admin_profiles` sans être bloquée par la
-- RLS de cette même table, ce qui provoquerait une récursion infinie de
-- politique. Définie ICI et pas en section 1 : son corps SQL est résolu à la
-- création, la table doit donc déjà exister.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_profiles where id = auth.uid());
$$;

grant execute on function public.is_admin() to anon, authenticated;

-- ── 2.2  Paramètres de la station ────────────────────────────────────────────
create table if not exists public.station_settings (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null default 'Station Naftal',
  logo_url               text,
  address                text,
  phone                  text,
  email                  text,
  fiscal_id              text,
  rc                     text,
  bank_account_number    text,
  depositor_number       text,
  fuel_prices            jsonb not null default '{"SUPER":14.80,"DIESEL":12.50,"ESSENCE":14.80,"GASOIL":12.50,"GPL":8.50}'::jsonb,
  fuel_buy_prices        jsonb not null default '{"SUPER":0,"DIESEL":0,"ESSENCE":0,"GASOIL":0,"GPL":0}'::jsonb,
  conversion_tables      jsonb not null default '{}'::jsonb,
  product_categories     jsonb not null default '["Lubrifiants","Accessoires","Lavage","Magasin"]'::jsonb,
  expense_categories     jsonb not null default '["Salaires","Entretien","Électricité","Eau","Loyer","Impôts","Divers"]'::jsonb,
  product_units          jsonb not null default '["Pièce","Litre","Kg","Carton","Pack","Bidon"]'::jsonb,
  decalage_positif_actif boolean not null default true,
  decalage_negatif_actif boolean not null default true,
  decalage_positif_seuil numeric(14,2) not null default 0,
  decalage_negatif_seuil numeric(14,2) not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

drop trigger if exists trg_station_settings_updated on public.station_settings;
create trigger trg_station_settings_updated before update on public.station_settings
  for each row execute function public.set_updated_at();

-- Une seule fiche station : semée ici pour que l'application trouve toujours
-- un jeu de paramètres au premier démarrage.
insert into public.station_settings (name)
select 'Station Naftal'
where not exists (select 1 from public.station_settings);

-- ── 2.3  Modèles de permissions réutilisables ────────────────────────────────
-- L'admin enregistre un jeu de permissions nommé, puis l'applique en un clic à
-- n'importe quel employé du même rôle (page « Modèles Permissions »).
create table if not exists public.permission_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  role        text not null check (role in ('pompiste','chef_brigade','gerant','magasin')),
  permissions jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── 2.4  Journal d'activité ──────────────────────────────────────────────────
create table if not exists public.activity_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid,
  action     text not null,
  details    text,
  timestamp  timestamptz not null default now(),
  created_at timestamptz not null default now()
);


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — INFRASTRUCTURE CARBURANT
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 3.1  Pistes ──────────────────────────────────────────────────────────────
create table if not exists public.tracks (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── 3.2  Cuves ───────────────────────────────────────────────────────────────
create table if not exists public.tanks (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  type            text not null check (type in ('ESSENCE','GASOIL','GPL','DIESEL','SUPER')),
  capacity        numeric(14,2) not null default 0,
  current         numeric(14,2) not null default 0,
  degrees         numeric(14,2) not null default 0,
  alert_threshold numeric(14,2) not null default 0,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── 3.3  Pompes ──────────────────────────────────────────────────────────────
create table if not exists public.pumps (
  id                           uuid primary key default gen_random_uuid(),
  number                       text,
  name                         text not null,
  tank_id                      uuid references public.tanks(id)  on delete set null,
  track_id                     uuid references public.tracks(id) on delete set null,
  type                         text,
  last_index                   numeric(16,2) not null default 0,
  status                       text not null default 'Actif',
  current_brigade_start_index  numeric(16,2),
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

-- ── 3.4  Pistolets ───────────────────────────────────────────────────────────
-- `track_id` rattache la piste AU PISTOLET (page Pistes → « Pistolets
-- rattachés »). Laissée vide, le pistolet suit simplement la piste de sa pompe :
-- la piste effective est donc `coalesce(nozzle.track_id, pump.track_id)`.
create table if not exists public.pump_nozzles (
  id          uuid primary key default gen_random_uuid(),
  pump_id     uuid not null references public.pumps(id) on delete cascade,
  name        text not null,
  last_index  numeric(16,2) not null default 0,
  start_index numeric(16,2) not null default 0,
  status      text not null default 'Actif',
  track_id    uuid references public.tracks(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Ajout conditionnel : le script reste rejouable sur une base déjà installée.
alter table public.pump_nozzles add column if not exists track_id uuid references public.tracks(id) on delete set null;

-- ── 3.5  Réglages de cuve (corrections manuelles de niveau) ──────────────────
create table if not exists public.cuve_reglages (
  id              uuid primary key default gen_random_uuid(),
  tank_id         uuid not null references public.tanks(id) on delete cascade,
  level_liters    numeric(14,2) not null default 0,
  level_degrees   numeric(14,2),
  previous_liters numeric(14,2),
  date            date not null default current_date,
  description     text,
  created_by      text,
  created_at      timestamptz not null default now()
);

-- ── 3.6  Armoires (stock produit par piste) ──────────────────────────────────
create table if not exists public.armoires (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  track_id   uuid references public.tracks(id) on delete set null,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — PERSONNEL
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Quatre métiers, quatre tables de même forme. Chacune porte :
--   · `auth_user_id`  → le compte Supabase Auth de l'employé (créé par le RPC
--                        provision_worker_account) ;
--   · `username`      → son identifiant de connexion, utilisable à la place de
--                        l'email sur l'écran de connexion ;
--   · `permissions`   → ce que l'admin lui a accordé : les interfaces de sa
--                        barre latérale ET les boutons d'action de chacune.
-- ───────────────────────────────────────────────────────────────────────────────

-- ── 4.1  Pompistes ───────────────────────────────────────────────────────────
create table if not exists public.pompistes (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  phone                 text,
  email                 text,
  cin                   text,
  address               text,
  photo_url             text,
  status                text not null default 'Actif' check (status in ('Actif','Inactif')),
  track_id              uuid references public.tracks(id) on delete set null,
  chef_id               uuid,
  base_salary           numeric(14,2) not null default 0,
  has_access            boolean not null default false,
  username              text unique,
  auth_user_id          uuid unique references auth.users(id) on delete set null,
  permissions           jsonb not null default '{}'::jsonb,
  hire_date             date,
  payment_type          text not null default 'MENSUEL' check (payment_type in ('MENSUEL','JOURNALIER')),
  daily_rate            numeric(14,2) not null default 0,
  work_days             jsonb not null default '[0,1,2,3,4,5,6]'::jsonb,
  cnas_declaration_date date,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ── 4.2  Chefs de brigade ────────────────────────────────────────────────────
create table if not exists public.brigade_chefs (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  phone                 text,
  email                 text,
  cin                   text,
  address               text,
  photo_url             text,
  status                text not null default 'Actif' check (status in ('Actif','Inactif')),
  base_salary           numeric(14,2) not null default 0,
  has_access            boolean not null default false,
  username              text unique,
  auth_user_id          uuid unique references auth.users(id) on delete set null,
  permissions           jsonb not null default '{}'::jsonb,
  hire_date             date,
  payment_type          text not null default 'MENSUEL' check (payment_type in ('MENSUEL','JOURNALIER')),
  daily_rate            numeric(14,2) not null default 0,
  work_days             jsonb not null default '[0,1,2,3,4,5,6]'::jsonb,
  cnas_declaration_date date,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Le lien pompiste → chef n'est posé qu'une fois les deux tables créées.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pompistes_chef_id_fkey'
  ) then
    alter table public.pompistes
      add constraint pompistes_chef_id_fkey
      foreign key (chef_id) references public.brigade_chefs(id) on delete set null;
  end if;
end $$;

-- ── 4.3  Gérants ─────────────────────────────────────────────────────────────
create table if not exists public.gerants (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  phone                 text,
  email                 text,
  cin                   text,
  address               text,
  photo_url             text,
  status                text not null default 'Actif' check (status in ('Actif','Inactif')),
  base_salary           numeric(14,2) not null default 0,
  has_access            boolean not null default false,
  username              text unique,
  auth_user_id          uuid unique references auth.users(id) on delete set null,
  permissions           jsonb not null default '{}'::jsonb,
  hire_date             date,
  payment_type          text not null default 'MENSUEL' check (payment_type in ('MENSUEL','JOURNALIER')),
  daily_rate            numeric(14,2) not null default 0,
  work_days             jsonb not null default '[0,1,2,3,4,5,6]'::jsonb,
  cnas_declaration_date date,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ── 4.4  Employés magasin ────────────────────────────────────────────────────
create table if not exists public.magasin_workers (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  phone                 text,
  email                 text,
  cin                   text,
  address               text,
  photo_url             text,
  status                text not null default 'Actif' check (status in ('Actif','Inactif')),
  base_salary           numeric(14,2) not null default 0,
  has_access            boolean not null default false,
  username              text unique,
  auth_user_id          uuid unique references auth.users(id) on delete set null,
  permissions           jsonb not null default '{}'::jsonb,
  hire_date             date,
  payment_type          text not null default 'MENSUEL' check (payment_type in ('MENSUEL','JOURNALIER')),
  daily_rate            numeric(14,2) not null default 0,
  work_days             jsonb not null default '[0,1,2,3,4,5,6]'::jsonb,
  cnas_declaration_date date,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ── 4.5  Affectation pompistes → chef ────────────────────────────────────────
create table if not exists public.chef_pompiste_assignments (
  chef_id     uuid not null references public.brigade_chefs(id) on delete cascade,
  pompiste_id uuid not null references public.pompistes(id)     on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (chef_id, pompiste_id)
);

-- ── 4.6  Paie : acomptes ─────────────────────────────────────────────────────
create table if not exists public.worker_acomptes (
  id          uuid primary key default gen_random_uuid(),
  worker_type text not null check (worker_type in ('pompiste','chef_brigade','gerant','magasin')),
  worker_id   uuid not null,
  date        date not null default current_date,
  amount      numeric(14,2) not null default 0,
  description text,
  is_paid     boolean not null default false,
  month_paid  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── 4.7  Paie : absences ─────────────────────────────────────────────────────
create table if not exists public.worker_absences (
  id          uuid primary key default gen_random_uuid(),
  worker_type text not null check (worker_type in ('pompiste','chef_brigade','gerant','magasin')),
  worker_id   uuid not null,
  date        date not null default current_date,
  cost        numeric(14,2) not null default 0,
  description text,
  is_paid     boolean not null default false,
  month_paid  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── 4.8  Paie : bulletins de salaire ─────────────────────────────────────────
create table if not exists public.worker_payment_records (
  id               uuid primary key default gen_random_uuid(),
  worker_type      text not null check (worker_type in ('pompiste','chef_brigade','gerant','magasin')),
  worker_id        uuid not null,
  month            text,
  base_salary      numeric(14,2) not null default 0,
  total_acomptes   numeric(14,2) not null default 0,
  total_absences   numeric(14,2) not null default 0,
  bonus_decalage   numeric(14,2) not null default 0,
  retenue_decalage numeric(14,2) not null default 0,
  net_salary       numeric(14,2) not null default 0,
  payment_date     date,
  payment_mode     text,
  cheque_number    text,
  notes            text,
  is_paid          boolean not null default false,
  payment_type     text not null default 'MENSUEL' check (payment_type in ('MENSUEL','JOURNALIER')),
  months_paid      jsonb,
  days_paid        jsonb,
  days_count       numeric(10,2),
  daily_rate       numeric(14,2),
  period_start     date,
  period_end       date,
  prime_type       text check (prime_type in ('POURCENTAGE','MONTANT')),
  prime_value      numeric(14,2),
  prime_amount     numeric(14,2),
  final_amount     numeric(14,2),
  acompte_ids      jsonb,
  absence_ids      jsonb,
  decalage_ids     jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 5 — PARTENAIRES (FOURNISSEURS, CLIENTS, CHAUFFEURS)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 5.1  Chauffeurs ──────────────────────────────────────────────────────────
create table if not exists public.drivers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  status     text not null default 'Actif',
  phone      text,
  email      text,
  address    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── 5.2  Fournisseurs ────────────────────────────────────────────────────────
create table if not exists public.suppliers (
  id              uuid primary key default gen_random_uuid(),
  ref             text,
  name            text not null,
  contact         text,
  phone           text,
  email           text,
  address         text,
  balance         numeric(14,2) not null default 0,
  total_purchases numeric(14,2) not null default 0,
  nif             text,
  nis             text,
  article         text,
  rc              text,
  type            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── 5.3  Clients ─────────────────────────────────────────────────────────────
create table if not exists public.clients (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  phone           text,
  cin             text,
  email           text,
  address         text,
  contact_person  text,
  balance         numeric(14,2) not null default 0,
  debt            numeric(14,2) not null default 0,
  credit_limit    numeric(14,2) not null default 0,
  payment_delay   integer       not null default 0,
  type            text,
  payment_mode    text,
  nif             text,
  nis             text,
  article         text,
  rc              text,
  advance_balance numeric(14,2) not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── 5.4  Rendez-vous de paiement fournisseur ─────────────────────────────────
create table if not exists public.supplier_appointments (
  id          uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  purchase_id uuid,
  date        date not null default current_date,
  amount      numeric(14,2) not null default 0,
  notes       text,
  is_paid     boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ── 5.5  Règlements de dette fournisseur ─────────────────────────────────────
create table if not exists public.supplier_debt_payments (
  id               uuid primary key default gen_random_uuid(),
  supplier_id      uuid not null references public.suppliers(id) on delete cascade,
  purchase_id      uuid,
  delivery_note_id uuid,
  date             date not null default current_date,
  amount           numeric(14,2) not null default 0,
  total_due        numeric(14,2) not null default 0,
  rest             numeric(14,2) not null default 0,
  payment_mode     text,
  cheque_number    text,
  notes            text,
  created_at       timestamptz not null default now()
);

-- ── 5.6  Rendez-vous de paiement client ──────────────────────────────────────
create table if not exists public.client_appointments (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients(id) on delete cascade,
  sale_id    uuid,
  date       date not null default current_date,
  amount     numeric(14,2) not null default 0,
  notes      text,
  is_paid    boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── 5.7  Mouvements de compte client ─────────────────────────────────────────
create table if not exists public.client_transactions (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.clients(id) on delete cascade,
  date              date not null default current_date,
  type              text not null check (type in ('PAYMENT','RECHARGE','SALE')),
  amount            numeric(14,2) not null default 0,
  mode              text,
  receipt_number    text,
  receipt_photo_url text,
  notes             text,
  created_at        timestamptz not null default now()
);


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 6 — MAGASIN : PRODUITS, STOCK, TRANSFERTS
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 6.1  Marques ─────────────────────────────────────────────────────────────
create table if not exists public.product_brands (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── 6.2  Produits ────────────────────────────────────────────────────────────
create table if not exists public.products (
  id                 uuid primary key default gen_random_uuid(),
  ref                text,
  name               text not null,
  category           text,
  buy_price          numeric(14,2) not null default 0,
  selling_price      numeric(14,2) not null default 0,
  last_selling_price numeric(14,2),
  stock              numeric(14,2) not null default 0,
  min_stock          numeric(14,2) not null default 0,
  barcode            text,
  image_url          text,
  unit               text,
  brand              text,
  brand_id           uuid references public.product_brands(id) on delete set null,
  tva_rate           numeric(6,2) not null default 0,
  -- Vente au détail : un bidon de 5 L peut être vendu au litre.
  sell_by_details    boolean not null default false,
  detail_capacity    numeric(14,3),
  detail_unit        text,
  detail_sale_qty    numeric(14,3),
  detail_sale_price  numeric(14,2),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ── 6.3  Stock d'une armoire (une ligne par produit) ─────────────────────────
create table if not exists public.armoire_stock (
  id         uuid primary key default gen_random_uuid(),
  armoire_id uuid not null references public.armoires(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity   numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (armoire_id, product_id)
);

-- ── 6.4  Transferts Magasin → Armoire ────────────────────────────────────────
create table if not exists public.stock_transfers (
  id         uuid primary key default gen_random_uuid(),
  armoire_id uuid not null references public.armoires(id) on delete cascade,
  date       date not null default current_date,
  source     text not null default 'transferts',
  notes      text,
  created_by text,
  total_qty  numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_transfer_items (
  id           uuid primary key default gen_random_uuid(),
  transfer_id  uuid not null references public.stock_transfers(id) on delete cascade,
  product_id   uuid references public.products(id) on delete set null,
  product_name text not null,
  barcode      text,
  quantity     numeric(14,2) not null default 0,
  created_at   timestamptz not null default now()
);


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 7 — ACHATS CARBURANT
--   « Bon de Livraison Facture Payement » : le bon ET son règlement.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 7.1  Bons de livraison facture (BLF) ─────────────────────────────────────
-- Le suivi du règlement vit sur la ligne : `amount_paid`, `rest`,
-- `payment_status`, `is_debt_invoice`. Ces colonnes sont toujours réécrites à
-- partir des reçus (`fuel_receipts`), jamais saisies indépendamment.
create table if not exists public.delivery_notes (
  id                 uuid primary key default gen_random_uuid(),
  date               date not null default current_date,
  supplier_id        uuid references public.suppliers(id) on delete set null,
  tank_id            uuid references public.tanks(id)     on delete set null,
  liters             numeric(14,2) not null default 0,
  price_per_liter    numeric(14,3) not null default 0,
  status             text not null default 'Reçu' check (status in ('Reçu','En attente')),
  total              numeric(14,2) not null default 0,
  expiry_date        date,
  bl_number          text,
  blf_number         text,
  bl_date            date,
  creation_date      date,
  immatriculation    text,
  driver_id          uuid references public.drivers(id) on delete set null,
  -- Rendez-vous de paiement pris sur ce bon
  appointment_date   date,
  appointment_amount numeric(14,2),
  appointment_notes  text,
  -- Règlement
  amount_paid        numeric(14,2) not null default 0,
  rest               numeric(14,2) not null default 0,
  payment_status     text not null default 'Non Payé' check (payment_status in ('Non Payé','Partiel','Payé')),
  is_debt_invoice    boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Colonnes ajoutées après coup : l'ajout est conditionnel pour que le script
-- reste rejouable sur une base déjà installée.
alter table public.delivery_notes add column if not exists is_debt_invoice boolean not null default false;
alter table public.delivery_notes add column if not exists blf_number text;

-- ── 7.2  Cuves livrées par un BLF (multi-cuves) ──────────────────────────────
create table if not exists public.delivery_note_items (
  id               uuid primary key default gen_random_uuid(),
  delivery_note_id uuid not null references public.delivery_notes(id) on delete cascade,
  tank_id          uuid references public.tanks(id) on delete set null,
  liters           numeric(14,2) not null default 0,
  price_per_liter  numeric(14,3) not null default 0,
  total            numeric(14,2) not null default 0,
  created_at       timestamptz not null default now()
);

-- ── 7.3  Scans du BLF ────────────────────────────────────────────────────────
create table if not exists public.delivery_note_photos (
  id               uuid primary key default gen_random_uuid(),
  delivery_note_id uuid not null references public.delivery_notes(id) on delete cascade,
  photo_url        text not null,
  created_at       timestamptz not null default now()
);

-- ── 7.4  Versements historiques attachés au BLF ──────────────────────────────
create table if not exists public.delivery_note_payments (
  id                uuid primary key default gen_random_uuid(),
  delivery_note_id  uuid not null references public.delivery_notes(id) on delete cascade,
  date              date not null default current_date,
  amount            numeric(14,2) not null default 0,
  mode              text,
  receipt_number    text,
  receipt_photo_url text,
  created_at        timestamptz not null default now()
);

-- ── 7.5  Factures carburant (héritage — conservées pour l'historique) ────────
create table if not exists public.fuel_invoices (
  id                 uuid primary key default gen_random_uuid(),
  invoice_number     text not null,
  invoice_date       date not null default current_date,
  creation_date      date  not null default current_date,
  reception_date     date,
  tva_active         boolean not null default false,
  tva_rate           numeric(6,2)  not null default 0,
  subtotal           numeric(14,2) not null default 0,
  tva_amount         numeric(14,2) not null default 0,
  total              numeric(14,2) not null default 0,
  amount_paid        numeric(14,2) not null default 0,
  rest               numeric(14,2) not null default 0,
  status             text not null default 'Non Payé' check (status in ('Payé','Non Payé','Partiel')),
  appointment_date   date,
  appointment_amount numeric(14,2),
  appointment_notes  text,
  invoice_image_url  text,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.fuel_invoice_bls (
  invoice_id       uuid not null references public.fuel_invoices(id)  on delete cascade,
  delivery_note_id uuid not null references public.delivery_notes(id) on delete cascade,
  created_at       timestamptz not null default now(),
  primary key (invoice_id, delivery_note_id)
);

-- ── 7.6  Reçus de paiement carburant ─────────────────────────────────────────
-- UN reçu = UN règlement. Il naît de trois endroits, tous équivalents :
--   · saisi avec le bon (« Bon de Livraison Facture Payement ») ;
--   · saisi depuis l'action « Payer » de l'historique (règlement d'une dette) ;
--   · saisi dans l'onglet Paiements pour solder plusieurs bons d'un coup.
create table if not exists public.fuel_receipts (
  id                           uuid primary key default gen_random_uuid(),
  receipt_number               text not null,
  receipt_date                 date not null default current_date,
  creation_date                date not null default current_date,
  total_invoiced               numeric(14,2) not null default 0,
  amount_paid                  numeric(14,2) not null default 0,
  rest                         numeric(14,2) not null default 0,
  is_debt_payment              boolean not null default false,
  receipt_image_url            text,
  notes                        text,
  bank_name                    text,
  -- Feuille de versement des espèces : { "2000": 10, "1000": 3, … }
  cash_denominations           jsonb   not null default '{}'::jsonb,
  cash_denominations_active    boolean not null default false,
  -- Une déclaration par famille de TAC réglée sur ce reçu
  naftal_declaration_number    text,
  other_tac_declaration_number text,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

-- ── 7.7  BLF réglés par un reçu ──────────────────────────────────────────────
create table if not exists public.fuel_receipt_bls (
  receipt_id       uuid not null references public.fuel_receipts(id)  on delete cascade,
  delivery_note_id uuid not null references public.delivery_notes(id) on delete cascade,
  amount           numeric(14,2) not null default 0,
  created_at       timestamptz not null default now(),
  primary key (receipt_id, delivery_note_id)
);

create table if not exists public.fuel_receipt_invoices (
  receipt_id uuid not null references public.fuel_receipts(id) on delete cascade,
  invoice_id uuid not null references public.fuel_invoices(id) on delete cascade,
  amount     numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  primary key (receipt_id, invoice_id)
);

-- ── 7.8  Lignes de règlement multi-modes ─────────────────────────────────────
-- Un reçu cumule espèces, TPE, TAC et chèques. Le mode TAC produit UNE LIGNE
-- PAR TYPE de TAC servi : c'est elle qui déstocke les TAC correspondants.
create table if not exists public.fuel_receipt_payments (
  id            uuid primary key default gen_random_uuid(),
  receipt_id    uuid not null references public.fuel_receipts(id) on delete cascade,
  method        text not null check (method in ('ESPECES','TPE','TAC','CHEQUE')),
  amount        numeric(14,2) not null default 0,
  cheque_number text,
  bank_name     text,
  tac_category  text check (tac_category in ('NAFTAL','OTHER')),
  tac_type_id   uuid,
  tac_type_name text,
  tac_quantity  numeric(12,2) not null default 0,
  notes         text,
  created_at    timestamptz not null default now()
);


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 8 — TAC & CAISSE TPE
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 8.1  Types de TAC ────────────────────────────────────────────────────────
-- Un type ne porte qu'un nom et une valeur unitaire : le nombre de TAC détenus
-- n'est JAMAIS stocké, il se recalcule toujours depuis tac_movements (IN − OUT).
create table if not exists public.tac_types (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  value      numeric(14,2) not null default 0,
  category   text not null default 'NAFTAL' check (category in ('NAFTAL','OTHER')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── 8.2  Mouvements de TAC ───────────────────────────────────────────────────
create table if not exists public.tac_movements (
  id            uuid primary key default gen_random_uuid(),
  tac_type_id   uuid not null references public.tac_types(id) on delete cascade,
  date          date not null default current_date,
  direction     text not null check (direction in ('IN','OUT')),
  quantity      numeric(12,2) not null default 0,
  source        text not null default 'MANUEL',
  brigade_id    uuid,
  accounting_id uuid,
  receipt_id    uuid references public.fuel_receipts(id) on delete cascade,
  pompiste_id   uuid references public.pompistes(id) on delete set null,
  pompiste_name text,
  label         text,
  amount        numeric(14,2) not null default 0,
  notes         text,
  created_at    timestamptz not null default now()
);

-- ── 8.3  Banques ─────────────────────────────────────────────────────────────
create table if not exists public.banks (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

-- ── 8.4  Journal de la caisse TPE ────────────────────────────────────────────
create table if not exists public.tpe_movements (
  id            uuid primary key default gen_random_uuid(),
  date          date not null default current_date,
  direction     text not null check (direction in ('IN','OUT')),
  amount        numeric(14,2) not null default 0,
  source        text not null default 'MANUEL',
  brigade_id    uuid,
  accounting_id uuid,
  receipt_id    uuid references public.fuel_receipts(id) on delete cascade,
  pompiste_id   uuid references public.pompistes(id) on delete set null,
  pompiste_name text,
  client_name   text,
  fuel_type     text,
  liters        numeric(14,2) not null default 0,
  label         text,
  notes         text,
  created_at    timestamptz not null default now()
);

-- ── 8.5  Justificatifs TPE/TAC saisis en comptabilité de brigade ─────────────
create table if not exists public.tpe_transactions (
  id              uuid primary key default gen_random_uuid(),
  brigade_id      uuid,
  accounting_id   uuid,
  date            date not null default current_date,
  mode            text,
  client_name     text,
  client_id       uuid references public.clients(id) on delete set null,
  fuel_type       text,
  liters          numeric(14,2) not null default 0,
  price_per_liter numeric(14,3) not null default 0,
  amount          numeric(14,2) not null default 0,
  track_id        uuid references public.tracks(id) on delete set null,
  track_name      text,
  pompiste_id     uuid references public.pompistes(id) on delete set null,
  pompiste_name   text,
  notes           text,
  created_at      timestamptz not null default now()
);


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 9 — BRIGADES & COMPTABILITÉ
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 9.1  Brigades ────────────────────────────────────────────────────────────
create table if not exists public.brigades (
  id                    uuid primary key default gen_random_uuid(),
  date                  date not null default current_date,
  shift                 text,
  chef_id               uuid references public.brigade_chefs(id) on delete set null,
  status                text not null default 'En cours',
  start_timestamp       text,
  end_timestamp         text,
  start_time            text,
  end_time              text,
  start_datetime        timestamptz,
  end_datetime          timestamptz,
  is_active             boolean not null default true,
  notes                 text,
  printed_at            timestamptz,
  start_indices         jsonb not null default '{}'::jsonb,
  end_indices           jsonb not null default '{}'::jsonb,
  start_tank_levels     jsonb not null default '{}'::jsonb,
  end_tank_levels       jsonb not null default '{}'::jsonb,
  pompiste_data         jsonb not null default '{}'::jsonb,
  pompiste_assignments  jsonb not null default '[]'::jsonb,
  start_nozzle_indices  jsonb not null default '{}'::jsonb,
  end_nozzle_indices    jsonb not null default '{}'::jsonb,
  active_nozzle_ids     jsonb not null default '[]'::jsonb,
  can_reactivate        boolean not null default false,
  tank_levels_active    boolean not null default true,
  active_tank_ids       jsonb not null default '[]'::jsonb,
  broken_nozzle_ids     jsonb not null default '[]'::jsonb,
  armoire_sales         jsonb not null default '[]'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ── 9.2  Pompistes d'une brigade ─────────────────────────────────────────────
create table if not exists public.brigade_pompiste_assignments (
  brigade_id  uuid not null references public.brigades(id)  on delete cascade,
  pompiste_id uuid not null references public.pompistes(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (brigade_id, pompiste_id)
);

-- ── 9.3  Comptabilité d'une brigade ──────────────────────────────────────────
create table if not exists public.brigade_accounting (
  id                        uuid primary key default gen_random_uuid(),
  brigade_id                uuid not null references public.brigades(id) on delete cascade,
  total_due                 numeric(14,2) not null default 0,
  cash_received             numeric(14,2) not null default 0,
  rest                      numeric(14,2) not null default 0,
  tank_summary              jsonb not null default '[]'::jsonb,
  nozzle_summary            jsonb not null default '[]'::jsonb,
  decalage_summary          jsonb not null default '{}'::jsonb,
  cuve_verifications        jsonb not null default '{}'::jsonb,
  nozzle_verifications      jsonb not null default '{}'::jsonb,
  pompiste_summary          jsonb not null default '{}'::jsonb,
  cash_denominations        jsonb not null default '{}'::jsonb,
  rest_assigned_worker_type text,
  rest_assigned_worker_id   uuid,
  rest_assigned_amount      numeric(14,2) not null default 0,
  status                    text not null default 'draft',
  created_by                text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- ── 9.4  Justificatifs de comptabilité ───────────────────────────────────────
create table if not exists public.brigade_accounting_justifications (
  id                 uuid primary key default gen_random_uuid(),
  accounting_id      uuid not null references public.brigade_accounting(id) on delete cascade,
  client_id          uuid references public.clients(id) on delete set null,
  amount             numeric(14,2) not null default 0,
  client_type        text,
  payment_mode       text,
  notes              text,
  justification_type text not null default 'CLIENT',
  client_name        text,
  fuel_type          text,
  liters             numeric(14,2) not null default 0,
  price_per_liter    numeric(14,3) not null default 0,
  track_id           uuid references public.tracks(id) on delete set null,
  pompiste_id        uuid references public.pompistes(id) on delete set null,
  tac_items          jsonb not null default '[]'::jsonb,
  created_at         timestamptz not null default now()
);

-- ── 9.5  Historique de décalage par pompiste ─────────────────────────────────
create table if not exists public.pompiste_decalage_history (
  id          uuid primary key default gen_random_uuid(),
  pompiste_id uuid not null references public.pompistes(id) on delete cascade,
  brigade_id  uuid references public.brigades(id) on delete set null,
  date        date not null default current_date,
  amount      numeric(14,2) not null default 0,
  type        text not null check (type in ('BONUS','RETENUE')),
  is_paid     boolean not null default false,
  month_paid  text,
  created_at  timestamptz not null default now()
);

-- ── 9.6  Alertes de décalage ─────────────────────────────────────────────────
create table if not exists public.brigade_decalage_alerts (
  id              uuid primary key default gen_random_uuid(),
  brigade_id      uuid references public.brigades(id) on delete cascade,
  brigade_date    date,
  start_datetime  timestamptz,
  end_datetime    timestamptz,
  chef_id         uuid references public.brigade_chefs(id) on delete set null,
  chef_name       text,
  alert_type      text not null check (alert_type in ('CORRECT','RETOUR_CUVE','VENTE_DIRECTE')),
  tank_id         uuid references public.tanks(id) on delete set null,
  tank_name       text,
  pompiste_id     uuid references public.pompistes(id) on delete set null,
  pompiste_name   text,
  decalage_liters numeric(14,2) not null default 0,
  decalage_amount numeric(14,2) not null default 0,
  workers_info    jsonb not null default '[]'::jsonb,
  is_dismissed    boolean not null default false,
  created_at      timestamptz not null default now()
);

-- Les mouvements TAC/TPE référencent une brigade et une comptabilité : les FK
-- sont posées maintenant que les deux tables existent.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tac_movements_brigade_id_fkey') then
    alter table public.tac_movements add constraint tac_movements_brigade_id_fkey
      foreign key (brigade_id) references public.brigades(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tac_movements_accounting_id_fkey') then
    alter table public.tac_movements add constraint tac_movements_accounting_id_fkey
      foreign key (accounting_id) references public.brigade_accounting(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tpe_movements_brigade_id_fkey') then
    alter table public.tpe_movements add constraint tpe_movements_brigade_id_fkey
      foreign key (brigade_id) references public.brigades(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tpe_movements_accounting_id_fkey') then
    alter table public.tpe_movements add constraint tpe_movements_accounting_id_fkey
      foreign key (accounting_id) references public.brigade_accounting(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tpe_transactions_brigade_id_fkey') then
    alter table public.tpe_transactions add constraint tpe_transactions_brigade_id_fkey
      foreign key (brigade_id) references public.brigades(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tpe_transactions_accounting_id_fkey') then
    alter table public.tpe_transactions add constraint tpe_transactions_accounting_id_fkey
      foreign key (accounting_id) references public.brigade_accounting(id) on delete cascade;
  end if;
end $$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 10 — VENTES
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 10.1  Ventes carburant ───────────────────────────────────────────────────
create table if not exists public.fuel_sales (
  id              uuid primary key default gen_random_uuid(),
  date            date not null default current_date,
  pump_id         uuid references public.pumps(id) on delete set null,
  liters          numeric(14,2) not null default 0,
  price_per_liter numeric(14,3) not null default 0,
  total           numeric(14,2) not null default 0,
  payment_mode    text not null default 'ESPECES' check (payment_mode in ('ESPECES','BON','CHEQUE','CREDIT','AVANCE')),
  client_id       uuid references public.clients(id)   on delete set null,
  bon_number      text,
  bon_photo_url   text,
  pompiste_id     uuid references public.pompistes(id) on delete set null,
  brigade_id      uuid references public.brigades(id)  on delete cascade,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── 10.2  Ventes magasin ─────────────────────────────────────────────────────
create table if not exists public.shop_sales (
  id                uuid primary key default gen_random_uuid(),
  date              date not null default current_date,
  client_id         uuid references public.clients(id) on delete set null,
  seller_id         uuid,
  subtotal          numeric(14,2) not null default 0,
  tva_amount        numeric(14,2) not null default 0,
  total             numeric(14,2) not null default 0,
  payment_mode      text not null default 'ESPECES' check (payment_mode in ('ESPECES','CHEQUE','CREDIT','AVANCE','BON')),
  cheque_number     text,
  bon_number        text,
  bon_photo_url     text,
  amount_paid       numeric(14,2) not null default 0,
  rest              numeric(14,2) not null default 0,
  status            text not null default 'Payé' check (status in ('Payé','Dette')),
  notes             text,
  printed_at        timestamptz,
  invoice_image_url text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.shop_sale_items (
  id           uuid primary key default gen_random_uuid(),
  sale_id      uuid not null references public.shop_sales(id) on delete cascade,
  product_id   uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity     numeric(14,3) not null default 0,
  price        numeric(14,2) not null default 0,
  tva          numeric(6,2)  not null default 0,
  created_at   timestamptz not null default now()
);

-- ── 10.3  Ventes depuis une armoire (pendant une brigade) ────────────────────
create table if not exists public.armoire_sales (
  id           uuid primary key default gen_random_uuid(),
  armoire_id   uuid references public.armoires(id)  on delete set null,
  brigade_id   uuid references public.brigades(id)  on delete cascade,
  pompiste_id  uuid references public.pompistes(id) on delete set null,
  product_id   uuid references public.products(id)  on delete set null,
  product_name text not null,
  quantity     numeric(14,2) not null default 0,
  price        numeric(14,2) not null default 0,
  total        numeric(14,2) not null default 0,
  date         timestamptz not null default now(),
  created_at   timestamptz not null default now()
);


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 11 — ACHATS MAGASIN, DÉPENSES, INVENTAIRES, RAPPORTS
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 11.1  Achats magasin ─────────────────────────────────────────────────────
create table if not exists public.purchases (
  id                      uuid primary key default gen_random_uuid(),
  date                    date not null default current_date,
  supplier_id             uuid references public.suppliers(id) on delete set null,
  invoice_number          text,
  due_date                date,
  driver_id               uuid references public.drivers(id) on delete set null,
  total                   numeric(14,2) not null default 0,
  amount_paid             numeric(14,2) not null default 0,
  rest                    numeric(14,2) not null default 0,
  status                  text not null default 'À payer' check (status in ('Payé','Partiel','À payer','En attente livraison')),
  payment_mode            text check (payment_mode in ('ESPECES','CHEQUE','CREDIT','VIREMENT')),
  cheque_number           text,
  linked_delivery_note_id uuid references public.delivery_notes(id) on delete set null,
  notes                   text,
  type                    text not null default 'RECEPTION' check (type in ('COMMANDE','RECEPTION')),
  tva_rate                numeric(6,2) not null default 0,
  tva_active              boolean not null default false,
  tank_id                 uuid references public.tanks(id) on delete set null,
  receipt_photo_url       text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create table if not exists public.purchase_items (
  id            uuid primary key default gen_random_uuid(),
  purchase_id   uuid not null references public.purchases(id) on delete cascade,
  product_id    uuid references public.products(id) on delete set null,
  product_name  text not null,
  quantity      numeric(14,3) not null default 0,
  buy_price     numeric(14,2) not null default 0,
  selling_price numeric(14,2) not null default 0,
  min_stock     numeric(14,2),
  unit          text,
  total         numeric(14,2) not null default 0,
  tank_id       uuid references public.tanks(id) on delete set null,
  tva_active    boolean not null default false,
  tva_rate      numeric(6,2) not null default 0,
  created_at    timestamptz not null default now()
);

create table if not exists public.purchase_payments (
  id            uuid primary key default gen_random_uuid(),
  purchase_id   uuid not null references public.purchases(id) on delete cascade,
  date          date not null default current_date,
  amount        numeric(14,2) not null default 0,
  mode          text not null default 'ESPECES' check (mode in ('ESPECES','CHEQUE','VIREMENT')),
  cheque_number text,
  notes         text,
  created_at    timestamptz not null default now()
);

-- Les rendez-vous et règlements fournisseur peuvent viser un achat magasin.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'supplier_appointments_purchase_id_fkey') then
    alter table public.supplier_appointments add constraint supplier_appointments_purchase_id_fkey
      foreign key (purchase_id) references public.purchases(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'supplier_debt_payments_purchase_id_fkey') then
    alter table public.supplier_debt_payments add constraint supplier_debt_payments_purchase_id_fkey
      foreign key (purchase_id) references public.purchases(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'supplier_debt_payments_delivery_note_id_fkey') then
    alter table public.supplier_debt_payments add constraint supplier_debt_payments_delivery_note_id_fkey
      foreign key (delivery_note_id) references public.delivery_notes(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'client_appointments_sale_id_fkey') then
    alter table public.client_appointments add constraint client_appointments_sale_id_fkey
      foreign key (sale_id) references public.shop_sales(id) on delete cascade;
  end if;
end $$;

-- ── 11.2  Dépenses ───────────────────────────────────────────────────────────
create table if not exists public.expenses (
  id            uuid primary key default gen_random_uuid(),
  date          date not null default current_date,
  category      text,
  amount        numeric(14,2) not null default 0,
  description   text,
  payment_mode  text,
  cheque_number text,
  paid_by       text,
  recipient     text,
  status        text,
  receipt_url   text,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── 11.3  Inventaires ────────────────────────────────────────────────────────
create table if not exists public.inventories (
  id                uuid primary key default gen_random_uuid(),
  name              text,
  description       text,
  date              date not null default current_date,
  user_name         text,
  type              text check (type in ('Carburant','Magasin')),
  status            text not null default 'En cours' check (status in ('En cours','Validé','Comparé')),
  fuel_gaps         jsonb not null default '[]'::jsonb,
  pump_index_gaps   jsonb not null default '[]'::jsonb,
  product_gaps      jsonb not null default '[]'::jsonb,
  adjustment_reason text,
  adjusted_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── 11.4  Fiches journalières ────────────────────────────────────────────────
create table if not exists public.daily_reports (
  id              uuid primary key default gen_random_uuid(),
  date            date not null default current_date,
  fuel_revenue    numeric(14,2) not null default 0,
  shop_revenue    numeric(14,2) not null default 0,
  total_expenses  numeric(14,2) not null default 0,
  cash_to_deposit numeric(14,2) not null default 0,
  tank_variations jsonb not null default '[]'::jsonb,
  brigade_ids     jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 12 — DÉCLENCHEURS `updated_at`
-- ═══════════════════════════════════════════════════════════════════════════════

do $$
declare
  t text;
  tables text[] := array[
    'admin_profiles','permission_templates','tracks','tanks','pumps','pump_nozzles',
    'armoires','pompistes','brigade_chefs','gerants','magasin_workers',
    'worker_acomptes','worker_absences','worker_payment_records',
    'drivers','suppliers','clients','product_brands','products','armoire_stock',
    'stock_transfers','delivery_notes','fuel_invoices','fuel_receipts','tac_types',
    'brigades','brigade_accounting','fuel_sales','shop_sales','purchases',
    'expenses','inventories'
  ];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists trg_%1$s_updated on public.%1$I', t);
    execute format(
      'create trigger trg_%1$s_updated before update on public.%1$I
       for each row execute function public.set_updated_at()', t);
  end loop;
end $$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 13 — INDEX
-- ═══════════════════════════════════════════════════════════════════════════════

create index if not exists idx_nozzles_pump          on public.pump_nozzles(pump_id);
create index if not exists idx_nozzles_track         on public.pump_nozzles(track_id);

create index if not exists idx_pompistes_auth        on public.pompistes(auth_user_id);
create index if not exists idx_pompistes_track       on public.pompistes(track_id);
create index if not exists idx_pompistes_chef        on public.pompistes(chef_id);
create index if not exists idx_chefs_auth            on public.brigade_chefs(auth_user_id);
create index if not exists idx_gerants_auth          on public.gerants(auth_user_id);
create index if not exists idx_magasin_auth          on public.magasin_workers(auth_user_id);

create index if not exists idx_acomptes_worker       on public.worker_acomptes(worker_type, worker_id);
create index if not exists idx_absences_worker       on public.worker_absences(worker_type, worker_id);
create index if not exists idx_payrecords_worker     on public.worker_payment_records(worker_type, worker_id);

create index if not exists idx_dn_supplier           on public.delivery_notes(supplier_id);
create index if not exists idx_dn_date               on public.delivery_notes(date desc);
create index if not exists idx_dn_blf                on public.delivery_notes(blf_number);
create index if not exists idx_dn_payment_status     on public.delivery_notes(payment_status);
create index if not exists idx_dn_items_note         on public.delivery_note_items(delivery_note_id);
create index if not exists idx_dn_photos_note        on public.delivery_note_photos(delivery_note_id);
create index if not exists idx_dn_payments_note      on public.delivery_note_payments(delivery_note_id);

create index if not exists idx_receipts_date         on public.fuel_receipts(receipt_date desc);
create index if not exists idx_receipt_bls_note      on public.fuel_receipt_bls(delivery_note_id);
create index if not exists idx_receipt_lines_receipt on public.fuel_receipt_payments(receipt_id);

create index if not exists idx_tac_mov_type          on public.tac_movements(tac_type_id);
create index if not exists idx_tac_mov_receipt       on public.tac_movements(receipt_id);
create index if not exists idx_tpe_mov_receipt       on public.tpe_movements(receipt_id);

create index if not exists idx_brigades_date         on public.brigades(date desc);
create index if not exists idx_accounting_brigade    on public.brigade_accounting(brigade_id);
create index if not exists idx_justif_accounting     on public.brigade_accounting_justifications(accounting_id);

create index if not exists idx_fuel_sales_brigade    on public.fuel_sales(brigade_id);
create index if not exists idx_fuel_sales_date       on public.fuel_sales(date desc);
create index if not exists idx_shop_sales_date       on public.shop_sales(date desc);
create index if not exists idx_shop_items_sale       on public.shop_sale_items(sale_id);

create index if not exists idx_purchase_items_p      on public.purchase_items(purchase_id);
create index if not exists idx_purchase_payments_p   on public.purchase_payments(purchase_id);
create index if not exists idx_client_tx_client      on public.client_transactions(client_id);
create index if not exists idx_armoire_stock_ar      on public.armoire_stock(armoire_id);
create index if not exists idx_transfer_items_t      on public.stock_transfer_items(transfer_id);


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 14 — FONCTIONS RPC APPELÉES PAR L'APPLICATION
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 14.1  Existe-t-il déjà un administrateur ? ───────────────────────────────
-- Appelée par l'écran de connexion AVANT toute authentification (rôle anon).
--   false → le bouton « Créer un compte administrateur » s'affiche ;
--   true  → il disparaît automatiquement, définitivement.
create or replace function public.has_admin_account()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_profiles);
$$;

grant execute on function public.has_admin_account() to anon, authenticated;

-- ── 14.2  Email ou nom d'utilisateur → email du compte ───────────────────────
-- Permet à CHAQUE compte — administrateur comme employé — de se connecter avec
-- son nom d'utilisateur à la place de son email. Renvoie NULL si l'identifiant
-- n'est pas connu ; l'application retombe alors sur ce qui a été saisi et c'est
-- Supabase Auth qui refuse, jamais cette fonction (aucune fuite d'information
-- sur l'existence d'un compte).
create or replace function public.resolve_login_email(p_identifier text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id    text := lower(trim(p_identifier));
  v_email text;
begin
  if v_id is null or v_id = '' then return null; end if;
  -- Un identifiant contenant « @ » est déjà une adresse email.
  if position('@' in v_id) > 0 then return v_id; end if;

  select email into v_email from public.admin_profiles  where lower(username) = v_id limit 1;
  if v_email is not null then return v_email; end if;

  select coalesce(email, username || '@workers.station.local') into v_email
    from public.pompistes       where lower(username) = v_id limit 1;
  if v_email is not null then return v_email; end if;

  select coalesce(email, username || '@workers.station.local') into v_email
    from public.brigade_chefs   where lower(username) = v_id limit 1;
  if v_email is not null then return v_email; end if;

  select coalesce(email, username || '@workers.station.local') into v_email
    from public.gerants         where lower(username) = v_id limit 1;
  if v_email is not null then return v_email; end if;

  select coalesce(email, username || '@workers.station.local') into v_email
    from public.magasin_workers where lower(username) = v_id limit 1;
  if v_email is not null then return v_email; end if;

  -- Dernier recours : l'identifiant a pu être stocké dans les métadonnées auth.
  select u.email into v_email
    from auth.users u
   where lower(u.raw_user_meta_data->>'username') = v_id
   limit 1;

  return v_email;
end;
$$;

grant execute on function public.resolve_login_email(text) to anon, authenticated;

-- ── 14.3  Création du PREMIER administrateur ─────────────────────────────────
-- Écrit dans auth.users + auth.identities + admin_profiles, et REFUSE de
-- s'exécuter dès qu'un administrateur existe. Le compte est utilisable
-- immédiatement : email confirmé d'office, aucune validation à faire.
create or replace function public.create_first_admin(
  p_email    text,
  p_password text,
  p_name     text,
  p_username text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid   uuid := gen_random_uuid();
  v_email text := lower(trim(p_email));
begin
  if exists (select 1 from public.admin_profiles) then
    return jsonb_build_object('ok', false, 'error', 'Un compte administrateur existe déjà.');
  end if;
  if v_email is null or v_email = '' then
    return jsonb_build_object('ok', false, 'error', 'L''email est requis.');
  end if;
  if p_password is null or length(p_password) < 6 then
    return jsonb_build_object('ok', false, 'error', 'Le mot de passe doit avoir au moins 6 caractères.');
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    return jsonb_build_object('ok', false, 'error', 'Cet email est déjà utilisé.');
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
    v_email, extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('name', p_name, 'username', lower(trim(p_username)), 'role', 'admin'),
    now(), now(), '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_uid, v_uid::text,
    jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  insert into public.admin_profiles (id, name, username, email, role)
  values (v_uid, coalesce(nullif(trim(p_name), ''), 'Administrateur'),
          nullif(lower(trim(p_username)), ''), v_email, 'admin');

  return jsonb_build_object('ok', true, 'auth_user_id', v_uid);
exception when others then
  return jsonb_build_object('ok', false, 'error', SQLERRM);
end;
$$;

grant execute on function public.create_first_admin(text, text, text, text) to anon, authenticated;

-- ── 14.4  Rôle de l'utilisateur connecté ─────────────────────────────────────
-- Renvoie 'admin', 'pompiste', 'chef_brigade', 'gerant', 'magasin' ou NULL.
-- NULL est volontaire : un compte auth sans fiche associée n'a AUCUN accès.
create or replace function public.get_my_role()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return null; end if;
  if exists (select 1 from public.admin_profiles  where id = v_uid)           then return 'admin';        end if;
  if exists (select 1 from public.pompistes       where auth_user_id = v_uid) then return 'pompiste';     end if;
  if exists (select 1 from public.brigade_chefs   where auth_user_id = v_uid) then return 'chef_brigade'; end if;
  if exists (select 1 from public.gerants         where auth_user_id = v_uid) then return 'gerant';       end if;
  if exists (select 1 from public.magasin_workers where auth_user_id = v_uid) then return 'magasin';      end if;
  return null;
end;
$$;

grant execute on function public.get_my_role() to anon, authenticated;

-- ── 14.5  Fiche de l'employé connecté ────────────────────────────────────────
-- Renvoie la ligne complète (dont `permissions`) du travailleur connecté.
-- C'est cette réponse qui construit SA barre latérale et débloque les boutons
-- d'action de chaque interface. NULL pour un administrateur.
create or replace function public.get_my_worker()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row jsonb;
begin
  if v_uid is null then return null; end if;

  select to_jsonb(p) into v_row from public.pompistes p       where p.auth_user_id = v_uid limit 1;
  if v_row is not null then return v_row || jsonb_build_object('worker_type', 'pompiste'); end if;

  select to_jsonb(c) into v_row from public.brigade_chefs c   where c.auth_user_id = v_uid limit 1;
  if v_row is not null then return v_row || jsonb_build_object('worker_type', 'chef_brigade'); end if;

  select to_jsonb(g) into v_row from public.gerants g         where g.auth_user_id = v_uid limit 1;
  if v_row is not null then return v_row || jsonb_build_object('worker_type', 'gerant'); end if;

  select to_jsonb(m) into v_row from public.magasin_workers m where m.auth_user_id = v_uid limit 1;
  if v_row is not null then return v_row || jsonb_build_object('worker_type', 'magasin'); end if;

  return null;
end;
$$;

grant execute on function public.get_my_worker() to anon, authenticated;

-- ── 14.6  Comptes des employés ───────────────────────────────────────────────
-- Crée / met à jour / supprime le compte Supabase Auth d'un employé, et relie
-- `auth_user_id` sur sa fiche. Un employé sans email reçoit l'adresse technique
-- <username>@workers.station.local : il se connecte alors simplement avec son
-- nom d'utilisateur (voir resolve_login_email).
create or replace function public.provision_worker_account(
  p_action      text,
  p_worker_type text,
  p_worker_id   uuid,
  p_username    text default null,
  p_password    text default null,
  p_name        text default null,
  p_email       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid      uuid;
  v_email    text;
  v_existing uuid;
  v_table    text;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'error', 'Seul un administrateur peut gérer les comptes.');
  end if;

  v_table := case p_worker_type
    when 'pompiste'     then 'pompistes'
    when 'chef_brigade' then 'brigade_chefs'
    when 'gerant'       then 'gerants'
    when 'magasin'      then 'magasin_workers'
    else null end;
  if v_table is null then
    return jsonb_build_object('ok', false, 'error', 'Type de travailleur inconnu : ' || coalesce(p_worker_type, 'null'));
  end if;

  execute format('select auth_user_id from public.%I where id = $1', v_table)
    into v_existing using p_worker_id;

  -- ── Création ───────────────────────────────────────────────────────────────
  if p_action = 'create' then
    if p_username is null or trim(p_username) = '' then
      return jsonb_build_object('ok', false, 'error', 'Le nom d''utilisateur est requis.');
    end if;
    if p_password is null or length(p_password) < 6 then
      return jsonb_build_object('ok', false, 'error', 'Le mot de passe doit avoir au moins 6 caractères.');
    end if;

    v_email := lower(coalesce(nullif(trim(p_email), ''), trim(p_username) || '@workers.station.local'));

    if exists (select 1 from auth.users where lower(email) = v_email) then
      return jsonb_build_object('ok', false, 'error', 'Cet email / nom d''utilisateur est déjà utilisé.');
    end if;

    v_uid := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
      v_email, extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('name', p_name, 'username', lower(trim(p_username)), 'role', p_worker_type),
      now(), now(), '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_uid, v_uid::text,
      jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
      'email', now(), now(), now()
    );

    execute format(
      'update public.%I set auth_user_id = $1, username = $2, has_access = true,
                            email = coalesce(nullif($3, ''''), email) where id = $4', v_table)
      using v_uid, lower(trim(p_username)), nullif(trim(p_email), ''), p_worker_id;

    return jsonb_build_object('ok', true, 'auth_user_id', v_uid, 'email', v_email);

  -- ── Changement de mot de passe ─────────────────────────────────────────────
  elsif p_action = 'update_password' then
    if v_existing is null then
      return jsonb_build_object('ok', false, 'error', 'Cet employé n''a pas encore de compte.');
    end if;
    if p_password is null or length(p_password) < 6 then
      return jsonb_build_object('ok', false, 'error', 'Le mot de passe doit avoir au moins 6 caractères.');
    end if;

    update auth.users
       set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
           updated_at = now()
     where id = v_existing;

    if p_username is not null and trim(p_username) <> '' then
      execute format('update public.%I set username = $1 where id = $2', v_table)
        using lower(trim(p_username)), p_worker_id;
      update auth.users
         set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                                  || jsonb_build_object('username', lower(trim(p_username)))
       where id = v_existing;
    end if;

    return jsonb_build_object('ok', true, 'auth_user_id', v_existing);

  -- ── Suppression ────────────────────────────────────────────────────────────
  elsif p_action = 'delete' then
    if v_existing is not null then
      delete from auth.identities where user_id = v_existing;
      delete from auth.users      where id      = v_existing;
    end if;
    execute format('update public.%I set auth_user_id = null, has_access = false where id = $1', v_table)
      using p_worker_id;
    return jsonb_build_object('ok', true);
  end if;

  return jsonb_build_object('ok', false, 'error', 'Action inconnue : ' || coalesce(p_action, 'null'));
exception when others then
  return jsonb_build_object('ok', false, 'error', SQLERRM);
end;
$$;

grant execute on function public.provision_worker_account(text, text, uuid, text, text, text, text) to authenticated;

-- ── 14.7  Ajustement ATOMIQUE d'un niveau de cuve ────────────────────────────
-- Une livraison, une vente ou un inventaire n'écrit jamais un niveau absolu
-- calculé côté navigateur : chacun envoie son DELTA, appliqué ici en une seule
-- instruction. Deux sessions simultanées ne peuvent donc pas s'écraser.
create or replace function public.adjust_tank_level(p_tank_id uuid, p_delta numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new numeric;
begin
  update public.tanks
     set current = greatest(0, current + p_delta),
         updated_at = now()
   where id = p_tank_id
   returning current into v_new;
  return v_new;
end;
$$;

grant execute on function public.adjust_tank_level(uuid, numeric) to authenticated;

-- ── 14.8  Ajustement ATOMIQUE du stock d'une armoire ─────────────────────────
create or replace function public.adjust_armoire_stock(
  p_armoire_id uuid,
  p_product_id uuid,
  p_delta      numeric
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new numeric;
begin
  insert into public.armoire_stock as s (armoire_id, product_id, quantity)
  values (p_armoire_id, p_product_id, greatest(0, p_delta))
  on conflict (armoire_id, product_id) do update
    set quantity = greatest(0, s.quantity + p_delta),
        updated_at = now()
  returning s.quantity into v_new;
  return v_new;
end;
$$;

grant execute on function public.adjust_armoire_stock(uuid, uuid, numeric) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 15 — ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Principe :
--   · Toutes les tables métier sont accessibles aux comptes AUTHENTIFIÉS.
--     Ce qu'un employé peut réellement voir et faire est décidé, interface par
--     interface et bouton par bouton, par sa colonne `permissions` — c'est elle
--     qui construit sa barre latérale et qui affiche (ou non) chaque action.
--   · Les tables sensibles sont plus strictes :
--       - `admin_profiles`      : chacun lit/écrit SON profil ; l'admin lit tout ;
--       - tables de travailleurs : écriture réservée à l'admin, sauf la mise à
--         jour de sa propre fiche par l'employé lui-même (page « Mon profil ») ;
--       - `permission_templates` : réservée à l'administrateur.
--   · Aucun accès anonyme aux données : seul l'écran de connexion parle à la
--     base, et uniquement par trois fonctions SECURITY DEFINER.
-- ───────────────────────────────────────────────────────────────────────────────

-- Active la RLS sur TOUTES les tables du schéma public.
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end $$;

-- ── 15.1  Tables métier : accès complet aux comptes authentifiés ─────────────
do $$
declare
  t text;
  tables text[] := array[
    'station_settings','activity_log',
    'tracks','tanks','pumps','pump_nozzles','cuve_reglages','armoires',
    'chef_pompiste_assignments','worker_acomptes','worker_absences','worker_payment_records',
    'drivers','suppliers','clients','supplier_appointments','supplier_debt_payments',
    'client_appointments','client_transactions',
    'product_brands','products','armoire_stock','stock_transfers','stock_transfer_items',
    'delivery_notes','delivery_note_items','delivery_note_photos','delivery_note_payments',
    'fuel_invoices','fuel_invoice_bls','fuel_receipts','fuel_receipt_bls',
    'fuel_receipt_invoices','fuel_receipt_payments',
    'tac_types','tac_movements','banks','tpe_movements','tpe_transactions',
    'brigades','brigade_pompiste_assignments','brigade_accounting',
    'brigade_accounting_justifications','pompiste_decalage_history','brigade_decalage_alerts',
    'fuel_sales','shop_sales','shop_sale_items','armoire_sales',
    'purchases','purchase_items','purchase_payments',
    'expenses','inventories','daily_reports'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists "auth_all_%1$s" on public.%1$I', t);
    execute format(
      'create policy "auth_all_%1$s" on public.%1$I
         for all to authenticated
         using (auth.uid() is not null)
         with check (auth.uid() is not null)', t);
  end loop;
end $$;

-- ── 15.2  Profils administrateurs ────────────────────────────────────────────
drop policy if exists "admin_profiles_select" on public.admin_profiles;
create policy "admin_profiles_select" on public.admin_profiles
  for select to authenticated using (auth.uid() is not null);

drop policy if exists "admin_profiles_update_self" on public.admin_profiles;
create policy "admin_profiles_update_self" on public.admin_profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists "admin_profiles_insert_admin" on public.admin_profiles;
create policy "admin_profiles_insert_admin" on public.admin_profiles
  for insert to authenticated with check (public.is_admin());

drop policy if exists "admin_profiles_delete_admin" on public.admin_profiles;
create policy "admin_profiles_delete_admin" on public.admin_profiles
  for delete to authenticated using (public.is_admin());

-- ── 15.3  Modèles de permissions : administrateur uniquement ─────────────────
drop policy if exists "permission_templates_read" on public.permission_templates;
create policy "permission_templates_read" on public.permission_templates
  for select to authenticated using (auth.uid() is not null);

drop policy if exists "permission_templates_write" on public.permission_templates;
create policy "permission_templates_write" on public.permission_templates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── 15.4  Tables de travailleurs ─────────────────────────────────────────────
-- Lecture pour tout compte authentifié (l'application a besoin de résoudre les
-- noms, les affectations de piste, les chefs…). Écriture réservée à l'admin —
-- à une exception près : chacun peut mettre à jour SA PROPRE fiche depuis
-- « Mon profil ». Un employé ne peut donc pas s'accorder des permissions sur la
-- fiche d'un autre.
do $$
declare
  t text;
  tables text[] := array['pompistes','brigade_chefs','gerants','magasin_workers'];
begin
  foreach t in array tables loop
    execute format('drop policy if exists "%1$s_select" on public.%1$I', t);
    execute format(
      'create policy "%1$s_select" on public.%1$I
         for select to authenticated using (auth.uid() is not null)', t);

    execute format('drop policy if exists "%1$s_insert_admin" on public.%1$I', t);
    execute format(
      'create policy "%1$s_insert_admin" on public.%1$I
         for insert to authenticated with check (public.is_admin())', t);

    execute format('drop policy if exists "%1$s_update" on public.%1$I', t);
    execute format(
      'create policy "%1$s_update" on public.%1$I
         for update to authenticated
         using (public.is_admin() or auth_user_id = auth.uid())
         with check (public.is_admin() or auth_user_id = auth.uid())', t);

    execute format('drop policy if exists "%1$s_delete_admin" on public.%1$I', t);
    execute format(
      'create policy "%1$s_delete_admin" on public.%1$I
         for delete to authenticated using (public.is_admin())', t);
  end loop;
end $$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 16 — BUCKETS DE STOCKAGE
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Un bucket par famille d'images de l'application. Tous PUBLICS en lecture
-- (l'interface affiche les photos par URL directe) ; l'envoi, le remplacement
-- et la suppression sont réservés aux comptes authentifiés.
--
--   station-logos     → logo de la station (Paramètres)
--   product-images    → photos des produits du magasin
--   worker-photos     → photos des employés ET avatar de l'administrateur
--   bon-photos        → photos des bons de vente carburant / magasin
--   delivery-photos   → scans des Bons de Livraison Facture
--   invoices          → scans des reçus de paiement carburant et factures
--   expense-receipts  → justificatifs de dépenses
--   client-receipts   → reçus de règlement client
-- ───────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values
  ('station-logos',    'station-logos',    true),
  ('product-images',   'product-images',   true),
  ('worker-photos',    'worker-photos',    true),
  ('bon-photos',       'bon-photos',       true),
  ('delivery-photos',  'delivery-photos',  true),
  ('invoices',         'invoices',         true),
  ('expense-receipts', 'expense-receipts', true),
  ('client-receipts',  'client-receipts',  true)
on conflict (id) do update set public = true;

do $$
declare
  b text;
  buckets text[] := array[
    'station-logos','product-images','worker-photos','bon-photos',
    'delivery-photos','invoices','expense-receipts','client-receipts'
  ];
begin
  foreach b in array buckets loop
    -- Lecture publique : les <img src="…"> fonctionnent sans jeton.
    execute format('drop policy if exists "public_read_%s" on storage.objects', b);
    execute format(
      'create policy "public_read_%1$s" on storage.objects
         for select to public using (bucket_id = %2$L)', b, b);

    -- Envoi / remplacement / suppression : comptes authentifiés uniquement.
    execute format('drop policy if exists "auth_insert_%s" on storage.objects', b);
    execute format(
      'create policy "auth_insert_%1$s" on storage.objects
         for insert to authenticated with check (bucket_id = %2$L)', b, b);

    execute format('drop policy if exists "auth_update_%s" on storage.objects', b);
    execute format(
      'create policy "auth_update_%1$s" on storage.objects
         for update to authenticated
         using (bucket_id = %2$L) with check (bucket_id = %2$L)', b, b);

    execute format('drop policy if exists "auth_delete_%s" on storage.objects', b);
    execute format(
      'create policy "auth_delete_%1$s" on storage.objects
         for delete to authenticated using (bucket_id = %2$L)', b, b);
  end loop;
end $$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 17 — TEMPS RÉEL
-- ═══════════════════════════════════════════════════════════════════════════════
-- L'application s'abonne à ces tables : toute écriture faite ailleurs (autre
-- poste, autre session) rafraîchit l'écran sans rechargement.

do $$
declare
  t text;
  tables text[] := array[
    'tanks','pumps','pump_nozzles','tracks','armoires','armoire_stock',
    'pompistes','brigade_chefs','gerants','magasin_workers',
    'brigades','brigade_accounting','brigade_decalage_alerts',
    'clients','suppliers','products','product_brands',
    'delivery_notes','delivery_note_items','fuel_receipts','fuel_receipt_payments',
    'fuel_sales','shop_sales','purchases','expenses','inventories',
    'tac_types','tac_movements','tpe_movements','banks',
    'stock_transfers','station_settings'
  ];
begin
  foreach t in array tables loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      -- Le temps réel est un confort, jamais un prérequis : aucune de ces
      -- situations ne doit faire échouer l'installation.
      --   · table déjà publiée ;
      --   · publication absente sur cette instance ;
      --   · publication déclarée FOR ALL TABLES (tout est déjà publié).
      when others then null;
    end;
  end loop;
end $$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION 18 — DROITS DE SCHÉMA
-- ═══════════════════════════════════════════════════════════════════════════════

grant usage on schema public to anon, authenticated;
grant all on all tables    in schema public to authenticated;
grant all on all sequences in schema public to authenticated;
grant all on all functions in schema public to authenticated;

alter default privileges in schema public grant all on tables    to authenticated;
alter default privileges in schema public grant all on sequences to authenticated;
alter default privileges in schema public grant all on functions to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════════
--  INSTALLATION TERMINÉE
-- ───────────────────────────────────────────────────────────────────────────────
--  Étapes suivantes, dans l'ordre :
--
--   1. Ouvrez l'application. L'écran de connexion affiche le bouton
--      « Créer un compte administrateur » — il n'apparaît que parce qu'aucun
--      administrateur n'existe encore.
--
--   2. Créez ce compte (nom, nom d'utilisateur, email, mot de passe). Le bouton
--      DISPARAÎT alors automatiquement et définitivement : `has_admin_account()`
--      renvoie désormais `true` à chaque ouverture de la page.
--
--   3. Connectez-vous avec votre email OU votre nom d'utilisateur.
--
--   4. Créez vos employés (Pompistes / Chefs de Brigade / Gérants / Employés
--      Magasin). Cocher « Accès à l'application » leur crée un compte
--      Supabase Auth ; ils se connectent avec leur nom d'utilisateur ou leur
--      email.
--
--   5. Ouvrez « Permissions » sur chaque employé : les interfaces cochées sont
--      exactement celles qui apparaîtront dans SA barre latérale, et les actions
--      cochées (Créer / Modifier / Supprimer / Imprimer / Exporter / Scanner /
--      Générer) sont exactement les boutons qu'il verra sur chacune. Un employé
--      sans permission ne voit que son tableau de bord.
-- ═══════════════════════════════════════════════════════════════════════════════
