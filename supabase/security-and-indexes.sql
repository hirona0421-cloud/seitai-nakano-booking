-- 整体なかの：管理RPC権限と補助インデックス
-- 本番DBへ適用済み。GitHub側の参照・復旧用。

create index if not exists nakano_body_charts_updated_by_idx
  on public.nakano_body_charts (updated_by)
  where updated_by is not null;

create index if not exists nakano_karte_records_booking_id_idx
  on public.nakano_karte_records (booking_id)
  where booking_id is not null;

revoke execute on function public.nakano_admin_delete_test_customer(uuid) from public, anon;
grant execute on function public.nakano_admin_delete_test_customer(uuid) to authenticated, service_role;

revoke execute on function public.nakano_admin_reset_initial_karte(uuid) from public, anon;
grant execute on function public.nakano_admin_reset_initial_karte(uuid) to authenticated, service_role;
