// ═══════════════════════════════════════════════════════════
//  letters.js — 편지 쓰기, 우편함, 편지 열기
// ═══════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────
//  LOAD LETTERS
// ───────────────────────────────────────────────────────────
async function loadMailbox() {
  const nowIso = new Date().toISOString();
  // 도착했고 + 가져갔고 + 휴지통에 안 들어간 편지만
  const { data, error } = await supa
    .from('letters')
    .select('*')
    .eq('to_user', State.me.id)
    .lte('deliver_at', nowIso)
    .eq('picked_up', true)
    .is('trashed_at', null)
    .order('deliver_at', { ascending: false });
  if (error) { console.error(error); return; }
  State.letters = data || [];
}

// 도착했지만 아직 안 가져간 편지 — 우편함 클릭 시 가져옴
async function loadPendingCount() {
  const nowIso = new Date().toISOString();
  const { count, error } = await supa
    .from('letters')
    .select('id', { count: 'exact', head: true })
    .eq('to_user', State.me.id)
    .lte('deliver_at', nowIso)
    .eq('picked_up', false)
    .is('trashed_at', null);
  if (error) { console.error(error); State.pendingCount = 0; return; }
  State.pendingCount = count || 0;
}

// 우편함을 클릭해서 미수령 편지를 모두 가져오는 액션
async function pickupLetters() {
  if (!State.pendingCount || State.pendingCount === 0) return;
  const nowIso = new Date().toISOString();
  const { data: pending, error: fetchErr } = await supa
    .from('letters')
    .select('*')
    .eq('to_user', State.me.id)
    .lte('deliver_at', nowIso)
    .eq('picked_up', false)
    .is('trashed_at', null);
  if (fetchErr) { console.error(fetchErr); return; }

  const { error: updErr } = await supa
    .from('letters')
    .update({ picked_up: true, picked_up_at: nowIso })
    .eq('to_user', State.me.id)
    .lte('deliver_at', nowIso)
    .eq('picked_up', false)
    .is('trashed_at', null);
  if (updErr) { console.error(updErr); showToast('편지를 가져오지 못했어요'); return; }

  for (const L of (pending || [])) notifyNewLetter(L);

  await Promise.all([loadMailbox(), loadPendingCount(), loadPendingRequests()]);
  renderAll();
  flashPickup(pending.length);

  // 친구 신청 알림 바도 갱신
  if (typeof renderFriendsPanel === 'function') {
    renderPendingFriendBar();
    renderFriendBadge();
  }

  // 지도 우체통 갱신
  if (State.mapInitialized && typeof buildPostboxes === 'function') {
    buildPostboxes();
    renderPostboxes();
  }

  checkAchievementsBackground();
}

function flashPickup(count) {
  // 짧은 토스트로 알림
  const word = count === 1 ? '한 통' : `${count}통`;
  showToast(`✉ ${word}의 편지를 가져왔어요`);
}

async function loadSent() {
  const { data, error } = await supa
    .from('letters')
    .select('*')
    .eq('from_user', State.me.id)
    .order('sent_at', { ascending: false });
  if (error) { console.error(error); return; }
  State.sent = data || [];
}

// ───────────────────────────────────────────────────────────
//  RENDER MAILBOX
// ───────────────────────────────────────────────────────────
function renderAll() {
  const arrivedCount = State.letters.length;        // 이미 가져간 편지
  const pendingCount = State.pendingCount || 0;     // 가져가기 대기
  const transitFromMe = State.sent.filter(l => new Date(l.deliver_at).getTime() > Date.now());

  document.getElementById('stat-arrived').textContent = arrivedCount;
  document.getElementById('stat-transit').textContent = transitFromMe.length;
  const transitLbl = document.querySelector('#stat-transit + .lbl');
  if (transitLbl) transitLbl.textContent = '내가 보낸·배송 중';

  // 깃발: 가져가기 대기 중인 편지가 있을 때 올라감
  const wrap = document.getElementById('mailbox-svg-wrap');
  const flag = document.getElementById('mb-flag');
  const badge = document.getElementById('badge-new');
  if (pendingCount > 0) {
    flag.classList.add('up');
    wrap.classList.add('has-pending');
    badge.style.display = 'inline-block';
    badge.textContent = pendingCount;
  } else {
    flag.classList.remove('up');
    wrap.classList.remove('has-pending');
    badge.style.display = 'none';
  }

  // 새로 도착한(아직 안 읽은) — 가져온 편지 중에서
  const unreadCount = State.letters.filter(l => !l.opened).length;

  const desc = document.getElementById('mb-desc');
  if (pendingCount > 0) {
    desc.innerHTML = `깃발이 올라가 있어요 — <strong>${pendingCount}통</strong>의 편지가 우편함을 열기를 기다리고 있습니다. <span class="pickup-hint">우편함을 열어 가져오세요</span>`;
  } else if (unreadCount > 0) {
    desc.textContent = `우편함에 ${unreadCount}통의 안 읽은 편지가 있어요.`;
  } else if (arrivedCount > 0) {
    desc.textContent = '새로 도착한 편지는 없습니다. 이전 편지들을 다시 펼쳐볼 수 있어요.';
  } else {
    desc.textContent = '우편함이 비어있습니다. 편지를 보내거나 친구의 편지를 기다려보세요.';
  }

  renderEnvelopes('arrived-grid', State.letters);
  renderSent();
}

function renderEnvelopes(elId, letters) {
  const el = document.getElementById(elId);
  if (letters.length === 0) {
    el.innerHTML = `<div class="empty-state">
      <div class="ico">✉</div>
      <div>도착한 편지가 없습니다</div>
      <em>No letters arrived yet</em>
    </div>`;
    return;
  }
  el.innerHTML = letters.map(envelopeHtml).join('');
  el.querySelectorAll('[data-letter-id]').forEach(node => {
    node.addEventListener('click', () => openLetter(node.dataset.letterId));
  });
}

function envelopeHtml(L) {
  const distKm = Math.round(L.distance);
  const cityCode = (L.from_location_name || '').slice(0, 6).toUpperCase() || '——';
  const sealText = (L.seal_symbol && L.seal_symbol.length) ? L.seal_symbol : (L.from_username || '?')[0].toUpperCase();
  const sealColor = L.seal_color || 'crimson';
  const envStyle  = L.envelope_style || 'cream';
  const opened = L.opened ? 'opened' : '';
  const titleHtml = L.title ? `<div class="env-title">${escapeHtml(L.title)}</div>` : '';
  const stampSvg = renderStampSvg(L.stamp_id || 'standard', { km: distKm, sealColor });
  let friendCls = '';
  let friendBadge = '';
  if (L.friend_kind === 'request') {
    friendCls = ' friend-request';
    friendBadge = '<div class="friend-badge">친구 신청</div>';
  } else if (L.friend_kind === 'accept') {
    friendCls = ' friend-accept';
    friendBadge = '<div class="friend-badge">수락 답신</div>';
  }
  return `
    <div class="envelope ${opened} seal-${escapeAttr(sealColor)}${friendCls}" data-env="${escapeAttr(envStyle)}" data-letter-id="${escapeAttr(L.id)}" title="편지 열기">
      <div class="envelope-texture-overlay"></div>
      <div class="env-postmark">${postmarkInner(cityCode, L.sent_at, distKm)}</div>
      <div class="postage-stamp">${stampSvg}</div>
      ${friendBadge}
      ${titleHtml}
      <div class="env-from"><span class="lbl">From</span>${escapeHtml(L.from_username)}</div>
      ${L.opened ? '' : `<div class="env-seal">${escapeHtml(sealText)}</div>`}
    </div>`;
}

// 도장 내부: 위쪽 호=도시 / 가운데=날짜 / 아래쪽 호=거리
function postmarkInner(cityCode, sentAt, distKm) {
  const dateShort = shortDate(sentAt);
  const km = distKm != null ? `${distKm} KM` : '';
  // SVG로 호를 따라가는 텍스트
  const topArc = `
    <div class="pm-arc-top">
      <svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <path id="pmTop-${escapeAttr(cityCode)}-${Math.random().toString(36).slice(2,7)}" d="M 12 38 A 38 38 0 0 1 88 38" fill="none"/>
        </defs>
      </svg>
    </div>`;
  // 호를 따라가는 텍스트는 동일 SVG 안에서 textPath 로 — 위 구조를 통합
  const uniqA = 'a' + Math.random().toString(36).slice(2, 8);
  const uniqB = 'b' + Math.random().toString(36).slice(2, 8);
  return `
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;">
      <defs>
        <path id="${uniqA}" d="M 14 44 A 36 36 0 0 1 86 44" fill="none"/>
        <path id="${uniqB}" d="M 14 56 A 36 36 0 0 0 86 56" fill="none"/>
      </defs>
      <text font-family="Cormorant Garamond, serif" font-size="9" letter-spacing="1.5" fill="currentColor" font-weight="600">
        <textPath href="#${uniqA}" startOffset="50%" text-anchor="middle">${escapeHtml(cityCode)}</textPath>
      </text>
      <text font-family="Cormorant Garamond, serif" font-size="8" letter-spacing="1" fill="currentColor" font-style="italic">
        <textPath href="#${uniqB}" startOffset="50%" text-anchor="middle">${escapeHtml(km)}</textPath>
      </text>
    </svg>
    <div class="pm-center">${escapeHtml(dateShort)}</div>
  `;
}

// ───────────────────────────────────────────────────────────
//  MAILBOX SVG
// ───────────────────────────────────────────────────────────
// 우편함 클릭: 문 열고/닫고 + 미수령 편지가 있다면 가져오기
document.getElementById('mailbox-svg-wrap').addEventListener('click', async (e) => {
  const wrap = e.currentTarget;
  const wasOpen = wrap.classList.contains('open');
  wrap.classList.toggle('open');

  // 막 열렸을 때, 가져갈 편지가 있으면 약간의 지연 후 가져옴 (문 열리는 모션 후)
  if (!wasOpen && State.pendingCount > 0) {
    setTimeout(() => { pickupLetters(); }, 600);
  }
});

// ═══════════════════════════════════════════════════════════
//  도전과제 검사 — 백그라운드 호출
// ═══════════════════════════════════════════════════════════
let achievementCheckInFlight = false;
async function checkAchievementsBackground() {
  if (achievementCheckInFlight) return;
  achievementCheckInFlight = true;
  try {
    const { data, error } = await supa.rpc('check_achievements');
    if (error) { console.warn('achievement check failed', error); return; }
    if (data && data.length > 0) {
      // 새로 해금된 우표 — 알림 모달 띄우기
      for (const stampId of data) {
        showStampUnlock(stampId);
      }
      // 보유 우표 갱신
      await loadMyStamps();
      // 우표 선택 UI 갱신 (작성 중일 수도 있으니)
      if (typeof renderStampPicker === 'function') renderStampPicker();
    }
  } finally {
    achievementCheckInFlight = false;
  }
}

// ───────────────────────────────────────────────────────────
//  OPEN LETTER (modal + tear animation)
// ───────────────────────────────────────────────────────────
async function openLetter(id) {
  const L = State.letters.find(x => x.id === id);
  if (!L) return;

  const stage = document.getElementById('letter-stage');
  const distKm = Math.round(L.distance);
  const sealText = (L.seal_symbol && L.seal_symbol.length) ? L.seal_symbol : (L.from_username || '?')[0].toUpperCase();
  const sealColor = L.seal_color || 'crimson';
  const envStyle  = L.envelope_style || 'cream';
  const cityCode = (L.from_location_name || '').slice(0, 6).toUpperCase() || '——';
  const stampSvg = renderStampSvg(L.stamp_id || 'standard', { km: distKm, sealColor });
  const titleHtml = L.title ? `<div class="stage-title">${escapeHtml(L.title)}</div>` : '';
  let friendCls = '';
  let friendBadge = '';
  if (L.friend_kind === 'request') {
    friendCls = ' friend-request';
    friendBadge = '<div class="friend-badge">친구 신청</div>';
  } else if (L.friend_kind === 'accept') {
    friendCls = ' friend-accept';
    friendBadge = '<div class="friend-badge">수락 답신</div>';
  }

  stage.innerHTML = `
    <div class="stage-envelope seal-${escapeAttr(sealColor)}${friendCls}" data-env="${escapeAttr(envStyle)}" id="stage-env">
      <div class="envelope-texture-overlay"></div>
      <div class="torn-edge"></div>
      <div class="env-postmark" style="top:24px;left:24px;">
        ${postmarkInner(cityCode, L.sent_at, distKm)}
      </div>
      <div class="postage-stamp">${stampSvg}</div>
      ${friendBadge}
      ${titleHtml}
      <div class="stage-from-meta"><span class="lbl">From</span>${escapeHtml(L.from_username)}<br><span style="font-family:'Cormorant Garamond',serif;font-style:italic;font-size:0.85rem;color:var(--sepia);">${escapeHtml(L.from_location_name || '')}</span></div>
      <div class="stage-seal">${escapeHtml(sealText)}</div>
    </div>
    <div class="tear-prompt" id="tear-prompt">봉투를 클릭해서 뜯어보세요</div>
  `;
  document.getElementById('letter-modal').classList.add('show');

  const env = document.getElementById('stage-env');
  env.addEventListener('click', async () => {
    if (env.classList.contains('tearing')) return;
    env.classList.add('tearing');
    document.getElementById('tear-prompt').style.opacity = '0';

    if (!L.opened) {
      const { error } = await supa.from('letters')
        .update({ opened: true, opened_at: new Date().toISOString() })
        .eq('id', L.id);
      if (!error) {
        L.opened = true;
        L.opened_at = new Date().toISOString();
      }
      // 받은 쪽도 도전과제 검사
      checkAchievementsBackground();
    }

    setTimeout(() => {
      env.classList.add('gone');
      setTimeout(() => renderLetterContent(L), 400);
    }, 1100);
  }, { once: true });
}

async function renderLetterContent(L) {
  const stage = document.getElementById('letter-stage');
  const signedUrls = await getSignedImageUrls(L.images || []);
  const validUrls = signedUrls.filter(u => u);
  const imgsHtml = validUrls.length
    ? `<div class="lcp-images">${validUrls.map(src => `<img class="lcp-img" data-src="${escapeHtml(src)}" src="${escapeHtml(src)}" alt="">`).join('')}</div>`
    : '';

  let bodyHtml;
  if (L.body_html && L.body_html.trim()) {
    bodyHtml = sanitizeLetterHtml(L.body_html);
  } else {
    bodyHtml = escapeHtml(L.body || '').replace(/\n/g, '<br>');
  }

  const paperStyle = L.paper_style || 'cream';
  const titleHtml = L.title ? `<div class="lcp-title">${escapeHtml(L.title)}</div>` : '';

  // 받은 편지에만 휴지통 버튼 (보낸 편지는 안 보여줌)
  const isReceived = (L.to_user === State.me.id);
  const toolsHtml = isReceived
    ? `<div class="lcp-tools"><button class="lcp-tool danger" id="lcp-trash" title="휴지통으로" type="button">🗑</button></div>`
    : '';

  stage.innerHTML = `
    <div class="letter-content-paper lcp" id="lcp" data-paper="${escapeAttr(paperStyle)}">
      <div class="paper-texture-overlay"></div>
      ${toolsHtml}
      ${titleHtml}
      <div class="lcp-header">
        <div class="lcp-from"><span class="lbl">From</span>${escapeHtml(L.from_username)}</div>
        <div class="lcp-date">${longDate(L.sent_at)}</div>
      </div>
      <div class="lcp-body">${bodyHtml}</div>
      ${imgsHtml}
      <div class="lcp-signature">
        <span class="pre">— 발신지 ${escapeHtml(L.from_location_name || '')} · ${Math.round(L.distance)}km 떨어진 곳에서 —</span>
        ${escapeHtml(L.from_username)} 드림
      </div>
    </div>`;
  requestAnimationFrame(() => document.getElementById('lcp').classList.add('show'));

  stage.querySelectorAll('.lcp-img').forEach(img => {
    img.addEventListener('click', () => {
      document.getElementById('lightbox-img').src = img.dataset.src;
      document.getElementById('lightbox').classList.add('show');
    });
  });

  // 휴지통 버튼
  const trashBtn = document.getElementById('lcp-trash');
  if (trashBtn) {
    trashBtn.addEventListener('click', async () => {
      if (!confirm('이 편지를 휴지통으로 보내시겠습니까? (7일 후 영구 삭제)')) return;
      const ok = await trashLetter(L.id);
      if (ok) {
        document.getElementById('letter-modal').classList.remove('show');
      }
    });
  }

  // 친구 신청·답신 편지 처리
  if (L.friend_kind && typeof appendFriendActionBar === 'function') {
    await appendFriendActionBar(L);
  }

  renderAll();
}

// 보낸 편지 보기 — 봉투 단계 건너뛰고 바로 종이
async function openSentLetter(id) {
  const L = State.sent.find(x => x.id === id);
  if (!L) return;
  const stage = document.getElementById('letter-stage');
  stage.innerHTML = '';
  document.getElementById('letter-modal').classList.add('show');
  // renderLetterContent는 .lcp 안에 paper-texture-overlay·header·body 등을 그리는데
  // 보낸 편지의 경우 from은 본인이므로, 그대로 써도 의미 있음
  await renderLetterContent(L);
}

document.getElementById('modal-close').addEventListener('click', () => {
  document.getElementById('letter-modal').classList.remove('show');
});
document.getElementById('letter-modal').addEventListener('click', e => {
  if (e.target.id === 'letter-modal') document.getElementById('letter-modal').classList.remove('show');
});
document.getElementById('lightbox').addEventListener('click', () => {
  document.getElementById('lightbox').classList.remove('show');
});

// ═══════════════════════════════════════════════════════════
//  COMPOSE — recipient lookup + editor + style pickers + send
// ═══════════════════════════════════════════════════════════
const recipientInput = document.getElementById('recipient-input');
const recipientInfo  = document.getElementById('recipient-info');
const letterBody     = document.getElementById('letter-body');
const sendBtn        = document.getElementById('send-btn');
const deliveryEstimate = document.getElementById('delivery-estimate');
const imageInput     = document.getElementById('image-input');
const imageStrip     = document.getElementById('image-strip');

let recipientCheckTimer = null;
recipientInput.addEventListener('input', () => {
  clearTimeout(recipientCheckTimer);
  recipientCheckTimer = setTimeout(checkRecipient, 400);
});

async function checkRecipient() {
  const name = recipientInput.value.trim();
  if (!name) {
    recipientInfo.textContent = '';
    recipientInfo.className = 'recipient-info';
    State.recipientCache = null;
    updateComposeUi();
    return;
  }
  const { data, error } = await supa
    .from('profiles')
    .select('id, username, lat, lng, location_name')
    .eq('username', name)
    .maybeSingle();
  if (error || !data) {
    recipientInfo.innerHTML = '등록된 사람이 없습니다';
    recipientInfo.className = 'recipient-info error';
    State.recipientCache = null;
  } else {
    const dist = haversine(State.me.lat, State.me.lng, data.lat, data.lng);
    const ms = deliveryMs(dist);
    State.recipientCache = { profile: data, dist, ms };
    recipientInfo.innerHTML = `<span class="km">${Math.round(dist)}km</span><br>${escapeHtml(data.location_name)}`;
    recipientInfo.className = 'recipient-info ok';
  }
  updateComposeUi();
  // 우표 미리보기에 거리 반영
  if (typeof renderStampPicker === 'function') renderStampPicker();
  // 친구 신청 토글 가시성 갱신
  if (typeof refreshFriendToggleVisibility === 'function') refreshFriendToggleVisibility();
}

function updateComposeUi() {
  const body = (letterBody.innerText || '').trim();
  const hasContent = body.length > 0 || State.composeImages.length > 0;
  if (State.recipientCache) {
    deliveryEstimate.innerHTML = `예상 배송 시간 <strong>${formatDuration(State.recipientCache.ms)}</strong>`;
    sendBtn.disabled = !hasContent;
  } else {
    deliveryEstimate.textContent = recipientInput.value.trim()
      ? '받는 사람을 확인 중…'
      : '받는 사람을 입력하면 배송 시간이 표시됩니다';
    sendBtn.disabled = true;
  }
}
letterBody.addEventListener('input', updateComposeUi);

document.getElementById('add-image-btn').addEventListener('click', () => imageInput.click());
imageInput.addEventListener('change', async e => {
  const files = Array.from(e.target.files || []);
  for (const file of files) {
    if (State.composeImages.length >= 4) { showToast('최대 4장까지 첨부할 수 있어요'); break; }
    try {
      const compressed = await compressImage(file);
      State.composeImages.push(compressed);
    } catch (err) { console.error(err); showToast('이미지를 불러올 수 없습니다'); }
  }
  imageInput.value = '';
  renderImageStrip();
  updateComposeUi();
});

function renderImageStrip() {
  imageStrip.innerHTML = State.composeImages.map((img, i) => `
    <div class="img-thumb" style="background-image:url('${img.dataUrl}')">
      <button class="rm" data-i="${i}" type="button">×</button>
    </div>
  `).join('');
  imageStrip.querySelectorAll('.rm').forEach(b => {
    b.addEventListener('click', () => {
      State.composeImages.splice(parseInt(b.dataset.i), 1);
      renderImageStrip(); updateComposeUi();
    });
  });
}

// ───────────────────────────────────────────────────────────
//  PAPER / ENVELOPE PICKERS — 작성 영역 배경도 함께 변경
// ───────────────────────────────────────────────────────────
function renderPaperPicker() {
  const el = document.getElementById('paper-picker');
  el.innerHTML = PAPER_STYLES.map(p =>
    `<div class="paper-swatch ${p.id === State.composeStyle.paper ? 'active' : ''}"
          data-paper="${p.id}" title="${p.label}"></div>`
  ).join('');
  el.querySelectorAll('.paper-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      State.composeStyle.paper = sw.dataset.paper;
      el.querySelectorAll('.paper-swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
      // 작성 영역 배경도 즉시 변경
      const composePaper = document.getElementById('compose-paper');
      if (composePaper) composePaper.dataset.paper = State.composeStyle.paper;
    });
  });
}
function renderEnvelopePicker() {
  const el = document.getElementById('env-picker');
  el.innerHTML = ENVELOPE_STYLES.map(e =>
    `<div class="env-swatch ${e.id === State.composeStyle.envelope ? 'active' : ''}"
          data-env="${e.id}" title="${e.label}"></div>`
  ).join('');
  el.querySelectorAll('.env-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      State.composeStyle.envelope = sw.dataset.env;
      el.querySelectorAll('.env-swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
    });
  });
}

// ═══════════════════════════════════════════════════════════
//  STAMPS — 보유 우표 로드 / 선택 UI / 해금 알림
// ═══════════════════════════════════════════════════════════
async function loadMyStamps() {
  // 1) 우표 카탈로그 (전체)
  const { data: catalog, error: e1 } = await supa
    .from('stamps')
    .select('*')
    .order('display_order', { ascending: true });
  if (e1) { console.error(e1); return; }
  State.stampCatalog = catalog || [];

  // 2) 내가 보유한 우표
  const { data: owned, error: e2 } = await supa
    .from('user_stamps')
    .select('stamp_id')
    .eq('user_id', State.me.id);
  if (e2) { console.error(e2); return; }
  State.ownedStampIds = new Set((owned || []).map(r => r.stamp_id));
}

function renderStampPicker() {
  const el = document.getElementById('stamp-picker');
  if (!el || !State.stampCatalog) return;

  // 보유한 우표만 선택지로 노출
  const myStamps = State.stampCatalog.filter(s => State.ownedStampIds.has(s.id));
  if (myStamps.length === 0) {
    el.innerHTML = '<div style="font-family: \'Cormorant Garamond\', serif; font-style: italic; color: var(--sepia); font-size: 0.85rem;">보유한 우표가 없습니다</div>';
    return;
  }

  // 활성 우표가 보유 목록에 없으면 standard로 폴백
  if (!myStamps.find(s => s.id === State.composeStyle.stamp)) {
    State.composeStyle.stamp = myStamps[0].id;
  }

  // 거리는 받는 사람이 정해진 상태에서만 의미 있음 — 미정이면 ?
  const km = State.recipientCache ? Math.round(State.recipientCache.dist) : null;
  const sealColor = State.me.seal_color || 'crimson';

  el.innerHTML = myStamps.map(s => `
    <div class="stamp-option seal-${escapeAttr(sealColor)} ${s.id === State.composeStyle.stamp ? 'active' : ''}"
         data-stamp="${escapeAttr(s.id)}" title="${escapeHtml(s.name)}">
      <div class="so-svg">${renderStampSvg(s.id, { km, sealColor })}</div>
      <div class="so-name">${escapeHtml(s.name)}</div>
    </div>
  `).join('');

  el.querySelectorAll('.stamp-option').forEach(node => {
    node.addEventListener('click', () => {
      State.composeStyle.stamp = node.dataset.stamp;
      el.querySelectorAll('.stamp-option').forEach(n => n.classList.remove('active'));
      node.classList.add('active');
    });
  });
}

function showStampUnlock(stampId) {
  const stamp = (State.stampCatalog || []).find(s => s.id === stampId);
  if (!stamp) return;
  const km = null;
  const sealColor = State.me.seal_color || 'crimson';
  const modal = document.getElementById('unlock-modal');
  document.getElementById('uc-stamp').className = 'uc-stamp seal-' + escapeAttr(sealColor);
  document.getElementById('uc-stamp').innerHTML = renderStampSvg(stampId, { km, sealColor });
  document.getElementById('uc-name').textContent = stamp.name;
  document.getElementById('uc-desc').textContent = stamp.description;
  modal.classList.add('show');
}
document.getElementById('uc-btn').addEventListener('click', () => {
  document.getElementById('unlock-modal').classList.remove('show');
});

// 우표함 (프로필 모달 안의 컬렉션) 렌더 — auth.js 의 openProfileModal 에서 호출
function renderCollection() {
  const grid = document.getElementById('collection-grid');
  const detail = document.getElementById('collection-detail');
  if (!grid || !State.stampCatalog) return;
  const km = null;
  const sealColor = State.me.seal_color || 'crimson';

  grid.innerHTML = State.stampCatalog.map(s => {
    const owned = State.ownedStampIds.has(s.id);
    const hidden = s.hidden && !owned;
    if (hidden) {
      return `<div class="collection-item locked" data-stamp="${escapeAttr(s.id)}" data-name="???" data-desc="아직 발견되지 않은 우표입니다."></div>`;
    }
    if (!owned) {
      return `<div class="collection-item locked" data-stamp="${escapeAttr(s.id)}"
                   data-name="${escapeAttr(s.name)}" data-desc="${escapeAttr(s.description)}">
                <div class="ci-svg seal-${escapeAttr(sealColor)}">${renderStampSvg(s.id, { km, sealColor })}</div>
              </div>`;
    }
    return `<div class="collection-item seal-${escapeAttr(sealColor)}" data-stamp="${escapeAttr(s.id)}"
                 data-name="${escapeAttr(s.name)}" data-desc="${escapeAttr(s.description)}">
              <div class="ci-svg">${renderStampSvg(s.id, { km, sealColor })}</div>
            </div>`;
  }).join('');

  // 호버하면 아래 디테일에 설명
  grid.querySelectorAll('.collection-item').forEach(node => {
    node.addEventListener('mouseenter', () => {
      const name = node.dataset.name;
      const desc = node.dataset.desc;
      detail.innerHTML = `<strong>${escapeHtml(name)}</strong> — ${escapeHtml(desc)}`;
    });
  });
  grid.addEventListener('mouseleave', () => { detail.innerHTML = ''; });
}

// ───────────────────────────────────────────────────────────
//  RICH EDITOR TOOLBAR
// ───────────────────────────────────────────────────────────
const tbFontSelect = document.getElementById('tb-font');
tbFontSelect.addEventListener('change', () => {
  letterBody.classList.remove('font-pen', 'font-myeongjo', 'font-cursive', 'font-cute');
  letterBody.classList.add('font-' + tbFontSelect.value);
  letterBody.focus();
});

document.querySelectorAll('.tb-btn[data-cmd]').forEach(btn => {
  btn.addEventListener('mousedown', e => e.preventDefault());
  btn.addEventListener('click', () => {
    document.execCommand(btn.dataset.cmd, false, null);
    updateToolbarState();
    letterBody.focus();
  });
});

document.querySelectorAll('.tb-color').forEach(btn => {
  btn.addEventListener('mousedown', e => e.preventDefault());
  btn.addEventListener('click', () => {
    const color = TEXT_COLORS[btn.dataset.color] || TEXT_COLORS.ink;
    document.execCommand('foreColor', false, color);
    document.querySelectorAll('.tb-color').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    letterBody.focus();
  });
});

function updateToolbarState() {
  ['bold', 'italic', 'underline'].forEach(cmd => {
    const btn = document.querySelector(`.tb-btn[data-cmd="${cmd}"]`);
    if (!btn) return;
    try {
      btn.classList.toggle('active', document.queryCommandState(cmd));
    } catch {}
  });
}
letterBody.addEventListener('keyup', updateToolbarState);
letterBody.addEventListener('mouseup', updateToolbarState);

letterBody.addEventListener('paste', e => {
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text/plain');
  document.execCommand('insertText', false, text);
});

// ───────────────────────────────────────────────────────────
//  RENDER SENT LIST
// ───────────────────────────────────────────────────────────
function renderSent() {
  const list = document.getElementById('sent-list');
  if (State.sent.length === 0) {
    list.innerHTML = `<div class="empty-state">
      <div class="ico">✉</div>
      <div>보낸 편지가 없습니다</div>
      <em>You haven't sent any letters yet</em>
    </div>`;
    return;
  }
  const now = Date.now();
  list.innerHTML = State.sent.map(L => {
    const deliverAt = new Date(L.deliver_at).getTime();
    let status, statusClass;
    if (L.opened) { status = '읽음'; statusClass = 'opened'; }
    else if (deliverAt <= now) { status = '도착'; statusClass = 'delivered'; }
    else { status = `${formatTimeRemaining(deliverAt - now)} 도착`; statusClass = 'transit'; }
    const init = (L.to_username || '?')[0].toUpperCase();
    const preview = (L.body || ((L.images || []).length ? '[사진 ' + L.images.length + '장]' : '')).slice(0, 60);
    const openedTxt = L.opened && L.opened_at ? ' · ' + shortDate(L.opened_at) + ' 읽음' : '';
    const titleHtml = L.title ? `<div class="title-line">${escapeHtml(L.title)}</div>` : '';
    return `
      <div class="sent-item ${statusClass}" data-letter-id="${escapeAttr(L.id)}">
        <div class="icon-circ">${escapeHtml(init)}</div>
        <div class="meta">
          ${titleHtml}
          <div class="to">${escapeHtml(L.to_username)} <span style="color:var(--sepia);font-weight:400;font-size:0.85rem;">· ${Math.round(L.distance)}km</span></div>
          <div class="preview">${escapeHtml(preview)}</div>
        </div>
        <div class="status">
          ${status}
          <span class="when">${shortDate(L.sent_at)} 발송${openedTxt}</span>
        </div>
      </div>`;
  }).join('');

  // 클릭 시 본문 보기
  list.querySelectorAll('.sent-item[data-letter-id]').forEach(node => {
    node.addEventListener('click', () => openSentLetter(node.dataset.letterId));
  });
}

// ───────────────────────────────────────────────────────────
//  SEND
// ───────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════
//  SEND — 두 단계: (1) 봉투화 시퀀스로 보여주기 (2) 확인 후 실제 발송
// ═══════════════════════════════════════════════════════════
sendBtn.addEventListener('click', startSealSequence);

function startSealSequence() {
  if (!State.recipientCache) return;
  const bodyText = (letterBody.innerText || '').trim();
  if (!bodyText && State.composeImages.length === 0) return;

  const fp = document.getElementById('fold-paper');
  const envWrap = document.getElementById('seal-env-wrap');
  const env = document.getElementById('seal-envelope');
  const impactSeal = document.getElementById('impact-seal');
  const confirm = document.getElementById('seal-confirm');
  const meta = document.getElementById('sc-meta');

  // 초기 상태 리셋
  fp.classList.remove('fold-1', 'fold-2');
  fp.style.opacity = '1';
  fp.dataset.paper = State.composeStyle.paper;
  envWrap.classList.remove('show');
  env.classList.remove('flap-closed', 'sealed', 'flying');
  env.dataset.env = State.composeStyle.envelope;
  // 인장 색
  env.className = 'seal-envelope seal-' + escapeAttr(State.me.seal_color || 'crimson');
  // 인장 심볼
  const sym = (State.me.seal_symbol && State.me.seal_symbol.length)
              ? State.me.seal_symbol : (State.me.username || '?')[0].toUpperCase();
  impactSeal.textContent = sym;
  confirm.classList.remove('show');

  // 미리보기 본문 (글자 수 제한)
  const previewText = (bodyText || '').slice(0, 200);
  fp.textContent = previewText || '(사진만 첨부)';

  // 메타 텍스트
  const dist = State.recipientCache.dist;
  const ms = State.recipientCache.ms;
  meta.innerHTML = `<strong>${escapeHtml(State.recipientCache.profile.username)}</strong>님께 · ${Math.round(dist)} km · 도착까지 약 ${escapeHtml(formatDuration(ms))}`;

  // 모달 띄우기
  document.getElementById('seal-modal').classList.add('show');

  // 시퀀스 진행
  setTimeout(() => fp.classList.add('fold-1'), 200);
  setTimeout(() => fp.classList.add('fold-2'), 700);
  setTimeout(() => {
    fp.style.opacity = '0';
    envWrap.classList.add('show');
  }, 1200);
  setTimeout(() => {
    env.classList.add('flap-closed');
  }, 1500);
  setTimeout(() => {
    env.classList.add('sealed');
  }, 2200);
  setTimeout(() => {
    confirm.classList.add('show');
  }, 2700);
}

document.getElementById('sc-cancel').addEventListener('click', () => {
  document.getElementById('seal-modal').classList.remove('show');
});
document.getElementById('seal-modal').addEventListener('click', e => {
  if (e.target.id === 'seal-modal') {
    // 클릭으로 닫기는 막기 — 사용자가 의도치 않게 취소되는 걸 방지
  }
});

document.getElementById('sc-confirm').addEventListener('click', async () => {
  // 봉투 날아가는 애니메이션 후 실제 발송
  const env = document.getElementById('seal-envelope');
  const confirm = document.getElementById('seal-confirm');
  confirm.classList.remove('show');
  env.classList.add('flying');
  // 발송 자체는 애니메이션과 병행
  const sendPromise = doSendLetter();
  setTimeout(async () => {
    document.getElementById('seal-modal').classList.remove('show');
    try {
      await sendPromise;
    } catch (err) {
      // doSendLetter 내부에서 toast 처리됨
    }
  }, 1200);
});

async function doSendLetter() {
  if (!State.recipientCache) return;
  const bodyText = (letterBody.innerText || '').trim();
  const bodyHtmlRaw = letterBody.innerHTML;
  if (!bodyText && State.composeImages.length === 0) return;

  const titleVal = (document.getElementById('letter-title-input').value || '').trim().slice(0, 60);

  try {
    const letterId = (crypto.randomUUID && crypto.randomUUID()) || (Date.now() + '-' + Math.random().toString(36).slice(2));
    const imagePaths = [];

    for (let i = 0; i < State.composeImages.length; i++) {
      const path = `${State.user.id}/${letterId}/${i}.jpg`;
      const { error: upErr } = await supa.storage
        .from('letter-images')
        .upload(path, State.composeImages[i].blob, { contentType: 'image/jpeg', upsert: false });
      if (upErr) throw upErr;
      imagePaths.push(path);
    }

    const dist = State.recipientCache.dist;
    const ms = State.recipientCache.ms;
    const now = Date.now();
    const safeBodyHtml = sanitizeLetterHtml(bodyHtmlRaw);

    // 공통 letter payload
    const payload = {
      from_username: State.me.username,
      from_location_name: State.me.location_name,
      from_lat: State.me.lat,
      from_lng: State.me.lng,
      to_username: State.recipientCache.profile.username,
      title: titleVal,
      body: bodyText,
      body_html: safeBodyHtml,
      images: imagePaths,
      distance: dist,
      sent_at: new Date(now).toISOString(),
      deliver_at: new Date(now + ms).toISOString(),
      paper_style: State.composeStyle.paper,
      envelope_style: State.composeStyle.envelope,
      stamp_id: State.composeStyle.stamp || 'standard',
      seal_color: State.me.seal_color || 'crimson',
      seal_symbol: State.me.seal_symbol || ''
    };

    // 분기 — 답신, 친구 신청, 일반
    if (State.acceptingRequest) {
      // 수락 답신 편지
      const { error } = await supa.rpc('send_accept_reply', {
        request_id: State.acceptingRequest,
        letter_id: letterId,
        letter_payload: payload
      });
      if (error) throw error;
      State.acceptingRequest = null;
      showToast(`✓ 답신을 보냈어요. 도착하면 친구가 됩니다 (${formatDuration(ms)} 후)`);
    } else if (State.composeFriendRequest) {
      // 친구 신청 편지
      const { error } = await supa.rpc('send_friend_request', {
        to_user_id: State.recipientCache.profile.id,
        letter_id: letterId,
        letter_payload: payload
      });
      if (error) throw error;
      State.composeFriendRequest = false;
      friendToggle.classList.remove('on');
      showToast(`♥ ${State.recipientCache.profile.username}님께 친구 신청 편지를 보냈어요 (${formatDuration(ms)} 후 도착)`);
    } else {
      // 일반 편지
      const { error } = await supa.from('letters').insert({
        id: letterId,
        from_user: State.me.id,
        from_username: State.me.username,
        from_location_name: State.me.location_name,
        from_lat: State.me.lat,
        from_lng: State.me.lng,
        to_user: State.recipientCache.profile.id,
        to_username: State.recipientCache.profile.username,
        title: titleVal,
        body: bodyText,
        body_html: safeBodyHtml,
        images: imagePaths,
        distance: dist,
        sent_at: new Date(now).toISOString(),
        deliver_at: new Date(now + ms).toISOString(),
        paper_style: State.composeStyle.paper,
        envelope_style: State.composeStyle.envelope,
        stamp_id: State.composeStyle.stamp || 'standard',
        seal_color: State.me.seal_color || 'crimson',
        seal_symbol: State.me.seal_symbol || ''
      });
      if (error) throw error;
      showToast(`✈ ${State.recipientCache.profile.username}님에게 편지를 보냈어요 (${formatDuration(ms)} 후 도착)`);
    }

    // 폼 리셋
    letterBody.innerHTML = '';
    document.getElementById('letter-title-input').value = '';
    State.composeImages = [];
    renderImageStrip();

    await Promise.all([loadSent(), loadPendingRequests()]);
    renderAll();
    document.querySelector('.tab[data-tab="sent"]').click();

    // 지도 우체통 갱신 (보낸 위치에 우체통 추가됨)
    if (State.mapInitialized && typeof buildPostboxes === 'function') {
      buildPostboxes();
      renderPostboxes();
    }

    checkAchievementsBackground();
  } catch (err) {
    console.error(err);
    showToast('편지를 보내지 못했습니다: ' + (err.message || ''));
  }
}
