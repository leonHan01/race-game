import { LONGBOARD, type VehicleDefinition } from '../content/vehicles';
import { boardOutline } from '../content/board-outline';

/** Lightweight catalogue illustration using the same body types as the 3D models. */
export function vehicleThumbnail(vehicle: VehicleDefinition) {
  if (vehicle.mode === 'longboard') return longboardThumbnail(vehicle);
  if (vehicle.mode === 'motorcycle') return motorcycleThumbnail(vehicle);
  const truck = vehicle.body === 'truck', suv = vehicle.body === 'suv', muscle = vehicle.body === 'muscle';
  const supercar = vehicle.body === 'supercar', coupe = vehicle.body === 'coupe' || supercar;
  const id = `car-${vehicle.id}`;
  const spokeCount = coupe ? 10 : muscle ? 5 : truck || suv ? 6 : 8;
  const rimScale = supercar ? 1.16 : coupe ? 1.1 : truck || suv || muscle ? 0.9 : 1;
  const top = suv ? 'M24 64Q28 54 66 51L93 20Q97 16 109 16H229Q237 16 239 25L249 52H281Q290 54 293 65'
    : muscle ? 'M23 65Q27 56 86 54L127 32Q135 28 143 28H180L211 50 278 55 292 64'
    : supercar ? 'M23 68 83 57 116 39Q126 34 138 34H164L196 55 273 57 292 68'
    : truck ? 'M24 64Q28 56 69 52L110 25Q116 21 127 21H169Q179 21 181 33L185 52H281Q290 54 293 65'
    : coupe ? 'M23 66Q28 57 77 54L123 33Q132 29 144 29H173Q184 30 194 38L228 54Q280 57 292 66'
    : 'M24 64Q28 55 68 52L108 28Q116 23 128 23H197Q211 23 216 35L230 53Q282 56 290 65';
  const glass = suv ? 'M80 50 101 23H137V50ZM144 23H186V50H144ZM193 23H229L235 50H193Z'
    : muscle ? 'M104 52 132 35Q137 33 144 33H160V52ZM167 33H177L201 50H167Z'
    : supercar ? 'M102 55 122 41Q128 38 139 38H153V54ZM159 38H164L188 54H159Z'
    : truck ? 'M94 51 115 28H143V51ZM150 28H169Q173 28 174 35L177 51H150Z'
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
    <path d="M108 74Q160 73 212 68V71Q158 76 108 75Z" fill="#df8e44"/>
    <path d="M163 55V70M97 55 102 70M173 57h9" fill="none" stroke="#52646d" stroke-width=".8"/>
    ${muscle ? '<path d="M52 55V50Q64 46 73 50L81 55Z" fill="#24343d"/><path d="M43 58 84 56M132 30h45" stroke="#df8e44" stroke-width="3"/>' : vehicle.id !== 'swift' && !supercar ? '<path d="M50 55 65 53m-9 5 15-2m-9 5 15-2" stroke="#30424c" stroke-width="1.7"/>' : ''}
    ${muscle ? '<path d="M27 60h22v10H27Z" fill="#253640"/><circle cx="32" cy="65" r="3.8" fill="#edf8ff"/><circle cx="43" cy="65" r="3.8" fill="#edf8ff"/><path d="M279 61v8m5-8v8m5-8v8" stroke="#b42837" stroke-width="2"/>'
      : `<path d="${truck || suv ? 'M27 61 44 59 45 68 28 70Z' : supercar ? 'M28 67 55 62 50 65 28 69Z' : coupe ? 'M27 63 50 60 48 63 27 66Z' : 'M27 63 47 61 46 66 27 68Z'}" fill="#edf8ff"/><path d="${truck || suv ? 'M278 59h10v12h-10Z' : 'M277 61h14v8h-14Z'}" fill="#26343d"/><path d="${truck || suv ? 'M281 61v8h5m-5-8h5' : vehicle.id === 'swift' ? 'M279 63h10v4h-10' : 'M279 63h10m-10 4h10'}" fill="none" stroke="#c13a45" stroke-width="1.6"/><path d="M280 68h3" stroke="#c8dfe6" stroke-width=".8"/>`}
    <path d="M25 75h28M267 76h25" stroke="#24343d" stroke-width="3"/>
    <path d="M29 71h11m-11 2h11M279 74h8" stroke="#657882" stroke-width=".8"/>
    <path d="M281 74h6" stroke="#a13d42" stroke-width="1.2"/>
    ${suv ? '<path d="M105 15V10H227V15M113 10V15m50-5v5m55-5v5M106 81h105" fill="none" stroke="#34444c" stroke-width="2.5"/><rect x="151" y="5" width="45" height="7" rx="2" fill="#34444c"/><path d="M159 5v7m28-7v7" stroke="#df8e44" stroke-width="2"/><path d="M74 52 83 20 88 17M27 78h26" fill="none" stroke="#34444c" stroke-width="3"/>'
      : muscle ? '<path d="M262 53Q273 49 287 50L286 53Q274 52 263 55Z" fill="#aab9bf"/>'
      : supercar ? '<path d="M252 57V43m-12-3v7m44-7v7M26 79h26" stroke="#253640" stroke-width="3"/><path d="M236 42Q262 39 287 42L285 45Q260 43 236 45Z" fill="#253640"/><path d="M192 58 218 56 208 70 189 72Z" fill="#253640"/><path d="M211 56 204 69" stroke="#df8e44" stroke-width="2"/><path d="M218 55h22m-19-3h19m-16-3h16" stroke="#253640" stroke-width="1.5"/>'
      : truck ? '<path d="M188 51h96M193 50V36Q195 32 200 32h13M106 80h105" fill="none" stroke="#34444c" stroke-width="2.5"/><path d="M26 78h24" stroke="#adbec4" stroke-width="3"/>'
      : coupe ? '<path d="M254 53V48" stroke="#253640" stroke-width="3"/><path d="M239 47Q264 44 286 47L285 50Q264 48 239 50Z" fill="#253640"/>' : `<path d="M197 25h${vehicle.id === 'swift' ? 20 : 27}" stroke="${vehicle.id === 'swift' ? '#c5d1d5' : '#253640'}" stroke-width="3"/>`}
    ${truck || suv ? '<path d="M56 78a22 22 0 0 1 44 0m120 0a22 22 0 0 1 44 0" fill="none" stroke="#27343b" stroke-width="3"/>' : ''}
    <path d="M102 54 107 56" stroke="#293d47" stroke-width="1.5"/><path d="M92 51Q94 47 102 48L108 50 106 54Q98 56 92 53Z" fill="#c4d1d6" stroke="#60747e" stroke-width=".7"/><path d="M94 53Q100 55 106 53" fill="none" stroke="#283b46" stroke-width="1.1"/>
    ${[78, 242].map(x => `<g transform="translate(${x} 77)"><circle r="18.5" fill="#141d24"/><circle r="17.8" fill="none" stroke="#303e47" stroke-width="${truck || suv ? 1.4 : .8}" stroke-dasharray="${truck || suv ? '2 5' : '1 8.3'}"/><circle r="16" fill="none" stroke="#303c44" stroke-width="1.2"/><g transform="scale(${rimScale})"><circle r="12.6" fill="url(#${id}-rim)" stroke="#c5d2d7" stroke-width=".8"/><circle r="8.4" fill="none" stroke="#53616b" stroke-width="2.5"/><path d="M7-5v9" stroke="#d78d4b" stroke-width="3"/>${Array.from({ length: spokeCount }, (_, i) => `<path d="M-.6-2 0-12 1.2-12 2-4Z" fill="#b2c2cc" stroke="#526773" stroke-width=".5" transform="rotate(${coupe ? Math.floor(i / 2) * 72 + (i % 2 ? 10 : -10) : i * 360 / spokeCount})"/>`).join('')}<circle r="3" fill="#526370"/><circle r="1.2" fill="#a6b6c1"/></g></g>`).join('')}
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
    <defs><linearGradient id="${id}-paint" x2="0" y2="1"><stop stop-color="#f2f1e7"/><stop offset=".4" stop-color="#dce4df"/><stop offset=".65" stop-color="#9aaeb4"/><stop offset="1" stop-color="#536a77"/></linearGradient>
    <linearGradient id="${id}-glass" x2="1" y2="1"><stop stop-color="#8cabbc"/><stop offset=".5" stop-color="#344f61"/><stop offset="1" stop-color="#142630"/></linearGradient></defs>
    <ellipse cx="163" cy="91" rx="106" ry="5" fill="#0a151c" opacity=".2"/>
    ${[89, 234].map(x => `<g transform="translate(${x} 73)"><circle r="23" fill="#182128"/>${enduro ? '<circle r="22" fill="none" stroke="#3d4950" stroke-width="2" stroke-dasharray="3 3"/>' : '<circle r="21" fill="none" stroke="#35454d" stroke-width=".8"/>'}<circle r="16" fill="#25373e" stroke="#bfccd0" stroke-width="1.2"/>${Array.from({ length: enduro ? 16 : 6 }, (_, n) => `<path d="M${enduro ? '2 3 0-15' : '-2 3 4-12 0-15'}" fill="none" stroke="#bfccd0" stroke-width="${enduro ? .65 : 1.8}" transform="rotate(${n * 360 / (enduro ? 16 : 6)})"/>`).join('')}<circle r="9" fill="none" stroke="#8a9ca4" stroke-width="3"/><circle r="9" fill="none" stroke="#25373e" stroke-width="1" stroke-dasharray="1 3"/><path d="M8-5v7" stroke="#d18b4d" stroke-width="3"/><circle r="4" fill="#d3dfe0"/></g>`).join('')}
    <path d="M89 73 140 65 186 41 207 42 234 73M140 65 178 73 199 49" fill="none" stroke="#b8c8cc" stroke-width="5" stroke-linejoin="round"/>
    <path d="M209 45 217 58" stroke="${enduro ? '#6e828e' : '#b68b50'}" stroke-width="4"/>
    <path d="M109 43 172 47 140 65 108 70" fill="none" stroke="#d78d4b" stroke-width="4"/>
    <path d="M109 42 66 36 64 43 130 54 147 43 177 46 195 37Q176 27 158 32L143 40Z" fill="url(#${id}-paint)" stroke="#bacace"/>
    <path d="M74 42 124 50 125 52 74 44Z" fill="#d78d4b"/>
    <path d="M83 39 123 44 143 40" stroke="#24343c" stroke-width="6" stroke-linecap="round"/>
    ${enduro ? '<path d="M208 49q21-6 40 0M196 27l14 3-4 17-10-2" fill="none" stroke="#e5edeb" stroke-width="5"/><path d="M185 72h-31" stroke="#b5c4c8" stroke-width="4"/><path d="M199 34h7m-7 5h7" stroke="#e9f8ff" stroke-width="2"/><path d="M201 28q11-5 13 4" fill="none" stroke="#a7bdc7" stroke-width="2"/>'
      : '<path d="M175 43Q196 32 213 38L222 44 208 49 191 57 178 77Q161 78 148 70L153 58Z" fill="url(#'+id+'-paint)" stroke="#b4c6ca"/><path d="M190 46 156 63 156 66 189 49Z" fill="#d78d4b"/><path d="M190 51 157 68 166 73 186 62Z" fill="#293c45"/><path d="M162 69h.4m11-5h.4m11-6h.4" stroke="#8c9ea6" stroke-width="1.2" stroke-linecap="round"/><path d="M196 35Q194 20 200 24L212 36" fill="url(#'+id+'-glass)" stroke="#9aafba" stroke-width=".6"/><path d="M215 52q17-7 26 7" fill="none" stroke="#293c45" stroke-width="4"/>'}
    <path d="M92 71 135 64 115 76Z" fill="none" stroke="#34444c" stroke-width="1.5"/><path d="M78 56 113 65" stroke="#a9bcc6" stroke-width="6" stroke-linecap="round"/><path d="M84 54 83 58m19 1-1 6" stroke="#334851" stroke-width="2"/>
    <path d="M126 39 145 53 134 69 148 71" fill="none" stroke="#27333e" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M126 35 ${enduro ? '144 12 169 20 185 32 201 31' : '160 18 180 24 184 36 199 36'}" fill="none" stroke="#293944" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M129 30 ${enduro ? '144 13' : '160 18'}" stroke="#d99751" stroke-width="6"/>
    <ellipse cx="${enduro ? 160 : 177}" cy="${enduro ? 12 : 14}" rx="10" ry="9.5" fill="url(#${id}-paint)"/>
    <path d="${enduro ? 'M159 7q7-1 12 3v6l-12-1Z' : 'M176 9q7-1 12 3v6l-12-1Z'}" fill="url(#${id}-glass)"/>
    <path d="${enduro ? 'M153 7q2-4 6-4' : 'M170 9q2-4 6-4'}" stroke="#d78d4b" stroke-width="1" fill="none"/>
    ${enduro ? '<path d="M158 5h16l-2 2h-13" fill="#283d48"/>' : ''}
    <path d="M65 40h9" stroke="#df5861" stroke-width="3"/><path d="M207 42h7" stroke="#edfbff" stroke-width="3"/>
  </svg>`;
}
