/** UDP receiver without Electron: separates "parser is broken" from "SITL is not sending". */
import dgram from 'node:dgram'

import { type MavLinkPacket, MavLinkPacketParser, MavLinkPacketSplitter } from 'node-mavlink'

import { messageNameOf, normalizePacketToTelemetryFrame } from '../src/main/link/normalize'
import { createSequenceGapTracker } from '../src/main/link/sequenceGap'
import { DEFAULT_GCS_UDP_PORT, EMPTY_VALUE_TEXT, LOCALHOST_ADDRESS } from '../src/shared/defaults'
import { MILLISECONDS_PER_SECOND } from '../src/shared/units'

import { parseCommandLineOptions } from './cli-options'

const commandLineOptions = parseCommandLineOptions(process.argv.slice(2))
const udpListenPort = commandLineOptions.readNumber('port', DEFAULT_GCS_UDP_PORT)
const runDurationSeconds = commandLineOptions.readNumber('seconds', 0)

const COORDINATE_DECIMALS = 6
const ALTITUDE_DECIMALS = 1
const COUNT_COLUMN_WIDTH = 6

const packetCountByMessageName = new Map<string, number>()
const sequenceGapTracker = createSequenceGapTracker()
let totalPacketCount = 0
let lostPacketCount = 0

const formatPositionLine = (
  frame: NonNullable<ReturnType<typeof normalizePacketToTelemetryFrame>>
): string => {
  const position = frame.position!
  const headingText = position.headingDegrees?.toFixed(0) ?? EMPTY_VALUE_TEXT
  return `\r${position.latitudeDegrees.toFixed(COORDINATE_DECIMALS)}, ${position.longitudeDegrees.toFixed(COORDINATE_DECIMALS)}  altitude ${position.altitudeAboveHomeMeters.toFixed(ALTITUDE_DECIMALS)} m  heading ${headingText}  total ${totalPacketCount} lost ${lostPacketCount}   `
}

const packetSplitter = new MavLinkPacketSplitter()
const packetParser = new MavLinkPacketParser()
packetSplitter.pipe(packetParser)

packetParser.on('data', (packet: MavLinkPacket) => {
  totalPacketCount++
  lostPacketCount += sequenceGapTracker.track(packet)
  const messageName = messageNameOf(packet)
  packetCountByMessageName.set(messageName, (packetCountByMessageName.get(messageName) ?? 0) + 1)

  const frame = normalizePacketToTelemetryFrame(packet)
  if (frame?.position) process.stdout.write(formatPositionLine(frame))
})

const udpSocket = dgram.createSocket('udp4')
udpSocket.on('message', (receivedBytes) => packetSplitter.write(receivedBytes))
udpSocket.bind(udpListenPort, LOCALHOST_ADDRESS, () =>
  console.log(`listening udp ${LOCALHOST_ADDRESS}:${udpListenPort}`)
)

const printSummary = (): void => {
  console.log('\n--- summary ---')
  const sortedByCountDescending = [...packetCountByMessageName.entries()].sort(
    ([, leftCount], [, rightCount]) => rightCount - leftCount
  )
  for (const [messageName, packetCount] of sortedByCountDescending) {
    console.log(`${packetCount.toString().padStart(COUNT_COLUMN_WIDTH)}  ${messageName}`)
  }
  console.log(`total ${totalPacketCount}, lost (by seq) ${lostPacketCount}`)
}

process.on('SIGINT', () => {
  printSummary()
  process.exit(0)
})

if (runDurationSeconds > 0) {
  setTimeout(() => {
    printSummary()
    process.exit(0)
  }, runDurationSeconds * MILLISECONDS_PER_SECOND)
}
