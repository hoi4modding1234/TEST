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

// ═══════════════════════════════════════════════════════════
//  지도 초기화
// ═══════════════════════════════════════════════════════════
function initMap() {
  if (State.mapInitialized) {
    // 탭 전환 후 leaflet 이 컨테이너 크기를 잘못 측정할 수 있어서 invalidateSize 호출
    setTimeout(() => { if (State.map) State.map.invalidateSize(); }, 100);
    return;
  }

  // 사용자 위치를 중심으로 시작
  const startLat = State.me?.lat || 37.5665;
  const startLng = State.me?.lng || 126.9780;

  const map = L.map('leaflet-map', {
    center: [startLat, startLng],
    zoom: 11,
    zoomControl: true,
    worldCopyJump: true
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  State.map = map;
  State.mapInitialized = true;

  // 롱프레스 핀 꽂기 — 마우스(데스크탑) + 터치(모바일)
  setupLongPress(map);

  // 초기 힌트 페이드 — 5초 후
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
