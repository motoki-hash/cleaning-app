'use client'

import { useSyncExternalStore } from 'react'

// 画面ごとの「元に戻す／やり直す」を、Shell（共通の枠）から呼べるようにする小さな登録所。
// 各ページ（データを扱うページ・スケジュールのページ）が、自分の undo / redo を登録する。
export type UndoHandlers = {
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  owner: string
}

let handlers: UndoHandlers | null = null
const listeners = new Set<() => void>()

export const setUndoHandlers = (h: UndoHandlers | null) => {
  handlers = h
  listeners.forEach(l => l())
}
// 自分が登録したものだけを外す（別のページが上書きした後に、古いページが消してしまうのを防ぐ）
export const clearUndoHandlers = (owner: string) => {
  if (handlers?.owner === owner) setUndoHandlers(null)
}
export const getUndoHandlers = () => handlers
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export const useUndoHandlers = () => useSyncExternalStore(subscribe, getUndoHandlers, () => null)
