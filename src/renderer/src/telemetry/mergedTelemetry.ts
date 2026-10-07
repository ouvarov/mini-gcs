import type { TelemetryFrame } from '@shared/ipc'

type SliceTiming = {
  receivedAtEpochMs: number
  timeSinceBootMs: number | null
}

type SliceName = Exclude<keyof TelemetryFrame, 'receivedAtEpochMs' | 'timeSinceBootMs' | 'systemId'>

type TimedSlice<Name extends SliceName> = NonNullable<TelemetryFrame[Name]> & SliceTiming

/** Each slice keeps the timestamp of its own message, not of the last merged frame. */
type MergedTelemetry = { systemId: number } & { [Name in SliceName]?: TimedSlice<Name> }

const SLICE_NAMES: SliceName[] = [
  'position',
  'attitude',
  'vfrHud',
  'battery',
  'gpsFix',
  'heartbeat',
  'statusText',
  'homePosition',
]

const mergeTelemetryFrame = (
  previousMergedTelemetry: MergedTelemetry | null,
  frame: TelemetryFrame
): MergedTelemetry => {
  const timing: SliceTiming = {
    receivedAtEpochMs: frame.receivedAtEpochMs,
    timeSinceBootMs: frame.timeSinceBootMs,
  }
  const nextMergedTelemetry: MergedTelemetry = {
    ...previousMergedTelemetry,
    systemId: frame.systemId,
  }
  for (const sliceName of SLICE_NAMES) {
    const slice = frame[sliceName]
    if (slice) Object.assign(nextMergedTelemetry, { [sliceName]: { ...slice, ...timing } })
  }
  return nextMergedTelemetry
}

/** Position heading first; VFR_HUD when the autopilot reports it unknown. */
const selectHeadingDegrees = (mergedTelemetry: MergedTelemetry | null): number | null =>
  mergedTelemetry?.position?.headingDegrees ?? mergedTelemetry?.vfrHud?.headingDegrees ?? null

export { mergeTelemetryFrame, selectHeadingDegrees }
export type { MergedTelemetry }
