-- 身体図のペン描画と、後から移動できる楕円・症状文字を分離して保存する。
-- image_data: 従来互換の合成PNG
-- base_image_data: ペン等の固定描画PNG
-- overlay_data: 楕円・症状文字の位置/形状/色など

alter table public.nakano_body_charts
  add column if not exists base_image_data text,
  add column if not exists overlay_data jsonb not null default '[]'::jsonb;

update public.nakano_body_charts
set base_image_data = image_data
where base_image_data is null;

alter table public.nakano_body_charts
  drop constraint if exists nakano_body_charts_overlay_array_check;

alter table public.nakano_body_charts
  add constraint nakano_body_charts_overlay_array_check
  check (jsonb_typeof(overlay_data) = 'array');
