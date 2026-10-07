import { useEffect, useRef } from 'react'

import type { LogLine } from '@shared/ipc'

type Props = {
  logLines: LogLine[]
}

const SEVERITY_CLASS_NAMES = {
  info: 'log__line--info',
  warn: 'log__line--warn',
  error: 'log__line--error',
} satisfies Record<LogLine['severityLevel'], string>

/** `HH:mm:ss.SSS` slice of an ISO timestamp. */
const ISO_TIME_OF_DAY_START = 11
const ISO_TIME_OF_DAY_END = 23

const formatLogTime = (loggedAtEpochMs: number): string =>
  new Date(loggedAtEpochMs).toISOString().slice(ISO_TIME_OF_DAY_START, ISO_TIME_OF_DAY_END)

const LogView = ({ logLines }: Props) => {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (container) container.scrollTop = container.scrollHeight
  }, [logLines])

  return (
    <div ref={containerRef} className="log" data-testid="log">
      {logLines.map((logLine, lineIndex) => (
        <div
          key={`${logLine.loggedAtEpochMs}-${lineIndex}`}
          className={`log__line ${SEVERITY_CLASS_NAMES[logLine.severityLevel]}`}
        >
          <span className="log__time">{formatLogTime(logLine.loggedAtEpochMs)}</span>
          <span className="log__level">{logLine.severityLevel}</span>
          <span>{logLine.messageText}</span>
        </div>
      ))}
    </div>
  )
}

export { LogView }
