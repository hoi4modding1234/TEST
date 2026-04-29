// ═══════════════════════════════════════════════════════════
//  pins.js — 지도 + 핀 시스템
//  Leaflet 사용, 핀은 밀랍 봉인 디자인
// ═══════════════════════════════════════════════════════════

State.map = null;
State.mapInitialized = false;
State.pins = [];                 // 모든 로드된 핀 (내 핀 + 친구 친구 공개 핀)
State.pinMarkers = new Map();    // pin_id → leaflet marker
State.mapFilter = 'mine';        // 'mine' | 'friends' | 'all'
State.composePin = {             // 핀 작성 중 상태
  lat: null, lng: null,
  imageBlob: null, imageDataUrl: null,
  visibility: 'private',
  editingId: null                 // 편집 중인 핀 id (null이면 신규)
};

// ─── 우체통 (postbox) 시스템 ───
State.postboxes = [];            // [{ key, lat, lng, letters: [...] }]
State.postboxMarkers = new Map();// key → leaflet marker
State.postboxesVisible = true;   // 우체통 토글 상태
const POSTBOX_GRID = 0.01;       // 격자 크기 (~1km, 동네 단위)

function postboxKey(lat, lng) {
  // 격자에 스냅 — 같은 격자 안의 좌표는 같은 key를 가짐
  const gx = Math.floor(lat / POSTBOX_GRID);
  const gy = Math.floor(lng / POSTBOX_GRID);
  return `${gx}:${gy}`;
}

function postboxCenter(key) {
  // 격자의 중심 좌표 반환 (마커 위치용)
  const [gx, gy] = key.split(':').map(Number);
  return {
    lat: (gx + 0.5) * POSTBOX_GRID,
    lng: (gy + 0.5) * POSTBOX_GRID
  };
}

// ═══════════════════════════════════════════════════════════
//  지도 초기화
// ═══════════════════════════════════════════════════════════
function initMap() {
  if (State.mapInitialized) {
    // 탭 전환 후 컨테이너 크기가 바뀌었을 수 있으므로 여러 번 invalidate
    if (State.map) {
      requestAnimationFrame(() => State.map.invalidateSize());
      setTimeout(() => State.map.invalidateSize(), 100);
      setTimeout(() => State.map.invalidateSize(), 400);
    }
    return;
  }

  // 컨테이너가 실제로 화면에 보이고 크기가 측정 가능한 시점까지 기다림
  const el = document.getElementById('leaflet-map');
  if (!el || el.offsetWidth === 0 || el.offsetHeight === 0) {
    // 아직 panel.active 가 적용되지 않음 — 다음 프레임에 재시도
    requestAnimationFrame(initMap);
    return;
  }

  if (typeof L === 'undefined') {
    console.error('Leaflet not loaded');
    showToast('지도 라이브러리를 불러오지 못했어요. 새로고침 해주세요.');
    return;
  }

  const startLat = State.me?.lat || 37.5665;
  const startLng = State.me?.lng || 126.9780;

  const map = L.map('leaflet-map', {
    center: [startLat, startLng],
    zoom: 11,
    zoomControl: false,  // 기본 zoom control 끄고 아래에서 직접 위치 지정
    worldCopyJump: true
  });

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  State.map = map;
  State.mapInitialized = true;

  setupLongPress(map);

  // 첫 렌더 후 크기 재측정 보강 — Leaflet 의 흔한 함정
  setTimeout(() => map.invalidateSize(), 100);
  setTimeout(() => map.invalidateSize(), 500);

  // 초기 힌트 페이드
  setTimeout(() => {
    const hint = document.getElementById('map-hint');
    if (hint) hint.classList.add('fade');
  }, 5000);
}

// ═══════════════════════════════════════════════════════════
//  롱프레스 검출
// ═══════════════════════════════════════════════════════════
function setupLongPress(map) {
  let pressTimer = null;
  let pressLatLng = null;
  let pressContainerPoint = null;
  let indicator = null;

  function startPress(latlng, containerPoint) {
    cancelPress();
    pressLatLng = latlng;
    pressContainerPoint = containerPoint;

    // 시각 표시
    indicator = document.createElement('div');
    indicator.className = 'map-longpress-indicator';
    indicator.style.left = containerPoint.x + 'px';
    indicator.style.top = containerPoint.y + 'px';
    map.getContainer().appendChild(indicator);
    requestAnimationFrame(() => indicator.classList.add('active'));

    pressTimer = setTimeout(() => {
      // 롱프레스 완료
      const ll = pressLatLng;
      cancelPress();
      openPinComposer(ll.lat, ll.lng);
    }, 600);
  }

  function cancelPress() {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    if (indicator) {
      indicator.classList.remove('active');
      const el = indicator;
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 150);
      indicator = null;
    }
  }

  // Leaflet 이벤트 — 마우스 + 터치 통합
  map.on('mousedown', e => {
    if (e.originalEvent.button !== 0) return;  // 좌클릭만
    startPress(e.latlng, e.containerPoint);
  });
  map.on('mouseup mouseout dragstart movestart zoomstart', cancelPress);
  map.on('mousemove', e => {
    // 살짝의 흔들림은 허용, 그 이상 움직이면 취소
    if (!pressContainerPoint) return;
    const dx = e.containerPoint.x - pressContainerPoint.x;
    const dy = e.containerPoint.y - pressContainerPoint.y;
    if (dx*dx + dy*dy > 100) cancelPress();
  });

  // 터치
  const container = map.getContainer();
  container.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) { cancelPress(); return; }
    const t = e.touches[0];
    const rect = container.getBoundingClientRect();
    const cp = L.point(t.clientX - rect.left, t.clientY - rect.top);
    const ll = map.containerPointToLatLng(cp);
    startPress(ll, cp);
  }, { passive: true });
  container.addEventListener('touchmove', e => {
    if (!pressContainerPoint) return;
    const t = e.touches[0];
    const rect = container.getBoundingClientRect();
    const dx = (t.clientX - rect.left) - pressContainerPoint.x;
    const dy = (t.clientY - rect.top) - pressContainerPoint.y;
    if (dx*dx + dy*dy > 100) cancelPress();
  }, { passive: true });
  container.addEventListener('touchend', cancelPress);
  container.addEventListener('touchcancel', cancelPress);
}

// ═══════════════════════════════════════════════════════════
//  GPS 버튼
// ═══════════════════════════════════════════════════════════
document.getElementById('map-locate').addEventListener('click', () => {
  if (!navigator.geolocation || !State.map) return;
  const btn = document.getElementById('map-locate');
  btn.classList.add('active');
  navigator.geolocation.getCurrentPosition(
    pos => {
      State.map.setView([pos.coords.latitude, pos.coords.longitude], 14);
      btn.classList.remove('active');
    },
    () => {
      btn.classList.remove('active');
      showToast('위치를 가져올 수 없어요');
    },
    { timeout: 10000 }
  );
});

// ═══════════════════════════════════════════════════════════
//  필터
// ═══════════════════════════════════════════════════════════
document.querySelectorAll('#map-filter button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#map-filter button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    State.mapFilter = btn.dataset.filter;
    renderPins();
  });
});

// ═══════════════════════════════════════════════════════════
//  핀 로드 및 렌더
// ═══════════════════════════════════════════════════════════
async function loadPins() {
  const { data, error } = await supa
    .from('pins')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { console.error(error); return; }
  State.pins = data || [];

  // 친구·다른 사람의 핀이라면 작성자 정보를 별도로 조회
  const otherIds = [...new Set(
    State.pins.filter(p => p.user_id !== State.me.id).map(p => p.user_id)
  )];
  if (otherIds.length > 0) {
    const { data: profs } = await supa
      .from('profiles')
      .select('id, username, seal_color, seal_symbol')
      .in('id', otherIds);
    const byId = {};
    for (const p of (profs || [])) byId[p.id] = p;
    for (const pin of State.pins) {
      if (pin.user_id !== State.me.id && byId[pin.user_id]) {
        pin._author = byId[pin.user_id];
      }
    }
  }
}

function fadeStage(createdAt) {
  // 1개월 미만 / 6개월 미만 / 1년 미만 / 1년+ / 2년+
  const ms = Date.now() - new Date(createdAt).getTime();
  const days = ms / (1000 * 60 * 60 * 24);
  if (days < 30) return 0;
  if (days < 180) return 1;
  if (days < 365) return 2;
  return 3;
}

function renderPins() {
  if (!State.map) return;

  // 기존 마커 제거
  for (const marker of State.pinMarkers.values()) {
    marker.remove();
  }
  State.pinMarkers.clear();

  const filter = State.mapFilter;
  let visible = State.pins;
  if (filter === 'mine') {
    visible = State.pins.filter(p => p.user_id === State.me.id);
  } else if (filter === 'friends') {
    visible = State.pins.filter(p => p.user_id !== State.me.id);
  }
  // 'all' 은 모두

  for (const pin of visible) {
    addPinMarker(pin);
  }
}

function addPinMarker(pin) {
  const isMine = pin.user_id === State.me.id;
  const sealColor = isMine
    ? (State.me.seal_color || 'crimson')
    : (pin._author?.seal_color || 'crimson');
  const fade = fadeStage(pin.created_at);
  const fadeClass = fade > 0 ? ` fade-${fade}` : '';
  const mineClass = isMine ? ' mine' : '';
  const imgClass = pin.image_path ? ' has-image' : '';

  const html = `
    <div class="pin-marker seal-${sealColor}${mineClass}${imgClass}${fadeClass}">
      <div class="pin-disc"></div>
    </div>`;

  const icon = L.divIcon({
    className: 'pin-icon-wrap',
    html,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
  const marker = L.marker([pin.lat, pin.lng], { icon, riseOnHover: true });
  marker.on('click', () => openPinView(pin.id));
  marker.addTo(State.map);
  State.pinMarkers.set(pin.id, marker);
}

// ═══════════════════════════════════════════════════════════
//  핀 작성 모달
// ═══════════════════════════════════════════════════════════
const pinComposeModal = document.getElementById('pin-compose-modal');
const pinImageArea = document.getElementById('pin-image-area');
const pinImageInput = document.getElementById('pin-image-input');
const pinMessageInput = document.getElementById('pin-message-input');
const pinMessageCount = document.getElementById('pin-message-count');
const pinVisibilityToggle = document.getElementById('pin-visibility-toggle');

function openPinComposer(lat, lng, existingPin = null) {
  State.composePin = {
    lat, lng,
    imageBlob: null,
    imageDataUrl: existingPin?.image_path ? '__loading__' : null,
    visibility: existingPin?.visibility || 'private',
    editingId: existingPin?.id || null
  };

  document.getElementById('pin-compose-coord').textContent =
    `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  pinMessageInput.value = existingPin?.message || '';
  pinMessageCount.textContent = pinMessageInput.value.length;
  pinVisibilityToggle.classList.toggle('on', State.composePin.visibility === 'friends');

  if (existingPin?.image_path) {
    // 기존 이미지 로드
    loadPinImageForEdit(existingPin.image_path);
  } else {
    pinImageArea.innerHTML = `
      <div class="pin-image-hint">사진 한 장 (선택)</div>
      <input type="file" id="pin-image-input" accept="image/*" style="display:none;">
    `;
    rebindPinImageHandlers();
  }

  pinComposeModal.classList.add('show');
}

async function loadPinImageForEdit(path) {
  const { data, error } = await supa.storage.from('pin-images').createSignedUrl(path, 3600);
  if (error) { console.error(error); return; }
  pinImageArea.innerHTML = `
    <img src="${data.signedUrl}" alt="">
    <button class="pin-image-remove" id="pin-image-remove" type="button">×</button>
    <input type="file" id="pin-image-input" accept="image/*" style="display:none;">
  `;
  // existing 이미지를 그대로 유지 — composePin.imageDataUrl='__keep__' 으로 표시
  State.composePin.imageDataUrl = '__keep__';
  rebindPinImageHandlers();
}

function rebindPinImageHandlers() {
  const input = document.getElementById('pin-image-input');
  pinImageArea.addEventListener('click', e => {
    if (e.target.id === 'pin-image-remove') return;  // 제거 버튼은 별도 처리
    input.click();
  });
  input.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      State.composePin.imageBlob = compressed.blob;
      State.composePin.imageDataUrl = compressed.dataUrl;
      pinImageArea.innerHTML = `
        <img src="${compressed.dataUrl}" alt="">
        <button class="pin-image-remove" id="pin-image-remove" type="button">×</button>
        <input type="file" id="pin-image-input" accept="image/*" style="display:none;">
      `;
      rebindPinImageHandlers();
    } catch (err) {
      console.error(err);
      showToast('이미지를 불러올 수 없습니다');
    }
  });
  const rm = document.getElementById('pin-image-remove');
  if (rm) {
    rm.addEventListener('click', e => {
      e.stopPropagation();
      State.composePin.imageBlob = null;
      State.composePin.imageDataUrl = null;
      pinImageArea.innerHTML = `
        <div class="pin-image-hint">사진 한 장 (선택)</div>
        <input type="file" id="pin-image-input" accept="image/*" style="display:none;">
      `;
      rebindPinImageHandlers();
    });
  }
}

pinMessageInput.addEventListener('input', () => {
  pinMessageCount.textContent = pinMessageInput.value.length;
});

pinVisibilityToggle.addEventListener('click', () => {
  State.composePin.visibility = (State.composePin.visibility === 'friends') ? 'private' : 'friends';
  pinVisibilityToggle.classList.toggle('on', State.composePin.visibility === 'friends');
});

document.getElementById('pin-compose-close').addEventListener('click', () => {
  pinComposeModal.classList.remove('show');
});
document.getElementById('pin-compose-cancel').addEventListener('click', () => {
  pinComposeModal.classList.remove('show');
});
pinComposeModal.addEventListener('click', e => {
  if (e.target === pinComposeModal) pinComposeModal.classList.remove('show');
});

// ═══════════════════════════════════════════════════════════
//  핀 저장 (신규/수정)
// ═══════════════════════════════════════════════════════════
document.getElementById('pin-compose-save').addEventListener('click', savePin);

async function savePin() {
  const message = (pinMessageInput.value || '').trim().slice(0, 200);
  if (!message && !State.composePin.imageBlob && State.composePin.imageDataUrl !== '__keep__') {
    showToast('메시지나 사진 중 하나는 있어야 해요');
    return;
  }

  const btn = document.getElementById('pin-compose-save');
  btn.disabled = true;
  btn.textContent = '저장 중…';

  try {
    const editing = !!State.composePin.editingId;
    let pinId = State.composePin.editingId || (crypto.randomUUID && crypto.randomUUID()) || (Date.now() + '-' + Math.random().toString(36).slice(2));
    let imagePath = null;

    // 이미지 처리
    if (State.composePin.imageBlob) {
      // 새 이미지 업로드
      imagePath = `${State.user.id}/${pinId}.jpg`;
      const { error: upErr } = await supa.storage
        .from('pin-images')
        .upload(imagePath, State.composePin.imageBlob, {
          contentType: 'image/jpeg',
          upsert: true
        });
      if (upErr) throw upErr;
    } else if (State.composePin.imageDataUrl === '__keep__') {
      // 편집 모드에서 기존 이미지 유지 — 기존 path 사용
      const existing = State.pins.find(p => p.id === pinId);
      imagePath = existing?.image_path || null;
    } else {
      // 사진 없음 — 편집 시엔 기존 이미지 삭제
      if (editing) {
        const existing = State.pins.find(p => p.id === pinId);
        if (existing?.image_path) {
          await supa.storage.from('pin-images').remove([existing.image_path]).catch(() => {});
        }
      }
      imagePath = null;
    }

    if (editing) {
      const { error } = await supa.from('pins').update({
        message,
        image_path: imagePath,
        visibility: State.composePin.visibility
      }).eq('id', pinId);
      if (error) throw error;
      showToast('핀이 수정되었어요');
    } else {
      const { error } = await supa.from('pins').insert({
        id: pinId,
        user_id: State.me.id,
        lat: State.composePin.lat,
        lng: State.composePin.lng,
        message,
        image_path: imagePath,
        visibility: State.composePin.visibility
      });
      if (error) throw error;
      showToast('핀을 꽂았어요');
    }

    pinComposeModal.classList.remove('show');
    await loadPins();
    renderPins();
  } catch (err) {
    console.error(err);
    showToast('저장 실패: ' + (err.message || ''));
  } finally {
    btn.disabled = false;
    btn.textContent = '꽂기';
  }
}

// ═══════════════════════════════════════════════════════════
//  핀 보기 모달
// ═══════════════════════════════════════════════════════════
const pinViewModal = document.getElementById('pin-view-modal');

async function openPinView(pinId) {
  const pin = State.pins.find(p => p.id === pinId);
  if (!pin) return;

  const isMine = pin.user_id === State.me.id;
  const author = isMine
    ? { username: State.me.username, seal_color: State.me.seal_color, seal_symbol: State.me.seal_symbol }
    : pin._author;
  const sealColor = author?.seal_color || 'crimson';
  const sealSymbol = (author?.seal_symbol && author.seal_symbol.length)
    ? author.seal_symbol
    : (author?.username || '?')[0].toUpperCase();
  const colors = sealColorVars(sealColor);

  document.getElementById('pin-view-author').innerHTML = `
    <div class="pva-seal" style="background: radial-gradient(circle at 35% 35%, ${colors[0]} 0%, ${colors[1]} 50%, ${colors[2]} 100%);">${escapeHtml(sealSymbol)}</div>
    <div class="pva-info">
      <div class="name">${escapeHtml(author?.username || '—')}</div>
      <div class="when">${longDate(pin.created_at)}</div>
    </div>
  `;

  document.getElementById('pin-view-coord').textContent =
    `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}`;

  // 이미지
  const imgWrap = document.getElementById('pin-view-image-wrap');
  if (pin.image_path) {
    imgWrap.innerHTML = `<div style="background: var(--paper-deep); aspect-ratio: 4/3; display: flex; align-items: center; justify-content: center; font-family: 'Cormorant Garamond', serif; font-style: italic; color: var(--sepia);">사진 불러오는 중…</div>`;
    const { data, error } = await supa.storage.from('pin-images').createSignedUrl(pin.image_path, 3600);
    if (data?.signedUrl) {
      imgWrap.innerHTML = `<img class="pin-view-image" src="${data.signedUrl}" alt="">`;
      imgWrap.querySelector('img').addEventListener('click', () => {
        document.getElementById('lightbox-img').src = data.signedUrl;
        document.getElementById('lightbox').classList.add('show');
      });
    } else {
      imgWrap.innerHTML = '';
    }
  } else {
    imgWrap.innerHTML = '';
  }

  document.getElementById('pin-view-message').textContent = pin.message || '';

  // 액션 버튼 — 본인 핀이면 수정/삭제, 아니면 닫기만
  const actions = document.getElementById('pin-view-actions');
  if (isMine) {
    actions.innerHTML = `
      <button class="pin-btn danger" id="pv-delete" type="button">삭제</button>
      <button class="pin-btn secondary" id="pv-close" type="button">닫기</button>
      <button class="pin-btn primary" id="pv-edit" type="button">수정</button>
    `;
    document.getElementById('pv-delete').addEventListener('click', () => deletePin(pin));
    document.getElementById('pv-edit').addEventListener('click', () => {
      pinViewModal.classList.remove('show');
      openPinComposer(pin.lat, pin.lng, pin);
    });
    document.getElementById('pv-close').addEventListener('click', () => pinViewModal.classList.remove('show'));
  } else {
    actions.innerHTML = `<button class="pin-btn secondary" id="pv-close" type="button">닫기</button>`;
    document.getElementById('pv-close').addEventListener('click', () => pinViewModal.classList.remove('show'));
  }

  pinViewModal.classList.add('show');
}

document.getElementById('pin-view-close').addEventListener('click', () => {
  pinViewModal.classList.remove('show');
});
pinViewModal.addEventListener('click', e => {
  if (e.target === pinViewModal) pinViewModal.classList.remove('show');
});

async function deletePin(pin) {
  if (!confirm('이 핀을 영구 삭제하시겠습니까?')) return;
  try {
    if (pin.image_path) {
      await supa.storage.from('pin-images').remove([pin.image_path]).catch(() => {});
    }
    const { error } = await supa.from('pins').delete().eq('id', pin.id);
    if (error) throw error;
    showToast('핀을 삭제했어요');
    pinViewModal.classList.remove('show');
    await loadPins();
    renderPins();
  } catch (err) {
    showToast('삭제 실패: ' + (err.message || ''));
  }
}

// ═══════════════════════════════════════════════════════════
//  우체통 (Postbox) — 편지 발신/수신 지점 시각화
// ═══════════════════════════════════════════════════════════

// 우체통 토글
document.getElementById('postbox-toggle').addEventListener('click', () => {
  State.postboxesVisible = !State.postboxesVisible;
  const btn = document.getElementById('postbox-toggle');
  btn.classList.toggle('active', State.postboxesVisible);
  renderPostboxes();
});

// 편지를 격자별로 그룹핑
function buildPostboxes() {
  const all = [
    ...State.letters.map(l => ({ ...l, _direction: 'received' })),
    ...State.sent.map(l => ({ ...l, _direction: 'sent' }))
  ];

  const groups = new Map();
  for (const L of all) {
    if (L.from_lat == null || L.from_lng == null) continue;
    const key = postboxKey(L.from_lat, L.from_lng);
    if (!groups.has(key)) {
      // 이 격자의 첫 편지 좌표를 마커 위치로 사용 (격자 중심 X)
      groups.set(key, { key, lat: L.from_lat, lng: L.from_lng, letters: [] });
    }
    groups.get(key).letters.push(L);
  }

  for (const pb of groups.values()) {
    pb.letters.sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));
  }

  State.postboxes = Array.from(groups.values());
}

function renderPostboxes() {
  if (!State.map) return;

  // 기존 마커 제거
  for (const marker of State.postboxMarkers.values()) marker.remove();
  State.postboxMarkers.clear();

  if (!State.postboxesVisible) return;

  for (const pb of State.postboxes) {
    addPostboxMarker(pb);
  }
}

function addPostboxMarker(pb) {
  const count = pb.letters.length;
  const html = postboxSvg(count);
  const icon = L.divIcon({
    className: 'postbox-icon-wrap',
    html,
    iconSize: [36, 48],
    iconAnchor: [18, 44]  // 우체통 발 부분이 좌표를 가리키도록
  });
  const marker = L.marker([pb.lat, pb.lng], { icon, riseOnHover: true, zIndexOffset: 1000 });
  marker.on('click', () => openPostboxModal(pb.key));
  marker.addTo(State.map);
  State.postboxMarkers.set(pb.key, marker);
}

function postboxSvg(count) {
  // 영국식 빨간 원기둥 우체통 — 단순화된 미니어처
  return `
    <div class="postbox-marker" title="${count}통의 편지">
      <svg viewBox="0 0 36 48" xmlns="http://www.w3.org/2000/svg">
        <!-- 본체 -->
        <rect x="6" y="14" width="24" height="30" rx="3" ry="2" fill="#b03050" stroke="#5a0d0d" stroke-width="0.8"/>
        <!-- 윗부분 (반원형 모자) -->
        <path d="M 6 14 Q 6 6, 18 6 Q 30 6, 30 14 Z" fill="#c44060" stroke="#5a0d0d" stroke-width="0.8"/>
        <!-- 모자 위 작은 윤곽선 (장식) -->
        <ellipse cx="18" cy="13" rx="11" ry="1.2" fill="none" stroke="#7a1828" stroke-width="0.5" opacity="0.5"/>
        <!-- 편지 투입구 -->
        <rect x="11" y="18" width="14" height="2.2" rx="1" fill="#3a0a14" stroke="#1a0408" stroke-width="0.4"/>
        <!-- ROYAL MAIL 라벨 (단순화) -->
        <rect x="9" y="26" width="18" height="6" fill="#fff5d4" stroke="#5a0d0d" stroke-width="0.4" opacity="0.85"/>
        <text x="18" y="30" text-anchor="middle" font-family="Cormorant Garamond, serif"
              font-size="2.6" font-weight="600" fill="#5a0d0d" letter-spacing="0.3">SLOW MAIL</text>
        <!-- 받침대 -->
        <rect x="3" y="43" width="30" height="3" fill="#3a2010" stroke="#1f0f08" stroke-width="0.4"/>
        <!-- 본체 빛 반사 -->
        <rect x="8" y="16" width="2" height="26" fill="#d4607a" opacity="0.5"/>
      </svg>
      <div class="pb-count">${count}</div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════
//  우체통 모달 — 편지 목록
// ═══════════════════════════════════════════════════════════
const postboxModal = document.getElementById('postbox-modal');

function openPostboxModal(key) {
  const pb = State.postboxes.find(p => p.key === key);
  if (!pb) return;

  document.getElementById('postbox-coord').textContent =
    `${pb.lat.toFixed(4)}, ${pb.lng.toFixed(4)} · ${pb.letters.length}통`;

  const list = document.getElementById('postbox-list');
  const now = Date.now();
  list.innerHTML = pb.letters.map(L => {
    const isReceived = L._direction === 'received';
    const deliverAt = new Date(L.deliver_at).getTime();
    const isInTransit = deliverAt > now;
    const direction = isReceived ? '받은 편지' : (isInTransit ? '배송 중' : '보낸 편지');
    const cls = isReceived ? 'received' : (isInTransit ? 'transit' : 'sent');
    const otherName = isReceived ? L.from_username : L.to_username;
    const initial = (otherName || '?')[0].toUpperCase();
    const sealColor = isReceived ? (L.seal_color || 'crimson') : (State.me.seal_color || 'crimson');
    const colors = sealColorVars(sealColor);

    let dateStatus;
    if (isInTransit) {
      dateStatus = `<span class="status transit">${formatTimeRemaining(deliverAt - now)} 도착</span>`;
    } else if (isReceived) {
      dateStatus = L.opened ? '<span class="status opened">읽음</span>' : '<span class="status">미열람</span>';
    } else {
      dateStatus = L.opened ? '<span class="status opened">상대가 읽음</span>' : '<span class="status">도착함</span>';
    }

    const titleText = L.title || (L.body ? L.body.slice(0, 50) : '(제목 없음)');

    return `
      <div class="postbox-letter-row ${cls}" data-letter-id="${escapeAttr(L.id)}" data-direction="${L._direction}">
        <div class="pblr-icon" style="background: radial-gradient(circle at 35% 35%, ${colors[0]} 0%, ${colors[1]} 50%, ${colors[2]} 100%);">${escapeHtml(initial)}</div>
        <div class="pblr-meta">
          <div class="pblr-direction">${direction}</div>
          <div class="pblr-title">${escapeHtml(titleText)}</div>
          <div class="pblr-sub">${isReceived ? 'From' : 'To'} ${escapeHtml(otherName || '—')}</div>
        </div>
        <div class="pblr-date">
          ${shortDate(L.sent_at)}
          ${dateStatus}
        </div>
      </div>
    `;
  }).join('');

  // 행 클릭 → 적절한 편지 모달 열기
  list.querySelectorAll('.postbox-letter-row').forEach(row => {
    row.addEventListener('click', () => {
      const id = row.dataset.letterId;
      const dir = row.dataset.direction;
      postboxModal.classList.remove('show');

      if (dir === 'received') {
        // 받은 편지 — 봉투 뜯기 단계는 이미 가져갔으면 건너뛰고 바로 본문으로
        const L = State.letters.find(x => x.id === id);
        if (!L) {
          showToast('편지를 찾을 수 없어요. 우편함을 먼저 확인해주세요.');
          return;
        }
        // 일반 흐름과 동일하게 처리 (봉투 → 종이)
        openLetter(id);
      } else {
        // 보낸 편지 — openSentLetter 사용
        openSentLetter(id);
      }
    });
  });

  postboxModal.classList.add('show');
}

document.getElementById('postbox-close').addEventListener('click', () => {
  postboxModal.classList.remove('show');
});
postboxModal.addEventListener('click', e => {
  if (e.target === postboxModal) postboxModal.classList.remove('show');
});
