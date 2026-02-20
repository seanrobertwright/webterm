/**
 * Binary message encoding/decoding for WebTerm WebSocket protocol
 * Format: [type:1][paneIdLength:1][paneId:N][payload:M]
 */

import { Buffer } from 'node:buffer';

/** Binary message type codes */
export const MessageType = {
  /** Terminal input: client → server */
  INPUT: 0x01,
  /** Terminal output: server → client */
  OUTPUT: 0x02,
} as const;

export type MessageTypeCode = (typeof MessageType)[keyof typeof MessageType];

/** Decoded binary message structure */
export interface DecodedBinaryMessage {
  type: MessageTypeCode;
  paneId: string;
  payload: Uint8Array;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * Encode a binary message for terminal I/O
 * @param type - Message type (INPUT or OUTPUT)
 * @param paneId - Target pane UUID
 * @param payload - Raw terminal data
 * @returns Encoded binary message as Uint8Array
 */
export function encodeBinaryMessage(
  type: MessageTypeCode,
  paneId: string,
  payload: Uint8Array
): Uint8Array {
  const paneIdBytes = textEncoder.encode(paneId);
  
  if (paneIdBytes.length > 255) {
    throw new Error(`Pane ID too long: ${paneIdBytes.length} bytes (max 255)`);
  }
  
  const message = new Uint8Array(2 + paneIdBytes.length + payload.length);
  message[0] = type;
  message[1] = paneIdBytes.length;
  message.set(paneIdBytes, 2);
  message.set(payload, 2 + paneIdBytes.length);
  
  return message;
}

/**
 * Decode a binary message from raw WebSocket data
 * @param data - Raw binary data
 * @returns Decoded message with type, paneId, and payload
 */
export function decodeBinaryMessage(data: Uint8Array | ArrayBuffer | Buffer): DecodedBinaryMessage {
  // Normalize input to Uint8Array
  let bytes: Uint8Array;
  // Check Buffer first since Buffer extends Uint8Array
  if (Buffer.isBuffer(data)) {
    bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  } else if (data instanceof Uint8Array) {
    bytes = data;
  } else if (data instanceof ArrayBuffer) {
    bytes = new Uint8Array(data);
  } else {
    throw new Error('Invalid binary message format');
  }
  
  if (bytes.length < 2) {
    throw new Error('Binary message too short');
  }
  
  const type = bytes[0] as MessageTypeCode;
  const paneIdLength = bytes[1] ?? 0;
  
  if (bytes.length < 2 + paneIdLength) {
    throw new Error('Binary message truncated: paneId incomplete');
  }
  
  const paneId = textDecoder.decode(bytes.slice(2, 2 + paneIdLength));
  const payload = bytes.slice(2 + paneIdLength);
  
  return { type, paneId, payload };
}

/**
 * Check if a message type code is valid
 */
export function isValidMessageType(type: number): type is MessageTypeCode {
  return type === MessageType.INPUT || type === MessageType.OUTPUT;
}

/**
 * Create an output message to send terminal output to client
 */
export function createOutputMessage(paneId: string, data: Uint8Array): Uint8Array {
  return encodeBinaryMessage(MessageType.OUTPUT, paneId, data);
}

/**
 * Parse input message data from client
 */
export function parseInputMessage(data: Uint8Array | ArrayBuffer | Buffer): {
  paneId: string;
  payload: Uint8Array;
} {
  const decoded = decodeBinaryMessage(data);
  
  if (decoded.type !== MessageType.INPUT) {
    throw new Error(`Expected INPUT message type, got ${decoded.type}`);
  }
  
  return {
    paneId: decoded.paneId,
    payload: decoded.payload,
  };
}
