do $$
declare routine_definition text;
begin
  select pg_get_functiondef('public.mcp_admin_write(text, jsonb, uuid, boolean)'::regprocedure) into routine_definition;
  if position('merchant = coalesce(p_payload ->> ''merchant'', merchant),' in routine_definition) = 0 then
    raise exception 'mcp_admin_write no longer updates merchant as expected';
  end if;
  execute replace(routine_definition,
    'merchant = coalesce(p_payload ->> ''merchant'', merchant),',
    'merchant = coalesce(p_payload ->> ''merchant'', merchant),
        description = coalesce(nullif(trim(p_payload ->> ''description''), ''''), description),');
end;
$$;
