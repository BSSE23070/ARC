/**
 * The ARC splash animation as pure maths: given a time, where is everything?
 * Ported from the "fin" prototype's SplashScreen (Figma, final screens page),
 * which was written for the web. Designed on a 390 × 844 stage, 6.8 seconds:
 *
 *   0.0–2.0  a ring of event cards spins
 *   2.0–2.7  the ring collapses into one ink ball
 *   2.7–3.7  the ball bounces into the R's head position
 *   3.7–5.2  the R grows around the ball (its head); A and C glide in
 *   5.2–6.2  the R's head opens to reveal the app
 */
export const T = {
  spin: 2.0,
  col: 2.7,
  bounce: 3.7,
  hold: 5.2,
  zoom: 6.2,
  end: 6.8,
} as const;
export const STAGE = {
  width: 390,
  height: 844,
  centerX: 195,
  centerY: 422,
} as const;

export type CardColour = 'signal' | 'meet' | 'spark' | 'volt' | 'ink';
export const CARDS: { name: string; icon: string; colour: CardColour }[] = [
  { name: 'Pottery night', icon: 'pottery', colour: 'signal' },
  { name: 'Padel doubles', icon: 'padel', colour: 'volt' },
  { name: 'Music night', icon: 'mic', colour: 'meet' },
  { name: 'Supper club', icon: 'food', colour: 'spark' },
  { name: 'Run club', icon: 'run', colour: 'ink' },
  { name: 'Board games', icon: 'dice', colour: 'signal' },
  { name: 'Sunrise yoga', icon: 'yoga', colour: 'spark' },
  { name: 'Life drawing', icon: 'art', colour: 'meet' },
  { name: 'Futsal', icon: 'ball', colour: 'volt' },
  { name: 'Book swap', icon: 'books', colour: 'ink' },
];

const RING_RADIUS = 142;
const PERSPECTIVE = 1000;
const RING_TILT_X = -22; // degrees, as in the prototype's rotateX
const RING_TILT_Z = -15; // degrees, as in the prototype's rotateZ

/** The logo is drawn 575 units wide and shown 236 wide, centred on the stage. */
export const LOGO_SCALE = 236 / 575;
const LOGO_X = (STAGE.width - 236) / 2;
const LOGO_Y = STAGE.centerY - (177 * LOGO_SCALE) / 2;
const TILE_X = { A: 0, R: 195, C: 392 } as const;
/** The R's head: where the ball lands and the reveal opens from. */
export const HEAD = {
  x: LOGO_X + (TILE_X.R + 90) * LOGO_SCALE,
  y: LOGO_Y + 58 * LOGO_SCALE,
  radius: 45 * LOGO_SCALE,
} as const;
/** Large enough to uncover the whole stage from the head. */
export const REVEAL_END_RADIUS = 980;

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const segment = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const easeIn = (p: number) => p * p * p;
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const overshoot = (p: number, s = 1.9) => 1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2);
const radians = (degrees: number) => (degrees * Math.PI) / 180;

export type TilePose = { x: number; y: number; scale: number; opacity: number };
export type Frame = {
  ring: {
    visible: boolean;
    spin: number;
    radius: number;
    cardScale: number;
    cardOpacity: number;
  };
  ball: {
    visible: boolean;
    x: number;
    y: number;
    diameter: number;
    stretchX: number;
    stretchY: number;
    grey: number;
  };
  tiles: { A: TilePose; R: TilePose; C: TilePose };
  /** Radius of the circle through which the app shows; 0 while hidden. */
  revealRadius: number;
};

export function frameAt(time: number): Frame {
  const t = clamp(time, 0, T.end);
  const intro = easeOut(segment(t, 0, 0.55));
  const collapse = easeIn(segment(t, T.spin, T.col));

  const ring = {
    visible: collapse < 1,
    spin: t * 42 + collapse * 260,
    radius: RING_RADIUS * (1 - collapse) * lerp(0.9, 1, intro),
    cardScale: lerp(0.85, 1, intro) * (1 - 0.8 * collapse),
    cardOpacity: intro * (1 - clamp((collapse - 0.55) / 0.45)),
  };

  let x: number = STAGE.centerX;
  let y: number = STAGE.centerY;
  let size = 0;
  let stretch = 0;
  if (t < T.col) {
    size = overshoot(clamp((collapse - 0.45) / 0.55), 1.4);
  } else if (t < T.bounce) {
    // Three bounces, each lower than the last, drifting across to the R's head.
    const u = segment(t, T.col, T.bounce);
    const bounds: [number, number, number, number] = [0, 0.42, 0.76, 1];
    const peaks: [number, number, number] = [118, 52, 16];
    const k: 0 | 1 | 2 = u < bounds[1] ? 0 : u < bounds[2] ? 1 : 2;
    const v = (u - bounds[k]) / (bounds[(k + 1) as 1 | 2 | 3] - bounds[k]);
    size = 1;
    x = lerp(STAGE.centerX, HEAD.x, easeInOut(u));
    y = lerp(k === 0 ? STAGE.centerY : HEAD.y, HEAD.y, v) - 4 * peaks[k] * v * (1 - v);
    // Squash briefly on each landing.
    const nearest = Math.min(...bounds.slice(1).map((landing) => Math.abs(u - landing)));
    stretch = nearest < 0.05 ? (1 - nearest / 0.05) * (0.28 - 0.07 * k) : 0;
  } else {
    x = HEAD.x;
    y = HEAD.y;
    size = 1;
  }

  const growR = segment(t, T.bounce, T.bounce + 0.55);
  const slideA = easeOut(segment(t, T.bounce + 0.3, T.bounce + 0.95));
  const slideC = easeOut(segment(t, T.bounce + 0.4, T.bounce + 1.05));
  const r = easeOut(growR);
  const restX = LOGO_X + TILE_X.R * LOGO_SCALE;

  return {
    ring,
    ball: {
      // Once the R has grown, its own head hole takes over from the ball.
      visible: size > 0 && (t < T.bounce || growR < 1),
      x,
      y,
      diameter: HEAD.radius * 2 * size,
      stretchX: 1 + stretch,
      stretchY: 1 - stretch,
      // Ink while it bounces, fading to paper as it becomes the R's head.
      grey: t >= T.bounce ? Math.round(255 * clamp(growR / 0.35)) : 0,
    },
    tiles: {
      A: {
        x: LOGO_X + TILE_X.A * LOGO_SCALE + 22 * (1 - slideA),
        y: LOGO_Y,
        scale: LOGO_SCALE,
        opacity: slideA,
      },
      R: {
        x: restX + (1 - r) * (HEAD.x - restX),
        y: LOGO_Y + (1 - r) * (HEAD.y - LOGO_Y),
        scale: LOGO_SCALE * r,
        opacity: growR <= 0 ? 0 : 1,
      },
      C: {
        x: LOGO_X + TILE_X.C * LOGO_SCALE - 22 * (1 - slideC),
        y: LOGO_Y,
        scale: LOGO_SCALE,
        opacity: slideC,
      },
    },
    revealRadius: t < T.hold ? 0 : lerp(HEAD.radius, REVEAL_END_RADIUS, easeInOut(segment(t, T.hold, T.zoom))),
  };
}

export type CardPose = {
  /** Offset of the card's centre from the stage centre. */
  x: number;
  y: number;
  /** Size change from perspective: nearer cards are larger. */
  depthScale: number;
  /** How far the card is turned about its vertical axis, in degrees. */
  turn: number;
  /** True when the card faces away from the viewer. */
  showsBack: boolean;
  /** Larger is nearer; used to stack the cards. */
  depth: number;
};

/**
 * Where card `index` sits on the tilted ring. React Native has no translateZ,
 * so the 3D position is worked out here and projected onto the screen.
 */
export function cardPose(index: number, spin: number, radius: number): CardPose {
  const angle = radians(index * (360 / CARDS.length) + spin);
  const tiltX = radians(RING_TILT_X);
  const tiltZ = radians(RING_TILT_Z);
  // Around the ring, then tilt the ring about X, then about Z.
  const ringX = radius * Math.sin(angle);
  const ringZ = radius * Math.cos(angle);
  const tiltedY = -ringZ * Math.sin(tiltX);
  const depth = ringZ * Math.cos(tiltX);
  const x = ringX * Math.cos(tiltZ) - tiltedY * Math.sin(tiltZ);
  const y = ringX * Math.sin(tiltZ) + tiltedY * Math.cos(tiltZ);
  const depthScale = PERSPECTIVE / (PERSPECTIVE - depth);
  const turn = ((angle * 180) / Math.PI) % 360;
  return {
    x: x * depthScale,
    y: y * depthScale,
    depthScale,
    turn,
    showsBack: Math.cos(angle) < 0,
    depth,
  };
}
