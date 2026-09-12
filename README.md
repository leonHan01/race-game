# DUSTLINE · 尘途拉力

**English** · [简体中文](README.zh-CN.md)

A 3D browser rally game with outdoor gravel trails, mountain routes, and three fully enclosed indoor venues. Pick a car, line up against five AI drivers, and race for the finish while chasing your best stage time.

Built with **Three.js, TypeScript, and Vite**. The in-game menus, HUD, and optional co-driver voice are currently in Chinese; this repository provides documentation in both English and Chinese.

## Highlights

- **Six-car races:** five AI opponents with different cars and driving speeds, corner braking, following, and overtaking behavior.
- **Ten race stages:** seven outdoor routes, including three rolling jump stages, and three enclosed indoor venues, with road widths from 14 to 22 meters and different surface grip.
- **Car and motorcycle modes:** four cars and two motorcycles with matching AI opponents. Bikes include riders, two-wheel models and cornering lean, with distinct sport and enduro handling.
- **Manual steering:** turn the car yourself, with smooth steering input and no automatic cornering or lane centering.
- **Hold-to-drift handbrake:** longer Space holds build a larger slide; releasing the key restores grip gradually.
- **Drift-powered nitro:** build charge while sliding, then hold Shift or the HUD button for faster acceleration.
- **Terrain-driven jumps:** accelerate over rounded crests to take off; cars and motorcycles share gravity, landing contact and airtime indicators with all five opponents.
- **A steady camera:** road-facing chase and low camera views, interpolated movement, and no added screen shake or suspension bounce.
- **Race position and time trials:** live standings, finish order, five sector splits, medals, and local personal bests.
- **Rally atmosphere:** natural lighting, procedural scenery and cars, dust trails, fading tyre marks, engine audio, and pace notes.

## Screenshots

Actual captures from the game at 1280 × 720. The in-game interface is currently in Chinese.

**Main menu — Pine Ridge and the FALCON R4**

![DUSTLINE main menu with the FALCON R4 at Pine Ridge](docs/screenshots/menu.jpg)

**Six-car starting grid and race HUD**

![Six cars lined up at Pine Ridge with the position leaderboard, minimap, and speedometer](docs/screenshots/race.jpg)

| Stage selection | Garage |
| --- | --- |
| ![Stage selection showing Green Valley and Pine Ridge](docs/screenshots/stages.jpg) | ![Garage showing the SWIFT F2 and FALCON R4](docs/screenshots/garage.jpg) |

The selection screens scroll to show the remaining stages and cars. Original images and capture notes are in [docs/screenshots](docs/screenshots/README.md).

## Quick start

You will need:

- Node.js **20.19+ in the 20.x line, or 22.12+**.
- npm.
- A browser with **WebGL 2** and hardware acceleration enabled.

From the project directory:

```bash
npm ci
npm run dev
```

Open **[http://localhost:5175/](http://localhost:5175/)**.

The development port is fixed at `5175`. If it is occupied, Vite reports an error instead of choosing another port. Run the project through Vite; opening `index.html` directly from the filesystem does not start the game correctly.

For a production build:

```bash
npm run build
npm run preview
```

The build is written to `dist/`. Open the preview URL printed in the terminal. Deploy `dist/` to a static web host when ready to publish. Fonts and scene assets are bundled or generated locally; gameplay does not fetch remote models or images.

## Controls

| Action | Keyboard |
| --- | --- |
| Accelerate | `W` / `↑` |
| Brake | `S` / `↓` |
| Steer left / right | `A` / `D`, or `←` / `→` |
| Hold handbrake / drift | Hold `Space`; release to restore grip |
| Nitro boost | Hold either `Shift` key or the nitro button; drift to recharge |
| Use item | Press `E` or click the item slot in Item Rush |
| Switch chase / low camera | `C` |
| Recover to the road | `R` — adds a 5-second time penalty |
| Pause / resume | `Esc` / `P` |

Touch devices have on-screen steering, throttle, brake, handbrake, and nitro buttons. Optional automatic throttle lets you focus on steering and braking; it does not steer for you.

Choose **选择地图** (Select stage) or **选择车辆** (Select vehicle) from the main menu, then press **开始赛段** (Start stage). The stage catalog has All, Outdoor, Indoor, and **起伏飞跃** (Hills & Jumps) filters. Choose Hills & Jumps for the new elevated routes, or **室内场馆** for the enclosed venues. Return to the main menu before changing the stage or car during a race.

## Stages

Distances are approximate. Each route has its own scenery, grip, and medal target.

| Stage | In-game name | Difficulty | Length | Road width | Surface |
| --- | --- | --- | --- | --- | --- |
| Green Valley | 绿谷短途 | Beginner | 1.97 km | 22 m | Firm gravel, gentle bends, high grip |
| Pine Ridge | 松岭山道 | Standard | 4.09 km | 18 m | Loose gravel, forest roads, linked S-bends |
| Red Canyon | 赤岩峡谷 | Advanced | 4.54 km | 16 m | Loose dirt, fast sections followed by sharp turns |
| Frost Pass | 雪岭关隘 | Expert | 5.42 km | 14 m | Packed snow, linked corners, reduced grip and braking |
| Hangar Run | 机库练习场 | Beginner | 0.94 km | 22 m | Indoor dry asphalt, broad bends, warm overhead lamps |
| Rally Dome | 穹顶拉力馆 | Advanced | 1.49 km | 18 m | Indoor packed clay, linked switchbacks, tiered grandstands |
| Depot Sprint | 货运仓储馆 | Expert | 1.43 km | 14 m | Indoor polished concrete, tight turns, warehouse service bays |
| Meadow Hills | 丘陵牧场 | Standard | 2.39 km | 22 m | Rolling grassland, three rounded gravel crests |
| Quarry Run | 砂岩采石场 | Advanced | 3.20 km | 20 m | Sandstone slopes, four jumps and long landing runouts |
| Skyline Crest | 云脊飞跃 | Expert | 3.35 km | 18 m | High ridges, four large crests and steep descents |

All three indoor venues have a complete roof, four enclosing walls, flat floors, ceiling beams, and overhead fixtures. Hangar Run has steel framing and service containers; Rally Dome has an arched roof and grandstands; Depot Sprint has a low ceiling, storage racks, crates, and closed shutters. They use the same six-car, five-gate point-to-point race format and separate records. Outer walls stop the player without turning the car, and the camera stays inside the enclosure. Indoor scenery replaces outdoor terrain and vegetation, with instanced fixtures and shared lighting to keep rendering work bounded.

### Hills and jumps

Stages 08–10 have continuous climbs, descents and rounded earth ramps. Yellow **JUMP** signs and the co-driver HUD warn of approaching crests; stage cards show an elevation profile and jump locations. No jump key is needed: low speeds keep the tyres on the road, while faster approaches produce longer, higher flights. Line up before takeoff and leave braking room after landing.

Airborne vehicles retain their horizontal momentum and fall under gravity. Steering, tyre braking, drift charging and nitro acceleration resume on ground contact. The HUD shows airtime and height above the road; ground dust and tyre marks stop during flight, and the contact shadow stays on the surface. The camera keeps its road-facing horizon and eases down after landing without an impact shake or rebound. Existing routes retain their previous grounded behavior.

## Garage

The table lists normal top speeds for undamaged vehicles, capped at **250 km/h**. Nitro temporarily adds **70 km/h**, reaching up to **320 km/h**. Damage lowers both limits.

| Car | Type / drivetrain | Top speed | Handling |
| --- | --- | --- | --- |
| SWIFT F2 | Hatchback / FWD | 220 km/h | Light, high grip, mild oversteer |
| FALCON R4 | Rally car / AWD | 250 km/h | Balanced acceleration, steering, and drift |
| COMET RS | Coupe / RWD | 250 km/h | Strong acceleration and larger slides; countersteer early |
| NOMAD T4 | Off-road pickup / AWD | 210 km/h | Durable, less off-road drag, slower steering |
| APEX R600 | Sport motorcycle / RWD | 250 km/h | Fast acceleration, tucked rider, responsive cornering |
| TRAIL X450 | Enduro motorcycle / RWD | 215 km/h | High bars, off-road tyres, less shoulder drag and damage |

Three player liveries are available: Sandstone White, Forest Green, and Racing Red. Your stage, car, livery, and other preferences are saved locally when browser storage is available.

## Motorcycle mode

Select **摩托车模式** (Motorcycle mode) in the main menu or garage, choose **APEX R600** or **TRAIL X450**, then start a stage. **汽车模式** switches back to cars. Changes are available before a race; vehicle choice and livery persist, and each vehicle has separate records.

Use `W / ↑` for throttle, `S / ↓` to brake, `A / D` to steer and lean, and `Space` for rear-wheel braking. Slide while steering to charge nitro, then release the rear brake and hold `Shift` to boost. The sport bike accelerates faster; the enduro bike loses less speed and condition on the shoulder. Bikes slide less than cars, with riders leaning into turns and steady chase / low cameras. All regular stages support motorcycles in classic and item races, with five motorcycle opponents.

## Racing and drifting

All six cars start after the same countdown. AI drivers adjust their speed for corners and grip, look for a free neighboring lane, and slow down behind traffic. Professional mode makes their pace faster.

The HUD shows your position and the distance to each opponent. Final position follows the actual finish order. Opponents still on the course are listed with their progress at the moment you finish. Recovery penalties affect your personal time-trial score, not the order in which cars cross the line. Pausing freezes every car; restarting returns the full field to the grid.

You must cross all **five timing gates in order**, moving forward within the road corridor. Cutting past a checkpoint does not count; recovery places you before a missed gate.

Steering changes the player's heading in world space. Releasing the steering key smoothly centers the steering input while keeping the new heading. The camera follows the road ahead independently, so the car can visibly turn and slide within the frame.

To drift, build some speed, steer into the turn, and hold `Space`. A longer hold progressively increases the slide angle. Countersteering reduces the angle; releasing `Space` lets grip return, with a longer recovery after a long hold. While the tyres are grounded, the handbrake continuously slows the car even with the throttle pressed. Holding it indefinitely brings the car to a stop.

Nitro starts empty each race. Moving handbrake slides charge the tank, with stronger slides earning more; straight handbraking and stationary wheels do not. Hold either `Shift` key or the button under the speedometer to boost, and release to save charge. A full tank lasts about four seconds. Nitro adds 40 m/s² of acceleration and raises the top-speed limit by 70 km/h for an undamaged vehicle. Releasing or exhausting nitro smoothly sheds the excess speed. Animated blue-white and orange flames emerge from the actual exhaust outlets. A wider camera view, subtle horizontal compression and edge speed streaks emphasize the sprint without distorting the HUD. The screen effects respect reduced-motion preferences. Braking or holding the handbrake suspends boost without consuming charge. Pause and recovery preserve the tank; restarting clears it.

Pace-note grades **2–3 indicate tighter corners**; **4–5 indicate faster corners**. Going off the road slows the car and damages it. Brake before the corner, then accelerate as you straighten out.

## Item Rush

Select **道具赛** (Item Rush) from the main menu, then **开始道具赛**. Every existing indoor and outdoor race stage gets rows of three blue question-mark boxes and cyan boost pads. Cross a box to draw one item, revealed after 0.8 seconds; press `E` or click the left-side item slot to use it. Full slots retain their item, boxes respawn after 2.5 seconds, and pads automatically provide a 1.4-second sprint.

| Item | Effect |
| --- | --- |
| Turbo sprint | Three seconds of extra acceleration within the vehicle speed limit; brakes and handbrake take priority |
| Banana trap | Drops behind the vehicle and briefly slows the next driver who hits it |
| Straight disc | Travels forward along the current lane and hits a rival |
| Homing disc | Tracks the nearest unfinished rival within 180 meters ahead, following lane changes; retained if no target is available |
| Energy shield | Lasts up to seven seconds and absorbs one disc, banana, or lightning hit |
| Lightning pulse | Slows other unfinished drivers within 180 meters ahead or behind |

AI drivers collect and use the same items. Trailing drivers have better odds of sprint, homing, and lightning items. Hits grant brief protection against consecutive attacks and do not damage vehicles or add penalties. Pause freezes item timers; recovery clears stun and item sprint; restart clears inventories, projectiles, and traps. Item Rush records are separate from classic records, including legacy times.

Props share instanced geometry, distant props are culled, and projectile/trap pools have fixed limits and expiry. No extra per-item lights or external assets are required.

## Longboard downhill

Select **长板速降**, choose a route with **选择地图** and a board with **选择长板**, then select **开始速降**. Six dedicated asphalt courses range from the 2.04 km / 150 m Jade Forest beginner descent to the 4.03 km / 480 m Mist Ridge endurance route. Ridgeline Descent, Sunset Foothills, Amber Switchbacks and Red Cliff Drop add different corner layouts, road widths, grip and scenery. Route cards include a map and elevation profile.

Choose from **RIDGELINE DH**, **BREEZE CR42**, **NEEDLE DH36**, **SWITCHBLADE FR**, **CARBON AERO** and **ATLAS ENDURANCE**. Deck silhouettes, dimensions, wheelbases and wheel colors vary, as do actual steering, grip, pushing, braking, slide braking and durability. Race five AI riders on mixed boards, with full-face helmets, slide gloves and protective gear. Downhill route and equipment preferences are saved separately from car/motorcycle selections; records are separated by course, board, difficulty and auto-push setting.

- **W / Up:** push off at low speed (below approximately 32 km/h).
- **A / D or Left / Right:** steer by shifting weight.
- **S / Down:** footbrake; hold to stop.
- **Space:** hands-down heelside/toeside slides, with crouch, glove contact and recovery.
- **X:** standing speed checks, with arms extended and lighter braking.
- **Double-tap or hold Space, Q or the 180° Switch button:** a 180-degree slide into or out of switch stance (above approximately 11 km/h).
- **Shift or the tuck button:** tuck to reduce aerodynamic drag; release to stand up.

Double-tapping Space rotates rider and board 180 degrees while preserving downhill travel. Holding Space for 0.6 seconds begins with a hands-down slide, then automatically transitions into the 180-degree Switch on the opposite side; release before another switch can begin. Switch swaps the physical leading foot, pushing foot and footbraking foot while steering inputs retain their direction. Animations include preload, shoulder counter-rotation, a planted slide glove and progressive recovery. Pausing freezes the action; recovery keeps the completed stance; restarting restores Regular. See [movement references and mappings](docs/longboard-actions.md).

Gravity accelerates the board downhill. Braking takes priority over pushing and tucking, and leaving the asphalt slows the rider and reduces condition. Board speed limits range from 92 to 120 km/h. This discipline has no nitro or items; the auto-throttle setting becomes automatic low-speed pushing. The rider animates pushing, tucking, leaning and braking, with a closer follow camera and wind/rolling audio.

Five ordered checkpoints, finish rankings, medals, pause, restart and **R** recovery (+5 seconds) remain available. The HUD shows stance, slope and descended height, and downhill records are stored separately. Switching back to Classic or Item Rush restores the previously selected car or motorcycle and stage.

## Settings and saves

| Setting | Behavior |
| --- | --- |
| Standard / lightweight graphics | Lightweight mode reduces vegetation and pixel density and targets 30 fps; standard mode targets 60 fps |
| Club / professional handling | Professional mode reduces grip and increases opponent pace; applies to the next start |
| Automatic throttle | Applies to the next start; braking and handbraking still take priority |
| Sound / co-driver voice | Synthesized engine and gravel audio; Chinese pace-note speech depends on browser voice availability |
| Camera | Road-facing chase or low view |

Best times are stored separately for each **race mode × stage × vehicle × handling difficulty × throttle mode**. Previous Pine Ridge / FALCON R4 records remain readable. Settings and records use browser-local storage; there is no account or cloud synchronization.

The game pauses when its tab loses focus. Menus and paused scenes render on demand. Cars and cameras share interpolated poses; vegetation and rival wheels use instancing, and distant opponents are culled to limit rendering work.

## Development

```text
src/
├── content/          Stage and vehicle definitions
├── simulation/       Track, player handling, AI opponents, timing, standings
├── render/           Three.js scenery, cars, cameras, dust, tyre marks
├── ui/               Chinese menus, HUD, stage selection, results
├── presentation.ts   Fixed-step simulation, pose interpolation, frame pacing
├── main.ts           Application lifecycle and integration
├── input.ts          Keyboard and touch input
├── audio.ts          Engine audio and co-driver speech
├── settings.ts       Preferences and local records
└── style.css         Interface styling and responsive layouts
tests/                Node.js simulation and presentation checks
docs/screenshots/     Shared screenshot assets and capture guide
```

Useful commands:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server on port 5175 |
| `npm run typecheck` | Check TypeScript without emitting files |
| `npm test` | Run the Node.js test suite |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the production build locally |

The tests cover manual steering, sustained handbraking, speed limits, checkpoints, ranking, AI traffic, pause/restart, saves, camera stability, interpolation, and resource disposal. They run in Node.js without opening a browser or creating a WebGL context.

**Project workflow:** do not launch the game for verification. Use the Node.js checks and production build.

## Scope and troubleshooting

This is an arcade rally game with AI opponents, not online multiplayer. AI drivers avoid traffic, and indoor outer walls contain the player. Vehicle collision impulses, full tyre physics, suspension simulation, and collisions with internal scenery or course barriers are not implemented.

If the page reports that the graphics engine is unavailable, check WebGL 2 support and hardware acceleration in your browser. On a slower device, choose lightweight graphics and keep only one game tab open. Browser speech availability varies by platform.
