-- Customer booking calendar + 30-minute booking cutoff
-- Applied to production on 2026-08-15.

create or replace function public.nakano_available_slots(p_date date, p_menu_id text)
returns table(start_time time without time zone)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_minutes integer;
  v_blocks integer;
  v_now_jst timestamp without time zone := now() at time zone 'Asia/Tokyo';
begin
  select minutes into v_minutes
  from public.nakano_menus
  where id=p_menu_id and is_active=true;

  if v_minutes is null then raise exception 'Invalid menu'; end if;
  v_blocks := (v_minutes + 14) / 15;

  return query
  select s.start_time
  from public.nakano_open_slots s
  where s.slot_date=p_date
    and s.is_open=true
    and mod(extract(minute from s.start_time)::int,15)=0
    and p_date >= v_now_jst::date
    and (p_date + s.start_time) >= (v_now_jst + interval '30 minutes')
    and (
      select count(*) from generate_series(0,v_blocks-1) g(n)
      where exists (
        select 1 from public.nakano_open_slots x
        where x.slot_date=p_date
          and x.start_time=(s.start_time + make_interval(mins=>g.n*15))::time
          and x.is_open=true
      )
    )=v_blocks
    and not exists (
      select 1 from public.nakano_bookings b
      where b.booking_date=p_date and b.status='confirmed'
        and tsrange(p_date+b.start_time,p_date+b.start_time+make_interval(mins=>b.minutes),'[)')
          && tsrange(p_date+s.start_time,p_date+s.start_time+make_interval(mins=>v_minutes),'[)')
    )
    and not exists (
      select 1 from public.nakano_blocked_times bt
      where bt.blocked_date=p_date
        and tsrange(p_date+bt.start_time,p_date+bt.end_time,'[)')
          && tsrange(p_date+s.start_time,p_date+s.start_time+make_interval(mins=>v_minutes),'[)')
    )
  order by s.start_time;
end;
$function$;

create or replace function public.nakano_month_availability(p_month date, p_menu_id text)
returns table(slot_date date, available_count bigint, first_time time without time zone)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_first date := date_trunc('month',p_month)::date;
  v_last date := (date_trunc('month',p_month) + interval '1 month - 1 day')::date;
begin
  if not exists(select 1 from public.nakano_menus where id=p_menu_id and is_active=true) then
    raise exception 'Invalid menu';
  end if;

  return query
  select d::date,
         count(s.start_time)::bigint,
         min(s.start_time)
  from generate_series(v_first,v_last,interval '1 day') d
  left join lateral public.nakano_available_slots(d::date,p_menu_id) s on true
  group by d
  order by d;
end;
$function$;

revoke execute on function public.nakano_month_availability(date,text) from public;
grant execute on function public.nakano_month_availability(date,text) to anon, authenticated, service_role;

-- The production migration also updates nakano_create_booking and
-- nakano_customer_change_booking so a customer cannot create or move a booking
-- to a start time less than 30 minutes from the current Japan time.
