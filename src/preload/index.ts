import {
  type GcsApi,
  IPC_CHANNELS,
  type LinkConfig,
  type LinkStatus,
  type LogLine,
  type RecordingStatus,
  type TelemetryBatch,
} from '@shared/ipc'
import { type IpcRendererEvent, contextBridge, ipcRenderer } from 'electron'

const subscribeToChannel = <Payload>(
  channel: string,
  listener: (payload: Payload) => void
): (() => void) => {
  const channelListener = (_event: IpcRendererEvent, payload: Payload): void => listener(payload)
  ipcRenderer.on(channel, channelListener)
  return () => ipcRenderer.removeListener(channel, channelListener)
}

const gcsApi: GcsApi = {
  connect: (linkConfig: LinkConfig) => ipcRenderer.invoke(IPC_CHANNELS.linkConnect, linkConfig),
  disconnect: () => ipcRenderer.invoke(IPC_CHANNELS.linkDisconnect),
  startRecording: () => ipcRenderer.invoke(IPC_CHANNELS.recordingStart),
  stopRecording: () => ipcRenderer.invoke(IPC_CHANNELS.recordingStop),
  pickTlogFile: () => ipcRenderer.invoke(IPC_CHANNELS.pickTlogFile),
  subscribeToTelemetryBatches: (listener) =>
    subscribeToChannel<TelemetryBatch>(IPC_CHANNELS.telemetryBatch, listener),
  subscribeToLinkStatus: (listener) =>
    subscribeToChannel<LinkStatus>(IPC_CHANNELS.linkStatus, listener),
  subscribeToRecordingStatus: (listener) =>
    subscribeToChannel<RecordingStatus>(IPC_CHANNELS.recordingStatus, listener),
  subscribeToLogLines: (listener) => subscribeToChannel<LogLine>(IPC_CHANNELS.logLine, listener),
}

// Only this narrow API reaches the renderer. No ipcRenderer, no Node.
contextBridge.exposeInMainWorld('gcs', gcsApi)
