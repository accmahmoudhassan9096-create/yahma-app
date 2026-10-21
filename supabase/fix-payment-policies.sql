-- =====================================================================
--  Yahma: fix RLS helper for writes
-- ---------------------------------------------------------------------
--  The write policies used public.yahma_is_ops_or_admin(), which is a
--  "security definer" function that reads profiles. When the caller's
--  JWT is missing/expired, auth.uid() returns null, the EXISTS query
--  returns no rows, and the helper returns NULL (not false).
--
--  Postgres then rejects the INSERT with:
--      new row violates row-level security policy
--
--  Fix: make the write policies explicit and NULL-safe, so they evaluate
--  to false (a clean "denied") instead of NULL (an opaque error), and so
--  an admin/ops account always passes regardless of helper caching.
--
--  Run once in Supabase → SQL Editor. Safe to re-run.
-- =====================================================================

-- 1) Explicit, NULL-safe write policy for inspection_payments
drop policy if exists "inspection_payments_insert_admin_ops" on public.inspection_payments;
create policy "inspection_payments_insert_admin_ops"
  on public.inspection_payments for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'manager', 'ops')
    )
  );

drop policy if exists "inspection_payments_update_admin_ops" on public.inspection_payments;
create policy "inspection_payments_update_admin_ops"
  on public.inspection_payments for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'manager', 'ops')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'manager', 'ops')
    )
  );

drop policy if exists "inspection_payments_delete_admin_ops" on public.inspection_payments;
create policy "inspection_payments_delete_admin_ops"
  on public.inspection_payments for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'manager', 'ops')
    )
  );

-- 2) Same hardening for branch_contacts (admin only)
drop policy if exists "branch_contacts_write_admin" on public.branch_contacts;
create policy "branch_contacts_write_admin"
  on public.branch_contacts for insert
  to authenticated
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists "branch_contacts_update_admin" on public.branch_contacts;
create policy "branch_contacts_update_admin"
  on public.branch_contacts for update
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "branch_contacts_delete_admin" on public.branch_contacts;
create policy "branch_contacts_delete_admin"
  on public.branch_contacts for delete
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- 3) Confirm the read policy is still open to any signed-in user
drop policy if exists "inspection_payments_select_authenticated" on public.inspection_payments;
create policy "inspection_payments_select_authenticated"
  on public.inspection_payments for select
  to authenticated
  using (true);