// ═══════════════════════════════════════════════════════════
//  scenery.js — 풍경 모드 (1차 화면)
//  하늘·산·들판·시냇물·집·우편함·풀밭 SVG + 시간대 빛 + 입자
// ═══════════════════════════════════════════════════════════

State.sceneryMode = true;        // 현재 풍경 모드인가
State.lightTimer = null;
State.particleTimer = null;
State.soundEnabled = false;
State.audioCtx = null;

// ─────────────────────────────────────────────────────────────
//  시간대 빛 팔레트 — 24시간 키프레임. 그 사이는 보간
// ─────────────────────────────────────────────────────────────
const SKY_PALETTE = [
  // hour, skyTop, skyBot, landFar, landNear, water, grass, grassTip, overlay
  { h:  0, top:'#0e1530', bot:'#1a2440', landFar:'#1f2a3a', landNear:'#152030', water:'#1a2a40', grass:'#1f2e1c', tip:'#3a4030', overlay:'rgba(20,20,50,0.35)' },
  { h:  4, top:'#1c2548', bot:'#3a3a58', landFar:'#2a3340', landNear:'#1f2a30', water:'#2a3a55', grass:'#2a3a25', tip:'#454a35', overlay:'rgba(30,30,70,0.25)' },
  { h:  6, top:'#5a6e8a', bot:'#e6b89a', landFar:'#5a7050', landNear:'#3d5538', water:'#7a9ab0', grass:'#5a8042', tip:'#c4a85a', overlay:'rgba(255,180,130,0.10)' },
  { h:  8, top:'#7eb4d8', bot:'#cce4f0', landFar:'#6b8a64', landNear:'#4a7040', water:'#7ab0c8', grass:'#5e9045', tip:'#c4b85a', overlay:'rgba(0,0,0,0)' },
  { h: 12, top:'#87ceeb', bot:'#d4e8f0', landFar:'#6b8a64', landNear:'#4a6e3a', water:'#6ba0c4', grass:'#5a8842', tip:'#c4b85a', overlay:'rgba(0,0,0,0)' },
  { h: 16, top:'#9ec6e0', bot:'#e4d8b4', landFar:'#7a8858', landNear:'#5a7038', water:'#7aa0b8', grass:'#688438', tip:'#d8b850', overlay:'rgba(255,200,140,0.08)' },
  { h: 18, top:'#d88a5a', bot:'#f0c490', landFar:'#7a5840', landNear:'#5a4028', water:'#a07058', grass:'#5e6a32', tip:'#d8a040', overlay:'rgba(255,140,80,0.18)' },
  { h: 20, top:'#3a3a6a', bot:'#705a7a', landFar:'#3a3a4a', landNear:'#252535', water:'#3a4a60', grass:'#2a3a25', tip:'#5a5535', overlay:'rgba(60,40,80,0.30)' },
  { h: 22, top:'#1a2040', bot:'#2a2e50', landFar:'#252e3a', landNear:'#1a2128', water:'#202e45', grass:'#1f2e1c', tip:'#404530', overlay:'rgba(20,20,60,0.35)' },
  { h: 24, top:'#0e1530', bot:'#1a2440', landFar:'#1f2a3a', landNear:'#152030', water:'#1a2a40', grass:'#1f2e1c', tip:'#3a4030', overlay:'rgba(20,20,50,0.35)' }
];

function lerpColor(c1, c2, t) {
  // hex/rgba 보간 — rgba 만 분기, hex 는 #rrggbb 가정
  if (c1.startsWith('rgba') && c2.startsWith('rgba')) {
    const r1 = c1.match(/[\d.]+/g).map(Number);
    const r2 = c2.match(/[\d.]+/g).map(Number);
    const r = Math.round(r1[0] + (r2[0]-r1[0])*t);
    const g = Math.round(r1[1] + (r2[1]-r1[1])*t);
    const b = Math.round(r1[2] + (r2[2]-r1[2])*t);
    const a = (r1[3] + (r2[3]-r1[3])*t).toFixed(3);
    return `rgba(${r},${g},${b},${a})`;
  }
  const r1 = parseInt(c1.slice(1,3),16), g1 = parseInt(c1.slice(3,5),16), b1 = parseInt(c1.slice(5,7),16);
  const r2 = parseInt(c2.slice(1,3),16), g2 = parseInt(c2.slice(3,5),16), b2 = parseInt(c2.slice(5,7),16);
  const r = Math.round(r1 + (r2-r1)*t);
  const g = Math.round(g1 + (g2-g1)*t);
  const b = Math.round(b1 + (b2-b1)*t);
  return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
}

function currentSkyColors() {
  const now = new Date();
  const hour = now.getHours() + now.getMinutes()/60;
  // 두 키프레임 사이 보간
  let i = 0;
  for (i = 0; i < SKY_PALETTE.length - 1; i++) {
    if (hour >= SKY_PALETTE[i].h && hour < SKY_PALETTE[i+1].h) break;
  }
  const a = SKY_PALETTE[i], b = SKY_PALETTE[i+1] || SKY_PALETTE[i];
  const span = b.h - a.h;
  const t = span > 0 ? (hour - a.h) / span : 0;
  return {
    top:      lerpColor(a.top, b.top, t),
    bot:      lerpColor(a.bot, b.bot, t),
    landFar:  lerpColor(a.landFar, b.landFar, t),
    landNear: lerpColor(a.landNear, b.landNear, t),
    water:    lerpColor(a.water, b.water, t),
    grass:    lerpColor(a.grass, b.grass, t),
    tip:      lerpColor(a.tip, b.tip, t),
    overlay:  lerpColor(a.overlay, b.overlay, t)
  };
}

function timeOfDayLabel() {
  const h = new Date().getHours();
  if (h < 5)  return '깊은 새벽';
  if (h < 7)  return '푸른 새벽';
  if (h < 11) return '아침';
  if (h < 14) return '한낮';
  if (h < 17) return '오후';
  if (h < 19) return '노을 무렵';
  if (h < 21) return '황혼';
  return '밤';
}

function applyTimeOfDay() {
  const c = currentSkyColors();
  const root = document.documentElement;
  root.style.setProperty('--sky-top', c.top);
  root.style.setProperty('--sky-bot', c.bot);
  root.style.setProperty('--land-far', c.landFar);
  root.style.setProperty('--land-near', c.landNear);
  root.style.setProperty('--water', c.water);
  root.style.setProperty('--grass', c.grass);
  root.style.setProperty('--grass-tip', c.tip);
  root.style.setProperty('--light-overlay', c.overlay);

  // 시간 라벨
  const tl = document.getElementById('scenery-time');
  if (tl) {
    const now = new Date();
    const h = String(now.getHours()).padStart(2,'0');
    const m = String(now.getMinutes()).padStart(2,'0');
    tl.textContent = `${h}:${m} · ${timeOfDayLabel()}`;
  }
}

// ─────────────────────────────────────────────────────────────
//  풍경 SVG 생성
// ─────────────────────────────────────────────────────────────
function buildSceneryHtml() {
  // SVG는 1200×600 viewBox 안에 고정, 화면 비율은 CSS가 처리
  // 좌상단(0,0) → 우하단(1200,600)
  // 구조:
  //   하늘 (그라디언트, 0~360)
  //   먼 산 (실루엣, 280~380)
  //   중간 들판 (350~450)
  //   집 + 우편함 (오른쪽, 380~520)
  //   시냇물 (왼쪽 30~140 폭, 위~아래)
  //   앞 풀밭 (450~600)
  //   풀잎들 흩어져 있음

  // 풀잎 — 무작위 위치에 여러 개
  const grassTufts = [];
  for (let i = 0; i < 60; i++) {
    const x = 20 + Math.random() * 1160;
    const y = 460 + Math.random() * 130;
    const h = 18 + Math.random() * 22;
    const skew = (Math.random() - 0.5) * 8;
    grassTufts.push(`
      <g class="grass-tuft" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
        <path d="M 0 0 Q ${skew.toFixed(1)} ${(-h*0.6).toFixed(1)} ${(skew*1.5).toFixed(1)} ${(-h).toFixed(1)}"
              stroke="var(--grass)" stroke-width="1.6" fill="none" stroke-linecap="round"/>
        <path d="M -3 0 Q ${(skew-2).toFixed(1)} ${(-h*0.5).toFixed(1)} ${(skew*0.5-3).toFixed(1)} ${(-h*0.85).toFixed(1)}"
              stroke="var(--grass)" stroke-width="1.4" fill="none" stroke-linecap="round" opacity="0.85"/>
        <path d="M 3 0 Q ${(skew+2).toFixed(1)} ${(-h*0.5).toFixed(1)} ${(skew*0.5+3).toFixed(1)} ${(-h*0.8).toFixed(1)}"
              stroke="var(--grass-tip)" stroke-width="1.2" fill="none" stroke-linecap="round" opacity="0.7"/>
      </g>
    `);
  }

  // 시냇물 빛 점
  const sparkles = [];
  for (let i = 0; i < 8; i++) {
    const x = 30 + Math.random() * 100;
    const y = 360 + Math.random() * 30;
    sparkles.push(`<ellipse class="water-sparkle" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="3" ry="1" fill="#fff" opacity="0.7"/>`);
  }

  // 들꽃 몇 송이
  const flowers = [];
  for (let i = 0; i < 8; i++) {
    const x = 100 + Math.random() * 1000;
    const y = 480 + Math.random() * 100;
    const c = ['#e88aa3', '#f4d35e', '#fff', '#d8a0e0'][Math.floor(Math.random() * 4)];
    flowers.push(`
      <g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
        <circle cx="-3" cy="-2" r="2.2" fill="${c}"/>
        <circle cx="3" cy="-2" r="2.2" fill="${c}"/>
        <circle cx="-2" cy="2" r="2.2" fill="${c}"/>
        <circle cx="2" cy="2" r="2.2" fill="${c}"/>
        <circle cx="0" cy="0" r="1.5" fill="#f4d35e"/>
      </g>
    `);
  }

  return `
    <svg class="scenery-svg" viewBox="0 0 1200 600" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="var(--sky-top)"/>
          <stop offset="1" stop-color="var(--sky-bot)"/>
        </linearGradient>
        <linearGradient id="grassGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="var(--grass-tip)"/>
          <stop offset="0.5" stop-color="var(--grass)"/>
          <stop offset="1" stop-color="var(--land-near)"/>
        </linearGradient>
        <linearGradient id="waterGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="var(--water)" stop-opacity="0.85"/>
          <stop offset="1" stop-color="var(--water)" stop-opacity="1"/>
        </linearGradient>
      </defs>

      <!-- 하늘 -->
      <rect x="0" y="0" width="1200" height="380" fill="url(#skyGrad)"/>

      <!-- 구름 -->
      <g class="cloud" opacity="0.85">
        <ellipse cx="200" cy="80" rx="60" ry="18" fill="#fff"/>
        <ellipse cx="240" cy="75" rx="40" ry="14" fill="#fff"/>
        <ellipse cx="170" cy="85" rx="35" ry="12" fill="#fff"/>
      </g>
      <g class="cloud cloud-2" opacity="0.7">
        <ellipse cx="600" cy="120" rx="80" ry="20" fill="#fff"/>
        <ellipse cx="650" cy="110" rx="50" ry="15" fill="#fff"/>
      </g>
      <g class="cloud cloud-3" opacity="0.75">
        <ellipse cx="900" cy="60" rx="50" ry="14" fill="#fff"/>
        <ellipse cx="935" cy="55" rx="35" ry="11" fill="#fff"/>
      </g>

      <!-- 먼 산 (실루엣) -->
      <path d="M 0 340 L 120 290 L 220 320 L 350 270 L 480 310 L 600 280 L 750 320 L 900 290 L 1050 310 L 1200 280 L 1200 380 L 0 380 Z"
            fill="var(--land-far)" opacity="0.7"/>
      <!-- 더 가까운 언덕 -->
      <path d="M 0 380 Q 200 360 400 375 Q 600 390 800 370 Q 1000 360 1200 380 L 1200 460 L 0 460 Z"
            fill="var(--land-near)"/>

      <!-- 시냇물 (왼쪽 가장자리) -->
      <path d="M 30 350 Q 50 420 35 500 L 110 600 L 0 600 L 0 380 Z"
            fill="url(#waterGrad)"/>
      <!-- 물결 -->
      <path d="M 35 380 Q 60 385 55 395 Q 50 405 70 415" stroke="#fff" stroke-width="0.8" fill="none" opacity="0.45"/>
      <path d="M 25 430 Q 50 435 45 445 Q 40 455 60 465" stroke="#fff" stroke-width="0.8" fill="none" opacity="0.4"/>
      <path d="M 30 480 Q 55 485 50 495 Q 45 505 70 515" stroke="#fff" stroke-width="0.8" fill="none" opacity="0.45"/>
      ${sparkles.join('')}

      <!-- 작은 통나무 집 (오른쪽) -->
      <g transform="translate(820 320)">
        <!-- 지붕 -->
        <path d="M -60 0 L 0 -50 L 60 0 L 60 5 L -60 5 Z" fill="var(--house-roof)" stroke="#2e1a0e" stroke-width="1"/>
        <!-- 지붕 그림자 라인 -->
        <line x1="-55" y1="-2" x2="55" y2="-2" stroke="#3a2418" stroke-width="0.7" opacity="0.5"/>
        <!-- 본체 (통나무 갈색) -->
        <rect x="-50" y="0" width="100" height="65" fill="var(--house-wall)" stroke="#3d2613" stroke-width="1"/>
        <!-- 통나무 결 라인 -->
        <line x1="-50" y1="14" x2="50" y2="14" stroke="#3d2613" stroke-width="0.5" opacity="0.6"/>
        <line x1="-50" y1="28" x2="50" y2="28" stroke="#3d2613" stroke-width="0.5" opacity="0.6"/>
        <line x1="-50" y1="42" x2="50" y2="42" stroke="#3d2613" stroke-width="0.5" opacity="0.6"/>
        <line x1="-50" y1="56" x2="50" y2="56" stroke="#3d2613" stroke-width="0.5" opacity="0.6"/>
        <!-- 창문 -->
        <rect x="-32" y="14" width="22" height="22" fill="#f4d878" stroke="#3d2613" stroke-width="0.8"/>
        <line x1="-21" y1="14" x2="-21" y2="36" stroke="#3d2613" stroke-width="0.6"/>
        <line x1="-32" y1="25" x2="-10" y2="25" stroke="#3d2613" stroke-width="0.6"/>
        <!-- 문 -->
        <rect x="10" y="22" width="20" height="43" fill="#3d2613" stroke="#241408" stroke-width="0.8"/>
        <circle cx="26" cy="44" r="1.3" fill="#c9a961"/>
      </g>

      <!-- 우편함 — 작게, 집 옆에 (클릭 영역) -->
      <g class="scenery-mailbox-zone" id="scenery-mailbox-zone" transform="translate(720 410)">
        <!-- 호버 펄스 링 (클릭 가능 표시) -->
        <circle class="pulse-ring" cx="0" cy="-22" r="20" fill="none" stroke="var(--gold)" stroke-width="2"/>
        <!-- 기둥 -->
        <rect x="-2" y="-5" width="4" height="38" fill="#3d2613"/>
        <!-- 박스 본체 (둥근 윗면) -->
        <path d="M -16 -32 Q -16 -42 0 -42 Q 16 -42 16 -32 L 16 -8 L -16 -8 Z"
              fill="#a85a30" stroke="#3d2613" stroke-width="1"/>
        <!-- 문 -->
        <rect x="-12" y="-28" width="24" height="18" fill="none" stroke="#3d2613" stroke-width="0.6"/>
        <!-- 깃발 (작게) -->
        <g id="scenery-flag" transform="translate(16 -28)">
          <rect x="0" y="0" width="1.5" height="14" fill="#3d2613"/>
          <path d="M 1.5 0 L 8 2 L 1.5 5 Z" fill="#8b1e1e"/>
        </g>
      </g>

      <!-- 앞쪽 풀밭 -->
      <rect x="0" y="450" width="1200" height="150" fill="url(#grassGrad)"/>

      <!-- 들꽃들 -->
      ${flowers.join('')}

      <!-- 풀잎들 (흔들림) -->
      ${grassTufts.join('')}

      <!-- 가장 앞쪽 풀잎 (큰 무리) — 화면 하단 디테일 -->
      <g transform="translate(0 600)">
        <path d="M 0 0 Q 60 -30 120 -10 Q 200 -45 280 -15 Q 360 -50 440 -20 Q 540 -55 640 -25 Q 740 -50 820 -20 Q 920 -45 1020 -15 Q 1120 -50 1200 -25 L 1200 0 Z"
              fill="var(--land-near)" opacity="0.95"/>
      </g>
    </svg>
  `;
}

// ─────────────────────────────────────────────────────────────
//  계절 입자 (꽃잎/낙엽/눈)
// ─────────────────────────────────────────────────────────────
function currentSeason() {
  const m = new Date().getMonth();
  if (m >= 2 && m <= 4)  return 'spring';
  if (m >= 5 && m <= 7)  return 'summer';
  if (m >= 8 && m <= 10) return 'autumn';
  return 'winter';
}

const SEASON_CHARS = {
  spring: ['🌸', '🌸', '🌸'],   // 벚꽃
  summer: ['✦', '·', '·'],      // 햇살 입자
  autumn: ['🍂', '🍁'],
  winter: ['❄', '·', '·']
};

function spawnParticle() {
  const stage = document.getElementById('scenery-stage');
  if (!stage || !State.sceneryMode) return;
  const container = document.getElementById('season-particles');
  if (!container) return;
  const rect = stage.getBoundingClientRect();
  if (rect.width === 0) return;

  const chars = SEASON_CHARS[currentSeason()];
  const ch = chars[Math.floor(Math.random() * chars.length)];

  const p = document.createElement('div');
  p.className = 'season-particle';
  p.textContent = ch;
  const startX = Math.random() * rect.width;
  p.style.left = startX + 'px';
  p.style.top = '-20px';
  p.style.fontSize = (10 + Math.random() * 8) + 'px';
  const dx = (Math.random() - 0.5) * 200;
  const dy = rect.height + 40;
  const rot = (Math.random() - 0.5) * 720;
  p.style.setProperty('--dx', dx.toFixed(0) + 'px');
  p.style.setProperty('--dy', dy.toFixed(0) + 'px');
  p.style.setProperty('--rot', rot.toFixed(0) + 'deg');
  p.style.animationDuration = (12 + Math.random() * 6) + 's';

  container.appendChild(p);
  setTimeout(() => p.remove(), 18000);
}

function startParticles() {
  if (State.particleTimer) clearInterval(State.particleTimer);
  // 8~15초마다 한 입자 (절제된 형태)
  const tick = () => {
    if (!State.sceneryMode) return;
    if (document.hidden) return;
    spawnParticle();
  };
  // 첫 입자는 살짝 빨리
  setTimeout(tick, 2000);
  State.particleTimer = setInterval(tick, 9000);
}
function stopParticles() {
  if (State.particleTimer) {
    clearInterval(State.particleTimer);
    State.particleTimer = null;
  }
}

// ─────────────────────────────────────────────────────────────
//  모드 전환 — 풍경 ↔ 우편함 상세
// ─────────────────────────────────────────────────────────────
function enterDetailMode() {
  const stage = document.getElementById('scenery-stage');
  const detail = document.getElementById('mailbox-detail-mode');
  if (!stage || !detail) return;

  stage.classList.add('zooming-in');
  setTimeout(() => {
    stage.classList.add('hidden');
    stage.classList.remove('zooming-in');
    detail.classList.add('active');
    State.sceneryMode = false;
    document.body.classList.remove('scenery-active');
    stopParticles();
    // 오늘 진입 기록 (그날 첫 진입만 풍경 모드)
    try { localStorage.setItem('sm_last_scenery_date', todayKey()); } catch {}
  }, 800);
}

function enterSceneryMode() {
  const stage = document.getElementById('scenery-stage');
  const detail = document.getElementById('mailbox-detail-mode');
  if (!stage || !detail) return;
  detail.classList.remove('active');
  stage.classList.remove('hidden', 'zooming-in');
  State.sceneryMode = true;
  document.body.classList.add('scenery-active');
  startParticles();
}

function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate();
}

// ─────────────────────────────────────────────────────────────
//  사운드 — 환경음 (간단한 Web Audio 합성)
// ─────────────────────────────────────────────────────────────
function initAmbientSound() {
  if (State.audioCtx) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    State.audioCtx = new Ctx();
  } catch {}
}

let ambientSources = [];
function startAmbient() {
  if (!State.audioCtx) return;
  stopAmbient();
  // 간단한 바람·새소리 합성 — 실제 음원 파일을 못 쓰니 노이즈+필터로
  const ctx = State.audioCtx;
  const buf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.4;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  // 필터 — 고주파 살짝 제거
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = 700;
  // 게인 — 매우 작게
  const gain = ctx.createGain();
  gain.gain.value = 0.04;
  src.connect(filt).connect(gain).connect(ctx.destination);
  src.start();
  ambientSources.push(src);
}
function stopAmbient() {
  for (const s of ambientSources) try { s.stop(); } catch {}
  ambientSources = [];
}

document.getElementById('scenery-sound-btn').addEventListener('click', () => {
  const btn = document.getElementById('scenery-sound-btn');
  if (State.soundEnabled) {
    State.soundEnabled = false;
    btn.classList.add('muted');
    stopAmbient();
    try { localStorage.setItem('sm_sound', '0'); } catch {}
  } else {
    initAmbientSound();
    if (State.audioCtx && State.audioCtx.state === 'suspended') {
      State.audioCtx.resume();
    }
    State.soundEnabled = true;
    btn.classList.remove('muted');
    startAmbient();
    try { localStorage.setItem('sm_sound', '1'); } catch {}
  }
});

// ─────────────────────────────────────────────────────────────
//  진입 안내
// ─────────────────────────────────────────────────────────────
function showSceneryHint() {
  const hint = document.getElementById('scenery-hint');
  if (!hint) return;
  setTimeout(() => hint.classList.add('show'), 1200);
  setTimeout(() => hint.classList.remove('show'), 6000);
}

// ─────────────────────────────────────────────────────────────
//  초기화 — 풍경 빌드, 시간대 적용, 클릭 핸들러
// ─────────────────────────────────────────────────────────────
function initScenery() {
  const wrap = document.getElementById('scenery-svg-wrap');
  if (!wrap) return;
  wrap.innerHTML = buildSceneryHtml();

  // 클릭 영역 (전체 SVG 또는 우편함 영역)
  const svg = wrap.querySelector('.scenery-svg');
  if (svg) {
    svg.addEventListener('click', (e) => {
      // 사운드 버튼·이름 영역 클릭은 제외 (그건 별도 핸들러)
      enterDetailMode();
    });
  }

  // 그날 첫 진입인지 확인
  let lastDate = null;
  try { lastDate = localStorage.getItem('sm_last_scenery_date'); } catch {}
  if (lastDate === todayKey()) {
    // 오늘 이미 풍경을 봤으면 바로 상세 모드로
    enterSceneryMode(); // 상태 셋업 먼저
    enterDetailMode();
  } else {
    // 첫 진입 — 풍경 모드 + 안내
    enterSceneryMode();
    showSceneryHint();
  }

  // 시간대 빛 적용 (즉시 + 1분마다 갱신)
  applyTimeOfDay();
  if (State.lightTimer) clearInterval(State.lightTimer);
  State.lightTimer = setInterval(applyTimeOfDay, 60000);

  // 입자 시작
  startParticles();

  // 사운드 복원 — 사용자가 이전에 켰었다면
  try {
    if (localStorage.getItem('sm_sound') === '1') {
      // 자동 시작은 브라우저가 막을 수 있어, 버튼 표시만 켜둠 — 실제 재생은 사용자 클릭 필요
      // (autoplay policy)
    }
  } catch {}

  // 사용자 이름
  const greet = document.getElementById('scenery-greeting');
  if (greet && State.me) {
    greet.innerHTML = `${escapeHtml(State.me.username)}의 풍경 <em>Scenery</em>`;
  }

  // 풍경 모드일 때 마스트헤드 반투명 (CSS가 처리)
  if (State.sceneryMode) document.body.classList.add('scenery-active');
}

// 풍경에서 우편함 깃발 동기화 — 새 편지 있으면 깃발 올라감
function syncSceneryFlag() {
  const flag = document.getElementById('scenery-flag');
  if (!flag) return;
  const pending = State.pendingCount || 0;
  if (pending > 0) {
    flag.style.transform = 'translate(16px, -34px) rotate(-15deg)';
    flag.style.transition = 'transform 0.6s cubic-bezier(0.4, 1.4, 0.5, 1)';
  } else {
    flag.style.transform = 'translate(16px, -28px)';
  }
}

// ─────────────────────────────────────────────────────────────
//  돌아가기 버튼
// ─────────────────────────────────────────────────────────────
document.getElementById('back-to-scenery').addEventListener('click', () => {
  enterSceneryMode();
  // 오늘 풍경을 다시 봤다고 기록할 필요는 없음 — 이미 본 것
});

// 페이지 가시성에 따라 입자 자동 일시정지
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopParticles();
  } else if (State.sceneryMode) {
    startParticles();
  }
});
