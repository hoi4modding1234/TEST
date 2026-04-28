// ═══════════════════════════════════════════════════════════
//  main.js — 앱 진입, 탭 전환, 자동 갱신
// ═══════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────
//  TABS
// ───────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    document.getElementById('panel-' + t.dataset.tab).classList.add('active');
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

  renderPaperPicker();
  renderEnvelopePicker();

  await Promise.all([loadMailbox(), loadSent()]);
  renderAll();
  startAutoRefresh();
}

function startAutoRefresh() {
  if (State.refreshTimer) clearInterval(State.refreshTimer);
  State.refreshTimer = setInterval(async () => {
    await Promise.all([loadMailbox(), loadSent()]);
    renderAll();
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
