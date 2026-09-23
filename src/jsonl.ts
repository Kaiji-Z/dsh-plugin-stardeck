/**
 * JSONL 追加唯一入口（对抗审查 2026-09-23 新增）：写侧防「崩断半行 + 重启粘连」。
 * 旧实现各账本直接 appendFileSync——进程在半行写入后崩溃，重启后下一次追加会
 * 粘到无换行的半行上，两行合成一行 JSON.parse 失败，读侧 skip 防线挡不住写侧
 * 粘连，两条事件一起不可见。本入口在追加前检查文件尾字节，非换行先补一个 \n，
 * 使损伤永远收敛为「单行可跳过」，不再吞掉后续事件。
 * @module dsh-plugin-stardeck/jsonl
 */

import { appendFileSync, existsSync, fstatSync, openSync, readSync, closeSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

/** Append one object as a JSON line, healing a torn (newline-less) tail first. */
export function appendJsonl(file: string, obj: unknown): void {
  appendJsonlBatch(file, [obj])
}

/** 批量追加：多个对象拼成一次 write（对抗审查 2026-09-23）——调用点需要
 * 「两枚事件要么一起可见、要么一起不可见」的写级原子性（如 pivot 的
 * received→approved 连写、war_publish 的 approved+task_created 连写）。
 * 单次 append 中途崩断至多损失尾部整段，读侧按单行跳过，不产生悬空中间态。 */
export function appendJsonlBatch(file: string, objs: ReadonlyArray<unknown>): void {
  mkdirSync(dirname(file), { recursive: true })
  let prefix = ''
  try {
    if (existsSync(file)) {
      const fd = openSync(file, 'r')
      try {
        const size = fstatSync(fd).size
        if (size > 0) {
          const tail = Buffer.alloc(1)
          readSync(fd, tail, 0, 1, size - 1)
          if (tail[0] !== 0x0a) prefix = '\n'
        }
      } finally {
        closeSync(fd)
      }
    }
  } catch {
    // 读尾失败按无前缀处理——追加本身不因此阻断。
  }
  appendFileSync(file, `${prefix}${objs.map(o => JSON.stringify(o)).join('\n')}\n`, 'utf8')
}
