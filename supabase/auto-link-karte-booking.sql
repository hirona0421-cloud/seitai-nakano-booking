-- 整体なかの：施術記録を予約へ自動紐付け
-- 同一顧客・同一日・確定予約が1件だけの場合に booking_id を自動設定する。
-- 同日に複数予約がある場合は誤紐付けを避けるため自動設定しない。

create or replace function public.nakano_auto_link_karte_booking()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_booking_id uuid;
begin
  if new.booking_id is not null or new.customer_id is null or new.visit_date is null then
    return new;
  end if;

  select case when count(*) = 1 then (array_agg(b.id order by b.start_time))[1] else null end
    into v_booking_id
  from public.nakano_bookings b
  where b.customer_id = new.customer_id
    and b.booking_date = new.visit_date
    and b.status = 'confirmed';

  if v_booking_id is not null then
    new.booking_id := v_booking_id;
  end if;

  return new;
end;
$$;

revoke all on function public.nakano_auto_link_karte_booking() from public, anon;
grant execute on function public.nakano_auto_link_karte_booking() to authenticated, service_role;

drop trigger if exists nakano_auto_link_karte_booking_trigger on public.nakano_karte_records;
create trigger nakano_auto_link_karte_booking_trigger
before insert or update of customer_id, visit_date, booking_id
on public.nakano_karte_records
for each row
execute function public.nakano_auto_link_karte_booking();

update public.nakano_karte_records k
set booking_id = (
  select b.id
  from public.nakano_bookings b
  where b.customer_id = k.customer_id
    and b.booking_date = k.visit_date
    and b.status = 'confirmed'
  order by b.start_time
  limit 1
)
where k.booking_id is null
  and 1 = (
    select count(*)
    from public.nakano_bookings b
    where b.customer_id = k.customer_id
      and b.booking_date = k.visit_date
      and b.status = 'confirmed'
  );
