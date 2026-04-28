// ═══════════════════════════════════════════════════════════
//  stamps.js — 우표 SVG 정의 (5종)
//  서버(stamps 테이블)는 메타데이터만 갖고, 실제 그림은 여기.
//  새 우표 추가 시: 1) DB에 row 추가  2) 여기에 SVG 함수 추가
// ═══════════════════════════════════════════════════════════

const STAMP_SVG = {
  // ─── standard: 기본 우표 ───
  standard: ({ km, sealColor }) => `
    <svg class="stamp-svg" viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ss-bg-${sealColor}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fbf5e3"/>
          <stop offset="1" stop-color="#ead9b6"/>
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="96" height="116" fill="url(#ss-bg-${sealColor})" stroke="var(--sc, #8b1e1e)" stroke-width="1.5"/>
      <rect x="6" y="6" width="88" height="108" fill="none" stroke="var(--sc, #8b1e1e)" stroke-width="0.5" opacity="0.4"/>
      <!-- 깃펜 모티프 -->
      <g transform="translate(50 56)">
        <path d="M -16 18 Q -8 -12, 14 -16 L 18 -12 Q 12 8, -10 18 Z"
              fill="var(--sc, #8b1e1e)" opacity="0.85"/>
        <line x1="-14" y1="16" x2="-22" y2="24" stroke="var(--sc, #8b1e1e)" stroke-width="2" stroke-linecap="round"/>
      </g>
      <!-- 거리 표시 -->
      <text x="50" y="98" text-anchor="middle" font-family="Cormorant Garamond, serif" font-style="italic" font-size="10" fill="var(--sc, #8b1e1e)">
        ${km != null ? km + ' KM' : 'POSTAGE'}
      </text>
      <text x="50" y="110" text-anchor="middle" font-family="Cormorant Garamond, serif" font-size="6" fill="var(--sc, #8b1e1e)" letter-spacing="1.5">
        SLOW MAIL
      </text>
    </svg>
  `,

  // ─── first_letter: 첫 편지 (벚꽃) ───
  first_letter: ({ km }) => `
    <svg class="stamp-svg" viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="fl-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fde9ef"/>
          <stop offset="1" stop-color="#f5cdd9"/>
        </linearGradient>
        <radialGradient id="fl-petal">
          <stop offset="0" stop-color="#ffd1dc"/>
          <stop offset="1" stop-color="#e88aa3"/>
        </radialGradient>
      </defs>
      <rect x="2" y="2" width="96" height="116" fill="url(#fl-bg)" stroke="#a8425e" stroke-width="1.5"/>
      <rect x="6" y="6" width="88" height="108" fill="none" stroke="#a8425e" stroke-width="0.5" opacity="0.4"/>
      <!-- 벚꽃: 5개의 꽃잎 -->
      <g transform="translate(50 52)">
        ${[0, 72, 144, 216, 288].map(deg => `
          <ellipse cx="0" cy="-14" rx="6" ry="11" fill="url(#fl-petal)" stroke="#a8425e" stroke-width="0.4"
                   transform="rotate(${deg})"/>
        `).join('')}
        <circle cx="0" cy="0" r="4" fill="#fff5d4" stroke="#a8425e" stroke-width="0.5"/>
        <!-- 꽃술 -->
        ${[0, 60, 120, 180, 240, 300].map(deg => `
          <circle cx="0" cy="-3" r="0.8" fill="#a8425e" transform="rotate(${deg})"/>
        `).join('')}
      </g>
      <text x="50" y="92" text-anchor="middle" font-family="Gowun Batang, serif" font-size="8" fill="#7a2e44" font-weight="700">
        첫 편지
      </text>
      <text x="50" y="105" text-anchor="middle" font-family="Cormorant Garamond, serif" font-style="italic" font-size="8" fill="#a8425e">
        ${km != null ? km + ' KM' : 'FIRST'}
      </text>
    </svg>
  `,

  // ─── grand_tour: 전국 일주 (한국 지도 실루엣) ───
  grand_tour: ({ km }) => `
    <svg class="stamp-svg" viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="gt-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#dde8d4"/>
          <stop offset="1" stop-color="#a4c098"/>
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="96" height="116" fill="url(#gt-bg)" stroke="#3d5d3a" stroke-width="1.5"/>
      <rect x="6" y="6" width="88" height="108" fill="none" stroke="#3d5d3a" stroke-width="0.5" opacity="0.4"/>
      <!-- 단순화된 한반도 실루엣 -->
      <g transform="translate(50 58) scale(0.85)">
        <path d="M -2 -36 Q 8 -38, 12 -28 Q 18 -22, 14 -14 Q 16 -6, 20 -2
                 Q 22 6, 18 12 Q 22 18, 18 24 Q 14 30, 8 30
                 Q 4 34, -2 34 Q -8 32, -10 26 Q -16 22, -14 14
                 Q -18 8, -14 0 Q -16 -8, -10 -14 Q -14 -22, -8 -28 Q -8 -34, -2 -36 Z"
              fill="#3d5d3a" stroke="#1f3220" stroke-width="0.8" opacity="0.85"/>
        <!-- 5개 도시 점 -->
        <circle cx="-4" cy="-22" r="1.8" fill="#fff5d4"/>  <!-- 서울 -->
        <circle cx="2" cy="-12" r="1.8" fill="#fff5d4"/>   <!-- 대전 -->
        <circle cx="8" cy="2" r="1.8" fill="#fff5d4"/>     <!-- 대구 -->
        <circle cx="10" cy="14" r="1.8" fill="#fff5d4"/>   <!-- 부산 -->
        <circle cx="-8" cy="6" r="1.8" fill="#fff5d4"/>    <!-- 광주 -->
      </g>
      <text x="50" y="92" text-anchor="middle" font-family="Gowun Batang, serif" font-size="8" fill="#1f3220" font-weight="700">
        전국 일주
      </text>
      <text x="50" y="105" text-anchor="middle" font-family="Cormorant Garamond, serif" font-style="italic" font-size="8" fill="#3d5d3a">
        ${km != null ? km + ' KM' : 'TOUR'}
      </text>
    </svg>
  `,

  // ─── long_friend: 오랜 친구 (얽힌 풀잎) ───
  long_friend: ({ km }) => `
    <svg class="stamp-svg" viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="lf-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#f0e8d8"/>
          <stop offset="1" stop-color="#d8c590"/>
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="96" height="116" fill="url(#lf-bg)" stroke="#8a6a30" stroke-width="1.5"/>
      <rect x="6" y="6" width="88" height="108" fill="none" stroke="#8a6a30" stroke-width="0.5" opacity="0.4"/>
      <!-- 얽힌 풀잎 두 개 -->
      <g transform="translate(50 56)" fill="none" stroke-width="2.5" stroke-linecap="round">
        <!-- 왼쪽 풀잎 (줄기 + 잎) -->
        <path d="M -14 22 Q -18 6, -8 -16" stroke="#5a7a48"/>
        <path d="M -8 -16 Q -2 -12, -4 -4 Q -10 -8, -8 -16 Z" fill="#7a9a64" stroke="#5a7a48" stroke-width="1"/>
        <path d="M -14 8 Q -8 6, -10 14 Q -16 12, -14 8 Z" fill="#7a9a64" stroke="#5a7a48" stroke-width="1"/>
        <!-- 오른쪽 풀잎 (줄기 + 잎) -->
        <path d="M 14 22 Q 18 6, 8 -16" stroke="#5a7a48"/>
        <path d="M 8 -16 Q 2 -12, 4 -4 Q 10 -8, 8 -16 Z" fill="#7a9a64" stroke="#5a7a48" stroke-width="1"/>
        <path d="M 14 8 Q 8 6, 10 14 Q 16 12, 14 8 Z" fill="#7a9a64" stroke="#5a7a48" stroke-width="1"/>
        <!-- 매듭 -->
        <ellipse cx="0" cy="22" rx="6" ry="3" fill="#a8854a" stroke="#5a3818" stroke-width="0.8"/>
      </g>
      <text x="50" y="92" text-anchor="middle" font-family="Gowun Batang, serif" font-size="8" fill="#3d2613" font-weight="700">
        오랜 친구
      </text>
      <text x="50" y="105" text-anchor="middle" font-family="Cormorant Garamond, serif" font-style="italic" font-size="8" fill="#5a3818">
        ${km != null ? km + ' KM' : 'FRIEND'}
      </text>
    </svg>
  `,

  // ─── night_owl: 야밤 우편 (달과 별) ───
  night_owl: ({ km }) => `
    <svg class="stamp-svg" viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="no-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#1a2848"/>
          <stop offset="1" stop-color="#0d1428"/>
        </linearGradient>
        <radialGradient id="no-moon">
          <stop offset="0" stop-color="#fff8d4"/>
          <stop offset="1" stop-color="#e8d49a"/>
        </radialGradient>
      </defs>
      <rect x="2" y="2" width="96" height="116" fill="url(#no-bg)" stroke="#c9a961" stroke-width="1.5"/>
      <rect x="6" y="6" width="88" height="108" fill="none" stroke="#c9a961" stroke-width="0.5" opacity="0.4"/>
      <!-- 별들 -->
      <circle cx="22" cy="22" r="0.9" fill="#fff8d4"/>
      <circle cx="78" cy="18" r="1.2" fill="#fff8d4"/>
      <circle cx="84" cy="38" r="0.7" fill="#fff8d4"/>
      <circle cx="16" cy="42" r="1" fill="#fff8d4"/>
      <circle cx="88" cy="62" r="0.8" fill="#fff8d4"/>
      <circle cx="14" cy="68" r="1.1" fill="#fff8d4"/>
      <!-- 십자 별 한 개 (중앙 약간 위) -->
      <g transform="translate(72 30)" fill="#fff8d4">
        <path d="M 0 -3 L 0.5 -0.5 L 3 0 L 0.5 0.5 L 0 3 L -0.5 0.5 L -3 0 L -0.5 -0.5 Z"/>
      </g>
      <!-- 초승달 -->
      <g transform="translate(50 56)">
        <circle cx="0" cy="0" r="18" fill="url(#no-moon)"/>
        <circle cx="6" cy="-2" r="16" fill="#1a2848"/>
        <!-- 달 표면 디테일 -->
        <circle cx="-6" cy="-4" r="1.5" fill="#d4be84" opacity="0.6"/>
        <circle cx="-9" cy="3" r="1" fill="#d4be84" opacity="0.5"/>
      </g>
      <text x="50" y="92" text-anchor="middle" font-family="Gowun Batang, serif" font-size="8" fill="#fff8d4" font-weight="700">
        야밤 우편
      </text>
      <text x="50" y="105" text-anchor="middle" font-family="Cormorant Garamond, serif" font-style="italic" font-size="8" fill="#c9a961">
        ${km != null ? km + ' KM' : 'NIGHT'}
      </text>
    </svg>
  `
};

function renderStampSvg(stampId, ctx = {}) {
  const fn = STAMP_SVG[stampId] || STAMP_SVG.standard;
  return fn({
    km: ctx.km != null ? Math.round(ctx.km) : null,
    sealColor: ctx.sealColor || 'crimson'
  });
}
