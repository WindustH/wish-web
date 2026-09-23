import type { PieSlice } from './pieDistribution';
import type { EChartsCoreOption } from 'echarts/core';
export interface PlotSeries { key: string; label: string; colorIndex?: number; scatter?: boolean; points: [number, number | null, number?][] }
export interface ChartStyle { foreground: string; muted: string; line: string; surface: string; font: string; colors: string[]; heat: string[] }
// Recompute each model's ±2σ band after clipping so extreme spikes cannot
// mask smaller outliers. Bound the passes; never modify source/aggregate data.
export function filterTpsOutliers(points: PlotSeries['points']): PlotSeries['points'] {
  let kept = points.filter(point => point[1] !== null && Number.isFinite(point[1]));
  for (let pass = 0; pass < 8 && kept.length >= 3; pass++) {
    let mean = 0;
    let squaredDeviation = 0;
    kept.forEach((point, index) => {
      const value = point[1]!;
      const delta = value - mean;
      mean += delta / (index + 1);
      squaredDeviation += delta * (value - mean);
    });
    if (squaredDeviation === 0) break;
    const radius = 2 * Math.sqrt(Math.max(0, squaredDeviation / kept.length));
    const next = kept.filter(point => Math.abs(point[1]! - mean) <= radius);
    if (!next.length || next.length === kept.length) break;
    kept = next;
  }
  return kept;
}
export function lineOptions(series: PlotSeries[], style: ChartStyle, locale: string, unit: string): EChartsCoreOption {
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const times = series.flatMap(item => item.points.map(point => point[0]));
  const span = times.length ? times.reduce((a,b)=>Math.max(a,b),-Infinity) - times.reduce((a,b)=>Math.min(a,b),Infinity) : 0;
  return {
    animation: true, animationDuration: 0, animationDurationUpdate: 260, animationEasingUpdate: 'cubicOut',
    textStyle: { fontFamily: style.font, color: style.foreground },
    grid: { left: 8, right: 18, top: 24, bottom: 8, containLabel: true },
    tooltip: { trigger: series.some(item => item.scatter) ? 'item' : 'axis', confine: true, renderMode: 'richText', backgroundColor: style.surface, borderColor: style.line,
      textStyle: { color: style.foreground, fontFamily: style.font, fontSize: 12 },
      formatter: (params: any) => {
        const actual = (Array.isArray(params) ? params : [params]).filter((point: any) => !point.data?.virtual);
        if (!actual.length) return '';
        return [new Date(actual[0].value[0]).toLocaleString(locale), ...actual.map((point: any) => `${point.seriesName}: ${point.value[1] == null ? '—' : format.format(point.value[1]) + ' ' + unit}`)].join('\n');
      },
      axisPointer: { type: 'line', lineStyle: { color: style.muted, type: 'dashed' } } },
    xAxis: { type: 'time', boundaryGap: false, axisLine: { lineStyle: { color: style.line } }, axisTick: { show: false },
      axisLabel: { color: style.muted, hideOverlap: true, formatter: (value: number) => new Date(value).toLocaleString(locale, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', ...(span < 3_600_000 ? { second: '2-digit' as const } : {}) }) }, splitNumber: 4 },
    yAxis: { type: 'value', min: 0, name: unit, nameTextStyle: { color: style.muted, align: 'left' }, axisLabel: { color: style.muted, formatter: (value: number) => new Intl.NumberFormat('en', { notation: 'compact' }).format(value) },
      splitLine: { lineStyle: { color: style.line } } },
    series: series.map((item, index) => ({
      id: item.key, name: item.label, type: item.scatter ? 'scatter' : 'line',
      data: item.scatter ? filterTpsOutliers(item.points) : item.points, smooth: false, connectNulls: false,
      showSymbol: true, symbol: 'circle', symbolSize: item.scatter ? 5 : 4,
      lineStyle: { width: 2 }, itemStyle: { color: style.colors[(item.colorIndex ?? index) % style.colors.length], opacity: item.scatter ? .7 : 1 }, emphasis: { focus: 'series' },
    })),
  };
}
export interface HeatData { buckets: { start_ms: number; total_tokens: number }[]; bucketMs: number; offsetMinutes: number; endMs: number }
export function calendarLayout(count: number, width: number) {
  const available = Math.max(1, width - 4);
  const rows = 7;
  const columns = Math.max(1, Math.ceil(count / rows));
  const cell = Math.max(1, Math.floor(available / columns));
  return { columns, rows, cell, width: columns * cell, height: rows * cell, canvasHeight: rows * cell + 32 };
}
export function calendarOptions(heat: HeatData, style: ChartStyle, locale: string, width = 800): EChartsCoreOption {
  const layout = calendarLayout(heat.buckets.length, width);
  const { rows, columns } = layout;
  const max = Math.max(1, ...heat.buckets.map(bucket => bucket.total_tokens));
  const date = (at: number, time = false) => new Date(at + heat.offsetMinutes * 60_000).toLocaleString(locale, {
    timeZone: 'UTC', month: 'numeric', day: 'numeric', ...(time ? { hour: '2-digit' as const, minute: '2-digit' as const } : {}) });
  const interval = heat.bucketMs !== 86_400_000;
  return {
    animation: true, animationDuration: 0, animationDurationUpdate: 260, animationEasingUpdate: 'cubicOut',
    textStyle: { fontFamily: style.font, color: style.foreground },
    grid: { top: 30, left: (width - layout.width) / 2, width: layout.width, height: layout.height },
    tooltip: { confine: true, renderMode: 'html', backgroundColor: style.surface, borderColor: style.line,
      padding: [10, 12], borderRadius: 8,
      extraCssText: 'max-width:calc(100% - 24px);white-space:normal;box-sizing:border-box;pointer-events:none;',
      textStyle: { color: style.foreground, fontFamily: style.font, fontSize: 12 },
      formatter: (params: any) => {
        const bucket = heat.buckets[params.data[3]]!;
        const range = `${date(bucket.start_ms, interval)}${interval ? ' – ' + date(Math.min(bucket.start_ms + heat.bucketMs, heat.endMs), true) : ''}`;
        const content = document.createElement('div');
        const period = document.createElement('div');
        period.textContent = range;
        period.style.cssText = `font-size:11px;line-height:1.5;color:${style.muted};margin-bottom:5px;`;
        const amount = document.createElement('div');
        amount.style.cssText = 'display:flex;align-items:baseline;gap:6px;font-variant-numeric:tabular-nums;';
        const value = document.createElement('strong');
        value.textContent = new Intl.NumberFormat(locale).format(bucket.total_tokens);
        value.style.cssText = 'font-size:18px;font-weight:600;line-height:1.4;';
        const unit = document.createElement('span');
        unit.textContent = 'Token';
        unit.style.cssText = `font-size:11px;color:${style.muted};`;
        amount.append(value, unit);
        content.append(period, amount);
        return content;
      } },
    xAxis: { type: 'category', position: 'top', data: Array.from({ length: columns }, (_, i) => i),
      axisLine: { show: false }, axisTick: { show: false }, splitArea: { show: false },
      axisLabel: { color: style.muted, fontSize: 10, hideOverlap: true, interval: Math.max(0, Math.ceil(columns / 5) - 1), formatter: (column: string) => date(heat.buckets[Number(column) * rows]!.start_ms, heat.buckets.length * heat.bucketMs <= 86_400_000) } },
    yAxis: { type: 'category', inverse: true, data: Array.from({ length: rows }, (_, i) => i), show: false },
    visualMap: { show: false, dimension: 2, type: 'piecewise', pieces: [
      { value: 0, color: style.heat[0] },
      ...[0, 1, 2, 3].map(index => ({ gt: max * index / 4, lte: max * (index + 1) / 4, color: style.heat[index + 1] }))
    ] },
    series: [{ type: 'heatmap', data: heat.buckets.map((bucket, index) => [Math.floor(index / rows), index % rows, bucket.total_tokens, index]),
      itemStyle: { borderColor: style.surface, borderWidth: 2, borderRadius: 3 }, emphasis: { itemStyle: { borderColor: style.foreground, borderWidth: 1 } } }],
  };
}

export function pieOptions(items: PieSlice[], style: ChartStyle, locale: string): EChartsCoreOption {
  let container: HTMLElement;
  return {
    // No pie animation at all: every stats refresh rebuilds the slice list,
    // which replays an expand tween even when the shares barely moved.
    // Lines and the heatmap keep their update transitions.
    animation: false, color: style.colors,
    tooltip: { trigger: 'item', confine: false, renderMode: 'html', backgroundColor: style.surface, borderColor: style.line,
      className: 'usage-pie-tooltip',
      appendTo: (chartContainer: HTMLElement) => { container = chartContainer; return document.body; },
      extraCssText: 'max-width:min(320px,calc(100vw - 24px));white-space:normal;overflow-wrap:anywhere;box-sizing:border-box;',
      position: (point: number[], _params: unknown, _dom: unknown, _rect: unknown, size: { contentSize: number[] }) => {
        // The first show positions the tooltip before `appendTo` has run
        // and captured the chart container; fall back to the plain offset
        // until then instead of throwing.
        if (!container) return [point[0]! + 12, point[1]! + 12];
        const bounds = container.getBoundingClientRect();
        return [Math.max(12 - bounds.left, Math.min(point[0]! + 12, window.innerWidth - bounds.left - size.contentSize[0]! - 12)),
          Math.max(12 - bounds.top, Math.min(point[1]! + 12, window.innerHeight - bounds.top - size.contentSize[1]! - 12))];
      },
      textStyle: { color: style.foreground, fontFamily: style.font, fontSize: 12 },
      formatter: (p: any) => {
        const content = document.createElement('div');
        const name = document.createElement('div');
        name.textContent = p.name;
        const value = document.createElement('div');
        value.textContent = `${new Intl.NumberFormat(locale).format(p.data.tokens)} Token · ${new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2 }).format(p.data.share)}`;
        content.append(name, value);
        if (p.data.members.length > 1) {
          const members = document.createElement('div');
          members.textContent = p.data.members.map((item: { name: string }) => item.name).join('、');
          content.append(members);
        }
        return content;
      } },
    series: [{ type: 'pie', radius: '82%', stillShowZeroSum: false, label: { show: false },
      itemStyle: { borderColor: style.surface, borderWidth: 2 }, data: items.map(item => ({ name: item.name, itemStyle: { color: item.colorIndex == null ? style.muted : style.colors[item.colorIndex % style.colors.length] }, value: item.displayShare, tokens: item.value, share: item.share, members: item.members })) }],
  };
}
