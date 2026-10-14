-- =====================================================================
--  Yahma: inspection payment queue (pending + paid)
-- ---------------------------------------------------------------------
--  Adds a single table that backs BOTH tabs:
--     • "under payment"  → status = 'pending'
--     • "paid"           → status = 'paid'
--  One place, so the flow is:
--     inspection renewal → request payment → under payment → paid → license renewal
--  Run this once in Supabase → SQL Editor. Safe to re-run.
-- =====================================================================

create table if not exists public.inspection_payments (
  id           uuid primary key default gen_random_uuid(),
  car_id       text not null,
  plate        text,
  branch       text,
  status       text not null default 'pending'
                 check (status in ('pending', 'paid', 'cancelled')),
  requested_at timestamptz not null default now(),
  paid_at      timestamptz,
  note         text,
  created_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now(),
  unique (car_id, requested_at)
);

create index if not exists inspection_payments_status_idx
  on public.inspection_payments (status, requested_at desc);

alter table public.inspection_payments enable row level security;

-- Everyone signed in may read the queue; writes are admin/ops only.
drop policy if exists "inspection_payments_select_authenticated"
  on public.inspection_payments;
create policy "inspection_payments_select_authenticated"
  on public.inspection_payments for select
  to authenticated
  using (true);

drop policy if exists "inspection_payments_insert_admin_ops"
  on public.inspection_payments;
create policy "inspection_payments_insert_admin_ops"
  on public.inspection_payments for insert
  to authenticated
  with check (public.yahma_is_ops_or_admin());

drop policy if exists "inspection_payments_update_admin_ops"
  on public.inspection_payments;
create policy "inspection_payments_update_admin_ops"
  on public.inspection_payments for update
  to authenticated
  using (public.yahma_is_ops_or_admin())
  with check (public.yahma_is_ops_or_admin());

drop policy if exists "inspection_payments_delete_admin_ops"
  on public.inspection_payments;
create policy "inspection_payments_delete_admin_ops"
  on public.inspection_payments for delete
  to authenticated
  using (public.yahma_is_ops_or_admin());

-- keep updated_at fresh
create or replace function public.touch_inspection_payments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists inspection_payments_touch on public.inspection_payments;
create trigger inspection_payments_touch
  before update on public.inspection_payments
  for each row execute function public.touch_inspection_payments();