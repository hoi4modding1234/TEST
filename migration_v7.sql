-- ════════════════════════════════════════════════════════════════════════════
--  느린우편 — Migration v7: 친구 시스템 + 편지 휴지통
--  사용법: Supabase SQL Editor → 새 쿼리 → 전체 붙여넣기 → RUN
-- ════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
--  LETTERS — 친구 신청 메타데이터 + 휴지통 컬럼
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.letters
  add column if not exists friend_kind text default null,           -- null | 'request' | 'accept'
  add column if not exists friend_request_id uuid default null,     -- 어느 신청에 대한 편지인지
  add column if not exists trashed_at timestamptz default null;     -- 휴지통에 들어간 시점

-- 친구 편지 종류 검증
alter table public.letters
  drop constraint if exists letters_friend_kind_chk;
alter table public.letters
  add constraint letters_friend_kind_chk
  check (friend_kind is null or friend_kind in ('request', 'accept'));

-- 휴지통/이메일 조회용 인덱스
create index if not exists letters_trash_idx on public.letters(to_user, trashed_at)
  where trashed_at is not null;

-- 친구 신청 조회용 인덱스
create index if not exists letters_friend_req_idx on public.letters(friend_request_id)
  where friend_request_id is not null;


-- ─────────────────────────────────────────────────────────────────────────────
--  FRIEND_REQUESTS — 친구 신청 상태 추적
--  state 흐름:
--    'sent'      신청 편지 발송됨, 아직 도착 안 했거나 미수령
--    'received'  수신자가 신청 편지를 봉투 뜯어서 읽음, 답신 대기 중
--    'accepted'  수신자가 답신 보내고 그 답신이 신청자에게 도착함 (= 친구)
--    'expired'   미수령 7일 또는 받았지만 7일 내 답신 없음 → 자동 만료
--    'discarded' 수신자가 신청 편지를 휴지통에 버림 (묵시적 거절)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.friend_requests (
  id            uuid primary key default gen_random_uuid(),
  from_user     uuid not null references public.profiles(id) on delete cascade,
  to_user       uuid not null references public.profiles(id) on delete cascade,
  request_letter_id uuid references public.letters(id) on delete set null,
  accept_letter_id  uuid references public.letters(id) on delete set null,
  state         text not null default 'sent'
                check (state in ('sent','received','accepted','expired','discarded')),
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz default null,
  -- 같은 (from, to) 페어로 활성 신청 한 개만 존재 가능 (DB 레벨 제약은 부분 인덱스로)
  constraint fr_no_self check (from_user <> to_user)
);

-- 활성 신청(미해결) 은 (from, to) 페어로 유일 — 종료된 신청은 여러 개 가능
create unique index if not exists friend_requests_active_uq
  on public.friend_requests (from_user, to_user)
  where state in ('sent','received');

create index if not exists friend_requests_to_idx
  on public.friend_requests (to_user, state);

create index if not exists friend_requests_from_idx
  on public.friend_requests (from_user, state);

alter table public.friend_requests enable row level security;

-- 본인이 발신·수신자인 신청만 조회 가능
drop policy if exists "fr_select_own" on public.friend_requests;
create policy "fr_select_own"
  on public.friend_requests for select
  to authenticated
  using (from_user = auth.uid() or to_user = auth.uid());


-- ─────────────────────────────────────────────────────────────────────────────
--  FRIENDSHIPS — 친구 관계 (양방향)
--  최소 정렬 (a < b) 로 한 행만 저장하여 중복 방지
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.friendships (
  user_a    uuid not null references public.profiles(id) on delete cascade,
  user_b    uuid not null references public.profiles(id) on delete cascade,
  since     timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);

create index if not exists friendships_a_idx on public.friendships(user_a);
create index if not exists friendships_b_idx on public.friendships(user_b);

alter table public.friendships enable row level security;

-- 자신이 포함된 친구 관계만 조회
drop policy if exists "friendships_select_own" on public.friendships;
create policy "friendships_select_own"
  on public.friendships for select
  to authenticated
  using (user_a = auth.uid() or user_b = auth.uid());

-- 양쪽이 다 자신을 끊을 수 있음
drop policy if exists "friendships_delete_own" on public.friendships;
create policy "friendships_delete_own"
  on public.friendships for delete
  to authenticated
  using (user_a = auth.uid() or user_b = auth.uid());


-- ─────────────────────────────────────────────────────────────────────────────
--  FRIEND_REQUESTS RPCs
-- ─────────────────────────────────────────────────────────────────────────────

-- 신청 가능 여부 확인 — UI 에서 표시용
-- 반환값:
--   'ok'           신청 가능
--   'already_friends'   이미 친구
--   'pending_out'  내가 보낸 활성 신청이 이미 있음
--   'pending_in'   상대가 나에게 보낸 활성 신청이 있음 (역으로 응답해야)
--   'cooldown'     최근 만료/거절된 지 7일 이내
--   'self'         자기 자신
create or replace function public.friend_request_eligibility(target uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  ua uuid; ub uuid;
  recent_resolved timestamptz;
begin
  if uid is null then raise exception '인증 필요'; end if;
  if target = uid then return 'self'; end if;

  -- 이미 친구
  if uid < target then ua := uid; ub := target; else ua := target; ub := uid; end if;
  if exists(select 1 from public.friendships where user_a = ua and user_b = ub) then
    return 'already_friends';
  end if;

  -- 활성 신청 (양방향 검사)
  if exists(select 1 from public.friend_requests
            where from_user = uid and to_user = target
              and state in ('sent','received')) then
    return 'pending_out';
  end if;
  if exists(select 1 from public.friend_requests
            where from_user = target and to_user = uid
              and state in ('sent','received')) then
    return 'pending_in';
  end if;

  -- 7일 쿨다운: 가장 최근에 종결된 (나→상대) 신청 기준
  select resolved_at into recent_resolved
    from public.friend_requests
   where from_user = uid and to_user = target
     and state in ('expired','discarded')
   order by resolved_at desc limit 1;
  if recent_resolved is not null and recent_resolved > now() - interval '7 days' then
    return 'cooldown';
  end if;

  return 'ok';
end;
$$;
revoke all on function public.friend_request_eligibility(uuid) from public, anon;
grant execute on function public.friend_request_eligibility(uuid) to authenticated;


-- 친구 신청 편지 발송 — letters.insert + friend_request 생성을 트랜잭션으로
-- 주의: letter row 자체는 클라이언트가 별도로 INSERT 하지 않고 이 RPC 가 처리
create or replace function public.send_friend_request(
  to_user_id uuid,
  letter_id uuid,
  letter_payload jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  fr_id uuid;
  elig text;
begin
  if uid is null then raise exception '인증 필요'; end if;
  elig := public.friend_request_eligibility(to_user_id);
  if elig <> 'ok' then
    raise exception '신청 불가: %', elig;
  end if;

  -- 신청 row 먼저 (편지에 friend_request_id 박을 수 있도록)
  insert into public.friend_requests (from_user, to_user, request_letter_id, state)
  values (uid, to_user_id, letter_id, 'sent')
  returning id into fr_id;

  -- 편지 INSERT — letter_payload 의 모든 필드를 추출
  insert into public.letters (
    id, from_user, from_username, from_location_name, from_lat, from_lng,
    to_user, to_username,
    title, body, body_html, images, distance,
    sent_at, deliver_at,
    paper_style, envelope_style, stamp_id, seal_color, seal_symbol,
    friend_kind, friend_request_id
  ) values (
    letter_id,
    uid,
    letter_payload->>'from_username',
    letter_payload->>'from_location_name',
    (letter_payload->>'from_lat')::double precision,
    (letter_payload->>'from_lng')::double precision,
    to_user_id,
    letter_payload->>'to_username',
    coalesce(letter_payload->>'title', ''),
    coalesce(letter_payload->>'body', ''),
    coalesce(letter_payload->>'body_html', ''),
    coalesce(array(select jsonb_array_elements_text(letter_payload->'images')), array[]::text[]),
    (letter_payload->>'distance')::double precision,
    (letter_payload->>'sent_at')::timestamptz,
    (letter_payload->>'deliver_at')::timestamptz,
    coalesce(letter_payload->>'paper_style', 'cream'),
    coalesce(letter_payload->>'envelope_style', 'cream'),
    coalesce(letter_payload->>'stamp_id', 'standard'),
    coalesce(letter_payload->>'seal_color', 'crimson'),
    coalesce(letter_payload->>'seal_symbol', ''),
    'request',
    fr_id
  );

  return fr_id;
end;
$$;
revoke all on function public.send_friend_request(uuid, uuid, jsonb) from public, anon;
grant execute on function public.send_friend_request(uuid, uuid, jsonb) to authenticated;


-- 수락 답신 발송 — accept letter + 친구 관계 확정 트리거(답신 도착 시)
create or replace function public.send_accept_reply(
  request_id uuid,
  letter_id uuid,
  letter_payload jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  fr public.friend_requests%rowtype;
begin
  if uid is null then raise exception '인증 필요'; end if;

  select * into fr from public.friend_requests where id = request_id;
  if not found then raise exception '신청을 찾을 수 없습니다'; end if;
  if fr.to_user <> uid then raise exception '본인에게 온 신청이 아닙니다'; end if;
  if fr.state <> 'received' then
    raise exception '답신을 보낼 수 있는 상태가 아닙니다 (현재: %)', fr.state;
  end if;

  -- 답신 편지 (state는 아직 received 유지 — 답신이 도착해야 accepted)
  insert into public.letters (
    id, from_user, from_username, from_location_name, from_lat, from_lng,
    to_user, to_username,
    title, body, body_html, images, distance,
    sent_at, deliver_at,
    paper_style, envelope_style, stamp_id, seal_color, seal_symbol,
    friend_kind, friend_request_id
  ) values (
    letter_id,
    uid,
    letter_payload->>'from_username',
    letter_payload->>'from_location_name',
    (letter_payload->>'from_lat')::double precision,
    (letter_payload->>'from_lng')::double precision,
    fr.from_user,
    letter_payload->>'to_username',
    coalesce(letter_payload->>'title', ''),
    coalesce(letter_payload->>'body', ''),
    coalesce(letter_payload->>'body_html', ''),
    coalesce(array(select jsonb_array_elements_text(letter_payload->'images')), array[]::text[]),
    (letter_payload->>'distance')::double precision,
    (letter_payload->>'sent_at')::timestamptz,
    (letter_payload->>'deliver_at')::timestamptz,
    coalesce(letter_payload->>'paper_style', 'cream'),
    coalesce(letter_payload->>'envelope_style', 'cream'),
    coalesce(letter_payload->>'stamp_id', 'standard'),
    coalesce(letter_payload->>'seal_color', 'crimson'),
    coalesce(letter_payload->>'seal_symbol', ''),
    'accept',
    fr.id
  );

  update public.friend_requests
    set accept_letter_id = letter_id
    where id = request_id;
end;
$$;
revoke all on function public.send_accept_reply(uuid, uuid, jsonb) from public, anon;
grant execute on function public.send_accept_reply(uuid, uuid, jsonb) to authenticated;


-- 신청 편지의 봉투를 뜯었을 때 호출 — state 'sent' → 'received'
create or replace function public.mark_friend_request_received(request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  fr public.friend_requests%rowtype;
begin
  if uid is null then raise exception '인증 필요'; end if;
  select * into fr from public.friend_requests where id = request_id;
  if not found then raise exception '신청 없음'; end if;
  if fr.to_user <> uid then raise exception '권한 없음'; end if;
  if fr.state = 'sent' then
    update public.friend_requests set state = 'received' where id = request_id;
  end if;
end;
$$;
revoke all on function public.mark_friend_request_received(uuid) from public, anon;
grant execute on function public.mark_friend_request_received(uuid) to authenticated;


-- 답신 편지가 도착(픽업 또는 봉투 뜯기)했을 때 호출 — friendship 생성
create or replace function public.confirm_friendship(request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  fr public.friend_requests%rowtype;
  ua uuid; ub uuid;
begin
  if uid is null then raise exception '인증 필요'; end if;
  select * into fr from public.friend_requests where id = request_id;
  if not found then return false; end if;
  if fr.from_user <> uid then return false; end if;  -- 답신은 신청자가 받음
  if fr.state = 'accepted' then return true; end if;  -- 이미 확정
  if fr.state <> 'received' then return false; end if;

  if fr.from_user < fr.to_user then ua := fr.from_user; ub := fr.to_user;
  else ua := fr.to_user; ub := fr.from_user; end if;

  insert into public.friendships (user_a, user_b)
    values (ua, ub)
    on conflict do nothing;

  update public.friend_requests
    set state = 'accepted', resolved_at = now()
    where id = request_id;

  return true;
end;
$$;
revoke all on function public.confirm_friendship(uuid) from public, anon;
grant execute on function public.confirm_friendship(uuid) to authenticated;


-- 신청 편지를 휴지통에 버렸을 때 호출 — state → 'discarded'
create or replace function public.discard_friend_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  fr public.friend_requests%rowtype;
begin
  if uid is null then raise exception '인증 필요'; end if;
  select * into fr from public.friend_requests where id = request_id;
  if not found then raise exception '신청 없음'; end if;
  if fr.to_user <> uid then raise exception '권한 없음'; end if;
  if fr.state in ('accepted','expired','discarded') then return; end if;

  update public.friend_requests
    set state = 'discarded', resolved_at = now()
    where id = request_id;
end;
$$;
revoke all on function public.discard_friend_request(uuid) from public, anon;
grant execute on function public.discard_friend_request(uuid) to authenticated;


-- 친구 끊기 — 양쪽 모두 호출 가능
create or replace function public.unfriend(other_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  ua uuid; ub uuid;
begin
  if uid is null then raise exception '인증 필요'; end if;
  if uid < other_user then ua := uid; ub := other_user;
  else ua := other_user; ub := uid; end if;
  delete from public.friendships where user_a = ua and user_b = ub;
end;
$$;
revoke all on function public.unfriend(uuid) from public, anon;
grant execute on function public.unfriend(uuid) to authenticated;


-- 만료 처리 — 클라이언트가 주기적으로 호출
-- 'sent' 상태인데 신청 편지 도착 후 7일 + 'received' 상태인데 7일 경과한 건 expired
create or replace function public.expire_old_friend_requests()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  cnt int;
begin
  with expired as (
    update public.friend_requests fr
    set state = 'expired', resolved_at = now()
    from public.letters l
    where fr.id = l.friend_request_id
      and fr.state = 'sent'
      and l.deliver_at < now() - interval '7 days'
    returning fr.id
  )
  select count(*) into cnt from expired;

  with expired2 as (
    update public.friend_requests
    set state = 'expired', resolved_at = now()
    where state = 'received'
      and created_at < now() - interval '7 days'
    returning id
  )
  select cnt + count(*) into cnt from expired2;

  return cnt;
end;
$$;
revoke all on function public.expire_old_friend_requests() from public, anon;
grant execute on function public.expire_old_friend_requests() to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
--  TRASH — 휴지통: trashed_at 으로 표시. 7일 후 영구 삭제.
-- ─────────────────────────────────────────────────────────────────────────────

-- 편지 휴지통으로 보내기 (받는 쪽에서)
create or replace function public.trash_letter(letter_id_in uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  lt public.letters%rowtype;
begin
  if uid is null then raise exception '인증 필요'; end if;
  select * into lt from public.letters where id = letter_id_in;
  if not found then raise exception '편지 없음'; end if;
  if lt.to_user <> uid then raise exception '본인에게 온 편지만 버릴 수 있습니다'; end if;

  update public.letters set trashed_at = now() where id = letter_id_in;

  -- 친구 신청 편지를 버린 경우 = 묵시적 거절
  if lt.friend_kind = 'request' and lt.friend_request_id is not null then
    perform public.discard_friend_request(lt.friend_request_id);
  end if;
end;
$$;
revoke all on function public.trash_letter(uuid) from public, anon;
grant execute on function public.trash_letter(uuid) to authenticated;


-- 휴지통에서 복원
create or replace function public.restore_letter(letter_id_in uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  lt public.letters%rowtype;
begin
  if uid is null then raise exception '인증 필요'; end if;
  select * into lt from public.letters where id = letter_id_in;
  if not found then raise exception '편지 없음'; end if;
  if lt.to_user <> uid then raise exception '권한 없음'; end if;
  update public.letters set trashed_at = null where id = letter_id_in;
end;
$$;
revoke all on function public.restore_letter(uuid) from public, anon;
grant execute on function public.restore_letter(uuid) to authenticated;


-- 휴지통 7일 경과 편지 영구 삭제 — 클라이언트가 진입 시 호출
create or replace function public.purge_old_trash()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cnt int;
begin
  if uid is null then raise exception '인증 필요'; end if;
  with deleted as (
    delete from public.letters
    where to_user = uid
      and trashed_at is not null
      and trashed_at < now() - interval '7 days'
    returning id
  )
  select count(*) into cnt from deleted;
  return cnt;
end;
$$;
revoke all on function public.purge_old_trash() from public, anon;
grant execute on function public.purge_old_trash() to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
--  Lint silence
-- ─────────────────────────────────────────────────────────────────────────────
comment on function public.friend_request_eligibility(uuid) is
  'Reads only own pending requests / friendships. @lint:ignore-warnings 0029_authenticated_security_definer_function_executable';
comment on function public.send_friend_request(uuid, uuid, jsonb) is
  'Creates request + letter atomically. Internal auth.uid()/eligibility checks. @lint:ignore-warnings 0029_authenticated_security_definer_function_executable';
comment on function public.send_accept_reply(uuid, uuid, jsonb) is
  'Sends the accept reply letter. @lint:ignore-warnings 0029_authenticated_security_definer_function_executable';
comment on function public.mark_friend_request_received(uuid) is
  '@lint:ignore-warnings 0029_authenticated_security_definer_function_executable';
comment on function public.confirm_friendship(uuid) is
  '@lint:ignore-warnings 0029_authenticated_security_definer_function_executable';
comment on function public.discard_friend_request(uuid) is
  '@lint:ignore-warnings 0029_authenticated_security_definer_function_executable';
comment on function public.unfriend(uuid) is
  '@lint:ignore-warnings 0029_authenticated_security_definer_function_executable';
comment on function public.expire_old_friend_requests() is
  '@lint:ignore-warnings 0029_authenticated_security_definer_function_executable';
comment on function public.trash_letter(uuid) is
  '@lint:ignore-warnings 0029_authenticated_security_definer_function_executable';
comment on function public.restore_letter(uuid) is
  '@lint:ignore-warnings 0029_authenticated_security_definer_function_executable';
comment on function public.purge_old_trash() is
  '@lint:ignore-warnings 0029_authenticated_security_definer_function_executable';


-- ════════════════════════════════════════════════════════════════════════════
--  완료. 다음 우표 라운드에서 친구 전용 우표(예: best_friend) 추가 가능.
-- ════════════════════════════════════════════════════════════════════════════
