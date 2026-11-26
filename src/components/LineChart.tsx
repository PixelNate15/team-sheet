import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';

import { font, useTheme } from '@/theme';

import { Text } from './Text';

export interface ChartPoint {
  label: string;
  value: number | null;
}

/**
 * Small themed line chart drawn with react-native-svg. Replaces the
 * matplotlib graphs in Reusable_Code/draw_graph.py. Gaps (null values)
 * break the line instead of crashing (the original plotted None).
 */
export function LineChart({
  points,
  height = 150,
  min,
  max,
  decimals = 1,
}: {
  points: ChartPoint[];
  height?: number;
  min?: number;
  max?: number;
  decimals?: number;
}) {
  const { c } = useTheme();
  const [width, setWidth] = useState(0);
  // The point whose value is shown: the newest by default, or the one tapped.
  const [picked, setPicked] = useState<number | null>(null);
  const values = points.map((p) => p.value).filter((v): v is number => v != null);

  if (values.length === 0) {
    return (
      <View style={{ height, alignItems: 'center', justifyContent: 'center' }}>
        <Text variant="small" color="textFaint">
          Not enough data yet
        </Text>
      </View>
    );
  }

  const lo = min ?? Math.min(...values);
  const hi = max ?? Math.max(...values);
  const span = hi - lo || 1;
  const padX = 8;
  const padTop = 18;
  const padBottom = 22;
  const innerW = Math.max(width - padX * 2, 1);
  const innerH = height - padTop - padBottom;
  const step = points.length > 1 ? innerW / (points.length - 1) : 0;

  const xy = points.map((p, i) => ({
    x: padX + i * step,
    y: p.value == null ? null : padTop + innerH - ((p.value - lo) / span) * innerH,
  }));

  // Build path segments, breaking at gaps.
  let line = '';
  let area = '';
  let segStart: number | null = null;
  xy.forEach((pt, i) => {
    if (pt.y == null) {
      if (segStart != null) area += ` L${xy[i - 1].x},${padTop + innerH} L${xy[segStart].x},${padTop + innerH} Z`;
      segStart = null;
      return;
    }
    if (segStart == null) {
      line += ` M${pt.x},${pt.y}`;
      area += ` M${pt.x},${pt.y}`;
      segStart = i;
    } else {
      line += ` L${pt.x},${pt.y}`;
      area += ` L${pt.x},${pt.y}`;
    }
  });
  if (segStart != null) {
    const lastX = xy[xy.length - 1].x;
    area += ` L${lastX},${padTop + innerH} L${xy[segStart].x},${padTop + innerH} Z`;
  }

  const lastIdx = [...xy].reverse().findIndex((p) => p.y != null);
  const newest = lastIdx >= 0 ? xy.length - 1 - lastIdx : null;
  const sel = picked != null && points[picked]?.value != null ? picked : newest;
  const selPt = sel != null ? xy[sel] : null;
  const selValue = sel != null ? points[sel].value : null;
  const labelEvery = Math.ceil(points.length / 5);

  // Nearest point (with a value) to where the finger is.
  const pickAt = (x: number) => {
    let best: number | null = null;
    xy.forEach((pt, i) => {
      if (pt.y != null && (best == null || Math.abs(pt.x - x) < Math.abs(xy[best].x - x))) best = i;
    });
    if (best != null) setPicked(best);
  };

  const bubbleText = selValue != null && sel != null ? `${selValue.toFixed(decimals)} · ${points[sel].label}` : '';
  const bubbleW = bubbleText.length * 6.6 + 14;
  const bubbleX = selPt ? Math.min(Math.max(selPt.x - bubbleW / 2, 0), width - bubbleW) : 0;
  const bubbleY = selPt?.y != null ? (selPt.y - 30 < 0 ? selPt.y + 10 : selPt.y - 30) : 0;

  return (
    <View
      style={{ height }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`Chart. ${bubbleText}`}
      accessibilityHint="Swipe up or down to move between points"
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        const dir = e.nativeEvent.actionName === 'increment' ? 1 : -1;
        for (let i = (sel ?? 0) + dir; i >= 0 && i < points.length; i += dir) {
          if (points[i].value != null) {
            setPicked(i);
            break;
          }
        }
      }}
      // Tap or drag along the chart to read any point; a vertical scroll can still take over.
      onStartShouldSetResponder={() => true}
      onResponderGrant={(e) => pickAt(e.nativeEvent.locationX)}
      onResponderMove={(e) => pickAt(e.nativeEvent.locationX)}
      onResponderTerminationRequest={() => true}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={c.accent} stopOpacity={0.28} />
              <Stop offset="1" stopColor={c.accent} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {[0, 0.5, 1].map((t) => (
            <Line
              key={t}
              x1={padX}
              x2={width - padX}
              y1={padTop + innerH * t}
              y2={padTop + innerH * t}
              stroke={c.border}
              strokeDasharray="4 6"
              strokeWidth={1}
            />
          ))}
          <Path d={area} fill="url(#fill)" />
          <Path d={line} stroke={c.accent} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          {selPt ? (
            <Line x1={selPt.x} x2={selPt.x} y1={padTop} y2={padTop + innerH} stroke={c.accent} strokeOpacity={0.35} strokeWidth={1} />
          ) : null}
          {xy.map((pt, i) =>
            pt.y == null ? null : (
              <Circle
                key={i}
                cx={pt.x}
                cy={pt.y}
                r={i === sel ? 5 : 3}
                fill={i === sel ? c.accent : c.surface}
                stroke={c.accent}
                strokeWidth={2}
              />
            ),
          )}
          {selPt && bubbleText ? (
            <>
              <Rect x={bubbleX} y={bubbleY} width={bubbleW} height={20} rx={10} fill={c.text} />
              <SvgText x={bubbleX + bubbleW / 2} y={bubbleY + 14} fill={c.background} fontSize={11} fontFamily={font.bold} textAnchor="middle">
                {bubbleText}
              </SvgText>
            </>
          ) : null}
          {points.map((p, i) =>
            i % labelEvery === 0 || i === points.length - 1 ? (
              <SvgText
                key={`l${i}`}
                x={xy[i].x}
                y={height - 4}
                fill={c.textFaint}
                fontSize={10}
                fontFamily={font.body}
                textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}>
                {p.label}
              </SvgText>
            ) : null,
          )}
        </Svg>
      ) : null}
    </View>
  );
}
