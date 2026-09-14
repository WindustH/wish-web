// Memory card segmentation and its detail rows: one pure mapping so the
// wording and the degradation math stay testable and the UI stays dumb.
// The labels are functional, never allocator jargon:
//   active data        what session contexts, event buffers and caches hold
//   retained           freed pages the allocator keeps for reuse — it can
//                      hand them back to the OS
//   sqlite             the database engine, which allocates outside the
//                      Rust global allocator
//   other              everything else native: C libraries, the program
export type MemorySegment = { name: string; value: number; note?: string };
export type MemorySegments = { segments: MemorySegment[]; partial: boolean };

export function memorySegments(snapshot: any, tx: (zh: string, en: string) => string): MemorySegments {
  if (!snapshot?.rss_bytes) return { segments: [], partial: false };
  const rss = snapshot.rss_bytes;
  const resident = snapshot.resident_bytes;
  const sqliteKnown = snapshot.sqlite_memory_used != null;
  if (!resident || snapshot.allocator !== 'jemalloc') {
    // No allocator counters: at best split the database engine out of RSS.
    if (sqliteKnown) {
      const sqlite = Math.max(0, Math.min(snapshot.sqlite_memory_used, rss));
      return { partial: true, segments: [
        { name: tx('SQLite', 'SQLite'), value: sqlite, note: tx('SQLite 数据库引擎占用', 'The SQLite database engine') },
        { name: tx('程序与 C 库', 'Program and C libraries'), value: Math.max(0, rss - sqlite),
          note: tx('程序本体与本地库占用', 'The program itself and its native libraries') },
      ] };
    }
    return { partial: true, segments: [
      { name: tx('进程驻留内存', 'Process resident memory'), value: rss },
    ] };
  }
  const allocated = Math.min(snapshot.allocated_bytes ?? 0, resident);
  const retained = Math.max(0, resident - allocated);   // metadata + cache + idle
  const nonAllocator = Math.max(0, rss - resident);
  const base: MemorySegment[] = [
    { name: tx('活跃数据', 'Active data'), value: allocated,
      note: tx('会话上下文、事件缓冲与缓存的真实占用', 'What session contexts, event buffers and caches hold') },
    { name: tx('分配器保留', 'Retained by allocator'), value: retained,
      note: tx('已释放待复用,可归还操作系统', 'Freed for reuse; can be returned to the OS') },
  ];
  if (!sqliteKnown) {
    return { partial: true, segments: [...base,
      { name: tx('SQLite 与 C 库', 'SQLite and C libraries'), value: nonAllocator,
        note: tx('分配器之外的本地库与程序占用', 'Native libraries and program use outside the allocator') }] };
  }
  const sqlite = Math.max(0, Math.min(snapshot.sqlite_memory_used, nonAllocator));
  return { partial: false, segments: [...base,
    { name: tx('SQLite', 'SQLite'), value: sqlite, note: tx('SQLite 数据库引擎占用', 'The SQLite database engine') },
    { name: tx('其他', 'Other'), value: Math.max(0, nonAllocator - sqlite),
      note: tx('程序本体与其他本地库占用', 'The program itself and other native libraries') }] };
}

// Actionable detail rows under the bar: every row is a number you can do
// something about, with one sentence on what it is and what growth means.
// Rows appear only when the daemon reports the field, so an older daemon
// simply shows fewer lines (the v3 nested snapshot maps onto the same rows).
export type MemoryDetailRow = { name: string; value: string; note: string };
export function memoryDetailRows(
  snapshot: any,
  daemonStatus: any,
  fmtBytes: (n: number) => string,
  numberFmt: (n: number) => string,
  tx: (zh: string, en: string) => string,
): MemoryDetailRow[] {
  const rows: MemoryDetailRow[] = [];
  const push = (name: string, value: string, note: string) => rows.push({ name, value, note });
  if (snapshot?.sqlite_memory_used != null) {
    push(tx('SQLite 引擎', 'SQLite engine'),
      `${fmtBytes(snapshot.sqlite_memory_used)}${snapshot.sqlite_connections != null ? ` · ${numberFmt(snapshot.sqlite_connections)} ${tx('个连接', 'connections')}` : ''}`,
      tx('页缓存与排序缓冲;持续增长说明查询集变大或缺少清理', 'Page cache and sort buffers; steady growth means a larger query set or missing cleanup'));
  }
  if (snapshot?.retained_bytes != null) {
    push(tx('分配器保留', 'Allocator retained'), fmtBytes(snapshot.retained_bytes),
      tx('已释放待复用的页;居高不下说明峰值流量大,可调 decay 参数', 'Pages freed for reuse; staying high means big peak traffic — tune the decay setting'));
  }
  const queue = daemonStatus?.queue;
  if (queue && queue.pending_content_bytes != null) {
    push(tx('待发送消息', 'Pending messages'),
      `${fmtBytes(queue.pending_content_bytes)}${queue.pending_items != null ? ` · ${numberFmt(queue.pending_items)} ${tx('条', 'items')}` : ''}`,
      tx('等待运行中会话消费的消息体积;增长快说明消费跟不上发送', 'Message volume waiting for a running session; fast growth means consumption lags sending'));
  }
  if (snapshot?.run_stream_subscribers != null) {
    push(tx('流订阅与缓冲', 'Stream subscriptions'),
      `${numberFmt(snapshot.run_stream_subscribers)} ${tx('个订阅', 'subscriptions')} · ${tx('每条至多', 'up to')} ${numberFmt(snapshot.run_stream_buffer_events ?? 0)} ${tx('条事件', 'events')}`,
      tx('正在接收流式输出的连接及为其保留的重放缓冲;随并发回复增长', 'Connections receiving live output and the replay buffers kept for them; grows with concurrent replies'));
  }
  if (snapshot?.threads != null) {
    push(tx('线程', 'Threads'), numberFmt(snapshot.threads),
      tx('运行时与工作线程;只增不减通常意味着阻塞或泄漏', 'Runtime and worker threads; a number that only grows usually means blocking or a leak'));
  }
  return rows;
}
