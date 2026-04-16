# Rhythm Ball Game — BeatDrop Rhythm Mode

## 1. Overview

Transform BeatDrop into a rhythm game using **Between Worlds** (Roger Subirana, 324s, 147.7 BPM).

**Core loop:** The ball bounces on fixed BPM beats. Track blocks appear on beats. The player moves the ball left/right to land on the block whose color matches the ball's current color. Ball speed and bounce intensity dynamically follow the music's energy envelope — fast during climaxes, slow during quiet sections.

---

## 2. Music Analysis

**Source:** `/music/BetweenWorlds.mp3`
**BPM:** 147.7 (fixed throughout)
**Beat period:** 0.406s
**Total beats:** ~712

### Energy Profile (5-second windows)

| Time   | Phase        | Energy | Behavior                    |
|--------|--------------|--------|-----------------------------|
| 0-25s  | Intro        | 0.005  | Very sparse                  |
| 25-50s | Build-up     | 0.015  | Gradually denser             |
| 50-120s| First climax | 0.055  | Dense blocks                |
| 120-260s| Main climax | 0.100+ | Maximum density, fastest speed |
| 260-300s| Outro       | 0.035  | Rapid decay, sparse         |

### Beat Detection
Use `librosa.beat.beat_track()` to extract exact beat times. These become the canonical "note times" — one block per detected beat.

---

## 3. Difficulty Curve

Difficulty = **beat density × energy multiplier**

| Phase        | Beats per 8s | Block Type           | Speed Mult |
|--------------|-------------|----------------------|------------|
| Intro        | 2-4         | Straight             | 0.5x       |
| Build-up     | 4-6         | Straight, Double     | 0.7x       |
| First climax | 6-8         | Straight, Double     | 0.9x       |
| Main climax  | 8-12        | Straight, Double, Triple | 1.2x   |
| Outro        | 2-4         | Straight             | 0.5x       |

Density note: climax is ~2× intro density — challenging but never overwhelming. Main climax maxes at ~1 beat per 0.7s.

Energy multiplier maps energy 0.005→0.26 linearly to speed 0.5→1.2.

---

## 4. Track Generation

### Pre-processing (build time)
```
For each beat time t:
  energy = compute_energy_at(t)
  phase = get_phase(t)  // intro/buildup/climax/outro
  difficulty = energy * BEATS_PER_WINDOW[phase]
  block_type = choose_block_type(difficulty)
  color = assign_color(block_type)
  → emit TrackNote(t, block_type, color)
```

### Per-Phase Block Selection
- **Intro / Outro:** Straight tracks only
- **Build-up:** 70% Straight, 30% Double
- **First climax:** 60% Straight, 30% Double, 10% Triple
- **Main climax:** 40% Straight, 40% Double, 20% Triple (max triple rate to keep readable)

Color assignment: Pink/Yellow/Blue, cycling or pseudo-random ensuring no impossible sequences.

---

## 5. Gameplay Mechanics

### Ball Bounce Cycle
- Fixed period: 0.406s (one beat at 147.7 BPM)
- Arc: sin curve, peak at half-period
- Ball speed multiplier: `0.5 + energy * 2.8` (capped at 1.2)
- Segment scroll speed: `sharedVelocity * speed_mult`

### Natural Motion
- **Smooth speed transitions:** Speed multiplier lerps toward target at rate 3.0/s — never instant jumps
- **Squash & stretch:** Ball scales Y on landing (squash) proportional to beat energy (max 0.8× Y-scale); stretches on ascent (max 1.2×)
- **Elastic timing window:** Landing within ±50ms of beat is "Perfect"; within ±120ms is "Great"
- **Inertia:** Ball X position has slight momentum — doesn't stop instantly when mouse stops
- Ball Z stays at 0 (track moves toward ball)
- On each beat, find segment whose Z is nearest to 0
- If ball X within segmentHalfW and ball Y ≤ ground → trigger landing
- Color match check: `ballColor == blockColor` → survive, else game over

### Scoring
- Survive a beat: +1 combo
- Perfect timing (within 50ms of beat): "PERFECT"
- Good timing (within 150ms): "GREAT"
- Miss: game over (unless continue available)

### Ball Color Transitions
- Ball adopts the color of the block it just landed on
- On Straight/SpeedBoost: ball takes segment's color
- On Double/Triple: ball takes the matched block's color

### Failed Landing
- Color mismatch → ball shatters
- Player can continue (limited continues)
- After continue countdown, ball respawns with pre-shatter color

---

## 6. Components

### New
- `AudioAnalyzer.js` — Pre-processes MP3, emits beat times + energy envelope
- `RhythmTrackGenerator.js` — Converts beat times to `TrackNote[]`
- `GameRhythmMode.js` — Subclass/sibling of `Game`, manages rhythm state

### Modified
- `Game.js` — Replace random track generation with pre-computed `TrackNote[]`
- `TrackManager.js` — Add `generateFromNotes(notes)` method
- `TrackSegment.js` — Add `fromNote(note, zPosition)` factory

### Removed (rhythm mode)
- Random track type selection
- Level-based jumps-to-win
- Gravity/bounce physics for rhythm timing (replaced by sin arc)
- Collision cooldown skipping first landing

---

## 7. Data Flow

```
BetweenWorlds.mp3
      ↓ librosa
beat_times[] + energy_envelope[]
      ↓ RhythmTrackGenerator
TrackNote[]  (t, type, color, energy)
      ↓
TrackManager.generateFromNotes(notes)
      ↓ per-segment creation at appropriate z positions
TrackSegment meshes + ripple shaders
      ↓
Game.update() — each beat:
  ball.arc_position(beat_fraction)
  segment.z += effectiveVelocity * energy_mult * dt
  if ball.y ≤ ground && beat_landing:
    handleLanding(segment)
```

---

## 8. Technical Approach

### Audio Analysis (pre-processing, runs once at load)
- Use `librosa.beat.beat_track()` for beat times
- Use `librosa.feature.rms()` for energy envelope
- Compute difficulty per beat window (e.g., 8-second windows)
- Serialize `TrackNote[]` to JSON, cache in `localStorage` or embed

### Ball Animation
Replace gravity-based physics for bounce with:
```javascript
// Per-beat arc, fixed 147.7 BPM period
const BEAT_PERIOD = 60 / 147.7; // ≈ 0.406s
const bouncePhase = (time % BEAT_PERIOD) / BEAT_PERIOD; // 0→1
const bounceY = Math.sin(bouncePhase * Math.PI) * BOUNCE_HEIGHT;
```
No gravity for bounce — gravity only affects landing squash.

### Timing Precision
- Use `performance.now()` for absolute timing
- On each frame, compute `currentBeat = floor(elapsedTime / BEAT_PERIOD)`
- Landing check fires when `currentBeat` increments

### Track Scheduling
- Pre-generate all `TrackNote` at init
- Assign each note a Z offset = `beat_index × SEGMENT_LENGTH`
- Scroll: each segment's Z decreases by `velocity × energy_mult × dt`
- When segment passes Z=0, trigger collision for its note

---

## 9. Out of Scope (Future)

- Multiple songs
- Custom beatmaps
- Note hit windows UI (timing feedback bars)
- Score saving
- Adjustable BPM
