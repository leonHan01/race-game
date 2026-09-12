import { LONGBOARD, type VehicleDefinition } from '../content/vehicles';
import { boardOutline } from '../content/board-outline';

/** Lightweight catalogue illustration using the same body types as the 3D models. */
export function vehicleThumbnail(vehicle: VehicleDefinition) {
  if (vehicle.mode === 'longboard') return longboardThumbnail(vehicle);
  if (vehicle.mode === 'motorcycle') return motorcycleThumbnail(vehicle);
  const truck = vehicle.body === 'truck'; const coupe = vehicle.body === 'coupe';
  const id = `car-${vehicle.id}`;
  const top = truck ? 'M24 64Q28 56 69 52L110 25Q116 21 127 21H169Q179 21 181 33L185 52H281Q290 54 293 65'
    : coupe ? 'M23 66Q28 57 77 54L123 33Q132 29 144 29H173Q184 30 194 38L228 54Q280 57 292 66'
    : 'M24 64Q28 55 68 52L108 28Q116 23 128 23H197Q211 23 216 35L230 53Q282 56 290 65';
  const glass = truck ? 'M94 51 115 28H143V51ZM150 28H169Q173 28 174 35L177 51H150Z'
    : coupe ? 'M98 52 128 35Q133 33 143 33H160V52ZM166 33H174Q181 34 187 39L207 53H166Z'
    : 'M93 51 116 30H155V51ZM162 30H194Q202 30 207 39L215 51H162Z';
  return `<svg class="catalog-preview vehicle-preview" viewBox="0 0 320 100" aria-hidden="true">
    <defs>
      <linearGradient id="${id}-paint" x1="0" y1="0" x2="0.12" y2="1"><stop stop-color="#f4f6f4"/><stop offset=".42" stop-color="#c5d1d5"/><stop offset=".52" stop-color="#eef0eb"/><stop offset=".72" stop-color="#9aa8ac"/><stop offset="1" stop-color="#56656c"/></linearGradient>
      <linearGradient id="${id}-glass" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#8ba7b7"/><stop offset=".4" stop-color="#344e60"/><stop offset="1" stop-color="#172731"/></linearGradient>
      <radialGradient id="${id}-rim"><stop stop-color="#788993"/><stop offset=".7" stop-color="#26313b"/><stop offset="1" stop-color="#bfccd1"/></radialGradient>
    </defs>
    <ellipse cx="162" cy="88" rx="139" ry="5" fill="#091218" opacity=".2"/>
    <path d="${top}L291 78H264C263 49 221 49 220 78H100C99 49 58 49 57 78H26Z" fill="url(#${id}-paint)" stroke="#75838a" stroke-width=".7"/>
    <path d="${glass}" fill="url(#${id}-glass)" stroke="#dce5e5" stroke-width="1"/>
    <path d="M106 57H216M34 59 68 57M106 76H213" fill="none" stroke="#ecf3ef" stroke-width=".8" opacity=".7"/>
    <path d="M105 60 107 73H212" fill="none" stroke="#172b37" stroke-width="1.4"/>
    <path d="M108 73H212" stroke="#df8e44" stroke-width="2"/>
    <path d="M163 55V70M97 55 102 70M173 57h9" fill="none" stroke="#52646d" stroke-width=".8"/>
    <path d="M27 63 47 61 46 66 27 68Z" fill="#edf8ff"/><path d="M278 62h12v5h-12Z" fill="#b42837"/>
    <path d="M25 75h28M267 76h25" stroke="#24343d" stroke-width="3"/>
    ${truck ? '<path d="M188 51h96M193 50V36Q195 32 200 32h13" fill="none" stroke="#34444c" stroke-width="2.5"/>'
      : coupe ? '<path d="M254 53V48m-15 0h47" stroke="#253640" stroke-width="3"/>' : '<path d="M197 25h27" stroke="#253640" stroke-width="3"/>'}
    <ellipse cx="100" cy="51" rx="7" ry="3" fill="#9cabb3" stroke="#5d727c" stroke-width=".7"/>
    ${[78, 242].map(x => `<g transform="translate(${x} 77)"><circle r="18.5" fill="#141d24"/><circle r="16" fill="none" stroke="#303c44" stroke-width="1.2"/><circle r="12.6" fill="url(#${id}-rim)" stroke="#c5d2d7" stroke-width=".8"/>${Array.from({ length: 10 }, (_, i) => `<path d="M-1.2 3 0-12 1.5-4Z" fill="#c3ced2" transform="rotate(${i * 36})"/>`).join('')}<circle r="3.5" fill="#788b97"/><circle r="1.2" fill="#dce4e7"/></g>`).join('')}
  </svg>`;
}

function longboardThumbnail(vehicle: VehicleDefinition) {
  const board = vehicle.board ?? LONGBOARD.board!;
  const path = boardOutline(board).map(([x, z], i) => `${i ? 'L' : 'M'}${160 + z * 180},${50 + x * 110}`).join(' ') + 'Z';
  const axles = [-board.wheelbase / 2, board.wheelbase / 2].map(z => 160 + z * 180);
  const wheelY = board.width * 0.45 * 110;
  return `<svg class="catalog-preview vehicle-preview" viewBox="0 0 320 100" aria-hidden="true">
    <ellipse cx="160" cy="84" rx="${board.length * 94}" ry="5" fill="#091218" opacity=".12"/>
    ${axles.map(x => `<path d="M${x} ${50 - wheelY}V${50 + wheelY}" stroke="#a5b8c0" stroke-width="5"/>${[-1, 1].map(side => `<rect x="${x - board.wheelRadius * 180}" y="${50 + side * wheelY - 7}" width="${board.wheelRadius * 360}" height="14" rx="4" fill="${board.wheelColor}" stroke="#22353c" stroke-width="1"/>`).join('')}`).join('')}
    <path d="${path}" fill="${board.deckColor}" stroke="#cad8d4" stroke-width="1"/>
    <path d="${path}" fill="#26343b" transform="translate(160 50) scale(.91 .76) translate(-160 -50)"/>
    <path d="M${160 - board.length * 55} 50H${160 + board.length * 55}" stroke="${board.deckColor}" stroke-width="5"/>
    ${axles.map(x => `<path d="M${x - 2} 44V47M${x + 2} 44V47M${x - 2} 53V56M${x + 2} 53V56" stroke="#bacbd0" stroke-width="1.4"/>`).join('')}
  </svg>`;
}

function motorcycleThumbnail(vehicle: VehicleDefinition) {
  const enduro = vehicle.id === 'trail'; const id = `bike-${vehicle.id}`;
  return `<svg class="catalog-preview vehicle-preview" viewBox="0 0 320 100" aria-hidden="true">
    <defs><linearGradient id="${id}-paint" x2="0" y2="1"><stop stop-color="#f2f1e7"/><stop offset="1" stop-color="#72868d"/></linearGradient></defs>
    <ellipse cx="163" cy="91" rx="106" ry="5" fill="#0a151c" opacity=".2"/>
    ${[89, 234].map(x => `<g transform="translate(${x} 73)"><circle r="23" fill="#182128"/><circle r="16" fill="#607681"/><circle r="12" fill="#25373e"/>${[0,60,120].map(a => `<path d="M-15 0H15" stroke="#bfccd0" stroke-width="2" transform="rotate(${a})"/>`).join('')}<circle r="4" fill="#d3dfe0"/></g>`).join('')}
    <path d="M89 73 140 65 186 41 207 42 234 73M140 65 178 73 199 49" fill="none" stroke="#b8c8cc" stroke-width="5" stroke-linejoin="round"/>
    <path d="M109 43 172 47 140 65 108 70" fill="none" stroke="#d78d4b" stroke-width="4"/>
    <path d="M109 42 66 36 64 43 130 54 147 43 177 46 195 37Q176 27 158 32L143 40Z" fill="url(#${id}-paint)" stroke="#bacace"/>
    <path d="M83 39 123 44 143 40" stroke="#24343c" stroke-width="6" stroke-linecap="round"/>
    ${enduro ? '<path d="M208 49h40M196 27l14 3-4 17-10-2" stroke="#e5edeb" stroke-width="5"/><path d="M185 72h-31" stroke="#b5c4c8" stroke-width="4"/>'
      : '<path d="M176 43 213 37 218 47 189 53 178 79 144 72 147 58Z" fill="url(#'+id+'-paint)" stroke="#b4c6ca"/><path d="M174 52 164 68" stroke="#d78d4b" stroke-width="5"/><path d="M196 34 192 21 203 28 210 36" fill="#526e7e"/>'}
    <path d="M126 39 145 53 134 69 148 71" fill="none" stroke="#27333e" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M126 35 ${enduro ? '144 12 169 20 185 32 201 31' : '160 18 180 24 184 36 199 36'}" fill="none" stroke="#293944" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M129 30 ${enduro ? '144 13' : '160 18'}" stroke="#d99751" stroke-width="6"/>
    <ellipse cx="${enduro ? 160 : 177}" cy="${enduro ? 9 : 14}" rx="11" ry="10" fill="#dce6e3"/>
    <path d="${enduro ? 'M161 5h10v7h-9' : 'M178 10h10v7h-9'}" fill="#293f50"/>
    <path d="M65 40h9" stroke="#df5861" stroke-width="3"/><path d="M207 42h7" stroke="#edfbff" stroke-width="3"/>
  </svg>`;
}
