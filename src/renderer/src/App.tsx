import { useCallback, useEffect, useRef } from 'react'

import { DEFAULT_UDP_LINK_CONFIG } from '@shared/defaults'
import type { LinkConfig } from '@shared/ipc'

import { DiagnosticsPanel } from './components/DiagnosticsPanel'
import { HeadsUpDisplay } from './components/HeadsUpDisplay'
import { InterceptPanel } from './components/InterceptPanel'
import { LinkPanel } from './components/LinkPanel'
import { LogView } from './components/LogView'
import { type MapScene, MapView } from './components/MapView'
import { useGcsBridge } from './hooks/useGcsBridge'
import { useInterceptScenario } from './hooks/useInterceptScenario'
import { useTrajectoryPrediction } from './hooks/useTrajectoryPrediction'
import { buildPredictionOverlay } from './prediction/trajectoryPrediction'
import { selectHeadingDegrees } from './telemetry/mergedTelemetry'

const App = () => {
  const {
    linkStatus,
    recordingStatus,
    mergedTelemetry,
    ipcLatencyMs,
    logLines,
    connect,
    disconnect,
    startRecording,
    stopRecording,
    pickTlogFile,
  } = useGcsBridge()
  const { trackedVehicle, reset: resetTrajectory } = useTrajectoryPrediction()

  // The map shows only the autopilot's own home (RTL target); the interceptor hook has its own fallback.
  const autopilotHome = mergedTelemetry?.homePosition ?? null
  const intercept = useInterceptScenario({
    localFrameOrigin: trackedVehicle.localFrameOrigin,
    autopilotHome,
    predictedPoints: trackedVehicle.predictedPoints,
  })

  const { resetLaunchPoint } = intercept
  const connectAndReset = useCallback(
    (linkConfig: LinkConfig) => {
      resetTrajectory()
      resetLaunchPoint()
      return connect(linkConfig)
    },
    [connect, resetTrajectory, resetLaunchPoint]
  )

  // Same default as QGroundControl: listening on UDP 14550 is harmless, so the app starts already listening.
  const hasAutoConnectedRef = useRef(false)
  useEffect(() => {
    if (hasAutoConnectedRef.current) return
    hasAutoConnectedRef.current = true
    void connectAndReset(DEFAULT_UDP_LINK_CONFIG)
  }, [connectAndReset])

  const mapScene: MapScene = {
    vehicle: trackedVehicle.vehiclePosition
      ? {
          position: trackedVehicle.vehiclePosition,
          headingDegrees: selectHeadingDegrees(mergedTelemetry),
        }
      : null,
    autopilotHome,
    interceptor: intercept.launchPoint.point
      ? { launchPoint: intercept.launchPoint.point, reachMeters: intercept.reachMeters }
      : null,
    trackCoordinates: trackedVehicle.trackCoordinates,
    prediction: buildPredictionOverlay(
      trackedVehicle.predictedPoints,
      trackedVehicle.localFrameOrigin
    ),
  }

  return (
    <div className="app">
      <header className="app__link">
        <LinkPanel
          initialLinkConfig={DEFAULT_UDP_LINK_CONFIG}
          link={{ status: linkStatus, connect: connectAndReset, disconnect }}
          recording={{ status: recordingStatus, start: startRecording, stop: stopRecording }}
          onPickTlogFile={pickTlogFile}
        />
      </header>
      <section className="app__map">
        <MapView scene={mapScene} onMapClick={intercept.setCustomLaunchPoint} />
      </section>
      <aside className="app__side">
        <HeadsUpDisplay mergedTelemetry={mergedTelemetry} />
        <InterceptPanel
          interceptSettings={intercept.settings}
          onSettingsChange={intercept.setSettings}
          interceptEstimate={intercept.estimate}
          predictedEllipses={trackedVehicle.predictedPoints.map(({ horizonSeconds, ellipse }) => ({
            horizonSeconds,
            ellipse,
          }))}
          launchPoint={intercept.launchPoint}
          onResetLaunchPoint={intercept.resetLaunchPoint}
        />
        <DiagnosticsPanel
          linkStatus={linkStatus}
          ipcLatencyMs={ipcLatencyMs}
          trackSampleCount={trackedVehicle.trackCoordinates.length}
          lastInnovationMeters={trackedVehicle.lastInnovationMeters}
        />
      </aside>
      <footer className="app__log">
        <LogView logLines={logLines} />
      </footer>
    </div>
  )
}

export default App
