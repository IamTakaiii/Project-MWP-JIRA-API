# JIRA Worklog Backend API

Production-grade backend service for JIRA Worklog management built with **Elysia.js** and **Bun**.

## Features

- 🚀 **High Performance** - Built on Bun runtime with Elysia.js
- 📝 **Type-Safe** - Full TypeScript support with TypeBox validation
- 🔒 **Secure** - Rate limiting, CORS, and input validation
- 📊 **Observable** - Structured logging with Pino
- 🐳 **Docker Ready** - Production Dockerfile included
- ✅ **Health Checks** - Kubernetes-ready health endpoints

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) v1.1+

### Installation

```bash
# Install dependencies
bun install

# Start development server
bun run dev

# Start production server
bun run start
```

### Environment Variables

Create a `.env` file (see `.env.example`):

```env
PORT=3001
HOST=0.0.0.0
NODE_ENV=development
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
LOG_LEVEL=info
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

## API Endpoints

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Full health status |
| GET | `/api/health/live` | Liveness probe |
| GET | `/api/health/ready` | Readiness probe |

### Worklog

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/worklog` | Create worklog |
| PUT | `/api/worklog` | Update worklog |
| DELETE | `/api/worklog` | Delete worklog |
| POST | `/api/worklog/history` | Get worklog history |

### Tasks

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/my-tasks` | Search assigned tasks |

## Request Format

All worklog endpoints require JIRA credentials in the request body:

```json
{
  "jiraUrl": "https://your-company.atlassian.net",
  "email": "your-email@example.com",
  "apiToken": "your-api-token",
  // ... endpoint-specific fields
}
```

### Create Worklog

```bash
curl -X POST http://localhost:3001/api/worklog \
  -H "Content-Type: application/json" \
  -d '{
    "jiraUrl": "https://company.atlassian.net",
    "email": "user@example.com",
    "apiToken": "your-token",
    "taskId": "PROJECT-123",
    "payload": {
      "timeSpent": "1h",
      "started": "2024-01-15T09:00:00.000+0700"
    }
  }'
```

### Search Tasks

```bash
curl -X POST http://localhost:3001/api/my-tasks \
  -H "Content-Type: application/json" \
  -d '{
    "jiraUrl": "https://company.atlassian.net",
    "email": "user@example.com",
    "apiToken": "your-token",
    "searchText": "bug",
    "status": "In Progress"
  }'
```

## Docker Deployment

### Build and Run

```bash
# Build image
docker build -t jira-worklog-api .

# Run container
docker run -p 3001:3001 \
  -e CORS_ORIGINS=http://localhost:5173 \
  jira-worklog-api
```

### Docker Compose

```bash
docker-compose up -d
```

## Project Structure

```
backend/
├── src/
│   ├── config/          # Environment configuration
│   ├── lib/             # Utilities (logger, errors)
│   ├── middleware/      # Elysia middleware
│   ├── routes/          # API route handlers
│   ├── services/        # Business logic
│   ├── types/           # TypeScript types & schemas
│   └── index.ts         # Application entry point
├── Dockerfile
├── docker-compose.yml
├── package.json
└── tsconfig.json
```

## Development

```bash
# Type checking
bun run typecheck

# Linting
bun run lint

# Run tests
bun test
```

## Rate Limiting

Default limits:
- **100 requests** per **60 seconds** per IP
- Configure via `RATE_LIMIT_*` environment variables

Response headers:
- `X-RateLimit-Limit`: Max requests allowed
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Unix timestamp when limit resets

## Error Handling

All errors follow a consistent format:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": "..."
  }
}
```

Error codes:
- `VALIDATION_ERROR` (400)
- `AUTHENTICATION_ERROR` (401)
- `NOT_FOUND` (404)
- `RATE_LIMIT_ERROR` (429)
- `EXTERNAL_SERVICE_ERROR` (502)
- `INTERNAL_ERROR` (500)

## License

MIT
