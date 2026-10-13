-- =====================================================================
--  Yahma: "ops" role without a branch = sees all branches
-- ---------------------------------------------------------------------
--  The problem: any ops/view account with an empty profiles.branch_name
--  made yahma_can_access_branch() return false  =>  zero rows  =>
--  "empty fleet" with no error message at all.
--
--  New rule (clearer for users and far less surprising):
--    * branch_name empty  =>  sees ALL branches
--    * branch_name set    =>  sees ONLY that branch
--  Roles are unchanged: admin still has full control.
--
--  Note: this widens READ access for ops/view accounts that have no
--  branch assigned. To narrow it again, just assign them a branch in
--  "User Management". Write/delete stays limited by the manage rule.
-- =====================================================================

-- 1) Read access: all branches when no branch is assigned
create or replace function public.yahma_can_access_branch(vehicle_branch text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.yahma_is_admin()
    or exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role in ('ops', 'view')
        and (
          nullif(trim(coalesce(branch_name, '')), '') is null
          or trim(branch_name) = trim(coalesce(vehicle_branch, ''))
        )
    );
$$;

-- 2) Write access: same rule (no branch => all branches)
create or replace function public.yahma_can_manage_branch(vehicle_branch text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.yahma_is_admin()
    or exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role = 'ops'
        and (
          nullif(trim(coalesce(branch_name, '')), '') is null
          or trim(branch_name) = trim(coalesce(vehicle_branch, ''))
        )
    );
$$;

-- 3) Sanity check after running (run it as your admin account)
select public.yahma_is_admin() as you_are_admin;

-- 4) Optional: inspect current accounts
-- select full_name, role,
--        coalesce(nullif(trim(branch_name), ''), '(all branches)') as branch,
--        allowed_tabs
-- from public.profiles
-- order by full_name;