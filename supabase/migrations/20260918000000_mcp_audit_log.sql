create table public.mcp_audit_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete restrict,
  client_id text not null check (char_length(client_id) between 1 and 200),
  tool_name text not null check (tool_name in (
    'get_finance_overview',
    'list_budget_categories',
    'list_open_dues'
  )),
  called_at timestamptz not null default now()
);

create index mcp_audit_log_user_called_at_idx
  on public.mcp_audit_log (user_id, called_at desc);

revoke all on public.mcp_audit_log from anon, authenticated;
grant select, insert on public.mcp_audit_log to authenticated;
alter table public.mcp_audit_log enable row level security;

create policy "admins can view their MCP audit records"
  on public.mcp_audit_log for select to authenticated
  using (user_id = auth.uid() and public.is_admin());

create policy "admins can record their MCP calls"
  on public.mcp_audit_log for insert to authenticated
  with check (user_id = auth.uid() and public.is_admin());
