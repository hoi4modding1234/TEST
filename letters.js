// ═══════════════════════════════════════════════════════════
//  letters.js — 편지 쓰기, 우편함, 편지 열기
// ═══════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────
//  LOAD LETTERS
// ───────────────────────────────────────────────────────────
async function loadMailbox() {
  const nowIso = new Date().toISOString();
  const { data, error } = await supa
    .from('letters')
    .select('*')
    .eq('to_user', State.me.id)
    .lte('deliver_at', nowIso)
    .order('deliver_at', { ascending: false });
  if (error) { console.error(error); return; }
  const letters = data || [];

  // Notification: any new letter id we haven't seen before
  if (State.seenLetterIds.size > 0) {  // skip on first load
    for (const L of letters) {
      if (!State.seenLetterIds.has(L.id)) {
        notifyNewLetter(L);
      }
    }
  }
  State.seenLetterIds = new Set(letters.map(l => l.id));
  State.letters = letters;
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
  const arrivedCount = State.letters.length;
  const newOnes = State.letters.filter(l => !l.opened);
  const transitFromMe = State.sent.filter(l => new Date(l.deliver_at).getTime() > Date.now());

  document.getElementById('stat-arrived').textContent = arrivedCount;
  document.getElementById('stat-transit').textContent = transitFromMe.length;
  const transitLbl = document.querySelector('#stat-transit + .lbl');
  if (transitLbl) transitLbl.textContent = '내가 보낸·배송 중';

  const badge = document.getElementById('badge-new');
  if (newOnes.length > 0) {
    badge.style.display = 'inline-block';
    badge.textContent = newOnes.length;
    document.getElementById('mb-flag').classList.add('up');
  } else {
    badge.style.display = 'none';
    document.getElementById('mb-flag').classList.remove('up');
  }

  const desc = document.getElementById('mb-desc');
  if (newOnes.length > 0) {
    desc.textContent = `깃발이 올라가 있어요 — ${newOnes.length}통의 새 편지가 기다리고 있습니다.`;
  } else if (arrivedCount > 0) {
    desc.textContent = '새로 도착한 편지는 없지만, 이전 편지들을 다시 펼쳐볼 수 있어요.';
  } else {
    desc.textContent = '아직 도착한 편지가 없습니다. 친구의 이름을 알려주고 첫 편지를 받아보세요.';
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
  return `
    <div class="envelope ${opened} seal-${escapeAttr(sealColor)}" data-env="${escapeAttr(envStyle)}" data-letter-id="${escapeAttr(L.id)}" title="편지 열기">
      <div class="envelope-texture-overlay"></div>
      <div class="env-postmark"><div class="city">${escapeHtml(cityCode)}</div><div class="date">${shortDate(L.sent_at)}</div></div>
      <div class="env-stamp"><div class="km">${distKm}</div><div class="km-lbl">KM</div></div>
      <div class="env-from"><span class="lbl">From</span>${escapeHtml(L.from_username)}</div>
      ${L.opened ? '' : `<div class="env-seal">${escapeHtml(sealText)}</div>`}
    </div>`;
}

// ───────────────────────────────────────────────────────────
//  MAILBOX SVG
// ───────────────────────────────────────────────────────────
document.getElementById('mailbox-svg-wrap').addEventListener('click', e => {
  e.currentTarget.classList.toggle('open');
});

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

  stage.innerHTML = `
    <div class="stage-envelope seal-${escapeAttr(sealColor)}" data-env="${escapeAttr(envStyle)}" id="stage-env">
      <div class="envelope-texture-overlay"></div>
      <div class="torn-edge"></div>
      <div class="env-postmark" style="top:24px;left:24px;width:96px;height:96px;">
        <div class="city">${escapeHtml(cityCode)}</div><div class="date">${shortDate(L.sent_at)}</div>
      </div>
      <div class="stage-stamp"><div class="km">${distKm}</div><div class="km-lbl">KM</div><div class="yr">${new Date(L.sent_at).getFullYear()}</div></div>
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

  stage.innerHTML = `
    <div class="letter-content-paper lcp" id="lcp" data-paper="${escapeAttr(paperStyle)}">
      <div class="paper-texture-overlay"></div>
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

  renderAll();
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
//  PAPER / ENVELOPE PICKERS
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
    return `
      <div class="sent-item ${statusClass}">
        <div class="icon-circ">${escapeHtml(init)}</div>
        <div class="meta">
          <div class="to">${escapeHtml(L.to_username)} <span style="color:var(--sepia);font-weight:400;font-size:0.85rem;">· ${Math.round(L.distance)}km</span></div>
          <div class="preview">${escapeHtml(preview)}</div>
        </div>
        <div class="status">
          ${status}
          <span class="when">${shortDate(L.sent_at)} 발송${openedTxt}</span>
        </div>
      </div>`;
  }).join('');
}

// ───────────────────────────────────────────────────────────
//  SEND
// ───────────────────────────────────────────────────────────
sendBtn.addEventListener('click', sendLetter);

async function sendLetter() {
  if (!State.recipientCache) return;
  const bodyText = (letterBody.innerText || '').trim();
  const bodyHtmlRaw = letterBody.innerHTML;
  if (!bodyText && State.composeImages.length === 0) return;

  sendBtn.disabled = true;
  sendBtn.textContent = '발송 중…';

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

    const { error } = await supa.from('letters').insert({
      id: letterId,
      from_user: State.me.id,
      from_username: State.me.username,
      from_location_name: State.me.location_name,
      from_lat: State.me.lat,
      from_lng: State.me.lng,
      to_user: State.recipientCache.profile.id,
      to_username: State.recipientCache.profile.username,
      body: bodyText,
      body_html: safeBodyHtml,
      images: imagePaths,
      distance: dist,
      sent_at: new Date(now).toISOString(),
      deliver_at: new Date(now + ms).toISOString(),
      paper_style: State.composeStyle.paper,
      envelope_style: State.composeStyle.envelope,
      seal_color: State.me.seal_color || 'crimson',
      seal_symbol: State.me.seal_symbol || ''
    });
    if (error) throw error;

    letterBody.innerHTML = '';
    State.composeImages = [];
    renderImageStrip();
    showToast(`✈ ${State.recipientCache.profile.username}님에게 편지를 보냈어요 (${formatDuration(ms)} 후 도착)`);
    sendBtn.disabled = false;
    sendBtn.textContent = '편지 보내기';

    await loadSent();
    renderAll();
    document.querySelector('.tab[data-tab="sent"]').click();
  } catch (err) {
    console.error(err);
    showToast('편지를 보내지 못했습니다: ' + (err.message || ''));
    sendBtn.disabled = false;
    sendBtn.textContent = '편지 보내기';
  }
}
