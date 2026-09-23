/**
 * The tiny global war state (activation + HQ binding + current campaign
 * pointer). Campaign HISTORY lives in the append-only event logs; only this
 * pointer state is a plain JSON file (tiny-pointer store pattern).
 * @module dsh-plugin-stardeck/state
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { WarGlobalState } from './types.ts'

/** Resolve the plugin state directory (the JSON file's dirname). */
export function resolveStateDir(configuredStateFile: string): string {
  if (configuredStateFile !== '') return dirname(configuredStateFile)
  const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(dshHome, 'warroom-plugin')
}

export function stateFilePath(stateDir: string): string {
  return join(stateDir, 'state.json')
}

export function loadWarState(stateDir: string): WarGlobalState {
  const file = stateFilePath(stateDir)
  if (!existsSync(file)) return { version: 2, active: false }
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<WarGlobalState>
    return {
      version: 2,
      active: parsed.active === true,
      hqSessionId: typeof parsed.hqSessionId === 'string' ? parsed.hqSessionId : undefined,
      commanderChildId: typeof parsed.commanderChildId === 'string' ? parsed.commanderChildId : undefined,
    }
  } catch {
    return { version: 2, active: false }
  }
}

export function saveWarState(stateDir: string, state: WarGlobalState): void {
  // 对抗审查 2026-09-23：原子写——先落 tmp 再 rename 覆盖。半写的 state.json
  // 会被 loadWarState 降级成 {active:false}，HQ 绑定凭空丢失；rename 保证
  // 读者看到的要么是完整旧文件、要么是完整新文件，不存在中间态。
  const file = stateFilePath(stateDir)
  const tmp = `${file}.tmp`
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  renameSync(tmp, file)
}

/** The store handle shared across command/tool/dashboard wiring. */
export interface WarStore {
  get(): WarGlobalState
  save(): void
}

export function createWarStore(stateDir: string): WarStore {
  let state = loadWarState(stateDir)
  return {
    get: () => state,
    save: () => {
      saveWarState(stateDir, state)
    },
    /** Test/refresh hook: reload from disk (not used in the happy path). */
    reload: () => {
      state = loadWarState(stateDir)
    },
  } as WarStore
}

/** New campaign ids: time-ordered, filesystem-safe. */
export function newCampaignId(now: Date = new Date()): string {
  const pad = (n: number, w = 2): string => String(n).padStart(w, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const rand = crypto.randomUUID().slice(0, 4)
  return `${stamp}-${rand}`
}
