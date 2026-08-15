-- 整体なかの：身体図クラウド保存
-- Supabase SQL Editor で1回だけ実行する想定。
-- 実行前後も body-chart.html は localStorage にフォールバックするため、
-- 予約・カルテの既存機能は停止しません。

create table if not exists public.nakano_body_charts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.nakano_customers(id) on delete cascade,
  visit_date date not null,
  image_data text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (customer_id, visit_date)
);

create index if not exists nakano_body_charts_customer_date_idx
  on public.nakano_body_charts (customer_id, visit_date desc);

alter table public.nakano_body_charts enable row level security;

drop policy if exists "nakano_body_charts_authenticated_select" on public.nakano_body_charts;
create policy "nakano_body_charts_authenticated_select"
  on public.nakano_body_charts
  for select
  to authenticated
  using (true);

drop policy if exists "nakano_body_charts_authenticated_insert" on public.nakano_body_charts;
create policy "nakano_body_charts_authenticated_insert"
  on public.nakano_body_charts
  for insert
  to authenticated
  with check (auth.uid() = updated_by);

drop policy if exists "nakano_body_charts_authenticated_update" on public.nakano_body_charts;
create policy "nakano_body_charts_authenticated_update"
  on public.nakano_body_charts
  for update
  to authenticated
  using (true)
  with check (auth.uid() = updated_by);

drop policy if exists "nakano_body_charts_authenticated_delete" on public.nakano_body_charts;
create policy "nakano_body_charts_authenticated_delete"
  on public.nakano_body_charts
  for delete
  to authenticated
  using (true);

comment on table public.nakano_body_charts is
  '整体なかの電子カルテの身体図。顧客IDと施術日で1件、描画PNG(data URL)を保存する。';
