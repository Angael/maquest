import { useEffect, useRef } from 'react'

/**
 * Debounced saves that may not have reached disk yet. Editors register a flush; before the window closes or the app
 * switches or closes the project, every flush runs and is awaited, so the last keystrokes are never lost (or written
 * into the next project).
 */
const flushers = new Set<() => unknown>()

async function flushAll() {
  for (let round = 0; round < 2; round++) await Promise.allSettled([...flushers].map((flush) => Promise.resolve().then(flush)))
}

/** Runs every registered flush (twice: a sheet field flushes into the node's own debounced save) and waits for them. */
export async function flushPending(timeout = 2500) {
  await Promise.race([flushAll(), new Promise((resolve) => setTimeout(resolve, timeout))])
}

/** Registers `flush` (the latest one passed) for as long as the component is mounted. */
export function useFlushOnLeave(flush: () => unknown) {
  const latest = useRef(flush)
  useEffect(() => {
    latest.current = flush
  })
  useEffect(() => {
    const run = () => latest.current()
    flushers.add(run)
    return () => void flushers.delete(run)
  }, [])
}
