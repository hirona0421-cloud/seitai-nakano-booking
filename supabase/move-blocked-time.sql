-- 予約不可／予定を15分単位で安全に移動する管理者用RPC
create or replace function public.nakano_admin_move_blocked_time(
  p_blocked_id text,
  p_start_time time without time zone
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  bt public.nakano_blocked_times%rowtype;
  v_start_min integer;
  v_end_min integer;
  v_duration integer;
  v_new_start_min integer;
  v_new_end_min integer;
  v_store_end time without time zone;
begin
  if auth.uid() is null then
    raise exception '管理者ログインが必要です';
  end if;

  if mod(extract(minute from p_start_time)::int,15)<>0 then
    raise exception '15分単位で指定してください';
  end if;

  select * into bt
  from public.nakano_blocked_times
  where id::text = p_blocked_id
  for update;

  if not found then
    raise exception '予約不可時間が見つかりません';
  end if;

  if bt.start_time = time '00:00:00' and bt.end_time >= time '23:59:00' then
    raise exception '終日予約不可は移動できません';
  end if;

  v_start_min := extract(hour from bt.start_time)::int * 60 + extract(minute from bt.start_time)::int;
  v_end_min := case
    when bt.end_time >= time '23:59:00' then 24 * 60
    else extract(hour from bt.end_time)::int * 60 + extract(minute from bt.end_time)::int
  end;
  v_duration := v_end_min - v_start_min;
  v_new_start_min := extract(hour from p_start_time)::int * 60 + extract(minute from p_start_time)::int;
  v_new_end_min := v_new_start_min + v_duration;

  if v_duration <= 0 then
    raise exception '予約不可時間の長さが不正です';
  end if;

  if v_new_end_min > 24 * 60 then
    raise exception '日付をまたぐ位置には移動できません';
  end if;

  v_store_end := case
    when v_new_end_min = 24 * 60 then time '23:59:00'
    else (p_start_time + make_interval(mins => v_duration))::time
  end;

  perform pg_advisory_xact_lock(hashtext('nakano-' || bt.blocked_date::text));

  if exists (
    select 1
    from public.nakano_bookings b
    where b.booking_date = bt.blocked_date
      and b.status = 'confirmed'
      and tsrange(
        bt.blocked_date + b.start_time,
        bt.blocked_date + b.start_time + make_interval(mins => b.minutes),
        '[)'
      ) && tsrange(
        bt.blocked_date + p_start_time,
        bt.blocked_date + p_start_time + make_interval(mins => v_duration),
        '[)'
      )
  ) then
    raise exception '予約と重なります';
  end if;

  if exists (
    select 1
    from public.nakano_blocked_times x
    where x.blocked_date = bt.blocked_date
      and x.id <> bt.id
      and tsrange(
        bt.blocked_date + x.start_time,
        bt.blocked_date + x.end_time,
        '[)'
      ) && tsrange(
        bt.blocked_date + p_start_time,
        bt.blocked_date + p_start_time + make_interval(mins => v_duration),
        '[)'
      )
  ) then
    raise exception '別の予約不可時間と重なります';
  end if;

  update public.nakano_blocked_times
  set start_time = p_start_time,
      end_time = v_store_end
  where id = bt.id;
end;
$$;

revoke all on function public.nakano_admin_move_blocked_time(text,time without time zone) from public;
revoke all on function public.nakano_admin_move_blocked_time(text,time without time zone) from anon;
grant execute on function public.nakano_admin_move_blocked_time(text,time without time zone) to authenticated;
grant execute on function public.nakano_admin_move_blocked_time(text,time without time zone) to service_role;
