import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';

import { useTheme } from '@/theme';

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
  const last = lastIdx >= 0 ? xy[xy.length - 1 - lastIdx] : null;
  const lastValue = lastIdx >= 0 ? points[points.length - 1 - lastIdx].value : null;
  const labelEvery = Math.ceil(points.length / 5);

  return (
    <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
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
          {xy.map((pt, i) =>
            pt.y == null ? null : <Circle key={i} cx={pt.x} cy={pt.y} r={3} fill={c.surface} stroke={c.accent} strokeWidth={2} />,
          )}
          {last && lastValue != null ? (
            <SvgText
              x={Math.min(last.x, width - padX - 4)}
              y={Math.max((last.y ?? 0) - 8, 10)}
              fill={c.text}
              fontSize={12}
              fontWeight="700"
              textAnchor="end">
              {lastValue.toFixed(decimals)}
            </SvgText>
          ) : null}
          {points.map((p, i) =>
            i % labelEvery === 0 || i === points.length - 1 ? (
              <SvgText
                key={`l${i}`}
                x={xy[i].x}
                y={height - 4}
                fill={c.textFaint}
                fontSize={10}
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
