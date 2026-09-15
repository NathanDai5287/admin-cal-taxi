-- Fixture identities: active member, admin, uninvited account, archived member.
insert into public.profiles values
 ('00000000-0000-0000-0000-000000000001', 'Same Name', 'member', null),
 ('00000000-0000-0000-0000-000000000002', 'Same Name', 'admin', null),
 ('00000000-0000-0000-0000-000000000003', 'Uninvited', 'none', null),
 ('00000000-0000-0000-0000-000000000004', 'Archived', 'member', now());

create function pg_temp.expect_rejected(statement text) returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    return;
  end;
  raise exception 'Expected rejection: %', statement;
end;
$$;
select pg_temp.expect_rejected($q$insert into public.chapter_receivables (id, member_name) values (2, 'Arbitrary name')$q$);
select pg_temp.expect_rejected($q$insert into public.chapter_receivables (id, member_name, member_id) values (2, 'Uninvited', '00000000-0000-0000-0000-000000000003')$q$);
select pg_temp.expect_rejected($q$insert into public.chapter_receivables (id, member_name, member_id) values (2, 'Archived', '00000000-0000-0000-0000-000000000004')$q$);
insert into public.chapter_receivables (id, member_name, member_id, amount_assessed)
 values (2, 'Forged label', '00000000-0000-0000-0000-000000000001', 100);
insert into public.chapter_receivables (id, member_name, member_id, amount_assessed)
 values (3, 'Forged label', '00000000-0000-0000-0000-000000000002', 100);
select pg_temp.expect_rejected($q$update public.chapter_receivables set member_name = 'Someone else' where id = 2$q$);
-- Legacy balances are preserved and can still receive payments, then be explicitly linked.
update public.chapter_receivables set amount_paid = 30 where id = 1;
update public.chapter_receivables set member_id = '00000000-0000-0000-0000-000000000001' where id = 1;
-- Archiving does not prevent settling existing obligations.
update public.profiles set removed_at = now() where id = '00000000-0000-0000-0000-000000000001';
update public.chapter_receivables set amount_paid = 100 where id = 2;

insert into public.reimbursements(id) values (1);
select pg_temp.expect_rejected($q$update public.reimbursements set reimbursed = true where id = 1$q$);
select pg_temp.expect_rejected($q$update public.reimbursements set status = 'approved' where id = 1$q$);
update public.reimbursements set status = 'verified' where id = 1;
update public.reimbursements set status = 'approved' where id = 1;
update public.reimbursements set reimbursed = true where id = 1;
select pg_temp.expect_rejected($q$update public.reimbursements set status = 'denied' where id = 1$q$);
select pg_temp.expect_rejected($q$update public.reimbursements set status = 'denied', reimbursed = false where id = 1$q$);
update public.reimbursements set reimbursed = false where id = 1;
update public.reimbursements set status = 'denied' where id = 1;
select pg_temp.expect_rejected($q$update public.reimbursements set reimbursed = true where id = 1$q$);

insert into public.reimbursement_budget_entries values (2, 900, 'forecast');
do $$begin
  if (select sum(amount) from public.reimbursement_budget_entries where kind = 'income') <> 100 then
    raise exception 'Forecast changed actual income';
  end if;
  if (select count(distinct member_id) from public.chapter_receivables where id in (2, 3)) <> 2 then
    raise exception 'Members with the same name were merged';
  end if;
  if (select member_name from public.chapter_receivables where id = 2) <> 'Same Name' then
    raise exception 'Member name was not derived from account';
  end if;
end$$;

update public.profiles set removed_at = null where id = '00000000-0000-0000-0000-000000000001';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select pg_temp.expect_rejected($q$insert into public.reimbursement_manual_expenses values (1, 20, auth.uid(), null)$q$);
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select pg_temp.expect_rejected($q$insert into public.reimbursement_manual_expenses values (1, 20, auth.uid(), null)$q$);
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
insert into public.reimbursement_manual_expenses values (1, 20, auth.uid(), null);
insert into public.reimbursement_manual_expenses values (2, 30, auth.uid(), 'manual/example.png');
reset role;
do $$begin
  if (select count(*) from public.reimbursement_manual_expenses) <> 2 then
    raise exception 'Admin transactions with and without receipts did not persist';
  end if;
end$$;
select 'Finance database boundary checks passed' as result;
