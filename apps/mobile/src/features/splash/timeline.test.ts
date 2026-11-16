import { cardPose, frameAt, HEAD, LOGO_SCALE, REVEAL_END_RADIUS, T } from './timeline';

describe('splash timeline', () => {
  it('starts with the ring fading in and nothing else on stage', () => {
    const frame = frameAt(0);
    expect(frame.ring.visible).toBe(true);
    expect(frame.ring.cardOpacity).toBe(0);
    expect(frame.ball.visible).toBe(false);
    expect(frame.tiles.R.opacity).toBe(0);
    expect(frame.revealRadius).toBe(0);
    expect(frameAt(1).ring.cardOpacity).toBe(1);
  });

  it('collapses the ring into a ball at the centre', () => {
    const frame = frameAt(T.col);
    expect(frame.ring.visible).toBe(false);
    expect(frame.ball).toMatchObject({
      visible: true,
      x: 195,
      y: 422,
      grey: 0,
    });
    expect(frame.ball.diameter).toBeCloseTo(HEAD.radius * 2);
  });

  it('bounces the ball above its landing line and lands it on the head of the R', () => {
    expect(frameAt(T.col + 0.2).ball.y).toBeLessThan(422);
    const landed = frameAt(T.bounce);
    expect(landed.ball.x).toBeCloseTo(HEAD.x);
    expect(landed.ball.y).toBeCloseTo(HEAD.y);
  });

  it('grows the R around the ball, then brings in A and C', () => {
    const early = frameAt(T.bounce + 0.2);
    expect(early.tiles.R.opacity).toBe(1);
    expect(early.tiles.R.scale).toBeLessThan(LOGO_SCALE);
    expect(early.tiles.A.opacity).toBe(0);

    const settled = frameAt(T.hold);
    for (const tile of [settled.tiles.A, settled.tiles.R, settled.tiles.C]) {
      expect(tile.opacity).toBe(1);
      expect(tile.scale).toBeCloseTo(LOGO_SCALE);
    }
    expect(settled.tiles.A.x).toBeLessThan(settled.tiles.R.x);
    expect(settled.tiles.R.x).toBeLessThan(settled.tiles.C.x);
    // The R's own head hole has taken over from the ball.
    expect(settled.ball.visible).toBe(false);
  });

  it('opens the reveal from the head of the R until it covers the stage', () => {
    expect(frameAt(T.hold - 0.01).revealRadius).toBe(0);
    expect(frameAt(T.hold).revealRadius).toBeCloseTo(HEAD.radius);
    expect(frameAt(T.zoom).revealRadius).toBe(REVEAL_END_RADIUS);
    expect(frameAt(99).revealRadius).toBe(REVEAL_END_RADIUS);
  });
});

describe('ring card positions', () => {
  it('puts the front card nearest and largest, and the back card farthest and facing away', () => {
    const front = cardPose(0, 0, 142);
    const back = cardPose(5, 0, 142);
    expect(front.showsBack).toBe(false);
    expect(back.showsBack).toBe(true);
    expect(front.depth).toBeGreaterThan(back.depth);
    expect(front.depthScale).toBeGreaterThan(1);
    expect(back.depthScale).toBeLessThan(1);
  });

  it('gathers every card at the centre when the ring has collapsed', () => {
    for (let index = 0; index < 10; index += 1) {
      const pose = cardPose(index, 300, 0);
      expect(pose.x).toBeCloseTo(0);
      expect(pose.y).toBeCloseTo(0);
    }
  });
});
