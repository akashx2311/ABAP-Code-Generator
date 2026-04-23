import { Router } from 'express';
import db from '../db.js';
import authMiddleware from '../middleware/auth.js';
import { encrypt, decrypt } from '../cryptoUtils.js';

const router = Router();
router.use(authMiddleware);

const VALID_PROVIDERS = ['gemini', 'openai', 'claude'];

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT provider FROM api_keys WHERE user_id = ?').all(req.userId);
  const result = { gemini: false, openai: false, claude: false };
  rows.forEach(r => { result[r.provider] = true; });
  res.json(result);
});

router.post('/', (req, res) => {
  const { provider, key } = req.body;
  if (!['gemini', 'openai', 'claude'].includes(provider) || !key?.trim()) {
    return res.status(400).json({ error: 'provider must be "gemini", "openai", or "claude" and key must not be empty' });
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
  if (!VALID_PROVIDERS.includes(req.params.provider)) {
    return res.status(400).json({ error: 'Invalid provider' });
  }
  db.prepare('DELETE FROM api_keys WHERE user_id = ? AND provider = ?')
    .run(req.userId, req.params.provider);
  res.json({ success: true });
});

router.get('/decrypt/:provider', (req, res) => {
  if (!VALID_PROVIDERS.includes(req.params.provider)) {
    return res.status(400).json({ error: 'Invalid provider' });
  }
  const row = db.prepare('SELECT key_encrypted FROM api_keys WHERE user_id = ? AND provider = ?')
    .get(req.userId, req.params.provider);
  if (!row) return res.status(404).json({ error: 'API key not found for this provider' });
  try {
    res.json({ key: decrypt(row.key_encrypted) });
  } catch {
    res.status(500).json({ error: 'Failed to decrypt key' });
  }
});

export default router;
