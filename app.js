// ═══════════════════════════════════════════════════════════
//  app.js — 부트스트랩, 전역 State, 공통 유틸
// ═══════════════════════════════════════════════════════════

// Configuration check
const isConfigured = SUPABASE_URL && SUPABASE_URL.startsWith('https://') && SUPABASE_ANON_KEY && SUPABASE_ANON_KEY.length > 30;

if (!isConfigured) {
  document.body.insertAdjacentHTML('afterbegin', `
    <div class="config-warning">
      <strong>설정 필요</strong> — <code>config.js</code> 의 <code>SUPABASE_URL</code> 과 <code>SUPABASE_ANON_KEY</code> 를 본인 프로젝트 값으로 교체하세요. README 참고.
    </div>
  `);
  const onb = document.getElementById('onboarding');
  if (onb) onb.style.display = 'none';
  throw new Error('Supabase not configured');
}

const supa = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ═══════════════════════════════════════════════════════════
//  GLOBAL STATE
// ═══════════════════════════════════════════════════════════
const State = {
  user: null,
  me: null,
  letters: [],            // picked-up arrived letters
  pendingCount: 0,        // arrived but not yet picked up
  sent: [],
  composeImages: [],
  composeStyle: { paper: 'cream', envelope: 'cream', stamp: 'standard' },
  recipientCache: null,
  refreshTimer: null,
  authMode: 'signin',
  notifEnabled: false,
  seenLetterIds: new Set(),
  stampCatalog: [],        // [{id, name, description, hidden, display_order}]
  ownedStampIds: new Set() // Set of stamp ids the user owns
};

// ═══════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════
const PAPER_STYLES = [
  { id: 'cream',  label: '크림' },
  { id: 'lined',  label: '줄지' },
  { id: 'grid',   label: '모눈' },
  { id: 'aged',   label: '오래된' },
  { id: 'ivory',  label: '아이보리' }
];
const ENVELOPE_STYLES = [
  { id: 'cream',  label: '크림' },
  { id: 'kraft',  label: '크라프트' },
  { id: 'navy',   label: '네이비' },
  { id: 'sage',   label: '세이지' },
  { id: 'ivory',  label: '아이보리' }
];
const SEAL_COLORS = ['crimson', 'navy', 'forest', 'gold', 'charcoal', 'plum'];
const TEXT_COLORS = {
  ink:     '#1f2a44',
  sepia:   '#6b4226',
  crimson: '#8b1e1e',
  forest:  '#3d5d3a'
};

// ═══════════════════════════════════════════════════════════
//  GEO + DELIVERY MATH
// ═══════════════════════════════════════════════════════════
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function deliveryMs(distanceKm) {
  if (distanceKm < 1) return 30 * 1000;
  const seconds = Math.max(60, Math.min(86400, Math.sqrt(distanceKm) * 60));
  return Math.round(seconds * 1000);
}

function formatDuration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}초`;
  if (s < 3600) return `${Math.round(s / 60)}분`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h < 24) return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
  const d = Math.floor(h / 24);
  return `${d}일 ${h % 24}시간`;
}

function formatTimeRemaining(ms) {
  if (ms <= 0) return '도착함';
  return `약 ${formatDuration(ms)} 후`;
}

function shortDate(ts) {
  const d = new Date(ts);
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${M}.${D} ${h}:${m}`;
}

function longDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

// ═══════════════════════════════════════════════════════════
//  HTML SAFETY
// ═══════════════════════════════════════════════════════════
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escapeAttr(s) {
  return String(s == null ? '' : s).replace(/[^a-zA-Z0-9_\-]/g, '');
}

function sanitizeLetterHtml(html) {
  if (typeof DOMPurify === 'undefined') {
    return escapeHtml(html).replace(/\n/g, '<br>');
  }
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 'br', 'div', 'span', 'p'],
    ALLOWED_ATTR: ['style'],
    ALLOWED_CSS: ['color', 'font-family', 'font-weight', 'font-style', 'text-decoration'],
    ALLOWED_URI_REGEXP: /^$/
  });
}

// ═══════════════════════════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════════════════════════
let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

// ═══════════════════════════════════════════════════════════
//  ACCORDION HELPER (used in profile modal)
// ═══════════════════════════════════════════════════════════
document.addEventListener('click', e => {
  const head = e.target.closest('.acc-head');
  if (!head) return;
  const group = head.closest('.acc-group');
  if (group) group.classList.toggle('open');
});

// ═══════════════════════════════════════════════════════════
//  IMAGE COMPRESSION (used by compose)
// ═══════════════════════════════════════════════════════════
function compressImage(file) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 800;
        let w = img.width, h = img.height;
        if (w > h && w > maxDim) { h = h * maxDim / w; w = maxDim; }
        else if (h > maxDim) { w = w * maxDim / h; h = maxDim; }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        const dataUrl = c.toDataURL('image/jpeg', 0.78);
        c.toBlob(blob => res({ blob, dataUrl }), 'image/jpeg', 0.78);
      };
      img.onerror = rej;
      img.src = e.target.result;
    };
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

// ═══════════════════════════════════════════════════════════
//  STORAGE: signed image URLs
// ═══════════════════════════════════════════════════════════
async function getSignedImageUrls(paths) {
  if (!paths || paths.length === 0) return [];
  const { data, error } = await supa.storage
    .from('letter-images')
    .createSignedUrls(paths, 3600);
  if (error) { console.error(error); return paths.map(() => null); }
  return data.map(d => d.signedUrl);
}
