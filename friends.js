// ═══════════════════════════════════════════════════════════
//  friends.js — 친구 시스템 + 휴지통
//  (letters.js 의 sendLetter / openLetter 등과 협력)
// ═══════════════════════════════════════════════════════════

// 추가 State
State.friends = [];               // [{ otherId, username, location_name, bio, seal_color, seal_symbol, since }]
State.pendingRequests = [];       // [{ id, from_user, to_user, state, created_at, ... letter info }]
State.friendIds = new Set();      // 빠른 조회
State.recipientFriendStatus = null; // 'ok'|'already_friends'|'pending_in'|'pending_out'|'cooldown'
State.composeFriendRequest = false; // 편지 쓰기 시 친구 신청 모드 토글
State.acceptingRequest = null;     // 답신 작성 중인 friend_request_id
State.trashed = [];

// ═══════════════════════════════════════════════════════════
//  로드 함수
// ═══════════════════════════════════════════════════════════
async function loadFriends() {
  const { data, error } = await supa
    .from('friendships')
    .select('user_a, user_b, since');
  if (error) { console.error(error); return; }
  const ids = (data || []).map(r => r.user_a === State.me.id ? r.user_b : r.user_a);
  State.friendIds = new Set(ids);
  if (ids.length === 0) { State.friends = []; return; }

  const { data: profiles, error: e2 } = await supa
    .from('profiles')
    .select('id, username, location_name, bio, seal_color, seal_symbol, lat, lng')
    .in('id', ids);
  if (e2) { console.error(e2); return; }

  const sinceMap = {};
  for (const r of (data || [])) {
    const other = r.user_a === State.me.id ? r.user_b : r.user_a;
    sinceMap[other] = r.since;
  }
  State.friends = (profiles || []).map(p => ({ ...p, since: sinceMap[p.id] }));
  State.friends.sort((a, b) => a.username.localeCompare(b.username, 'ko'));
}

async function loadPendingRequests() {
  const { data, error } = await supa
    .from('friend_requests')
    .select('*')
    .or(`from_user.eq.${State.me.id},to_user.eq.${State.me.id}`)
    .in('state', ['sent', 'received'])
    .order('created_at', { ascending: false });
  if (error) { console.error(error); return; }
  State.pendingRequests = data || [];
}

async function loadTrash() {
  const { data, error } = await supa
    .from('letters')
    .select('*')
    .eq('to_user', State.me.id)
    .not('trashed_at', 'is', null)
    .order('trashed_at', { ascending: false });
  if (error) { console.error(error); return; }
  State.trashed = data || [];
}

// ═══════════════════════════════════════════════════════════
//  렌더링
// ═══════════════════════════════════════════════════════════
function renderFriendsPanel() {
  // 친구 목록
  const fwrap = document.getElementById('friends-grid-wrap');
  if (State.friends.length === 0) {
    fwrap.innerHTML = `<div class="friends-empty">
      <div>아직 친구가 없습니다</div>
      <em>편지를 쓸 때 ♥ 친구 신청 토글을 켜면 친구가 될 수 있어요.</em>
    </div>`;
  } else {
    fwrap.innerHTML = `<div class="friends-grid">
      ${State.friends.map(friendCardHtml).join('')}
    </div>`;
    fwrap.querySelectorAll('[data-write-to]').forEach(b => {
      b.addEventListener('click', e => {
        e.stopPropagation();
        const name = b.dataset.writeTo;
        document.querySelector('.tab[data-tab="compose"]').click();
        document.getElementById('recipient-input').value = name;
        // 트리거 input 이벤트
        document.getElementById('recipient-input').dispatchEvent(new Event('input'));
      });
    });
    fwrap.querySelectorAll('[data-unfriend]').forEach(b => {
      b.addEventListener('click', async e => {
        e.stopPropagation();
        const otherId = b.dataset.unfriend;
        const friend = State.friends.find(f => f.id === otherId);
        if (!friend) return;
        if (!confirm(`${friend.username}님과의 친구 관계를 끊으시겠습니까?`)) return;
        const { error } = await supa.rpc('unfriend', { other_user: otherId });
        if (error) { showToast('친구 끊기 실패: ' + error.message); return; }
        showToast(`${friend.username}님과의 친구 관계를 끊었어요`);
        await loadFriends();
        renderFriendsPanel();
        renderRecipientQuick();
      });
    });
  }

  // 진행 중인 신청
  const pwrap = document.getElementById('pending-grid-wrap');
  if (State.pendingRequests.length === 0) {
    pwrap.innerHTML = `<div class="friends-empty">
      <div>진행 중인 신청이 없습니다</div>
    </div>`;
  } else {
    pwrap.innerHTML = `<div class="friends-grid">
      ${State.pendingRequests.map(pendingCardHtml).join('')}
    </div>`;
  }

  // 마스트헤드 위 알림 바
  renderPendingFriendBar();
  renderFriendBadge();
}

function friendCardHtml(f) {
  const initial = (f.seal_symbol && f.seal_symbol.length) ? f.seal_symbol : (f.username || '?')[0].toUpperCase();
  const sealColor = f.seal_color || 'crimson';
  const colors = sealColorVars(sealColor);
  return `
    <div class="friend-card">
      <div class="fc-seal" style="background: radial-gradient(circle at 35% 35%, ${colors[0]} 0%, ${colors[1]} 50%, ${colors[2]} 100%);">${escapeHtml(initial)}</div>
      <div class="fc-info">
        <div class="fc-name">${escapeHtml(f.username)}</div>
        <div class="fc-loc">${escapeHtml(f.location_name || '')}</div>
        ${f.bio ? `<div class="fc-bio">${escapeHtml(f.bio)}</div>` : ''}
      </div>
      <div class="fc-actions">
        <button class="fc-btn" data-write-to="${escapeAttr(f.username)}">편지 쓰기</button>
        <button class="fc-btn danger" data-unfriend="${escapeAttr(f.id)}">친구 끊기</button>
      </div>
    </div>
  `;
}

function pendingCardHtml(r) {
  const isOutgoing = r.from_user === State.me.id;
  const otherId = isOutgoing ? r.to_user : r.from_user;
  const direction = isOutgoing ? '내가 보낸' : '받은';
  const stateLabel = {
    sent: isOutgoing ? '배송 중' : '도착',
    received: isOutgoing ? '읽음, 답신 대기 중' : '답신 대기 중'
  }[r.state] || r.state;
  // 진행 중인 신청에는 자세한 상대 정보를 별도 조회 안 함 (간단히)
  return `
    <div class="friend-card">
      <div class="fc-seal" style="background: radial-gradient(circle at 35% 35%, var(--seal-crimson-l) 0%, var(--seal-crimson) 50%, var(--seal-crimson-d) 100%);">♥</div>
      <div class="fc-info">
        <div class="fc-name">${direction} 친구 신청</div>
        <div class="fc-loc">${escapeHtml(stateLabel)}</div>
        <div class="fc-bio">신청일: ${shortDate(r.created_at)}</div>
      </div>
    </div>
  `;
}

function sealColorVars(name) {
  const map = {
    crimson:  ['var(--seal-crimson-l)',  'var(--seal-crimson)',  'var(--seal-crimson-d)'],
    navy:     ['var(--seal-navy-l)',     'var(--seal-navy)',     'var(--seal-navy-d)'],
    forest:   ['var(--seal-forest-l)',   'var(--seal-forest)',   'var(--seal-forest-d)'],
    gold:     ['var(--seal-gold-l)',     'var(--seal-gold)',     'var(--seal-gold-d)'],
    charcoal: ['var(--seal-charcoal-l)', 'var(--seal-charcoal)', 'var(--seal-charcoal-d)'],
    plum:     ['var(--seal-plum-l)',     'var(--seal-plum)',     'var(--seal-plum-d)']
  };
  return map[name] || map.crimson;
}

function renderFriendBadge() {
  const badge = document.getElementById('badge-friend');
  // 답을 기다리는 신청 (받은 쪽에서 received 또는 sent 도착) — 액션이 필요한 것만 카운트
  const actionable = State.pendingRequests.filter(r => r.to_user === State.me.id && r.state === 'received').length;
  if (actionable > 0) {
    badge.textContent = actionable;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

function renderPendingFriendBar() {
  // 마스트헤드 아래에 작은 알림 바 — 도착했지만 답하지 않은 친구 신청 안내
  let bar = document.getElementById('pending-friend-bar');
  const actionable = State.pendingRequests.filter(r => r.to_user === State.me.id && r.state === 'received');
  if (actionable.length === 0) {
    if (bar) bar.remove();
    return;
  }
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'pending-friend-bar';
    bar.className = 'pending-friend-bar';
    const tabs = document.querySelector('.tabs');
    tabs.parentNode.insertBefore(bar, tabs);
  }
  const word = actionable.length === 1 ? '한 통' : `${actionable.length}통`;
  bar.innerHTML = `
    <div class="pfb-msg"><strong>${word}</strong>의 친구 신청 편지가 답신을 기다리고 있어요.</div>
    <button class="pfb-action" type="button">우편함에서 보기</button>
  `;
  bar.querySelector('.pfb-action').addEventListener('click', () => {
    document.querySelector('.tab[data-tab="mailbox"]').click();
  });
}

// ═══════════════════════════════════════════════════════════
//  받는 사람 빠른 선택 (친구 칩)
// ═══════════════════════════════════════════════════════════
function renderRecipientQuick() {
  const el = document.getElementById('recipient-quick');
  if (!el) return;
  if (State.friends.length === 0) { el.innerHTML = ''; return; }
  el.innerHTML = State.friends.slice(0, 12).map(f =>
    `<div class="rq-chip" data-name="${escapeAttr(f.username)}">${escapeHtml(f.username)}</div>`
  ).join('');
  el.querySelectorAll('.rq-chip').forEach(c => {
    c.addEventListener('click', () => {
      const input = document.getElementById('recipient-input');
      input.value = c.dataset.name;
      input.dispatchEvent(new Event('input'));
    });
  });
}

// ═══════════════════════════════════════════════════════════
//  편지 쓰기 화면 — 친구 신청 토글 처리
// ═══════════════════════════════════════════════════════════
const friendToggleRow = document.getElementById('friend-toggle-row');
const friendToggle = document.getElementById('friend-toggle');
const friendToggleState = document.getElementById('friend-toggle-state');

friendToggle.addEventListener('click', () => {
  if (friendToggle.disabled) return;
  State.composeFriendRequest = !State.composeFriendRequest;
  friendToggle.classList.toggle('on', State.composeFriendRequest);
});

// 받는 사람 변경 시 호출 — letters.js 의 checkRecipient 에서 추가로 호출
async function refreshFriendToggleVisibility() {
  if (!State.recipientCache) {
    friendToggleRow.style.display = 'none';
    State.composeFriendRequest = false;
    friendToggle.classList.remove('on');
    return;
  }
  const otherId = State.recipientCache.profile.id;
  if (otherId === State.me.id) {
    // 자기 자신
    friendToggleRow.style.display = 'none';
    State.composeFriendRequest = false;
    friendToggle.classList.remove('on');
    return;
  }
  const { data, error } = await supa.rpc('friend_request_eligibility', { target: otherId });
  if (error) { console.warn(error); friendToggleRow.style.display = 'none'; return; }
  State.recipientFriendStatus = data;

  friendToggleRow.style.display = 'flex';
  friendToggle.disabled = false;
  friendToggleState.textContent = '';
  friendToggleState.className = 'ft-state';

  switch (data) {
    case 'ok':
      friendToggleState.textContent = '신청 가능';
      friendToggleState.classList.add('ok');
      break;
    case 'already_friends':
      friendToggleState.textContent = '이미 친구';
      friendToggle.disabled = true;
      State.composeFriendRequest = false;
      friendToggle.classList.remove('on');
      break;
    case 'pending_out':
      friendToggleState.textContent = '신청 진행 중';
      friendToggleState.classList.add('warn');
      friendToggle.disabled = true;
      State.composeFriendRequest = false;
      friendToggle.classList.remove('on');
      break;
    case 'pending_in':
      friendToggleState.textContent = '상대가 보낸 신청 있음';
      friendToggleState.classList.add('warn');
      friendToggle.disabled = true;
      State.composeFriendRequest = false;
      friendToggle.classList.remove('on');
      break;
    case 'cooldown':
      friendToggleState.textContent = '7일 이내 재신청 불가';
      friendToggleState.classList.add('warn');
      friendToggle.disabled = true;
      State.composeFriendRequest = false;
      friendToggle.classList.remove('on');
      break;
    case 'self':
      friendToggleRow.style.display = 'none';
      break;
  }
}

// ═══════════════════════════════════════════════════════════
//  답신 편지 작성 모드 (수락 흐름)
// ═══════════════════════════════════════════════════════════
function startAcceptReplyCompose(requestId, fromUsername) {
  State.acceptingRequest = requestId;
  // 편지 쓰기 탭으로 이동, 받는 사람 자동 입력
  document.querySelector('.tab[data-tab="compose"]').click();
  document.getElementById('recipient-input').value = fromUsername;
  document.getElementById('recipient-input').dispatchEvent(new Event('input'));
  // 안내 메시지
  document.getElementById('letter-title-input').value = '친구 신청을 수락합니다';
  // 친구 신청 토글은 끔
  State.composeFriendRequest = false;
  friendToggle.classList.remove('on');
  showToast(`${fromUsername}님께 답신을 작성해주세요`);
}

// ═══════════════════════════════════════════════════════════
//  편지 봉투에 ♥ 배지 추가 / 친구 액션 바
//  letters.js 의 envelopeHtml / openLetter 와 협력
// ═══════════════════════════════════════════════════════════
function decorateEnvelopeForFriend(L) {
  // letters.js envelopeHtml 가 호출 후 이 후처리 함수를 부를 수 있게 분리
  // 하지만 단순함을 위해 letters.js 에서 friend_kind 검사 후 클래스/배지를 직접 추가
  // → 이 함수는 사용 안 함 (예약)
}

// 친구 신청·답신 편지를 열었을 때 letter-content-paper 안에 액션 바 삽입
async function appendFriendActionBar(L) {
  const lcp = document.getElementById('lcp');
  if (!lcp) return;
  if (L.friend_kind === 'request') {
    // 받는 쪽 — 수락 가능한 상태인지 확인 후 액션 바
    if (L.to_user !== State.me.id) return;  // 본인이 받은 것만
    // friend_request 상태 조회
    const { data: fr, error } = await supa
      .from('friend_requests')
      .select('*')
      .eq('id', L.friend_request_id)
      .maybeSingle();
    if (error || !fr) return;

    // state를 'sent' 면 'received' 로 업데이트
    if (fr.state === 'sent') {
      await supa.rpc('mark_friend_request_received', { request_id: fr.id });
      fr.state = 'received';
    }

    if (fr.state === 'received') {
      const bar = document.createElement('div');
      bar.className = 'friend-action-bar';
      bar.innerHTML = `
        <div class="fab-msg">
          <strong>${escapeHtml(L.from_username)}</strong>님이 친구가 되고 싶어해요.<br>
          답신 편지를 보내야 친구 관계가 시작됩니다.
        </div>
        <div class="fab-actions">
          <button class="fab-btn" id="accept-fr-btn" type="button">답신 쓰기</button>
        </div>
      `;
      lcp.appendChild(bar);
      bar.querySelector('#accept-fr-btn').addEventListener('click', () => {
        document.getElementById('letter-modal').classList.remove('show');
        startAcceptReplyCompose(fr.id, L.from_username);
      });
    } else if (fr.state === 'accepted') {
      const bar = document.createElement('div');
      bar.className = 'friend-action-bar';
      bar.innerHTML = `<div class="fab-msg"><strong>이미 친구</strong>가 되었습니다 ♥</div>`;
      lcp.appendChild(bar);
    }
  } else if (L.friend_kind === 'accept') {
    // 신청자가 받은 답신 — confirm_friendship 호출
    if (L.from_user === State.me.id) return;  // 보낸 사람이 보는 건 무시
    const { data: ok } = await supa.rpc('confirm_friendship', { request_id: L.friend_request_id });
    const bar = document.createElement('div');
    bar.className = 'friend-action-bar';
    if (ok) {
      bar.innerHTML = `<div class="fab-msg"><strong>${escapeHtml(L.from_username)}</strong>님과 친구가 되었습니다 ♥</div>`;
      // 친구 목록 갱신
      await loadFriends();
      renderRecipientQuick();
      if (document.querySelector('.tab[data-tab="friends"]').classList.contains('active')) {
        renderFriendsPanel();
      }
    } else {
      bar.innerHTML = `<div class="fab-msg">친구 관계가 이미 확정됐거나 만료되었습니다.</div>`;
    }
    lcp.appendChild(bar);
  }
}

// ═══════════════════════════════════════════════════════════
//  휴지통
// ═══════════════════════════════════════════════════════════
function renderTrashPanel() {
  const list = document.getElementById('trash-list');
  if (State.trashed.length === 0) {
    list.innerHTML = `<div class="empty-state">
      <div class="ico">🗑</div>
      <div>휴지통이 비어있습니다</div>
      <em>버린 편지가 여기 7일간 머무릅니다</em>
    </div>`;
    return;
  }
  const now = Date.now();
  list.innerHTML = State.trashed.map(L => {
    const trashedTime = new Date(L.trashed_at).getTime();
    const remainMs = (trashedTime + 7 * 24 * 60 * 60 * 1000) - now;
    const remainTxt = remainMs > 0 ? `${formatDuration(remainMs)} 후 삭제` : '곧 삭제';
    const init = (L.from_username || '?')[0].toUpperCase();
    const preview = (L.title || L.body || '').slice(0, 60);
    return `
      <div class="trash-item">
        <div class="ti-icon">${escapeHtml(init)}</div>
        <div class="ti-meta">
          <div class="from">${escapeHtml(L.from_username)}</div>
          <div class="preview">${escapeHtml(preview)}</div>
        </div>
        <div class="ti-countdown">${escapeHtml(remainTxt)}</div>
        <div class="ti-actions">
          <button class="ti-btn" data-restore="${escapeAttr(L.id)}" type="button">복원</button>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('[data-restore]').forEach(b => {
    b.addEventListener('click', async () => {
      const id = b.dataset.restore;
      const { error } = await supa.rpc('restore_letter', { letter_id_in: id });
      if (error) { showToast('복원 실패: ' + error.message); return; }
      showToast('편지를 복원했어요');
      await Promise.all([loadTrash(), loadMailbox()]);
      renderTrashPanel();
      renderAll();
    });
  });
}

async function trashLetter(letterId) {
  const { error } = await supa.rpc('trash_letter', { letter_id_in: letterId });
  if (error) { showToast('버리기 실패: ' + error.message); return false; }
  showToast('편지를 휴지통에 넣었어요. 7일 후 영구 삭제됩니다.');
  await Promise.all([loadMailbox(), loadTrash(), loadPendingRequests()]);
  renderAll();
  if (document.querySelector('.tab[data-tab="trash"]').classList.contains('active')) {
    renderTrashPanel();
  }
  // 지도 우체통 갱신
  if (State.mapInitialized && typeof buildPostboxes === 'function') {
    buildPostboxes();
    renderPostboxes();
  }
  return true;
}

// ═══════════════════════════════════════════════════════════
//  자동 정리 — 만료·휴지통 청소
// ═══════════════════════════════════════════════════════════
async function runMaintenance() {
  try {
    await supa.rpc('expire_old_friend_requests');
    await supa.rpc('purge_old_trash');
  } catch (e) { console.warn('maintenance failed', e); }
}
