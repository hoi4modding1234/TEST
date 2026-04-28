// ═══════════════════════════════════════════════════════════
//  auth.js — 인증, 프로필, 계정 관리
// ═══════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────
//  AUTH UI (sign in / sign up)
// ───────────────────────────────────────────────────────────
const authStage   = document.getElementById('stage-auth');
const profileStage= document.getElementById('stage-profile');
const confirmStage= document.getElementById('stage-confirm');
const authEmail   = document.getElementById('auth-email');
const authPass    = document.getElementById('auth-password');
const authMsg     = document.getElementById('auth-msg');
const authSubmit  = document.getElementById('auth-submit');

document.querySelectorAll('.at-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.at-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    State.authMode = btn.dataset.mode;
    authSubmit.textContent = State.authMode === 'signup' ? '가입하기' : '들어가기';
    authPass.autocomplete = State.authMode === 'signup' ? 'new-password' : 'current-password';
    hideAuthMsg();
  });
});

function showAuthMsg(text, kind = 'error') {
  authMsg.className = kind === 'info' ? 'auth-info' : 'auth-error';
  authMsg.textContent = text;
  authMsg.style.display = 'block';
}
function hideAuthMsg() { authMsg.style.display = 'none'; }

function translateAuthError(msg) {
  const m = (msg || '').toLowerCase();
  if (m.includes('invalid login')) return '이메일 또는 비밀번호가 올바르지 않습니다.';
  if (m.includes('already registered') || m.includes('already exists')) return '이미 가입된 이메일입니다.';
  if (m.includes('email not confirmed')) return '이메일 인증을 완료한 뒤 다시 시도해주세요.';
  if (m.includes('password') && m.includes('6')) return '비밀번호는 6자 이상이어야 합니다.';
  if (m.includes('rate limit')) return '잠시 후 다시 시도해주세요.';
  if (m.includes('email') && m.includes('valid')) return '올바른 이메일 주소를 입력해주세요.';
  return msg || '알 수 없는 오류가 발생했습니다.';
}

authSubmit.addEventListener('click', async () => {
  hideAuthMsg();
  const email = authEmail.value.trim();
  const password = authPass.value;
  if (!email || !password) { showAuthMsg('이메일과 비밀번호를 입력해주세요.'); return; }

  authSubmit.disabled = true;
  authSubmit.textContent = '잠시만요…';

  try {
    if (State.authMode === 'signup') {
      const { data, error } = await supa.auth.signUp({ email, password });
      if (error) throw error;
      if (!data.session) {
        document.getElementById('confirm-email').textContent = email;
        authStage.style.display = 'none';
        confirmStage.style.display = 'block';
      } else {
        State.user = data.user;
        await routeAfterAuth();
      }
    } else {
      const { data, error } = await supa.auth.signInWithPassword({ email, password });
      if (error) throw error;
      State.user = data.user;
      await routeAfterAuth();
    }
  } catch (err) {
    showAuthMsg(translateAuthError(err.message));
  } finally {
    authSubmit.disabled = false;
    authSubmit.textContent = State.authMode === 'signup' ? '가입하기' : '들어가기';
  }
});

document.getElementById('back-to-auth').addEventListener('click', () => {
  confirmStage.style.display = 'none';
  authStage.style.display = 'block';
  document.querySelectorAll('.at-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.at-btn[data-mode="signin"]').classList.add('active');
  State.authMode = 'signin';
  authSubmit.textContent = '들어가기';
  hideAuthMsg();
});

// ───────────────────────────────────────────────────────────
//  PROFILE SETUP (first-time after sign-up)
// ───────────────────────────────────────────────────────────
const ob = {
  username: document.getElementById('ob-username'),
  city:     document.getElementById('ob-city'),
  geo:      document.getElementById('ob-geo'),
  start:    document.getElementById('ob-start'),
  msg:      document.getElementById('profile-msg'),
  selectedLoc: null
};

function checkObReady() {
  ob.start.disabled = !(ob.username.value.trim() && ob.selectedLoc);
}
ob.username.addEventListener('input', checkObReady);
ob.city.addEventListener('change', () => {
  if (!ob.city.value) { ob.selectedLoc = null; checkObReady(); return; }
  const [lat, lng, name] = ob.city.value.split(',');
  ob.selectedLoc = { lat: parseFloat(lat), lng: parseFloat(lng), name };
  checkObReady();
});
ob.geo.addEventListener('click', () => {
  if (!navigator.geolocation) { showToast('이 브라우저는 위치 서비스를 지원하지 않습니다'); return; }
  ob.geo.classList.add('locating');
  ob.geo.textContent = '찾는 중…';
  navigator.geolocation.getCurrentPosition(
    pos => {
      ob.selectedLoc = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        name: `현재 위치 (${pos.coords.latitude.toFixed(2)}, ${pos.coords.longitude.toFixed(2)})`
      };
      ob.city.value = '';
      ob.city.options[0].text = `📍 ${ob.selectedLoc.name}`;
      ob.geo.classList.remove('locating');
      ob.geo.textContent = '✓ 사용됨';
      checkObReady();
    },
    () => {
      ob.geo.classList.remove('locating');
      ob.geo.textContent = '📍 현재 위치';
      showToast('위치를 가져올 수 없어요');
    },
    { timeout: 10000 }
  );
});

function showProfileMsg(text, kind = 'error') {
  ob.msg.className = kind === 'info' ? 'auth-info' : 'auth-error';
  ob.msg.textContent = text;
  ob.msg.style.display = 'block';
}

ob.start.addEventListener('click', async () => {
  ob.msg.style.display = 'none';
  const username = ob.username.value.trim();
  if (!username || !ob.selectedLoc) return;

  ob.start.disabled = true;
  ob.start.textContent = '우편함 준비 중…';

  try {
    const { data, error } = await supa.from('profiles').insert({
      id: State.user.id,
      username,
      lat: ob.selectedLoc.lat,
      lng: ob.selectedLoc.lng,
      location_name: ob.selectedLoc.name
    }).select().single();

    if (error) {
      if (error.code === '23505') {
        showProfileMsg('이미 사용 중인 이름입니다. 다른 이름을 선택해주세요.');
      } else {
        showProfileMsg(error.message);
      }
      ob.start.disabled = false;
      ob.start.textContent = '우편함 만들기';
      return;
    }

    State.me = data;
    document.getElementById('onboarding').style.display = 'none';
    await launchApp();
  } catch (err) {
    showProfileMsg(err.message);
    ob.start.disabled = false;
    ob.start.textContent = '우편함 만들기';
  }
});

// ───────────────────────────────────────────────────────────
//  AUTH ROUTING
// ───────────────────────────────────────────────────────────
async function loadMyProfile() {
  const { data, error } = await supa
    .from('profiles')
    .select('*')
    .eq('id', State.user.id)
    .maybeSingle();
  if (error) { console.error(error); return null; }
  return data;
}

async function routeAfterAuth() {
  const profile = await loadMyProfile();
  if (profile) {
    State.me = profile;
    document.getElementById('onboarding').style.display = 'none';
    await launchApp();
  } else {
    authStage.style.display = 'none';
    confirmStage.style.display = 'none';
    profileStage.style.display = 'block';
  }
}

document.getElementById('signout-btn').addEventListener('click', async () => {
  if (!confirm('로그아웃하시겠습니까?')) return;
  await supa.auth.signOut();
  location.reload();
});

// ═══════════════════════════════════════════════════════════
//  PROFILE EDIT MODAL
// ═══════════════════════════════════════════════════════════
const PM = {
  modal:    document.getElementById('profile-modal'),
  close:    document.getElementById('pmc-close'),
  bioInput: document.getElementById('pm-bio-input'),
  bioCount: document.getElementById('pm-bio-count'),
  saveBtn:  document.getElementById('pm-save'),
  msg:      document.getElementById('pm-msg'),
  ppSeal:   document.getElementById('pp-seal'),
  ppName:   document.getElementById('pp-name'),
  ppBio:    document.getElementById('pp-bio'),
  ppLoc:    document.getElementById('pp-loc'),
  draft: {}
};

document.getElementById('profile-btn').addEventListener('click', openProfileModal);
PM.close.addEventListener('click', () => PM.modal.classList.remove('show'));
PM.modal.addEventListener('click', e => {
  if (e.target === PM.modal) PM.modal.classList.remove('show');
});

function openProfileModal() {
  PM.draft = {
    bio:              State.me.bio || '',
    seal_color:       State.me.seal_color || 'crimson',
    seal_symbol:      State.me.seal_symbol || '',
    paper_default:    State.me.paper_default || 'cream',
    envelope_default: State.me.envelope_default || 'cream'
  };

  PM.bioInput.value = PM.draft.bio;
  PM.bioCount.textContent = PM.draft.bio.length;
  PM.msg.style.display = 'none';

  document.querySelectorAll('#pm-seal-colors .seal-swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.color === PM.draft.seal_color);
  });

  const initial = (State.me.username || '?')[0].toUpperCase();
  const defSym = document.querySelector('#pm-seal-symbols .symbol-swatch[data-symbol=""] em');
  if (defSym) defSym.textContent = initial;
  document.querySelectorAll('#pm-seal-symbols .symbol-swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.symbol === PM.draft.seal_symbol);
  });

  renderProfileDefaultPaperPicker();
  renderProfileDefaultEnvPicker();

  // Initialize account section
  document.getElementById('acc-email-current').value = State.user.email || '';

  // Initialize location section
  resetLocationEditor();

  // Initialize notification toggle state
  refreshNotifToggle();

  // 우표함 렌더
  if (typeof renderCollection === 'function') renderCollection();

  // Close all accordions on open
  document.querySelectorAll('.profile-card .acc-group').forEach(g => g.classList.remove('open'));

  updateProfilePreview();
  PM.modal.classList.add('show');
}

function renderProfileDefaultPaperPicker() {
  const el = document.getElementById('pm-paper-default');
  el.innerHTML = PAPER_STYLES.map(p =>
    `<div class="paper-swatch ${p.id === PM.draft.paper_default ? 'active' : ''}"
          data-paper="${p.id}" title="${p.label}"></div>`
  ).join('');
  el.querySelectorAll('.paper-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      PM.draft.paper_default = sw.dataset.paper;
      el.querySelectorAll('.paper-swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
    });
  });
}
function renderProfileDefaultEnvPicker() {
  const el = document.getElementById('pm-env-default');
  el.innerHTML = ENVELOPE_STYLES.map(e =>
    `<div class="env-swatch ${e.id === PM.draft.envelope_default ? 'active' : ''}"
          data-env="${e.id}" title="${e.label}"></div>`
  ).join('');
  el.querySelectorAll('.env-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      PM.draft.envelope_default = sw.dataset.env;
      el.querySelectorAll('.env-swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
    });
  });
}

document.querySelectorAll('#pm-seal-colors .seal-swatch').forEach(sw => {
  sw.addEventListener('click', () => {
    PM.draft.seal_color = sw.dataset.color;
    document.querySelectorAll('#pm-seal-colors .seal-swatch').forEach(s => s.classList.remove('active'));
    sw.classList.add('active');
    updateProfilePreview();
  });
});
document.querySelectorAll('#pm-seal-symbols .symbol-swatch').forEach(sw => {
  sw.addEventListener('click', () => {
    PM.draft.seal_symbol = sw.dataset.symbol;
    document.querySelectorAll('#pm-seal-symbols .symbol-swatch').forEach(s => s.classList.remove('active'));
    sw.classList.add('active');
    updateProfilePreview();
  });
});

PM.bioInput.addEventListener('input', () => {
  PM.draft.bio = PM.bioInput.value.slice(0, 200);
  PM.bioCount.textContent = PM.draft.bio.length;
  updateProfilePreview();
});

function updateProfilePreview() {
  PM.ppName.textContent = State.me.username;
  PM.ppBio.textContent = PM.draft.bio || '';
  PM.ppLoc.textContent = State.me.location_name || '';
  const initial = (State.me.username || '?')[0].toUpperCase();
  const sym = PM.draft.seal_symbol || initial;
  PM.ppSeal.textContent = sym;

  const sealColors = {
    crimson:  ['var(--seal-crimson-l)',  'var(--seal-crimson)',  'var(--seal-crimson-d)'],
    navy:     ['var(--seal-navy-l)',     'var(--seal-navy)',     'var(--seal-navy-d)'],
    forest:   ['var(--seal-forest-l)',   'var(--seal-forest)',   'var(--seal-forest-d)'],
    gold:     ['var(--seal-gold-l)',     'var(--seal-gold)',     'var(--seal-gold-d)'],
    charcoal: ['var(--seal-charcoal-l)', 'var(--seal-charcoal)', 'var(--seal-charcoal-d)'],
    plum:     ['var(--seal-plum-l)',     'var(--seal-plum)',     'var(--seal-plum-d)']
  };
  const c = sealColors[PM.draft.seal_color] || sealColors.crimson;
  PM.ppSeal.style.background = `radial-gradient(circle at 35% 35%, ${c[0]} 0%, ${c[1]} 50%, ${c[2]} 100%)`;
}

PM.saveBtn.addEventListener('click', async () => {
  PM.msg.style.display = 'none';
  PM.saveBtn.disabled = true;
  PM.saveBtn.textContent = '저장 중…';
  try {
    const { data, error } = await supa
      .from('profiles')
      .update({
        bio:              PM.draft.bio,
        seal_color:       PM.draft.seal_color,
        seal_symbol:      PM.draft.seal_symbol,
        paper_default:    PM.draft.paper_default,
        envelope_default: PM.draft.envelope_default
      })
      .eq('id', State.me.id)
      .select()
      .single();
    if (error) throw error;
    State.me = data;

    State.composeStyle.paper    = State.me.paper_default;
    State.composeStyle.envelope = State.me.envelope_default;
    if (typeof renderPaperPicker === 'function') renderPaperPicker();
    if (typeof renderEnvelopePicker === 'function') renderEnvelopePicker();

    PM.modal.classList.remove('show');
    showToast('프로필이 저장됐어요');
  } catch (err) {
    PM.msg.className = 'auth-error';
    PM.msg.textContent = err.message || '저장에 실패했습니다';
    PM.msg.style.display = 'block';
  } finally {
    PM.saveBtn.disabled = false;
    PM.saveBtn.textContent = '저장하기';
  }
});

// ═══════════════════════════════════════════════════════════
//  LOCATION CHANGE
// ═══════════════════════════════════════════════════════════
const LOC = {
  city:    document.getElementById('loc-city'),
  geo:     document.getElementById('loc-geo'),
  preview: document.getElementById('loc-preview'),
  save:    document.getElementById('loc-save'),
  msg:     document.getElementById('loc-msg'),
  selected: null
};

function resetLocationEditor() {
  LOC.city.value = '';
  LOC.preview.textContent = '';
  LOC.msg.innerHTML = '';
  LOC.save.disabled = true;
  LOC.geo.textContent = '📍 현재 위치 사용';
  LOC.selected = null;
}

LOC.city.addEventListener('change', () => {
  if (!LOC.city.value) { LOC.selected = null; LOC.save.disabled = true; LOC.preview.textContent = ''; return; }
  const [lat, lng, name] = LOC.city.value.split(',');
  LOC.selected = { lat: parseFloat(lat), lng: parseFloat(lng), name };
  LOC.preview.textContent = `${name} (${LOC.selected.lat.toFixed(2)}, ${LOC.selected.lng.toFixed(2)})`;
  LOC.save.disabled = false;
});

LOC.geo.addEventListener('click', () => {
  if (!navigator.geolocation) { LOC.msg.innerHTML = '<div class="acc-msg err">이 브라우저는 위치 서비스를 지원하지 않습니다</div>'; return; }
  LOC.geo.textContent = '찾는 중…';
  LOC.geo.disabled = true;
  navigator.geolocation.getCurrentPosition(
    pos => {
      LOC.selected = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        name: `현재 위치 (${pos.coords.latitude.toFixed(2)}, ${pos.coords.longitude.toFixed(2)})`
      };
      LOC.city.value = '';
      LOC.preview.textContent = LOC.selected.name;
      LOC.geo.textContent = '✓ 사용됨';
      LOC.geo.disabled = false;
      LOC.save.disabled = false;
    },
    () => {
      LOC.geo.textContent = '📍 현재 위치 사용';
      LOC.geo.disabled = false;
      LOC.msg.innerHTML = '<div class="acc-msg err">위치를 가져올 수 없어요</div>';
    },
    { timeout: 10000 }
  );
});

LOC.save.addEventListener('click', async () => {
  if (!LOC.selected) return;
  LOC.save.disabled = true;
  LOC.save.textContent = '저장 중…';
  LOC.msg.innerHTML = '';
  try {
    const { data, error } = await supa
      .from('profiles')
      .update({
        lat: LOC.selected.lat,
        lng: LOC.selected.lng,
        location_name: LOC.selected.name
      })
      .eq('id', State.me.id)
      .select()
      .single();
    if (error) throw error;
    State.me = data;
    document.getElementById('me-loc').textContent = State.me.location_name;
    PM.ppLoc.textContent = State.me.location_name;
    LOC.msg.innerHTML = '<div class="acc-msg ok">출발지가 변경됐어요. 다음 편지부터 적용됩니다.</div>';
    showToast('출발지가 ' + State.me.location_name + ' 으로 변경됐어요');
    resetLocationEditor();
  } catch (err) {
    LOC.msg.innerHTML = `<div class="acc-msg err">${escapeHtml(err.message)}</div>`;
  } finally {
    LOC.save.disabled = false;
    LOC.save.textContent = '변경 저장';
  }
});

// ═══════════════════════════════════════════════════════════
//  EMAIL / PASSWORD CHANGE
// ═══════════════════════════════════════════════════════════
document.getElementById('acc-email-save').addEventListener('click', async () => {
  const newEmail = document.getElementById('acc-email-new').value.trim();
  const msgEl = document.getElementById('acc-email-msg');
  msgEl.innerHTML = '';
  if (!newEmail) {
    msgEl.innerHTML = '<div class="acc-msg err">새 이메일을 입력해주세요</div>'; return;
  }
  if (newEmail === State.user.email) {
    msgEl.innerHTML = '<div class="acc-msg err">현재 이메일과 같아요</div>'; return;
  }
  const btn = document.getElementById('acc-email-save');
  btn.disabled = true; btn.textContent = '발송 중…';
  try {
    const { error } = await supa.auth.updateUser({ email: newEmail });
    if (error) throw error;
    msgEl.innerHTML = `<div class="acc-msg info">
      <p>두 통의 확인 메일이 발송됐습니다:</p>
      <p>① 현재 주소 <strong>${escapeHtml(State.user.email)}</strong> 로 변경 알림</p>
      <p>② 새 주소 <strong>${escapeHtml(newEmail)}</strong> 로 인증 링크</p>
      <p>두 메일 모두에서 확인 링크를 클릭해야 변경이 완료됩니다.</p>
    </div>`;
    document.getElementById('acc-email-new').value = '';
  } catch (err) {
    msgEl.innerHTML = `<div class="acc-msg err">${escapeHtml(translateAuthError(err.message))}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = '변경';
  }
});

document.getElementById('acc-pw-save').addEventListener('click', async () => {
  const newPw = document.getElementById('acc-pw-new').value;
  const msgEl = document.getElementById('acc-pw-msg');
  msgEl.innerHTML = '';
  if (!newPw || newPw.length < 6) {
    msgEl.innerHTML = '<div class="acc-msg err">비밀번호는 6자 이상이어야 합니다</div>'; return;
  }
  const btn = document.getElementById('acc-pw-save');
  btn.disabled = true; btn.textContent = '저장 중…';
  try {
    const { error } = await supa.auth.updateUser({ password: newPw });
    if (error) throw error;
    msgEl.innerHTML = '<div class="acc-msg ok">비밀번호가 변경됐습니다</div>';
    document.getElementById('acc-pw-new').value = '';
  } catch (err) {
    msgEl.innerHTML = `<div class="acc-msg err">${escapeHtml(translateAuthError(err.message))}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = '변경';
  }
});

// ═══════════════════════════════════════════════════════════
//  ACCOUNT DELETION
// ═══════════════════════════════════════════════════════════
const DZ = {
  modal:        document.getElementById('delete-modal'),
  trigger:      document.getElementById('dz-delete-btn'),
  cancel:       document.getElementById('dz-cancel'),
  confirm:      document.getElementById('dz-confirm'),
  input:        document.getElementById('dz-confirm-input'),
  usernameDisp: document.getElementById('dz-username-display'),
  msg:          document.getElementById('dz-msg')
};

DZ.trigger.addEventListener('click', () => {
  DZ.usernameDisp.textContent = State.me.username;
  DZ.input.value = '';
  DZ.confirm.disabled = true;
  DZ.msg.innerHTML = '';
  DZ.modal.classList.add('show');
  setTimeout(() => DZ.input.focus(), 100);
});

DZ.cancel.addEventListener('click', () => DZ.modal.classList.remove('show'));
DZ.modal.addEventListener('click', e => {
  if (e.target === DZ.modal) DZ.modal.classList.remove('show');
});

DZ.input.addEventListener('input', () => {
  DZ.confirm.disabled = (DZ.input.value.trim() !== State.me.username);
});

DZ.confirm.addEventListener('click', async () => {
  if (DZ.input.value.trim() !== State.me.username) return;
  DZ.confirm.disabled = true;
  DZ.confirm.textContent = '삭제 중…';
  DZ.msg.innerHTML = '';
  try {
    const { error } = await supa.rpc('delete_my_account');
    if (error) throw error;
    DZ.msg.innerHTML = '<div class="acc-msg ok">계정이 삭제되었습니다. 잠시 후 페이지가 새로고침됩니다…</div>';
    setTimeout(async () => {
      await supa.auth.signOut();
      location.reload();
    }, 1500);
  } catch (err) {
    DZ.msg.innerHTML = `<div class="acc-msg err">삭제 실패: ${escapeHtml(err.message)}<br>migration_v3.sql 이 실행되었는지 확인해주세요.</div>`;
    DZ.confirm.disabled = false;
    DZ.confirm.textContent = '영구 삭제';
  }
});

// ═══════════════════════════════════════════════════════════
//  NOTIFICATION SETTINGS
// ═══════════════════════════════════════════════════════════
const NOTIF = {
  toggle: document.getElementById('notif-toggle'),
  msg:    document.getElementById('notif-msg')
};

function isNotifAvailable() {
  return 'Notification' in window;
}

function refreshNotifToggle() {
  if (!isNotifAvailable()) {
    NOTIF.toggle.disabled = true;
    NOTIF.msg.innerHTML = '<div class="acc-msg err">이 브라우저는 알림을 지원하지 않습니다</div>';
    State.notifEnabled = false;
    NOTIF.toggle.classList.remove('on');
    return;
  }
  // Sync state with permission + localStorage preference
  const pref = localStorage.getItem('sm_notif_pref') === '1';
  if (Notification.permission === 'granted' && pref) {
    State.notifEnabled = true;
    NOTIF.toggle.classList.add('on');
    NOTIF.msg.innerHTML = '';
  } else if (Notification.permission === 'denied') {
    State.notifEnabled = false;
    NOTIF.toggle.classList.remove('on');
    NOTIF.msg.innerHTML = '<div class="acc-msg err">브라우저에서 알림이 차단됐어요. 주소창 옆 자물쇠 아이콘에서 권한을 다시 허용한 뒤 토글하세요.</div>';
  } else {
    State.notifEnabled = false;
    NOTIF.toggle.classList.remove('on');
    NOTIF.msg.innerHTML = '';
  }
}

NOTIF.toggle.addEventListener('click', async () => {
  if (!isNotifAvailable()) return;
  if (State.notifEnabled) {
    // Turn off
    State.notifEnabled = false;
    localStorage.setItem('sm_notif_pref', '0');
    NOTIF.toggle.classList.remove('on');
    NOTIF.msg.innerHTML = '<div class="acc-msg info"><p>알림이 꺼졌어요</p></div>';
    return;
  }
  // Turn on — request permission if needed
  if (Notification.permission === 'denied') {
    NOTIF.msg.innerHTML = '<div class="acc-msg err">브라우저에서 알림이 차단됐어요. 주소창 옆 자물쇠 아이콘에서 권한을 다시 허용한 뒤 토글하세요.</div>';
    return;
  }
  let perm = Notification.permission;
  if (perm !== 'granted') {
    perm = await Notification.requestPermission();
  }
  if (perm === 'granted') {
    State.notifEnabled = true;
    localStorage.setItem('sm_notif_pref', '1');
    NOTIF.toggle.classList.add('on');
    NOTIF.msg.innerHTML = '<div class="acc-msg ok">알림이 켜졌어요. 새 편지가 도착하면 알려드릴게요.</div>';
    // sample notification
    try { new Notification('느린우편', { body: '알림이 활성화되었습니다 ✉' }); } catch {}
  } else {
    NOTIF.msg.innerHTML = '<div class="acc-msg err">알림 권한이 거부됐어요</div>';
  }
});

function notifyNewLetter(letter) {
  if (!State.notifEnabled || !isNotifAvailable() || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(`${letter.from_username}님의 편지가 도착했어요`, {
      body: '봉투를 열어보세요 ✉',
      tag: 'sm-letter-' + letter.id,
      silent: false
    });
    n.onclick = () => { window.focus(); n.close(); };
  } catch (e) { console.warn(e); }
}
