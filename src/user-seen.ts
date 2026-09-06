/**
 * M1-件② 亲自对话信号（纯读投影加料）：监听宿主 `user/message` 事件，记「舰长
 * 最近一次亲自进会话说话」的会话级时间戳。
 *
 * 判据（对齐宿主 SessionController 的口径）：source.kind === 'user' 才算人说话
 * （tool-result 是 tool、插件注入带自家标记）；本插件经适配器投递的 followup 带
 * `rpcId: 'warroom-*'` 前缀——程序化提示不是亲自对话，过滤掉。
 * 内存表不落盘（重启即丢，v1 定案）；载荷在 `.data` 下（V9.11 宿主嵌套形状坑）。
 * 不进账本、不动 seen/已读机制（那是任务回报的门槛，与此正交）。
 */
export interface UserSeenTracker {
  handle(sessionId: string | undefined, ev: unknown): void
  /** 该会话最近一次舰长亲自输入的 ISO 时间；无记录 null。 */
  seenAt(sessionId: string): string | null
  /** revision 盐：只随「有无记录」翻转（presence-only），时间刷新不翻——SSE
   * revision-only 红线下不制造每消息一跳的抖动。 */
  salt(): string
}

interface UserMessageShape {
  type?: unknown
  data?: { source?: { kind?: unknown; rpcId?: unknown } } | undefined
  source?: { kind?: unknown; rpcId?: unknown }
  time?: unknown
}

/** 纯函数：一个 session/event 是否构成「舰长亲自输入」。嵌套 .data 优先、扁平退回。 */
export function isPersonalUserMessage(ev: unknown): { at: string } | null {
  if (typeof ev !== 'object' || ev === null) return null
  const e = ev as UserMessageShape
  if (e.type !== 'user/message') return null
  const nested = typeof e.data === 'object' && e.data !== null ? e.data : undefined
  const source = nested?.source ?? e.source
  if (typeof source !== 'object' || source === null) return null
  if (source.kind !== 'user') return null
  const rpcId = typeof source.rpcId === 'string' ? source.rpcId : ''
  if (rpcId.startsWith('warroom-')) return null
  const at = typeof e.time === 'string' && e.time !== '' ? e.time : new Date().toISOString()
  return { at }
}

export function createUserSeenTracker(clock: () => string = () => new Date().toISOString()): UserSeenTracker {
  const bySession = new Map<string, string>()
  return {
    handle(sessionId, ev) {
      if (typeof sessionId !== 'string' || sessionId === '') return
      const hit = isPersonalUserMessage(ev)
      if (hit === null) return
      bySession.set(sessionId, hit.at)
    },
    seenAt(sessionId) {
      return bySession.get(sessionId) ?? null
    },
    salt() {
      return bySession.size > 0 ? 'u' : ''
    },
  }
}
