import { memo, useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Path, Rect, SvgXml } from 'react-native-svg';

import { colors } from '@arc/tokens';
import { Text } from '@arc/ui';

import { strings } from '@/i18n';

import { CARDS, cardPose, frameAt, HEAD, STAGE, T, type CardColour, type TilePose } from './timeline';

const palette = colors.primitive;
/** Text and icon colour on each card colour. */
const ON: Record<CardColour, string> = {
  signal: palette.ink,
  volt: palette.ink,
  spark: palette.ink,
  meet: palette.paper,
  ink: palette.volt,
};
const CARD = { width: 84, height: 66 };

// Line icons from the prototype (64 × 64 viewBox).
const ICONS: Record<string, string> = {
  pottery:
    '<path d="M24 12h16M26 12v7c-8 4-12 11-11 20 1 10 8 15 17 15s16-5 17-15c1-9-3-16-11-20v-7"/><path d="M17 34h30"/>',
  padel:
    '<ellipse cx="26" cy="24" rx="14" ry="17"/><path d="M34 37l14 16M23 16v1M29 22v1M23 28v1M18 22v1"/><circle cx="48" cy="18" r="6"/>',
  mic: '<rect x="24" y="8" width="16" height="28" rx="8"/><path d="M16 30c0 9 7 16 16 16s16-7 16-16M32 46v10M24 56h16"/>',
  food: '<path d="M10 32h44c0 13-10 22-22 22S10 45 10 32z"/><path d="M24 24c-3-4 3-6 0-11M32 24c-3-4 3-6 0-11M40 24c-3-4 3-6 0-11"/>',
  run: '<path d="M10 40c0-6 4-10 10-10h8l6-10 8 4-4 8h8c6 0 10 4 10 8v6H10z"/><path d="M10 46h44"/>',
  dice: '<rect x="12" y="12" width="40" height="40" rx="8"/><circle cx="23" cy="23" r="1.5"/><circle cx="41" cy="41" r="1.5"/><circle cx="32" cy="32" r="1.5"/>',
  yoga: '<path d="M32 50c-10-6-12-18 0-30 12 12 10 24 0 30z"/><path d="M32 50c-10 0-20-6-20-16 6 0 14 4 20 16zM32 50c10 0 20-6 20-16-6 0-14 4-20 16z"/>',
  art: '<path d="M32 10c13 0 22 9 22 18 0 7-6 8-10 8-5 0-6 4-4 7 3 5-2 11-8 11-12 0-22-10-22-22S20 10 32 10z"/><circle cx="22" cy="28" r="3"/><circle cx="32" cy="20" r="3"/><circle cx="43" cy="24" r="3"/>',
  ball: '<circle cx="32" cy="32" r="20"/><path d="M32 12v40M12 32h40M18 18c8 8 8 20 0 28M46 18c-8 8-8 20 0 28"/>',
  books: '<path d="M12 14h16c3 0 4 2 4 4v34c0-3-2-4-4-4H12zM52 14H36c-3 0-4 2-4 4v34c0-3 2-4 4-4h16z"/>',
};

const iconXml = (icon: string, stroke: string) =>
  `<svg viewBox="0 0 64 64" fill="none" stroke="${stroke}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">${ICONS[icon]}</svg>`;

/** One event card. Memoised: only its position changes from frame to frame. */
const CardFace = memo(function CardFace({ name, icon, colour }: (typeof CARDS)[number]) {
  const ink = ON[colour];
  return (
    <View style={[styles.card, { backgroundColor: palette[colour] }, colour === 'ink' && styles.cardOutline]}>
      <SvgXml xml={iconXml(icon, ink)} width={26} height={26} style={styles.cardIcon} />
      <Text variant="splashCard" style={{ color: ink }} numberOfLines={2}>
        {name}
      </Text>
    </View>
  );
});

/** A logo tile: an ink square with the letter's shapes cut out in paper. */
function Tile({ id, width, pose, children }: { id: string; width: number; pose: TilePose; children: ReactNode }) {
  return (
    <G transform={`translate(${pose.x} ${pose.y}) scale(${pose.scale})`} opacity={pose.opacity}>
      <Defs>
        <ClipPath id={id}>
          <Rect width={width} height={177} rx={7} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${id})`}>
        <Rect width={width} height={177} fill={palette.ink} />
        {children}
      </G>
    </G>
  );
}

type SplashProps = {
  /** Whether to play the animation on this launch. Read once, when first shown. */
  play: boolean;
  /** The app. It is mounted from the start and uncovered by the animation. */
  children: ReactNode;
};

/**
 * The animated ARC splash, shown over the app on launch.
 * Follows the "fin" prototype's SplashScreen; the timing lives in ./timeline.
 */
export function Splash({ play, children }: SplashProps) {
  const window = useWindowDimensions();
  const [playing, setPlaying] = useState(play);
  const [time, setTime] = useState(0);

  useEffect(() => {
    if (!playing) return;
    let frameId = 0;
    let cancelled = false;
    let startedAt: number | null = null;
    const tick = (now: number) => {
      if (cancelled) return;
      startedAt ??= now;
      const elapsed = (now - startedAt) / 1000;
      if (elapsed >= T.end) return setPlaying(false);
      setTime(elapsed);
      frameId = requestAnimationFrame(tick);
    };
    // People who turn motion off in their phone settings skip the animation.
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (reduced) setPlaying(false);
      else frameId = requestAnimationFrame(tick);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    };
  }, [playing]);

  // The same two wrappers hold the app during and after the animation, so the
  // app is not remounted (and does not lose its state) when the splash ends.
  if (!playing) {
    return (
      <View style={styles.fill}>
        <View style={styles.fill}>
          <View style={styles.fill}>{children}</View>
        </View>
      </View>
    );
  }

  const frame = frameAt(time);
  // Fit the 390 × 844 stage inside the window, centred.
  const fit = Math.min(window.width / STAGE.width, window.height / STAGE.height);
  const headX = window.width / 2 + (HEAD.x - STAGE.centerX) * fit;
  const headY = window.height / 2 + (HEAD.y - STAGE.centerY) * fit;
  const reveal = frame.revealRadius * fit;
  const revealing = reveal > 0;

  return (
    <View style={[styles.fill, styles.paper]} accessibilityLabel={strings.splash.label}>
      <View
        pointerEvents="none"
        style={[
          styles.stage,
          {
            left: (window.width - STAGE.width) / 2,
            top: (window.height - STAGE.height) / 2,
            transform: [{ scale: fit }],
          },
        ]}
      >
        {frame.ring.visible
          ? CARDS.map((card, index) => {
              const pose = cardPose(index, frame.ring.spin, frame.ring.radius);
              return (
                <View
                  key={card.name}
                  style={[
                    styles.cardSlot,
                    {
                      opacity: frame.ring.cardOpacity,
                      zIndex: Math.round(pose.depth) + 1000,
                      transform: [
                        { translateX: pose.x },
                        { translateY: pose.y },
                        { perspective: 1000 },
                        { rotateZ: '-15deg' },
                        { rotateX: '-22deg' },
                        // A card facing away is turned a further half-turn so its back reads correctly.
                        {
                          rotateY: `${pose.turn + (pose.showsBack ? 180 : 0)}deg`,
                        },
                        { scale: pose.depthScale * frame.ring.cardScale },
                      ],
                    },
                  ]}
                >
                  <CardFace {...card} />
                  {pose.showsBack ? <View style={styles.cardShade} /> : null}
                </View>
              );
            })
          : null}

        <Svg width={STAGE.width} height={STAGE.height} style={styles.logo}>
          <Tile id="arc-a" width={178} pose={frame.tiles.A}>
            <Circle cx={89} cy={58} r={45} fill={palette.paper} />
            <Path d="M 39 178 A 50 50 0 0 1 139 178 Z" fill={palette.paper} />
          </Tile>
          <Tile id="arc-r" width={180} pose={frame.tiles.R}>
            <Circle cx={90} cy={58} r={45} fill={palette.paper} />
            <Path d="M 40 178 A 50 50 0 0 1 140 178 Z" fill={palette.paper} />
            <Circle cx={181} cy={116} r={23} fill={palette.paper} />
          </Tile>
          <Tile id="arc-c" width={183} pose={frame.tiles.C}>
            <Circle cx={104} cy={88} r={66} fill={palette.paper} />
            <Rect x={104} y={34} width={90} height={108} fill={palette.paper} />
          </Tile>
        </Svg>

        {frame.ball.visible ? (
          <View
            style={[
              styles.ball,
              {
                width: frame.ball.diameter,
                height: frame.ball.diameter,
                borderRadius: frame.ball.diameter / 2,
                left: frame.ball.x - frame.ball.diameter / 2,
                top: frame.ball.y - frame.ball.diameter / 2,
                backgroundColor: `rgb(${frame.ball.grey},${frame.ball.grey},${frame.ball.grey})`,
                transform: [{ scaleX: frame.ball.stretchX }, { scaleY: frame.ball.stretchY }],
              },
            ]}
          />
        ) : null}
      </View>

      {/* The app, seen through a circle that opens from the R's head. */}
      <View
        pointerEvents={revealing ? 'auto' : 'none'}
        accessibilityElementsHidden={!revealing}
        importantForAccessibility={revealing ? 'auto' : 'no-hide-descendants'}
        style={[
          styles.revealCircle,
          {
            left: headX - reveal,
            top: headY - reveal,
            width: reveal * 2,
            height: reveal * 2,
            borderRadius: reveal,
          },
        ]}
      >
        <View
          style={[
            styles.revealContent,
            {
              left: reveal - headX,
              top: reveal - headY,
              width: window.width,
              height: window.height,
            },
          ]}
        >
          {children}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  paper: { backgroundColor: palette.paper },
  stage: { position: 'absolute', width: STAGE.width, height: STAGE.height },
  cardSlot: {
    position: 'absolute',
    left: STAGE.centerX - CARD.width / 2,
    top: STAGE.centerY - CARD.height / 2,
    width: CARD.width,
    height: CARD.height,
  },
  card: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 8,
    justifyContent: 'flex-end',
  },
  cardOutline: { borderWidth: 1, borderColor: colors.border },
  cardIcon: { position: 'absolute', left: 7, top: 7 },
  cardShade: {
    ...StyleSheet.absoluteFill,
    borderRadius: 10,
    backgroundColor: palette.ink,
    opacity: 0.08,
  },
  logo: { position: 'absolute', left: 0, top: 0 },
  ball: { position: 'absolute' },
  revealCircle: { position: 'absolute', overflow: 'hidden' },
  revealContent: { position: 'absolute', backgroundColor: colors.bg },
});
