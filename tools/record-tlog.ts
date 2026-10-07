/** Records a .tlog from SITL's TCP port 5762 (the app's UDP stream stays untouched). */
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'

import { type MavLinkPacket, MavLinkPacketParser, MavLinkPacketSplitter } from 'node-mavlink'

import { STREAM_REQUEST_RATE_HZ, buildStreamRequestBytes } from '../src/main/link/streamRequest'
import { encodeTlogRecord } from '../src/main/link/tlog'
import { LOCALHOST_ADDRESS, SITL_APP_TCP_PORT } from '../src/shared/defaults'
import { MILLISECONDS_PER_SECOND } from '../src/shared/units'

import { parseCommandLineOptions } from './cli-options'

const DEFAULT_OUTPUT_FILE_PATH = 'fixtures/sitl-square.tlog'

const commandLineOptions = parseCommandLineOptions(process.argv.slice(2))
const sitlTcpHost = commandLineOptions.readString('host', LOCALHOST_ADDRESS)
const sitlTcpPort = commandLineOptions.readNumber('port', SITL_APP_TCP_PORT)
const recordDurationSeconds = commandLineOptions.readNumber('seconds', 60)
const outputFilePath = commandLineOptions.readString('out', DEFAULT_OUTPUT_FILE_PATH)
const streamRequestRateHz = commandLineOptions.readNumber('rate', STREAM_REQUEST_RATE_HZ)

fs.mkdirSync(path.dirname(outputFilePath), { recursive: true })
const outputStream = fs.createWriteStream(outputFilePath)
let recordedPacketCount = 0

const packetSplitter = new MavLinkPacketSplitter()
const packetParser = new MavLinkPacketParser()
packetSplitter.pipe(packetParser)
packetParser.on('data', (packet: MavLinkPacket) => {
  outputStream.write(encodeTlogRecord(Date.now(), packet.buffer))
  recordedPacketCount++
})

const sitlSocket = net.createConnection({ host: sitlTcpHost, port: sitlTcpPort }, () => {
  console.log(
    `connected to ${sitlTcpHost}:${sitlTcpPort}, recording ${recordDurationSeconds}s to ${outputFilePath}`
  )
  // SITL sends heartbeats only until a client asks for streams.
  sitlSocket.write(buildStreamRequestBytes(streamRequestRateHz))
})
sitlSocket.on('data', (receivedBytes) => packetSplitter.write(receivedBytes))
sitlSocket.on('error', (error) => {
  console.error(`tcp: ${error.message}`)
  process.exit(1)
})

setTimeout(() => {
  sitlSocket.destroy()
  outputStream.end(() => {
    console.log(
      `recorded ${recordedPacketCount} packets, ${fs.statSync(outputFilePath).size} bytes`
    )
    process.exit(0)
  })
}, recordDurationSeconds * MILLISECONDS_PER_SECOND)
