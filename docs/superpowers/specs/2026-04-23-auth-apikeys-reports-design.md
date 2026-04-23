# ABAP Code Generator — Auth, API Keys & Reports Design

**Date:** 2026-04-23  
**Status:** Approved

---

## Overview

Extend the existing React + Vite ABAP Code Generator with:
1. User registration and login (full profile)
2. Per-user API key management (Gemini + OpenAI)
3. Per-user report history with view, re-use, and delete

Persistence uses a Node.js + Express + SQLite backend added as a `server/` folder alongside the existing frontend. The frontend and backend run side-by-side in development; Vite proxies `/api/*` requests to Express.

---

## Architecture

### Structure

```
ABAP-Code-generator-main/
├── server/                   ← NEW
│   ├── index.js              ← Express entry point
│   ├── db.js                 ← SQLite setup + schema migrations
│   ├── middleware/
│   │   └── auth.js           ← JWT verification middleware
│   └── routes/
│       ├── auth.js           ← /api/auth/*
│       ├── apikeys.js        ← /api/apikeys/*
│       └── reports.js        ← /api/reports/*
├── pages/                    ← NEW (root level, alongside existing App.tsx)
│   ├── AuthPage.tsx          ← Register / Login
│   ├── ApiSetupPage.tsx      ← API key configuration
│   ├── GeneratorPage.tsx     ← Existing generator (extracted from App.tsx)
│   └── ReportsPage.tsx       ← Report history
├── hooks/                    ← NEW (root level)
│   └── useAuth.ts            ← Auth state + JWT helpers
├── App.tsx                   ← Route orchestrator (replaces existing generator logic)
├── components/
│   ├── Header.tsx            ← Shared header (replaces existing unused one)
│   └── Icon.tsx              ← Existing, unchanged
├── types.ts                  ← Extended with new types
├── package.json              ← Add server deps + concurrently dev script
└── vite.config.ts            ← Add /api proxy to Express port
```

### Dev startup

`npm run dev` starts both servers via `concurrently`:
- Vite on port 5173 (frontend)
- Express on port 3001 (backend)
- Vite proxies `/api/*` → `http://localhost:3001`

---

## Database Schema (SQLite)

### `users`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| first_name | TEXT NOT NULL | |
| last_name | TEXT NOT NULL | |
| email | TEXT UNIQUE NOT NULL | |
| username | TEXT UNIQUE NOT NULL | |
| password_hash | TEXT NOT NULL | bcrypt, cost factor 12 |
| created_at | DATETIME DEFAULT CURRENT_TIMESTAMP | |

### `api_keys`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| user_id | INTEGER NOT NULL FK → users.id | |
| provider | TEXT NOT NULL | `'gemini'` or `'openai'` |
| key_encrypted | TEXT NOT NULL | AES-256-GCM, server-side secret |
| updated_at | DATETIME DEFAULT CURRENT_TIMESTAMP | |

Unique constraint: `(user_id, provider)` — one key per provider per user.

### `reports`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| user_id | INTEGER NOT NULL FK → users.id | |
| program_name | TEXT NOT NULL | |
| description | TEXT | |
| input_parameters | TEXT | JSON array of InputParameter objects |
| tables | TEXT | JSON array of Table objects |
| output_description | TEXT | |
| generated_code | TEXT NOT NULL | |
| model | TEXT NOT NULL | e.g. `gemini-2.0-flash`, `gpt-4o` |
| generation_profile | TEXT NOT NULL | Balanced / Creative / Concise / Well-Commented |
| created_at | DATETIME DEFAULT CURRENT_TIMESTAMP | |

---

## Backend API

All routes except `/api/auth/*` require `Authorization: Bearer <jwt>` header. The `auth` middleware verifies the token and sets `req.userId`.

### Auth (`/api/auth`)

**POST `/api/auth/register`**
```json
Body: { first_name, last_name, email, username, password }
Response 201: { token, user: { id, first_name, last_name, email, username } }
Response 409: { error: "Email or username already taken" }
```

**POST `/api/auth/login`**
```json
Body: { username, password }  // username OR email accepted
Response 200: { token, user: { id, first_name, last_name, email, username } }
Response 401: { error: "Invalid credentials" }
```

### API Keys (`/api/apikeys`)

**GET `/api/apikeys`**
```json
Response 200: { gemini: true, openai: false }  // presence only, never returns key values
```

**POST `/api/apikeys`**
```json
Body: { provider: "gemini" | "openai", key: "AIzaSy..." }
Response 200: { success: true }
```

**DELETE `/api/apikeys/:provider`**
```json
Response 200: { success: true }
```

**GET `/api/apikeys/decrypt/:provider`** ← used only by frontend at generation time
```json
Response 200: { key: "AIzaSy..." }  // decrypted key, only sent over HTTPS in production
```

### Reports (`/api/reports`)

**GET `/api/reports`**
```json
Response 200: [ { id, program_name, description, model, generation_profile, created_at }, ... ]
// List view omits generated_code and full JSON blobs for performance
```

**GET `/api/reports/:id`**
```json
Response 200: { id, program_name, description, input_parameters, tables, output_description,
                generated_code, model, generation_profile, created_at }
```

**POST `/api/reports`**
```json
Body: { program_name, description, input_parameters, tables, output_description,
        generated_code, model, generation_profile }
Response 201: { id }
```

**DELETE `/api/reports/:id`**
```json
Response 200: { success: true }
Response 403: if report belongs to a different user
```

---

## Frontend Pages

### App.tsx — Route Orchestrator

Manages a `page` state: `'auth' | 'api-setup' | 'generator' | 'reports'`.

**On mount:**
1. Read JWT from localStorage. If missing/expired → `'auth'`.
2. Call `GET /api/apikeys`. If both gemini and openai are absent AND it's the user's first login flag → `'api-setup'`.
3. Otherwise → `'generator'`.

First-login flag: stored in localStorage as `abap_firstLogin` after register, cleared after API setup page is shown once.

### AuthPage (`pages/AuthPage.tsx`)

- Two tabs: Register / Login
- Register fields: First Name, Last Name, Email, Username, Password
- Login fields: Username (or email), Password
- On success: store JWT + user object in localStorage, dispatch to next page
- Validation: all required fields filled, email format, password ≥ 8 chars, passwords match (register only)

### ApiSetupPage (`pages/ApiSetupPage.tsx`)

- Two provider cards: Gemini (recommended badge) and OpenAI
- Each has a password-type input with show/hide toggle
- "Save Keys & Continue" → POST each non-empty key to `/api/apikeys`, then navigate to generator
- "Skip for now" → navigate directly to generator
- Can also be reached from the header settings icon at any time (update keys)

### GeneratorPage (`pages/GeneratorPage.tsx`)

Existing `App.tsx` generator logic, extracted into its own page component.

Accepts an optional `initialState` prop of type `ReportSpec` (program name, description, input parameters, tables, output description, model, generation profile). When provided (from a Re-use action in ReportsPage), the form is pre-populated with those values. If the saved `model` is not found in the current `LLM_MODELS` list, fall back to `LLM_MODELS[0]`.

Additional changes:
- On generate: fetch decrypted key from `/api/apikeys/decrypt/:provider` before calling the AI SDK
- On successful generation: POST to `/api/reports` to save the report; `input_parameters` and `tables` are serialised as JSON strings in the POST body and parsed back on read
- Show a brief "Report saved" toast after saving

### ReportsPage (`pages/ReportsPage.tsx`)

- Fetches `GET /api/reports` on mount
- Search bar filters by program name / description client-side
- Report cards show: program name, description (truncated), model badge, profile badge, relative timestamp
- **View:** opens a modal with the full generated code (copy button included)
- **Re-use:** fetches `GET /api/reports/:id` for full detail, sets it as `initialState` on GeneratorPage, and navigates there
- **Delete:** confirm dialog → `DELETE /api/reports/:id` → remove from list

### Header (`components/Header.tsx`)

Shown on all pages after login. Contains:
- App title / logo (left)
- "My Reports" button → navigate to ReportsPage
- Settings (key icon) → navigate to ApiSetupPage
- User avatar (initials fallback) + username (right)
- Logout button → clear localStorage JWT, navigate to AuthPage

---

## Auth & Security

- **Passwords:** hashed with bcrypt (cost factor 12) server-side; plain text never stored or logged
- **JWT:** signed with `JWT_SECRET` env var, 7-day expiry
- **API keys:** encrypted with AES-256-GCM using `ENCRYPTION_KEY` env var (32-byte hex) before storing; decrypted only on explicit `/decrypt` request
- **CORS:** in dev, Express allows only `http://localhost:5173`; in production, same-origin (Express serves the built app)

---

## Environment Variables

**server/.env**
```
PORT=3001
JWT_SECRET=<random 64-char hex>
ENCRYPTION_KEY=<random 32-byte hex>
DB_PATH=./data/abap_generator.db
```

The existing `.env.local` (Gemini API key) is no longer used at startup — keys are fetched from the backend at generation time. The file can be kept as a fallback for unauthenticated dev use.

---

## New npm Dependencies

**Root `package.json` (frontend dev):**
- `concurrently` — run Vite + Express together

**server/package.json (or root):**
- `express` — HTTP server
- `better-sqlite3` — synchronous SQLite driver, no setup required
- `bcryptjs` — password hashing (pure JS, no native bindings)
- `jsonwebtoken` — JWT sign/verify
- `cors` — CORS middleware
- `dotenv` — env vars

---

## Out of Scope

- Email verification
- Password reset flow
- OAuth / social login
- Rate limiting (nice-to-have, not in this iteration)
- Production deployment / Docker
