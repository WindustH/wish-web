import type { EChartsCoreOption } from 'echarts/core';
export interface PlotSeries { key: string; label: string; colorIndex?: number; points: [number, number | null][] }
export interface ChartStyle { foreground: string; muted: string; line: string; surface: string; font: string; colors: string[]; heat: string[] }
export function lineOptions(series: PlotSeries[], style: ChartStyle, locale: string, unit: string): EChartsCoreOption {
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const times = series.flatMap(item => item.points.map(point => point[0]));
  const span = times.length ? times.reduce((a,b)=>Math.max(a,b),-Infinity) - times.reduce((a,b)=>Math.min(a,b),Infinity) : 0;
  return {
    animation: false,
    textStyle: { fontFamily: style.font, color: style.foreground },
    grid: { left: 8, right: 18, top: 24, bottom: 8, containLabel: true },
    tooltip: { trigger: 'axis', confine: true, renderMode: 'richText', backgroundColor: style.surface, borderColor: style.line,
      textStyle: { color: style.foreground, fontFamily: style.font, fontSize: 12 },
      valueFormatter: (value: unknown) => value == null ? '—' : `${format.format(Number(value))} ${unit}`,
      axisPointer: { type: 'line', lineStyle: { color: style.muted, type: 'dashed' } } },
    xAxis: { type: 'time', boundaryGap: false, axisLine: { lineStyle: { color: style.line } }, axisTick: { show: false },
      axisLabel: { color: style.muted, hideOverlap: true, formatter: (value: number) => new Date(value).toLocaleString(locale, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', ...(span < 3_600_000 ? { second: '2-digit' as const } : {}) }) }, splitNumber: 4 },
    yAxis: { type: 'value', min: 0, name: unit, nameTextStyle: { color: style.muted, align: 'left' }, axisLabel: { color: style.muted, formatter: (value: number) => new Intl.NumberFormat('en', { notation: 'compact' }).format(value) },
      splitLine: { lineStyle: { color: style.line } } },
    series: series.map((item, index) => ({ id: item.key, name: item.label, type: 'line', data: item.points,
      smooth: 0.25, smoothMonotone: 'x', connectNulls: false, showSymbol: true, symbol: 'circle', symbolSize: 4,
      lineStyle: { width: 2 }, itemStyle: { color: style.colors[(item.colorIndex ?? index) % style.colors.length] }, emphasis: { focus: 'series' } })),
  };
}
export function calendarOptions(days: [string, number][], style: ChartStyle, locale: string): EChartsCoreOption {
  const max = Math.max(1, ...days.map(day => day[1]));
  return {
    animation: false,
    textStyle: { fontFamily: style.font, color: style.foreground },
    tooltip: { confine: true, renderMode: 'richText', backgroundColor: style.surface, borderColor: style.line,
      textStyle: { color: style.foreground, fontFamily: style.font, fontSize: 12 },
      formatter: (params: any) => `${params.value[0]}\n${new Intl.NumberFormat(locale).format(params.value[1])} Token` },
    visualMap: { show: false, type: 'piecewise', pieces: [
      { value: 0, color: style.heat[0] },
      ...[0, 1, 2, 3].map(index => ({ gt: max * index / 4, lte: max * (index + 1) / 4, color: style.heat[index + 1] }))
    ] },
    calendar: { top: 28, left: 34, right: days.length < 90 ? undefined : 8, bottom: 4, cellSize: [days.length < 90 ? 18 : 'auto', 15], range: [days[0]?.[0], days.at(-1)?.[0]],
      splitLine: { show: false }, itemStyle: { borderWidth: 0, color: 'transparent' },
      yearLabel: { show: false }, monthLabel: { color: style.muted, fontSize: 11, nameMap: locale.startsWith('zh') ? 'ZH' : 'EN', margin: 10 },
      dayLabel: { firstDay: 1, color: style.muted, fontSize: 10, margin: 7, nameMap: locale.startsWith('zh') ? ['日','一','二','三','四','五','六'] : ['S','M','T','W','T','F','S'] } },
    series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: days,
      itemStyle: { borderColor: style.surface, borderWidth: 2, borderRadius: 3 }, emphasis: { itemStyle: { borderColor: style.foreground, borderWidth: 1 } } }],
  };
}

export function pieOptions(items: { name: string; value: number }[], style: ChartStyle, locale: string): EChartsCoreOption {
  return {
    animation: false, color: style.colors,
    tooltip: { trigger: 'item', confine: true, renderMode: 'richText', backgroundColor: style.surface, borderColor: style.line,
      textStyle: { color: style.foreground, fontFamily: style.font, fontSize: 12 },
      formatter: (p: any) => `${p.name}\n${new Intl.NumberFormat(locale).format(p.value)} Token · ${p.percent}%` },
    series: [{ type: 'pie', radius: '82%', stillShowZeroSum: false, label: { show: false },
      itemStyle: { borderColor: style.surface, borderWidth: 2 }, data: items }],
  };
}
