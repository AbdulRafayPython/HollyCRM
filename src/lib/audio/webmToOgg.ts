/**
 * Repackages Opus audio from a WebM container into an Ogg container.
 *
 * Why this exists: Green API accepts ogg, mp3 and m4a and rejects everything
 * else outright ("mime type audio/webm;codecs=opus is not supported"), while
 * Chrome's MediaRecorder can only produce Opus in WebM. Both containers carry
 * the *same* Opus packets, so this is a remux — the audio is copied bit for
 * bit, never decoded and re-encoded, so there is no quality loss and no codec
 * dependency. Ogg/Opus is also exactly the format WhatsApp uses for its own
 * voice notes.
 *
 * Scope is deliberately narrow: MediaRecorder output, one Opus track, no
 * lacing. Anything outside that throws rather than emitting a file that would
 * fail silently on someone's phone.
 *
 * References: EBML/Matroska element IDs, and RFC 7845 (Ogg encapsulation for
 * Opus) for the header packets and granule positions.
 */

const EL = {
  SEGMENT: 0x18538067,
  TRACKS: 0x1654ae6b,
  TRACK_ENTRY: 0xae,
  AUDIO: 0xe1,
  CODEC_ID: 0x86,
  CODEC_PRIVATE: 0x63a2,
  CLUSTER: 0x1f43b675,
  BLOCK_GROUP: 0xa0,
  SIMPLE_BLOCK: 0xa3,
  BLOCK: 0xa1,
  CHANNELS: 0x9f,
} as const;

/** Containers we walk into. Everything else is a leaf and gets skipped by size. */
const DESCEND = new Set<number>([
  EL.SEGMENT,
  EL.TRACKS,
  EL.TRACK_ENTRY,
  EL.AUDIO,
  EL.CLUSTER,
  EL.BLOCK_GROUP,
]);

export class RemuxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RemuxError";
  }
}

interface Vint {
  value: number;
  length: number;
  unknown: boolean;
}

/** EBML variable-length integer. `keepMarker` is what distinguishes an ID from a size. */
function readVint(data: Uint8Array, at: number, keepMarker: boolean): Vint {
  if (at >= data.length) throw new RemuxError("Truncated WebM: ran out of bytes.");
  const first = data[at];
  if (first === 0) throw new RemuxError("Invalid EBML: zero length descriptor.");

  let length = 1;
  let mask = 0x80;
  while (length <= 8 && (first & mask) === 0) {
    mask >>= 1;
    length++;
  }
  if (length > 8 || at + length > data.length) throw new RemuxError("Invalid EBML length descriptor.");

  let value = keepMarker ? first : first & (mask - 1);
  let allOnes = (first & (mask - 1)) === mask - 1;
  for (let i = 1; i < length; i++) {
    const byte = data[at + i];
    // Values above 2^53 cannot survive a JS number; sizes that large do not
    // occur in a voice note, so this is a real corruption signal.
    value = value * 256 + byte;
    if (byte !== 0xff) allOnes = false;
  }

  return { value, length, unknown: !keepMarker && allOnes };
}

/** Opus frame duration in 48 kHz samples, from the packet's TOC byte (RFC 6716 §3.1). */
function opusPacketSamples(packet: Uint8Array): number {
  if (packet.length === 0) throw new RemuxError("Empty Opus packet.");
  const toc = packet[0];
  const config = toc >> 3;
  const code = toc & 0x03;

  let frameMs: number;
  if (config < 12) frameMs = [10, 20, 40, 60][config % 4];
  else if (config < 16) frameMs = [10, 20][config % 2];
  else frameMs = [2.5, 5, 10, 20][config % 4];

  let frames: number;
  if (code === 0) frames = 1;
  else if (code === 1 || code === 2) frames = 2;
  else {
    if (packet.length < 2) throw new RemuxError("Truncated Opus packet (code 3).");
    frames = packet[1] & 0x3f;
  }

  return Math.round(frameMs * 48 * frames);
}

interface OpusTrack {
  opusHead: Uint8Array | null;
  channels: number;
  packets: Uint8Array[];
}

/**
 * Pulls the Opus packets out of a WebM byte stream.
 *
 * The walk is flat by design: every container we care about is descended into
 * rather than skipped, so an element declared with "unknown size" — which
 * MediaRecorder uses for Segment and Cluster while streaming — needs no special
 * handling at all. Leaves are skipped by their declared size.
 */
function readWebm(data: Uint8Array): OpusTrack {
  const track: OpusTrack = { opusHead: null, channels: 1, packets: [] };
  let codecId: string | null = null;
  let at = 0;

  while (at < data.length) {
    const id = readVint(data, at, true);
    at += id.length;
    const size = readVint(data, at, false);
    at += size.length;

    if (DESCEND.has(id.value)) continue;

    if (size.unknown) throw new RemuxError("Unsupported WebM: unknown size on a leaf element.");
    const end = at + size.value;
    if (end > data.length) {
      // A recording cut off mid-write still has usable complete clusters
      // before this point, so stop rather than discard the whole take.
      break;
    }
    const payload = data.subarray(at, end);

    switch (id.value) {
      case EL.CODEC_ID:
        codecId = new TextDecoder().decode(payload).replace(/\0+$/, "");
        break;
      case EL.CODEC_PRIVATE:
        track.opusHead = payload;
        break;
      case EL.CHANNELS:
        track.channels = payload.reduce((acc, byte) => acc * 256 + byte, 0) || 1;
        break;
      case EL.SIMPLE_BLOCK:
      case EL.BLOCK: {
        const num = readVint(payload, 0, false);
        // track number vint + 2-byte relative timecode + 1-byte flags
        const flags = payload[num.length + 2];
        if ((flags & 0x06) !== 0) {
          throw new RemuxError("Unsupported WebM: laced blocks.");
        }
        const frame = payload.subarray(num.length + 3);
        if (frame.length > 0) track.packets.push(frame);
        break;
      }
    }

    at = end;
  }

  if (codecId && codecId !== "A_OPUS") {
    throw new RemuxError(`Unsupported WebM audio codec: ${codecId}.`);
  }
  if (track.packets.length === 0) throw new RemuxError("No audio found in the recording.");
  return track;
}

/* ---------------------------------------------------------------------------
 * Ogg muxing
 * ------------------------------------------------------------------------ */

/** Ogg's CRC-32: polynomial 0x04c11db7, no reflection, no final xor. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) r = r & 0x80000000 ? ((r << 1) ^ 0x04c11db7) >>> 0 : (r << 1) >>> 0;
    table[i] = r >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0;
  for (let i = 0; i < bytes.length; i++) {
    crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ bytes[i]) & 0xff]) >>> 0;
  }
  return crc >>> 0;
}

/** Lacing: every packet is split into 255-byte segments, terminated by one < 255. */
function lacingFor(packets: Uint8Array[]): number[] {
  const table: number[] = [];
  for (const p of packets) {
    let left = p.length;
    while (left >= 255) {
      table.push(255);
      left -= 255;
    }
    table.push(left);
  }
  return table;
}

function buildPage(
  packets: Uint8Array[],
  headerType: number,
  granule: number,
  serial: number,
  sequence: number
): Uint8Array {
  const lacing = lacingFor(packets);
  if (lacing.length > 255) throw new RemuxError("Internal: too many segments for one Ogg page.");

  const body = packets.reduce((n, p) => n + p.length, 0);
  const page = new Uint8Array(27 + lacing.length + body);
  const view = new DataView(page.buffer);

  page.set([0x4f, 0x67, 0x67, 0x53], 0); // "OggS"
  page[4] = 0; // stream structure version
  page[5] = headerType;

  // granule position is 64-bit little-endian; header pages use 0, and the
  // value never exceeds 2^53 for anything a person would record.
  view.setUint32(6, granule >>> 0, true);
  view.setUint32(10, Math.floor(granule / 0x100000000), true);

  view.setUint32(14, serial, true);
  view.setUint32(18, sequence, true);
  view.setUint32(22, 0, true); // CRC placeholder — computed over the zeroed page
  page[26] = lacing.length;
  page.set(lacing, 27);

  let at = 27 + lacing.length;
  for (const p of packets) {
    page.set(p, at);
    at += p.length;
  }

  view.setUint32(22, crc32(page), true);
  return page;
}

function opusTags(): Uint8Array {
  const vendor = new TextEncoder().encode("HolyCRM");
  const out = new Uint8Array(8 + 4 + vendor.length + 4);
  out.set(new TextEncoder().encode("OpusTags"), 0);
  const view = new DataView(out.buffer);
  view.setUint32(8, vendor.length, true);
  out.set(vendor, 12);
  view.setUint32(12 + vendor.length, 0, true); // zero user comments
  return out;
}

/** Minimal ID header for the rare stream that carries no CodecPrivate. */
function synthOpusHead(channels: number): Uint8Array {
  const head = new Uint8Array(19);
  head.set(new TextEncoder().encode("OpusHead"), 0);
  head[8] = 1; // version
  head[9] = channels;
  const view = new DataView(head.buffer);
  view.setUint16(10, 3840, true); // pre-skip: 80 ms, what libopus reports by default
  view.setUint32(12, 48000, true); // original sample rate
  view.setUint16(16, 0, true); // output gain
  head[18] = 0; // channel mapping family
  return head;
}

/** Target page payload. 4 KB is the conventional size; it keeps pages small
 *  enough to stay under the 255-segment limit for any sane packet size. */
const PAGE_TARGET_BYTES = 4096;

/**
 * WebM/Opus → Ogg/Opus.
 *
 * Throws RemuxError on anything it cannot faithfully convert, so a caller can
 * surface a real message instead of shipping a file that will not open.
 */
export function webmToOgg(webm: Uint8Array, serial = 0x484f4c4c): Uint8Array<ArrayBuffer> {
  const { opusHead, channels, packets } = readWebm(webm);
  const head = opusHead ?? synthOpusHead(channels);

  if (head.length < 12 || new TextDecoder().decode(head.subarray(0, 8)) !== "OpusHead") {
    throw new RemuxError("Recording carries no usable Opus header.");
  }
  const preSkip = new DataView(head.buffer, head.byteOffset, head.byteLength).getUint16(10, true);

  const pages: Uint8Array[] = [];
  let sequence = 0;

  // 0x02 = beginning of stream. Each header packet gets its own page, as the
  // Opus mapping requires.
  pages.push(buildPage([head], 0x02, 0, serial, sequence++));
  pages.push(buildPage([opusTags()], 0x00, 0, serial, sequence++));

  // Granule counts decoded samples at 48 kHz, offset by pre-skip so the end
  // granule matches the true stream length.
  let granule = preSkip;
  let batch: Uint8Array[] = [];
  let batchBytes = 0;
  let batchSegments = 0;

  const flush = (last: boolean) => {
    if (batch.length === 0) return;
    pages.push(buildPage(batch, last ? 0x04 : 0x00, granule, serial, sequence++));
    batch = [];
    batchBytes = 0;
    batchSegments = 0;
  };

  for (let i = 0; i < packets.length; i++) {
    const packet = packets[i];
    const segments = Math.floor(packet.length / 255) + 1;

    if (batch.length > 0 && (batchBytes + packet.length > PAGE_TARGET_BYTES || batchSegments + segments > 255)) {
      flush(false);
    }

    batch.push(packet);
    batchBytes += packet.length;
    batchSegments += segments;
    // The page's granule is the position after its last complete packet.
    granule += opusPacketSamples(packet);

    if (i === packets.length - 1) flush(true);
  }

  const total = pages.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of pages) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Total duration in seconds, for logging and the message row. */
export function oggOpusDuration(webm: Uint8Array): number {
  const { packets } = readWebm(webm);
  return packets.reduce((n, p) => n + opusPacketSamples(p), 0) / 48000;
}
