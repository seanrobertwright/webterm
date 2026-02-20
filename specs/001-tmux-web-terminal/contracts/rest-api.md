# REST API: WebTerm Session Management

**Version**: 1.0.0  
**Base URL**: `http://localhost:{port}/api/v1`  
**Content-Type**: `application/json`

---

## Sessions

### List Sessions

Retrieve all saved sessions.

**Request**

```
GET /sessions
```

**Response** `200 OK`

```json
{
  "sessions": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Development",
      "createdAt": 1739800000000,
      "updatedAt": 1739850000000,
      "windowCount": 3,
      "paneCount": 7
    }
  ]
}
```

---

### Get Session

Retrieve a specific session with full details.

**Request**

```
GET /sessions/{sessionId}
```

**Response** `200 OK`

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Development",
  "createdAt": 1739800000000,
  "updatedAt": 1739850000000,
  "activeWindowId": "660f9500-f39c-52e5-b827-557766551111",
  "windows": [
    {
      "id": "660f9500-f39c-52e5-b827-557766551111",
      "name": "main",
      "index": 0,
      "layout": { "type": "leaf", "paneId": "..." },
      "panes": [
        {
          "id": "770g0611-g40d-63f6-c938-668877662222",
          "shell": "bash",
          "cwd": "/home/user/project",
          "cols": 120,
          "rows": 40
        }
      ]
    }
  ]
}
```

**Response** `404 Not Found`

```json
{
  "error": {
    "code": "SESSION_NOT_FOUND",
    "message": "Session with id '...' not found"
  }
}
```

---

### Create Session

Create a new session.

**Request**

```
POST /sessions
Content-Type: application/json

{
  "name": "My Session"
}
```

**Response** `201 Created`

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "My Session",
  "createdAt": 1739800000000,
  "updatedAt": 1739800000000,
  "activeWindowId": null
}
```

**Response** `400 Bad Request`

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Session name is required",
    "details": {
      "field": "name",
      "constraint": "required"
    }
  }
}
```

**Response** `409 Conflict`

```json
{
  "error": {
    "code": "DUPLICATE_NAME",
    "message": "Session with name 'My Session' already exists"
  }
}
```

---

### Update Session

Update session properties.

**Request**

```
PATCH /sessions/{sessionId}
Content-Type: application/json

{
  "name": "Renamed Session"
}
```

**Response** `200 OK`

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Renamed Session",
  "createdAt": 1739800000000,
  "updatedAt": 1739860000000,
  "activeWindowId": "..."
}
```

---

### Delete Session

Delete a saved session.

**Request**

```
DELETE /sessions/{sessionId}
```

**Response** `204 No Content`

**Response** `404 Not Found`

---

### Save Current Session

Save the current active session state.

**Request**

```
POST /sessions/{sessionId}/save
```

**Response** `200 OK`

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Development",
  "updatedAt": 1739870000000,
  "windowCount": 3,
  "paneCount": 7
}
```

---

## Windows

### Create Window

Create a new window in a session.

**Request**

```
POST /sessions/{sessionId}/windows
Content-Type: application/json

{
  "name": "logs"
}
```

**Response** `201 Created`

```json
{
  "id": "660f9500-f39c-52e5-b827-557766551111",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "name": "logs",
  "index": 1,
  "layout": { "type": "leaf", "paneId": "770g0611-g40d-63f6-c938-668877662222" },
  "createdAt": 1739880000000
}
```

---

### Update Window

Update window properties.

**Request**

```
PATCH /sessions/{sessionId}/windows/{windowId}
Content-Type: application/json

{
  "name": "server-logs",
  "index": 0
}
```

**Response** `200 OK`

---

### Delete Window

Delete a window and all its panes.

**Request**

```
DELETE /sessions/{sessionId}/windows/{windowId}
```

**Response** `204 No Content`

---

## System

### Get System Info

Get server and shell information.

**Request**

```
GET /system/info
```

**Response** `200 OK`

```json
{
  "version": "1.0.0",
  "platform": "win32",
  "shells": [
    { "id": "powershell", "name": "Windows PowerShell", "path": "powershell.exe", "available": true },
    { "id": "pwsh", "name": "PowerShell Core", "path": "pwsh.exe", "available": true },
    { "id": "cmd", "name": "Command Prompt", "path": "cmd.exe", "available": true },
    { "id": "bash", "name": "Bash", "path": "C:\\Program Files\\Git\\bin\\bash.exe", "available": true }
  ],
  "defaultShell": "powershell",
  "maxPanes": 16,
  "scrollbackLines": 10000
}
```

---

### Health Check

Check server health.

**Request**

```
GET /health
```

**Response** `200 OK`

```json
{
  "status": "healthy",
  "uptime": 3600,
  "activeSessions": 1,
  "activePanes": 4,
  "memoryUsage": {
    "heapUsed": 52428800,
    "heapTotal": 67108864
  }
}
```

---

## Error Responses

All error responses follow this format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {}
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `SESSION_NOT_FOUND` | 404 | Session does not exist |
| `WINDOW_NOT_FOUND` | 404 | Window does not exist |
| `PANE_NOT_FOUND` | 404 | Pane does not exist |
| `DUPLICATE_NAME` | 409 | Name already exists |
| `MAX_WINDOWS_EXCEEDED` | 422 | Cannot create more windows |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Rate Limiting

No rate limiting for local deployment.

---

## CORS

CORS enabled for `localhost` origins only:

```
Access-Control-Allow-Origin: http://localhost:*
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type
```
