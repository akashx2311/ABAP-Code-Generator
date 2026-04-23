# Auth, API Keys & Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user registration/login, per-user encrypted API key storage, and per-user report history to the ABAP Code Generator, backed by a Node.js + Express + SQLite server running alongside the existing Vite frontend.

**Architecture:** A `server/` folder holds the Express app, SQLite schema, JWT middleware, and route modules. The existing Vite frontend is extended with a `pages/` folder (AuthPage, ApiSetupPage, GeneratorPage, ReportsPage) and a `hooks/` folder. `App.tsx` becomes a lightweight page router. Vite proxies `/api/*` to Express on port 3001 in dev.

**Tech Stack:** Express 4, better-sqlite3, bcryptjs, jsonwebtoken, Node.js built-in `crypto` (AES-256-GCM), React 19, TypeScript, Tailwind CSS (CDN), concurrently

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `server/index.js` | Create | Express app, middleware wiring, server start |
| `server/db.js` | Create | SQLite connection + schema creation |
| `server/cryptoUtils.js` | Create | AES-256-GCM encrypt/decrypt for API keys |
| `server/middleware/auth.js` | Create | JWT verification, sets `req.userId` |
| `server/routes/auth.js` | Create | POST /api/auth/register, POST /api/auth/login |
| `server/routes/apikeys.js` | Create | GET/POST/DELETE /api/apikeys + GET /api/apikeys/decrypt/:provider |
| `server/routes/reports.js` | Create | GET/POST/DELETE /api/reports |
| `server/.env` | Create | PORT, JWT_SECRET, ENCRYPTION_KEY, DB_PATH |
| `types.ts` | Modify | Add AppUser, ReportListItem, ReportDetail, ReportSpec |
| `hooks/useAuth.ts` | Create | Auth state management + localStorage persistence |
| `components/Header.tsx` | Replace | Shared header: nav buttons, user initials avatar, logout |
| `pages/AuthPage.tsx` | Create | Register/Login tabs |
| `pages/ApiSetupPage.tsx` | Create | Gemini + OpenAI key cards |
| `pages/GeneratorPage.tsx` | Create | Existing generator logic extracted + backend key fetch + report save |
| `pages/ReportsPage.tsx` | Create | Report list with view modal, re-use, delete |
| `App.tsx` | Replace | Page router only — no generator logic |
| `package.json` | Modify | Add server deps, concurrently, dev scripts |
| `vite.config.ts` | Modify | Add `/api` proxy to port 3001 |

---

## Task 1: Install dependencies and set up dev environment

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Create: `server/.env`
- Modify: `.gitignore`

- [ ] **Step 1: Install all server and dev dependencies**

```bash
npm install express better-sqlite3 bcryptjs jsonwebtoken cors dotenv
npm install --save-dev concurrently
```

Expected: `node_modules/express`, `node_modules/better-sqlite3`, etc. appear. No errors.

- [ ] **Step 2: Update `package.json` scripts**

Open `package.json` and replace the `"scripts"` block with:

```json
"scripts": {
  "dev": "concurrently \"vite\" \"node --watch server/index.js\"",
  "dev:frontend": "vite",
  "dev:backend": "node --watch server/index.js",
  "build": "vite build",
  "preview": "vite preview"
}
```

- [ ] **Step 3: Add `/api` proxy to `vite.config.ts`**

Open `vite.config.ts` and add a `server.proxy` block:

```typescript
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        },
      },
      server: {
        proxy: {
          '/api': 'http://localhost:3001',
        },
      },
    };
});
```

- [ ] **Step 4: Create `server/.env`**

```bash
mkdir -p server/data server/middleware server/routes
```

Create `server/.env` with these contents (generate random hex values):

```
PORT=3001
JWT_SECRET=b3f4a8c2d1e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1
ENCRYPTION_KEY=a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2
DB_PATH=./server/data/abap_generator.db
```

> Note: `ENCRYPTION_KEY` must be exactly 32 bytes = 64 hex chars. `JWT_SECRET` can be any length; 64 hex chars is fine.

- [ ] **Step 5: Update `.gitignore`**

Add these lines to `.gitignore`:

```
server/.env
server/data/
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vite.config.ts .gitignore
git commit -m "chore: install backend deps and configure dev environment"
```

---

## Task 2: Backend — database setup

**Files:**
- Create: `server/db.js`

- [ ] **Step 1: Create `server/db.js`**

```javascript
import 'dotenv/config';
import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

const dbPath = process.env.DB_PATH || './server/data/abap_generator.db';
const dir = dirname(dbPath);
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name      TEXT NOT NULL,
    last_name       TEXT NOT NULL,
    email           TEXT UNIQUE NOT NULL,
    username        TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider      TEXT NOT NULL,
    key_encrypted TEXT NOT NULL,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, provider)
  );

  CREATE TABLE IF NOT EXISTS reports (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    program_name      TEXT NOT NULL,
    description       TEXT,
    input_parameters  TEXT,
    tables            TEXT,
    output_description TEXT,
    generated_code    TEXT NOT NULL,
    model             TEXT NOT NULL,
    generation_profile TEXT NOT NULL,
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

export default db;
```

- [ ] **Step 2: Verify schema creation**

```bash
node -e "import('./server/db.js').then(() => console.log('DB OK'))"
```

Expected output: `DB OK` and `server/data/abap_generator.db` created.

- [ ] **Step 3: Commit**

```bash
git add server/db.js
git commit -m "feat: add SQLite database setup and schema"
```

---

## Task 3: Backend — crypto utils and JWT middleware

**Files:**
- Create: `server/cryptoUtils.js`
- Create: `server/middleware/auth.js`

- [ ] **Step 1: Create `server/cryptoUtils.js`**

```javascript
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function getKey() {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) throw new Error('ENCRYPTION_KEY must be 64 hex chars (32 bytes)');
  return Buffer.from(hex, 'hex');
}

export function encrypt(text) {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decrypt(data) {
  const key = getKey();
  const buf = Buffer.from(data, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
```

- [ ] **Step 2: Verify encrypt/decrypt round-trip**

```bash
node -e "
import('./server/cryptoUtils.js').then(({ encrypt, decrypt }) => {
  const original = 'AIzaSy-test-key-12345';
  const enc = encrypt(original);
  const dec = decrypt(enc);
  console.assert(dec === original, 'round-trip failed');
  console.log('cryptoUtils OK:', dec === original);
});
"
```

Expected: `cryptoUtils OK: true`

- [ ] **Step 3: Create `server/middleware/auth.js`**

```javascript
import jwt from 'jsonwebtoken';

export default function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed token' });
  }
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add server/cryptoUtils.js server/middleware/auth.js
git commit -m "feat: add AES-256-GCM crypto utils and JWT auth middleware"
```

---

## Task 4: Backend — auth routes

**Files:**
- Create: `server/routes/auth.js`

- [ ] **Step 1: Create `server/routes/auth.js`**

```javascript
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db.js';

const router = Router();

router.post('/register', async (req, res) => {
  const { first_name, last_name, email, username, password } = req.body;
  if (!first_name || !last_name || !email || !username || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  try {
    const password_hash = await bcrypt.hash(password, 12);
    const result = db.prepare(
      'INSERT INTO users (first_name, last_name, email, username, password_hash) VALUES (?, ?, ?, ?, ?)'
    ).run(first_name, last_name, email.toLowerCase(), username.toLowerCase(), password_hash);

    const user = { id: result.lastInsertRowid, first_name, last_name, email, username };
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Email or username already taken' });
    }
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  const user = db.prepare(
    'SELECT * FROM users WHERE username = ? OR email = ?'
  ).get(username.toLowerCase(), username.toLowerCase());

  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const { password_hash, ...safeUser } = user;
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: safeUser });
});

export default router;
```

- [ ] **Step 2: Commit**

```bash
git add server/routes/auth.js
git commit -m "feat: add auth routes (register + login)"
```

---

## Task 5: Backend — API keys routes

**Files:**
- Create: `server/routes/apikeys.js`

- [ ] **Step 1: Create `server/routes/apikeys.js`**

```javascript
import { Router } from 'express';
import db from '../db.js';
import authMiddleware from '../middleware/auth.js';
import { encrypt, decrypt } from '../cryptoUtils.js';

const router = Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT provider FROM api_keys WHERE user_id = ?').all(req.userId);
  const result = { gemini: false, openai: false };
  rows.forEach(r => { result[r.provider] = true; });
  res.json(result);
});

router.post('/', (req, res) => {
  const { provider, key } = req.body;
  if (!['gemini', 'openai'].includes(provider) || !key?.trim()) {
    return res.status(400).json({ error: 'provider must be "gemini" or "openai" and key must not be empty' });
  }
  const encrypted = encrypt(key.trim());
  db.prepare(`
    INSERT INTO api_keys (user_id, provider, key_encrypted, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, provider)
    DO UPDATE SET key_encrypted = excluded.key_encrypted, updated_at = CURRENT_TIMESTAMP
  `).run(req.userId, provider, encrypted);
  res.json({ success: true });
});

router.delete('/:provider', (req, res) => {
  db.prepare('DELETE FROM api_keys WHERE user_id = ? AND provider = ?')
    .run(req.userId, req.params.provider);
  res.json({ success: true });
});

router.get('/decrypt/:provider', (req, res) => {
  const row = db.prepare('SELECT key_encrypted FROM api_keys WHERE user_id = ? AND provider = ?')
    .get(req.userId, req.params.provider);
  if (!row) return res.status(404).json({ error: 'API key not found for this provider' });
  res.json({ key: decrypt(row.key_encrypted) });
});

export default router;
```

- [ ] **Step 2: Commit**

```bash
git add server/routes/apikeys.js
git commit -m "feat: add API keys routes with AES-256-GCM encryption"
```

---

## Task 6: Backend — reports routes

**Files:**
- Create: `server/routes/reports.js`

- [ ] **Step 1: Create `server/routes/reports.js`**

```javascript
import { Router } from 'express';
import db from '../db.js';
import authMiddleware from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  const reports = db.prepare(
    'SELECT id, program_name, description, model, generation_profile, created_at FROM reports WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.userId);
  res.json(reports);
});

router.get('/:id', (req, res) => {
  const report = db.prepare('SELECT * FROM reports WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!report) return res.status(404).json({ error: 'Report not found' });
  report.input_parameters = JSON.parse(report.input_parameters || '[]');
  report.tables = JSON.parse(report.tables || '[]');
  res.json(report);
});

router.post('/', (req, res) => {
  const { program_name, description, input_parameters, tables,
          output_description, generated_code, model, generation_profile } = req.body;
  if (!program_name || !generated_code || !model || !generation_profile) {
    return res.status(400).json({ error: 'program_name, generated_code, model, and generation_profile are required' });
  }
  const result = db.prepare(`
    INSERT INTO reports
      (user_id, program_name, description, input_parameters, tables,
       output_description, generated_code, model, generation_profile)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.userId, program_name, description ?? '',
    JSON.stringify(input_parameters ?? []),
    JSON.stringify(tables ?? []),
    output_description ?? '', generated_code, model, generation_profile
  );
  res.status(201).json({ id: result.lastInsertRowid });
});

router.delete('/:id', (req, res) => {
  const report = db.prepare('SELECT id FROM reports WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!report) return res.status(403).json({ error: 'Report not found or not authorized' });
  db.prepare('DELETE FROM reports WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
```

- [ ] **Step 2: Commit**

```bash
git add server/routes/reports.js
git commit -m "feat: add reports CRUD routes"
```

---

## Task 7: Backend — Express entry point and full API smoke test

**Files:**
- Create: `server/index.js`

- [ ] **Step 1: Create `server/index.js`**

```javascript
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import apiKeyRoutes from './routes/apikeys.js';
import reportRoutes from './routes/reports.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json({ limit: '5mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/apikeys', apiKeyRoutes);
app.use('/api/reports', reportRoutes);

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
```

- [ ] **Step 2: Start the server**

```bash
node server/index.js
```

Expected: `Server running on http://localhost:3001`

- [ ] **Step 3: Smoke test register**

In a new terminal:

```bash
curl -s -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"first_name":"Jane","last_name":"Dev","email":"jane@test.com","username":"janedev","password":"password123"}' | python3 -m json.tool
```

Expected: `{ "token": "eyJ...", "user": { "id": 1, "first_name": "Jane", ... } }`

- [ ] **Step 4: Smoke test login**

```bash
curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"janedev","password":"password123"}' | python3 -m json.tool
```

Expected: same shape as register response. Copy the `token` value for the next steps.

- [ ] **Step 5: Smoke test API key save and retrieve**

```bash
# Replace TOKEN with the value from Step 4
TOKEN="<paste token here>"

# Save a Gemini key
curl -s -X POST http://localhost:3001/api/apikeys \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"provider":"gemini","key":"AIzaSy-fake-test-key"}' | python3 -m json.tool

# Check presence
curl -s http://localhost:3001/api/apikeys \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

Expected for presence check: `{ "gemini": true, "openai": false }`

- [ ] **Step 6: Commit**

```bash
git add server/index.js
git commit -m "feat: add Express server entry point"
```

---

## Task 8: Frontend — extend types and add useAuth hook

**Files:**
- Modify: `types.ts`
- Create: `hooks/useAuth.ts`

- [ ] **Step 1: Replace `types.ts` content**

```typescript
export interface InputParameter {
  id: string;
  name: string;
  type: string;
  required: boolean;
}

export type TableOperation = 'SELECT' | 'UPDATE' | 'INSERT' | 'DELETE';

export interface Table {
  id: string;
  name: string;
  operation: TableOperation;
  fields: string;
  whereClause: string;
}

export interface AppUser {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  username: string;
}

export interface AuthState {
  user: AppUser | null;
  token: string | null;
}

export interface ReportListItem {
  id: number;
  program_name: string;
  description: string;
  model: string;
  generation_profile: string;
  created_at: string;
}

export interface ReportDetail extends ReportListItem {
  input_parameters: InputParameter[];
  tables: Table[];
  output_description: string;
  generated_code: string;
}

export interface ReportSpec {
  programName: string;
  programDescription: string;
  inputParameters: InputParameter[];
  tables: Table[];
  outputDescription: string;
  model: string;
  generationProfile: string;
}
```

- [ ] **Step 2: Create `hooks/useAuth.ts`**

```bash
mkdir -p hooks
```

```typescript
import { useState, useCallback } from 'react';
import type { AppUser, AuthState } from '../types';

const STORAGE_KEY = 'abap_auth';

function loadAuth(): AuthState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { user: null, token: null };
  } catch {
    return { user: null, token: null };
  }
}

export function useAuth() {
  const [auth, setAuth] = useState<AuthState>(loadAuth);

  const login = useCallback((token: string, user: AppUser) => {
    const state: AuthState = { token, user };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    setAuth(state);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('abap_firstLogin');
    setAuth({ user: null, token: null });
  }, []);

  return { auth, login, logout };
}
```

- [ ] **Step 3: Commit**

```bash
git add types.ts hooks/useAuth.ts
git commit -m "feat: extend types and add useAuth hook"
```

---

## Task 9: Frontend — Header component

**Files:**
- Replace: `components/Header.tsx`

- [ ] **Step 1: Replace `components/Header.tsx`**

```typescript
import React from 'react';
import type { AppUser } from '../types';

type Page = 'generator' | 'reports' | 'api-setup';

interface HeaderProps {
  user: AppUser;
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({ user, currentPage, onNavigate, onLogout }) => {
  const initials = `${user.first_name[0]}${user.last_name[0]}`.toUpperCase();

  return (
    <header className="bg-white shadow-sm">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">ABAP Code Generator</h1>
        </div>
        <button
          onClick={() => onNavigate('generator')}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${currentPage === 'generator' ? 'bg-blue-100 text-blue-800 font-semibold' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          Generator
        </button>
        <button
          onClick={() => onNavigate('reports')}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${currentPage === 'reports' ? 'bg-blue-100 text-blue-800 font-semibold' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          My Reports
        </button>
        <button
          onClick={() => onNavigate('api-setup')}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${currentPage === 'api-setup' ? 'bg-blue-100 text-blue-800 font-semibold' : 'text-gray-600 hover:bg-gray-100'}`}
          title="Manage API Keys"
        >
          🔑 API Keys
        </button>
        <div className="flex items-center gap-2 ml-2">
          <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold select-none">
            {initials}
          </div>
          <span className="text-sm text-gray-700 font-medium hidden sm:block">{user.username}</span>
        </div>
        <button
          onClick={onLogout}
          className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors"
        >
          Logout
        </button>
      </div>
    </header>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add components/Header.tsx
git commit -m "feat: add shared Header component with nav and user avatar"
```

---

## Task 10: Frontend — AuthPage

**Files:**
- Create: `pages/AuthPage.tsx`

- [ ] **Step 1: Create directory and file**

```bash
mkdir -p pages
```

Create `pages/AuthPage.tsx`:

```typescript
import React, { useState } from 'react';
import type { AppUser } from '../types';

interface AuthPageProps {
  onAuth: (token: string, user: AppUser) => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onAuth }) => {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [regFirstName, setRegFirstName] = useState('');
  const [regLastName, setRegLastName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');

  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onAuth(data.token, data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (regPassword !== regConfirm) return setError('Passwords do not match');
    if (regPassword.length < 8) return setError('Password must be at least 8 characters');
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: regFirstName, last_name: regLastName,
          email: regEmail, username: regUsername, password: regPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      localStorage.setItem('abap_firstLogin', '1');
      onAuth(data.token, data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-8">
        <h1 className="text-2xl font-bold text-gray-900 text-center mb-1">ABAP Code Generator</h1>
        <p className="text-gray-500 text-sm text-center mb-6">Sign in or create an account to get started</p>

        <div className="flex gap-2 mb-6">
          {(['login', 'register'] as const).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(''); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${tab === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {t}
            </button>
          ))}
        </div>

        {error && <p className="text-red-600 text-sm mb-4 bg-red-50 p-3 rounded-lg">{error}</p>}

        {tab === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username or Email</label>
              <input type="text" value={loginUsername} onChange={e => setLoginUsername(e.target.value)} required className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} required className={inputClass} />
            </div>
            <button type="submit" disabled={isLoading} className="w-full py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition-colors">
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                <input type="text" value={regFirstName} onChange={e => setRegFirstName(e.target.value)} required className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                <input type="text" value={regLastName} onChange={e => setRegLastName(e.target.value)} required className={inputClass} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} required className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input type="text" value={regUsername} onChange={e => setRegUsername(e.target.value)} required className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input type="password" value={regPassword} onChange={e => setRegPassword(e.target.value)} required className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
              <input type="password" value={regConfirm} onChange={e => setRegConfirm(e.target.value)} required className={inputClass} />
            </div>
            <button type="submit" disabled={isLoading} className="w-full py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition-colors">
              {isLoading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add pages/AuthPage.tsx
git commit -m "feat: add AuthPage with register/login tabs"
```

---

## Task 11: Frontend — ApiSetupPage

**Files:**
- Create: `pages/ApiSetupPage.tsx`

- [ ] **Step 1: Create `pages/ApiSetupPage.tsx`**

```typescript
import React, { useState, useEffect } from 'react';

interface ApiSetupPageProps {
  token: string;
  onComplete: () => void;
  isSettingsMode?: boolean;
}

export const ApiSetupPage: React.FC<ApiSetupPageProps> = ({ token, onComplete, isSettingsMode = false }) => {
  const [geminiKey, setGeminiKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [showGemini, setShowGemini] = useState(false);
  const [showOpenai, setShowOpenai] = useState(false);
  const [existing, setExisting] = useState({ gemini: false, openai: false });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const authHeaders = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetch('/api/apikeys', { headers: authHeaders })
      .then(r => r.json())
      .then(setExisting)
      .catch(() => {});
  }, [token]);

  const saveKey = (provider: 'gemini' | 'openai', key: string) =>
    fetch('/api/apikeys', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, key: key.trim() }),
    });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!geminiKey.trim() && !openaiKey.trim()) {
      return setError('Please enter at least one API key.');
    }
    setIsSaving(true);
    setError('');
    try {
      await Promise.all([
        geminiKey.trim() ? saveKey('gemini', geminiKey) : Promise.resolve(),
        openaiKey.trim() ? saveKey('openai', openaiKey) : Promise.resolve(),
      ]);
      setSuccess('Keys saved successfully!');
      setTimeout(onComplete, 900);
    } catch {
      setError('Failed to save keys. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass = 'flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono';

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-lg p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">
          {isSettingsMode ? 'Update API Keys' : 'Configure AI Keys'}
        </h2>
        <p className="text-gray-500 text-sm mb-6">
          {isSettingsMode
            ? 'Update your stored API keys below. Leave a field blank to keep the existing key.'
            : 'Add at least one API key to start generating ABAP reports.'}
        </p>

        {error && <p className="text-red-600 text-sm mb-4 bg-red-50 p-3 rounded-lg">{error}</p>}
        {success && <p className="text-green-600 text-sm mb-4 bg-green-50 p-3 rounded-lg">{success}</p>}

        <form onSubmit={handleSave} className="space-y-4">
          {/* Gemini card */}
          <div className="border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded bg-blue-500 flex items-center justify-center text-white text-xs font-bold">G</div>
              <span className="font-semibold text-gray-800 text-sm">Google Gemini</span>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Recommended</span>
              {existing.gemini && <span className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✓ Saved</span>}
            </div>
            <div className="flex gap-2">
              <input
                type={showGemini ? 'text' : 'password'}
                value={geminiKey}
                onChange={e => setGeminiKey(e.target.value)}
                placeholder={existing.gemini ? '(key saved — enter new value to replace)' : 'AIzaSy...'}
                className={inputClass}
              />
              <button type="button" onClick={() => setShowGemini(v => !v)} className="px-3 text-gray-500 hover:text-gray-700 text-sm">
                {showGemini ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {/* OpenAI card */}
          <div className="border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded bg-green-600 flex items-center justify-center text-white text-xs font-bold">AI</div>
              <span className="font-semibold text-gray-800 text-sm">OpenAI</span>
              {existing.openai && <span className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✓ Saved</span>}
            </div>
            <div className="flex gap-2">
              <input
                type={showOpenai ? 'text' : 'password'}
                value={openaiKey}
                onChange={e => setOpenaiKey(e.target.value)}
                placeholder={existing.openai ? '(key saved — enter new value to replace)' : 'sk-...'}
                className={inputClass}
              />
              <button type="button" onClick={() => setShowOpenai(v => !v)} className="px-3 text-gray-500 hover:text-gray-700 text-sm">
                {showOpenai ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <button type="submit" disabled={isSaving} className="w-full py-2.5 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 disabled:bg-purple-300 transition-colors">
            {isSaving ? 'Saving...' : 'Save Keys & Continue'}
          </button>
          {!isSettingsMode && (
            <button type="button" onClick={onComplete} className="w-full py-2 text-gray-400 hover:text-gray-600 text-sm transition-colors">
              Skip for now →
            </button>
          )}
        </form>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add pages/ApiSetupPage.tsx
git commit -m "feat: add ApiSetupPage for Gemini and OpenAI key management"
```

---

## Task 12: Frontend — GeneratorPage

**Files:**
- Create: `pages/GeneratorPage.tsx`

- [ ] **Step 1: Create `pages/GeneratorPage.tsx`**

This extracts all logic from `App.tsx` and adds: backend key fetch, OpenAI support, report saving, and `initialState` prop.

```typescript
import React, { useState, useCallback, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import type { InputParameter, Table, TableOperation, ReportSpec } from '../types';
import { Icon } from '../components/Icon';

type GenerationProfile = 'Balanced' | 'Creative' | 'Concise' | 'Well-Commented';

type LLMModel = { id: string; label: string; description: string; provider: 'gemini' | 'openai' };

const LLM_MODELS: LLMModel[] = [
  { id: 'gemini-2.0-flash',         label: 'Gemini 2.0 Flash',     description: 'Fast & capable — recommended', provider: 'gemini' },
  { id: 'gemini-2.5-pro-exp-03-25', label: 'Gemini 2.5 Pro (Exp)', description: 'Most capable for complex logic', provider: 'gemini' },
  { id: 'gemini-1.5-pro',           label: 'Gemini 1.5 Pro',       description: 'Stable & reliable',            provider: 'gemini' },
  { id: 'gemini-1.5-flash',         label: 'Gemini 1.5 Flash',     description: 'Fastest generation',           provider: 'gemini' },
  { id: 'gpt-4o',                   label: 'GPT-4o',               description: 'OpenAI — most capable',        provider: 'openai' },
  { id: 'gpt-4o-mini',              label: 'GPT-4o Mini',          description: 'OpenAI — fast and cheap',      provider: 'openai' },
];

const FormSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white p-6 rounded-lg shadow-md mb-6">
    <h2 className="text-xl font-bold text-gray-800 border-b pb-3 mb-4">{title}</h2>
    {children}
  </div>
);

interface GeneratorPageProps {
  token: string;
  initialState?: ReportSpec;
  onInitialStateConsumed?: () => void;
}

export const GeneratorPage: React.FC<GeneratorPageProps> = ({ token, initialState, onInitialStateConsumed }) => {
  const defaultModel = LLM_MODELS[0].id;

  const [programName, setProgramName] = useState(initialState?.programName ?? 'Z_DEMO_REPORT');
  const [programDescription, setProgramDescription] = useState(initialState?.programDescription ?? 'A report to demonstrate AI code generation.');
  const [generationProfile, setGenerationProfile] = useState<GenerationProfile>(
    (initialState?.generationProfile as GenerationProfile) ?? 'Balanced'
  );
  const [selectedModel, setSelectedModel] = useState(() => {
    const saved = initialState?.model;
    return LLM_MODELS.find(m => m.id === saved)?.id ?? defaultModel;
  });
  const [inputParameters, setInputParameters] = useState<InputParameter[]>(
    initialState?.inputParameters ?? [{ id: crypto.randomUUID(), name: 'P_BUKRS', type: 'BUKRS', required: true }]
  );
  const [tables, setTables] = useState<Table[]>(
    initialState?.tables ?? [{ id: crypto.randomUUID(), name: 'T001', operation: 'SELECT', fields: 'BUKRS, BUTXT', whereClause: 'BUKRS = P_BUKRS' }]
  );
  const [outputDescription, setOutputDescription] = useState(
    initialState?.outputDescription ?? 'Display the selected company code details in a simple ALV grid.'
  );

  const [generatedCode, setGeneratedCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [copySuccess, setCopySuccess] = useState('');
  const [saveToast, setSaveToast] = useState('');

  useEffect(() => {
    if (initialState) {
      setProgramName(initialState.programName);
      setProgramDescription(initialState.programDescription);
      setGenerationProfile((initialState.generationProfile as GenerationProfile) ?? 'Balanced');
      setSelectedModel(LLM_MODELS.find(m => m.id === initialState.model)?.id ?? defaultModel);
      setInputParameters(initialState.inputParameters);
      setTables(initialState.tables);
      setOutputDescription(initialState.outputDescription);
      setGeneratedCode('');
      onInitialStateConsumed?.();
    }
  }, [initialState]);

  const handleAddParameter = useCallback(() => {
    setInputParameters(c => [...c, { id: crypto.randomUUID(), name: '', type: '', required: false }]);
  }, []);
  const handleRemoveParameter = useCallback((id: string) => {
    setInputParameters(c => c.filter(p => p.id !== id));
  }, []);
  const handleParameterChange = useCallback((id: string, field: keyof Omit<InputParameter, 'id'>, value: string | boolean) => {
    setInputParameters(c => c.map(p => p.id === id ? { ...p, [field]: value } : p));
  }, []);
  const handleAddTable = useCallback(() => {
    setTables(c => [...c, { id: crypto.randomUUID(), name: '', operation: 'SELECT', fields: '', whereClause: '' }]);
  }, []);
  const handleRemoveTable = useCallback((id: string) => {
    setTables(c => c.filter(t => t.id !== id));
  }, []);
  const handleTableChange = useCallback((id: string, field: keyof Omit<Table, 'id'>, value: string) => {
    setTables(c => c.map(t => t.id === id ? { ...t, [field]: value } : t));
  }, []);

  const generatePrompt = (): string => {
    let prompt = `You are an expert SAP ABAP developer. Your task is to generate a complete and high-quality ABAP report program based on the following specifications. The code should be well-structured, follow modern ABAP (7.4+) syntax where possible, and include helpful comments.\n\n**Program Name:** ${programName.trim() || 'Z_GENERATED_REPORT'}\n**Program Description:** ${programDescription}\n\n**Selection Screen (Input Parameters):**\n`;
    if (inputParameters.length === 0) {
      prompt += '- None\n';
    } else {
      inputParameters.forEach(p => {
        prompt += `- Parameter: ${p.name || 'param_name'}, Type: ${p.type || 'c'}, Required: ${p.required ? 'Yes' : 'No'}\n`;
      });
    }
    prompt += '\n**Data Processing Logic (Tables & Operations):**\n';
    if (tables.length === 0) {
      prompt += '- None\n';
    } else {
      tables.forEach(t => {
        prompt += `- Operation: ${t.operation}\n  - Table Name: ${t.name}\n`;
        if (t.fields) prompt += `  - Fields: ${t.fields}\n`;
        if (t.whereClause) prompt += `  - WHERE Clause: ${t.whereClause}\n`;
      });
    }
    prompt += `\n**Output Requirements:**\n- ${outputDescription}\n\nPlease generate the complete ABAP code now.\n`;
    return prompt;
  };

  const fetchApiKey = async (provider: 'gemini' | 'openai'): Promise<string> => {
    const res = await fetch(`/api/apikeys/decrypt/${provider}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`No ${provider} API key configured. Add one via API Keys settings.`);
    const data = await res.json();
    return data.key;
  };

  const buildModelConfig = (): { systemInstruction?: string; temperature?: number } => {
    switch (generationProfile) {
      case 'Creative':     return { temperature: 1 };
      case 'Concise':      return { systemInstruction: 'Generate the most concise, compact, and shortest possible ABAP code that meets the requirements.' };
      case 'Well-Commented': return { systemInstruction: 'Generate ABAP code with extensive, detailed comments explaining each major block of logic, variable declaration, and complex statements.' };
      default:             return { temperature: 0.5 };
    }
  };

  const handleGenerateCode = async () => {
    if (!programName.trim()) {
      setError('Program name is required.');
      return;
    }
    setError('');
    setGeneratedCode('');
    setIsLoading(true);
    try {
      const prompt = generatePrompt();
      const modelConfig = buildModelConfig();
      const activeModel = LLM_MODELS.find(m => m.id === selectedModel)!;
      let code: string;

      if (activeModel.provider === 'openai') {
        const apiKey = await fetchApiKey('openai');
        const messages: { role: string; content: string }[] = [];
        if (modelConfig.systemInstruction) {
          messages.push({ role: 'system', content: modelConfig.systemInstruction });
        }
        messages.push({ role: 'user', content: prompt });
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model: selectedModel, messages, temperature: modelConfig.temperature ?? 0.7 }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error?.message ?? 'OpenAI API error');
        }
        const data = await res.json();
        code = data.choices[0]?.message?.content ?? '';
      } else {
        const apiKey = await fetchApiKey('gemini');
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({ model: selectedModel, contents: prompt, config: modelConfig });
        code = (response.text ?? '').trim();
      }

      code = code.replace(/^```(?:abap)?\n?/i, '').replace(/\n?```\s*$/i, '').trim();
      setGeneratedCode(code);

      // Save report
      await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          program_name: programName.trim(),
          description: programDescription,
          input_parameters: inputParameters,
          tables,
          output_description: outputDescription,
          generated_code: code,
          model: selectedModel,
          generation_profile: generationProfile,
        }),
      });
      setSaveToast('Report saved!');
      setTimeout(() => setSaveToast(''), 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Generation failed: ${msg}`);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!generatedCode) return;
    navigator.clipboard.writeText(generatedCode).then(
      () => { setCopySuccess('Copied!'); setTimeout(() => setCopySuccess(''), 2000); },
      () => setCopySuccess('Failed!')
    );
  };

  const activeModel = LLM_MODELS.find(m => m.id === selectedModel);

  return (
    <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-2 lg:gap-8">
      <div>
        <FormSection title="1. Program Details">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="program-name" className="block text-sm font-medium text-gray-700 mb-1">Program Name <span className="text-red-500">*</span></label>
              <input type="text" id="program-name" value={programName} onChange={e => setProgramName(e.target.value)} disabled={isLoading}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 ${!programName.trim() ? 'border-red-300' : 'border-gray-300'}`} />
            </div>
            <div>
              <label htmlFor="generation-profile" className="block text-sm font-medium text-gray-700 mb-1">Generation Profile</label>
              <select id="generation-profile" value={generationProfile} onChange={e => setGenerationProfile(e.target.value as GenerationProfile)} disabled={isLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-50">
                <option>Balanced</option><option>Creative</option><option>Concise</option><option>Well-Commented</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="llm-model" className="block text-sm font-medium text-gray-700 mb-1">LLM Model</label>
              <select id="llm-model" value={selectedModel} onChange={e => setSelectedModel(e.target.value)} disabled={isLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-50">
                <optgroup label="Google Gemini">
                  {LLM_MODELS.filter(m => m.provider === 'gemini').map(m => (
                    <option key={m.id} value={m.id}>{m.label} — {m.description}</option>
                  ))}
                </optgroup>
                <optgroup label="OpenAI">
                  {LLM_MODELS.filter(m => m.provider === 'openai').map(m => (
                    <option key={m.id} value={m.id}>{m.label} — {m.description}</option>
                  ))}
                </optgroup>
              </select>
              {activeModel && <p className="mt-1 text-xs text-gray-500">Model ID: <code className="bg-gray-100 px-1 rounded">{activeModel.id}</code></p>}
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="program-desc" className="block text-sm font-medium text-gray-700 mb-1">Program Description</label>
              <textarea id="program-desc" value={programDescription} onChange={e => setProgramDescription(e.target.value)} rows={2} disabled={isLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50" />
            </div>
          </div>
        </FormSection>

        <FormSection title="2. Input Parameters (Selection Screen)">
          {inputParameters.map(param => (
            <div key={param.id} className="grid grid-cols-12 gap-2 mb-3 items-end p-2 border rounded-md">
              <div className="col-span-5">
                <label className="block text-xs font-medium text-gray-600">Parameter Name</label>
                <input type="text" value={param.name} onChange={e => handleParameterChange(param.id, 'name', e.target.value)} placeholder="e.g., P_BUKRS" disabled={isLoading}
                  className="w-full text-sm px-2 py-1 border border-gray-300 rounded-md disabled:bg-gray-50" />
              </div>
              <div className="col-span-4">
                <label className="block text-xs font-medium text-gray-600">Data Type</label>
                <input type="text" value={param.type} onChange={e => handleParameterChange(param.id, 'type', e.target.value)} placeholder="e.g., BUKRS" disabled={isLoading}
                  className="w-full text-sm px-2 py-1 border border-gray-300 rounded-md disabled:bg-gray-50" />
              </div>
              <div className="col-span-2 flex items-center h-full">
                <input type="checkbox" id={`req-${param.id}`} checked={param.required} onChange={e => handleParameterChange(param.id, 'required', e.target.checked)} disabled={isLoading} className="h-4 w-4 text-blue-600 border-gray-300 rounded" />
                <label htmlFor={`req-${param.id}`} className="ml-2 text-sm text-gray-700">Req.</label>
              </div>
              <div className="col-span-1">
                <button onClick={() => handleRemoveParameter(param.id)} disabled={isLoading} className="p-1.5 text-red-600 hover:bg-red-100 rounded-full disabled:opacity-40" aria-label="Remove">
                  <Icon type="trash" className="h-5 w-5" />
                </button>
              </div>
            </div>
          ))}
          <button onClick={handleAddParameter} disabled={isLoading} className="mt-2 flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200 disabled:opacity-40">
            <Icon type="plus" className="h-4 w-4" /> Add Parameter
          </button>
        </FormSection>

        <FormSection title="3. Tables & Operations">
          {tables.map(table => (
            <div key={table.id} className="p-3 border rounded-md mb-3">
              <div className="grid grid-cols-12 gap-2 mb-2 items-center">
                <div className="col-span-5">
                  <label className="block text-xs font-medium text-gray-600">Table Name</label>
                  <input type="text" value={table.name} onChange={e => handleTableChange(table.id, 'name', e.target.value)} placeholder="e.g., MARA" disabled={isLoading}
                    className="w-full text-sm px-2 py-1 border border-gray-300 rounded-md disabled:bg-gray-50" />
                </div>
                <div className="col-span-6">
                  <label className="block text-xs font-medium text-gray-600">Operation</label>
                  <select value={table.operation} onChange={e => handleTableChange(table.id, 'operation', e.target.value as TableOperation)} disabled={isLoading}
                    className="w-full text-sm px-2 py-1 border border-gray-300 rounded-md bg-white disabled:bg-gray-50">
                    <option>SELECT</option><option>UPDATE</option><option>INSERT</option><option>DELETE</option>
                  </select>
                </div>
                <div className="col-span-1 self-end">
                  <button onClick={() => handleRemoveTable(table.id)} disabled={isLoading} className="p-1.5 text-red-600 hover:bg-red-100 rounded-full disabled:opacity-40" aria-label="Remove">
                    <Icon type="trash" className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600">Fields (comma-separated)</label>
                <input type="text" value={table.fields} onChange={e => handleTableChange(table.id, 'fields', e.target.value)} placeholder="e.g., MATNR, MTART" disabled={isLoading}
                  className="w-full text-sm px-2 py-1 border border-gray-300 rounded-md mb-2 disabled:bg-gray-50" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600">WHERE Clause</label>
                <input type="text" value={table.whereClause} onChange={e => handleTableChange(table.id, 'whereClause', e.target.value)} placeholder="e.g., MTART = P_MTART" disabled={isLoading}
                  className="w-full text-sm px-2 py-1 border border-gray-300 rounded-md disabled:bg-gray-50" />
              </div>
            </div>
          ))}
          <button onClick={handleAddTable} disabled={isLoading} className="mt-2 flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200 disabled:opacity-40">
            <Icon type="plus" className="h-4 w-4" /> Add Table Operation
          </button>
        </FormSection>

        <FormSection title="4. Output Requirements">
          <label htmlFor="output-desc" className="block text-sm font-medium text-gray-700 mb-1">Describe the desired output</label>
          <textarea id="output-desc" value={outputDescription} onChange={e => setOutputDescription(e.target.value)} rows={3} disabled={isLoading}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50" />
        </FormSection>

        <div className="mt-6">
          <button onClick={handleGenerateCode} disabled={isLoading || !programName.trim()}
            className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-blue-600 text-white font-bold rounded-md shadow-md hover:bg-blue-700 disabled:bg-blue-300 transition-colors">
            {isLoading ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Generating with {activeModel?.label ?? selectedModel}...
              </>
            ) : (
              <><Icon type="sparkles" className="h-6 w-6" /> Generate ABAP Code</>
            )}
          </button>
        </div>
      </div>

      <div className="mt-8 lg:mt-0">
        <div className="sticky top-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-800">Generated Code</h2>
            <div className="flex items-center gap-2">
              {saveToast && <span className="text-xs text-green-700 bg-green-100 px-2 py-1 rounded">{saveToast}</span>}
              {generatedCode && <span className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded">{activeModel?.label}</span>}
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg shadow-lg relative h-[75vh]">
            {generatedCode && (
              <button onClick={copyToClipboard} className="absolute top-2 right-2 z-10 flex items-center gap-2 px-3 py-1.5 text-xs bg-gray-600 text-white rounded-md hover:bg-gray-500">
                <Icon type="copy" className="h-4 w-4" />{copySuccess || 'Copy'}
              </button>
            )}
            <pre className="p-4 h-full overflow-auto rounded-lg">
              <code className="text-white text-sm font-mono whitespace-pre">
                {isLoading && <span className="text-gray-400">Generating with {activeModel?.label}...</span>}
                {error && <span className="text-red-400">{error}</span>}
                {!isLoading && !error && !generatedCode && <span className="text-gray-400">Your generated ABAP code will appear here.</span>}
                {generatedCode}
              </code>
            </pre>
          </div>
        </div>
      </div>
    </main>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add pages/GeneratorPage.tsx
git commit -m "feat: add GeneratorPage with backend key fetch, OpenAI support, and report saving"
```

---

## Task 13: Frontend — ReportsPage

**Files:**
- Create: `pages/ReportsPage.tsx`

- [ ] **Step 1: Create `pages/ReportsPage.tsx`**

```typescript
import React, { useState, useEffect } from 'react';
import type { ReportListItem, ReportDetail, ReportSpec } from '../types';

interface ReportsPageProps {
  token: string;
  onReuse: (spec: ReportSpec) => void;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export const ReportsPage: React.FC<ReportsPageProps> = ({ token, onReuse }) => {
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [search, setSearch] = useState('');
  const [viewReport, setViewReport] = useState<ReportDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copySuccess, setCopySuccess] = useState('');

  const authHeaders = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetch('/api/reports', { headers: authHeaders })
      .then(r => r.json())
      .then(data => { setReports(Array.isArray(data) ? data : []); setIsLoading(false); })
      .catch(() => setIsLoading(false));
  }, [token]);

  const handleView = async (id: number) => {
    const res = await fetch(`/api/reports/${id}`, { headers: authHeaders });
    const data = await res.json();
    setViewReport(data);
  };

  const handleReuse = async (id: number) => {
    const res = await fetch(`/api/reports/${id}`, { headers: authHeaders });
    const data: ReportDetail = await res.json();
    onReuse({
      programName: data.program_name,
      programDescription: data.description,
      inputParameters: data.input_parameters,
      tables: data.tables,
      outputDescription: data.output_description,
      model: data.model,
      generationProfile: data.generation_profile,
    });
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this report? This cannot be undone.')) return;
    await fetch(`/api/reports/${id}`, { method: 'DELETE', headers: authHeaders });
    setReports(r => r.filter(rep => rep.id !== id));
    if (viewReport?.id === id) setViewReport(null);
  };

  const copyCode = () => {
    if (!viewReport?.generated_code) return;
    navigator.clipboard.writeText(viewReport.generated_code).then(
      () => { setCopySuccess('Copied!'); setTimeout(() => setCopySuccess(''), 2000); },
      () => setCopySuccess('Failed!')
    );
  };

  const filtered = reports.filter(r =>
    r.program_name.toLowerCase().includes(search.toLowerCase()) ||
    (r.description ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">My Reports</h2>
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search reports..."
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
        />
      </div>

      {isLoading && <p className="text-gray-500 text-sm">Loading reports...</p>}
      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">{search ? 'No reports match your search.' : 'No reports yet. Generate your first report!'}</p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map(report => (
          <div key={report.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">{report.program_name}</p>
                <p className="text-sm text-gray-500 truncate mt-0.5">{report.description || '—'}</p>
              </div>
              <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">{relativeTime(report.created_at)}</span>
            </div>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">{report.model}</span>
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{report.generation_profile}</span>
              <div className="ml-auto flex gap-3">
                <button onClick={() => handleView(report.id)} className="text-sm text-blue-600 hover:text-blue-800 font-medium">View</button>
                <button onClick={() => handleReuse(report.id)} className="text-sm text-green-600 hover:text-green-800 font-medium">Re-use</button>
                <button onClick={() => handleDelete(report.id)} className="text-sm text-red-500 hover:text-red-700 font-medium">Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* View modal */}
      {viewReport && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setViewReport(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="font-bold text-gray-900">{viewReport.program_name}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{viewReport.model} · {viewReport.generation_profile} · {relativeTime(viewReport.created_at)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={copyCode} className="px-3 py-1.5 text-xs bg-gray-700 text-white rounded-md hover:bg-gray-600">
                  {copySuccess || 'Copy Code'}
                </button>
                <button onClick={() => setViewReport(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none px-2">✕</button>
              </div>
            </div>
            <pre className="flex-1 overflow-auto p-4 bg-gray-900 rounded-b-xl">
              <code className="text-white text-sm font-mono whitespace-pre">{viewReport.generated_code}</code>
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add pages/ReportsPage.tsx
git commit -m "feat: add ReportsPage with view modal, re-use, and delete"
```

---

## Task 14: Frontend — App.tsx route orchestrator and final wiring

**Files:**
- Replace: `App.tsx`

- [ ] **Step 1: Replace `App.tsx` with the route orchestrator**

```typescript
import React, { useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import { AuthPage } from './pages/AuthPage';
import { ApiSetupPage } from './pages/ApiSetupPage';
import { GeneratorPage } from './pages/GeneratorPage';
import { ReportsPage } from './pages/ReportsPage';
import { Header } from './components/Header';
import type { AppUser, ReportSpec } from './types';

type Page = 'auth' | 'api-setup' | 'generator' | 'reports';

const App: React.FC = () => {
  const { auth, login, logout } = useAuth();
  const [page, setPage] = useState<Page>('auth');
  const [generatorInitialState, setGeneratorInitialState] = useState<ReportSpec | undefined>();

  useEffect(() => {
    if (!auth.token || !auth.user) {
      setPage('auth');
      return;
    }
    const isFirstLogin = localStorage.getItem('abap_firstLogin') === '1';
    setPage(isFirstLogin ? 'api-setup' : 'generator');
  }, [auth.token]);

  const handleAuth = (token: string, user: AppUser) => {
    login(token, user);
  };

  const handleApiSetupComplete = () => {
    localStorage.removeItem('abap_firstLogin');
    setPage('generator');
  };

  const handleReuse = (spec: ReportSpec) => {
    setGeneratorInitialState(spec);
    setPage('generator');
  };

  if (!auth.token || !auth.user) {
    return <AuthPage onAuth={handleAuth} />;
  }

  const headerPage = page === 'api-setup' ? 'api-setup' : page as 'generator' | 'reports';

  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      <Header
        user={auth.user}
        currentPage={headerPage}
        onNavigate={p => setPage(p)}
        onLogout={logout}
      />
      {page === 'api-setup' && (
        <ApiSetupPage
          token={auth.token}
          onComplete={handleApiSetupComplete}
          isSettingsMode={localStorage.getItem('abap_firstLogin') !== '1'}
        />
      )}
      {page === 'generator' && (
        <GeneratorPage
          token={auth.token}
          initialState={generatorInitialState}
          onInitialStateConsumed={() => setGeneratorInitialState(undefined)}
        />
      )}
      {page === 'reports' && (
        <ReportsPage token={auth.token} onReuse={handleReuse} />
      )}
    </div>
  );
};

export default App;
```

- [ ] **Step 2: Kill any running dev server and start fresh with both processes**

```bash
npm run dev
```

Expected output from concurrently:
```
[0] VITE v6.x.x  ready in Xms
[0]   ➜  Local:   http://localhost:5173/
[1] Server running on http://localhost:3001
```

- [ ] **Step 3: Verify full auth flow in browser**

Open http://localhost:5173

1. App shows the **Auth page** with Login / Register tabs
2. Click **Register** → fill in First Name, Last Name, Email, Username, Password → submit
3. App redirects to **API Key Setup** page
4. Enter a Gemini API key → click **Save Keys & Continue**
5. App redirects to the **Generator** page with the Header showing your username
6. Fill in a program name and click **Generate ABAP Code** — code appears and "Report saved!" toast shows
7. Click **My Reports** in the header — the generated report appears in the list
8. Click **View** on the report — modal shows the generated code with a copy button
9. Click **Re-use** — form is pre-populated with the original spec
10. Click **Logout** — app returns to Auth page
11. Login with the credentials you registered — lands on Generator directly (no API setup this time)

- [ ] **Step 4: Commit**

```bash
git add App.tsx
git commit -m "feat: wire App.tsx as page router and complete auth/reports integration"
```

---

## Self-Review Notes

**Spec coverage check:**
- ✅ User registration with first/last name, email, username, password
- ✅ Login with username or email
- ✅ JWT auth, 7-day expiry
- ✅ API keys encrypted with AES-256-GCM, stored in DB
- ✅ GET /api/apikeys returns presence flags only (never raw key values)
- ✅ Gemini and OpenAI model support in GeneratorPage
- ✅ Report saved after every successful generation
- ✅ Reports list with model/profile badges and relative timestamps
- ✅ View modal with copy button
- ✅ Re-use pre-populates generator form; unknown model falls back to LLM_MODELS[0]
- ✅ Delete with confirm dialog
- ✅ Header on all post-login pages with initials avatar
- ✅ API Keys page reachable from header (isSettingsMode=true) and first-login (isSettingsMode=false)
- ✅ First-login flag set on register, cleared after api-setup completes
