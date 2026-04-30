// ═══════════════════════════════════════════════════════════
//  main.js — 앱 진입, 탭 전환, 자동 갱신
// ═══════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────
//  TABS
// ───────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', async () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    document.getElementById('panel-' + t.dataset.tab).classList.add('active');

    // 탭별 lazy 렌더
    if (t.dataset.tab === 'friends') {
      await Promise.all([loadFriends(), loadPendingRequests()]);
      renderFriendsPanel();
    } else if (t.dataset.tab === 'trash') {
      await loadTrash();
      renderTrashPanel();
    } else if (t.dataset.tab === 'map') {
      // 지도 lazy 초기화
      if (typeof initMap === 'function') {
        initMap();
        await loadPins();
        renderPins();
        if (typeof buildPostboxes === 'function') {
          buildPostboxes();
          renderPostboxes();
        }
      }
    }
  });
});

// ───────────────────────────────────────────────────────────
//  APP LAUNCH
// ───────────────────────────────────────────────────────────
async function launchApp() {
  document.getElementById('app').style.display = 'block';
  document.getElementById('me-name').textContent = State.me.username;
  document.getElementById('me-loc').textContent = State.me.location_name;
  document.getElementById('compose-date').textContent = longDate(Date.now());
  document.getElementById('mb-greeting').innerHTML = `${State.me.username}의 우편함 <em>Letterbox</em>`;

  State.composeStyle.paper    = State.me.paper_default    || 'cream';
  State.composeStyle.envelope = State.me.envelope_default || 'cream';
  State.composeStyle.stamp    = 'standard';

  const composePaper = document.getElementById('compose-paper');
  if (composePaper) composePaper.dataset.paper = State.composeStyle.paper;

  await loadMyStamps();

  renderPaperPicker();
  renderEnvelopePicker();
  renderStampPicker();

  // 친구·휴지통은 비동기로 로드, 백그라운드 정리도
  await Promise.all([
    loadMailbox(),
    loadSent(),
    loadPendingCount(),
    loadFriends(),
    loadPendingRequests()
  ]);
  renderAll();
  renderRecipientQuick();
  renderPendingFriendBar();
  renderFriendBadge();
  startAutoRefresh();

  // 백그라운드 정리 + 도전과제
  runMaintenance();
  checkAchievementsBackground();
}

function startAutoRefresh() {
  if (State.refreshTimer) clearInterval(State.refreshTimer);
  State.refreshTimer = setInterval(async () => {
    await Promise.all([
      loadMailbox(),
      loadSent(),
      loadPendingCount(),
      loadPendingRequests()
    ]);
    renderAll();
    renderPendingFriendBar();
    renderFriendBadge();
    // 지도가 이미 초기화돼 있으면 우체통도 갱신
    if (State.mapInitialized && typeof buildPostboxes === 'function') {
      buildPostboxes();
      renderPostboxes();
    }
  }, 20000);
}

// ───────────────────────────────────────────────────────────
//  BOOT
// ───────────────────────────────────────────────────────────
(async function boot() {
  const { data } = await supa.auth.getSession();
  if (data && data.session) {
    State.user = data.session.user;
    await routeAfterAuth();
  }
})();

supa.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') location.reload();
});
