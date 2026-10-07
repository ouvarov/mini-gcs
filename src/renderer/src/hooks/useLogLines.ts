import { useEffect, useState } from 'react'

import type { LogLine } from '@shared/ipc'

const MAX_LOG_LINES_KEPT = 200

const useLogLines = (): LogLine[] => {
  const [logLines, setLogLines] = useState<LogLine[]>([])

  useEffect(
    () =>
      window.gcs.subscribeToLogLines((logLine) =>
        setLogLines((previousLogLines) =>
          previousLogLines.length >= MAX_LOG_LINES_KEPT
            ? [...previousLogLines.slice(1), logLine]
            : [...previousLogLines, logLine]
        )
      ),
    []
  )

  return logLines
}

export { useLogLines }
