import { useCallback, useEffect, useRef } from 'react'

/** Coalesces many updates into one `flush` per animation frame; the caller stores the latest data in a ref. */
const useAnimationFrameFlush = (flush: () => void): (() => void) => {
  const animationFrameRequestIdRef = useRef<number | null>(null)
  const latestFlushRef = useRef(flush)

  useEffect(() => {
    latestFlushRef.current = flush
  }, [flush])

  useEffect(
    () => () => {
      if (animationFrameRequestIdRef.current !== null)
        cancelAnimationFrame(animationFrameRequestIdRef.current)
    },
    []
  )

  return useCallback((): void => {
    if (animationFrameRequestIdRef.current !== null) return
    animationFrameRequestIdRef.current = requestAnimationFrame(() => {
      animationFrameRequestIdRef.current = null
      latestFlushRef.current()
    })
  }, [])
}

export { useAnimationFrameFlush }
