# WebSocket Protocol: WebTerm Terminal I/O

**Version**: 1.0.0  
**Transport**: WebSocket over HTTP  
**Endpoint**: `ws://localhost:{port}/ws?sessionId={sessionId}`

---

## Connection

### Handshake

```
GET /ws?sessionId={sessionId} HTTP/1.1
Host: localhost:3000
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: ...
Sec-WebSocket-Version: 13
```

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sessionId` | string (UUID) | No | Resume existing session |

### Connection Response

On successful connection, server sends:

```json
{
  "type": "connected",
  "payload": {
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "session": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Default Session",
      "createdAt": 1739800000000,
      "updatedAt": 1739800000000,
      "activeWindowId": "660f9500-f39c-52e5-b827-557766551111"
    }
  }
}
```

---

## Message Format

### Binary Messages (Terminal I/O)

Used for high-throughput terminal input/output to minimize parsing overhead.

**Format**: `[type:1][paneIdLength:1][paneId:N][payload:M]`

| Byte(s) | Field | Description |
|---------|-------|-------------|
| 0 | type | Message type (see below) |
| 1 | paneIdLength | Length of paneId string (max 36 for UUID) |
| 2..N+1 | paneId | Pane identifier (UTF-8 string) |
| N+2..end | payload | Raw terminal data |

**Binary Message Types**:

| Type | Code | Direction | Description |
|------|------|-----------|-------------|
| INPUT | 0x01 | Client → Server | Keyboard input to PTY |
| OUTPUT | 0x02 | Server → Client | PTY output to terminal |

### JSON Messages (Control)

Used for structured control messages.

**Format**: Standard JSON text frame

```typescript
interface JsonMessage {
  type: string;
  payload: object;
}
```

---

## Client → Server Messages

### input (Binary: 0x01)

Send keyboard input to a terminal pane.

**Binary Format**: `[0x01][paneIdLen][paneId][keyData]`

**Example** (hex): `01 24 <36-byte-uuid> 6C 73 0D` (sends "ls\r")

---

### resize

Resize a terminal pane.

```json
{
  "type": "resize",
  "payload": {
    "paneId": "550e8400-e29b-41d4-a716-446655440000",
    "cols": 120,
    "rows": 40
  }
}
```

---

### create

Create a new pane in a window.

```json
{
  "type": "create",
  "payload": {
    "windowId": "660f9500-f39c-52e5-b827-557766551111",
    "shell": "powershell",
    "cwd": "C:\\Users\\username"
  }
}
```

**Shell Values**: `powershell`, `pwsh`, `cmd`, `bash`, `zsh`, `sh`, `default`

> **Note**: See [data-model.md](../data-model.md) Pane entity for canonical shell enum.

---

### close

Close a pane.

```json
{
  "type": "close",
  "payload": {
    "paneId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

---

### split

Split an existing pane.

```json
{
  "type": "split",
  "payload": {
    "paneId": "550e8400-e29b-41d4-a716-446655440000",
    "direction": "h",
    "shell": "bash"
  }
}
```

**Direction Values**: `h` (horizontal), `v` (vertical)

---

### focus

Notify server of focused pane (for broadcast mode tracking).

```json
{
  "type": "focus",
  "payload": {
    "paneId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

---

### broadcast

Toggle broadcast mode for input.

```json
{
  "type": "broadcast",
  "payload": {
    "enabled": true,
    "paneIds": [
      "550e8400-e29b-41d4-a716-446655440000",
      "660f9500-f39c-52e5-b827-557766551111"
    ]
  }
}
```

---

## Server → Client Messages

### output (Binary: 0x02)

Terminal output from PTY.

**Binary Format**: `[0x02][paneIdLen][paneId][outputData]`

---

### created

Pane created successfully.

```json
{
  "type": "created",
  "payload": {
    "pane": {
      "id": "770g0611-g40d-63f6-c938-668877662222",
      "windowId": "660f9500-f39c-52e5-b827-557766551111",
      "shell": "bash",
      "cwd": "/home/user",
      "cols": 80,
      "rows": 24,
      "connectionState": "connected",
      "exitCode": null,
      "createdAt": 1739800000000
    },
    "layout": {
      "type": "horizontal",
      "sizes": [0.5, 0.5],
      "children": [
        { "type": "leaf", "paneId": "550e8400-e29b-41d4-a716-446655440000" },
        { "type": "leaf", "paneId": "770g0611-g40d-63f6-c938-668877662222" }
      ]
    }
  }
}
```

---

### closed

Pane closed.

```json
{
  "type": "closed",
  "payload": {
    "paneId": "550e8400-e29b-41d4-a716-446655440000",
    "layout": {
      "type": "leaf",
      "paneId": "770g0611-g40d-63f6-c938-668877662222"
    }
  }
}
```

---

### exited

PTY process exited.

```json
{
  "type": "exited",
  "payload": {
    "paneId": "550e8400-e29b-41d4-a716-446655440000",
    "exitCode": 0
  }
}
```

---

### error

Error occurred.

```json
{
  "type": "error",
  "payload": {
    "paneId": "550e8400-e29b-41d4-a716-446655440000",
    "code": "PTY_SPAWN_FAILED",
    "message": "Failed to spawn shell: powershell.exe not found"
  }
}
```

**Error Codes**:

| Code | Description |
|------|-------------|
| `PTY_SPAWN_FAILED` | Failed to spawn PTY process |
| `PANE_NOT_FOUND` | Referenced pane does not exist |
| `WINDOW_NOT_FOUND` | Referenced window does not exist |
| `SESSION_NOT_FOUND` | Referenced session does not exist |
| `INVALID_MESSAGE` | Message parsing failed |
| `MAX_PANES_EXCEEDED` | Cannot create more panes (limit: 16) |

---

### connected

Connection established (see Connection section).

---

### reconnected

Session reconnected after disconnect.

```json
{
  "type": "reconnected",
  "payload": {
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "missedOutputPanes": ["550e8400-e29b-41d4-a716-446655440000"]
  }
}
```

Note: Missed output will follow as binary OUTPUT messages.

---

## Heartbeat

- Server sends WebSocket PING every 30 seconds
- Client must respond with PONG within 10 seconds
- Connection terminated if PONG not received

---

## Flow Control

When server's output buffer exceeds high water mark (64KB):

1. Server pauses PTY output
2. Server sends flow control message:
   ```json
   { "type": "flow", "payload": { "paneId": "...", "paused": true } }
   ```
3. When buffer drains below low water mark (16KB):
   ```json
   { "type": "flow", "payload": { "paneId": "...", "paused": false } }
   ```
