import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import db from '../db.js';
import authMiddleware from '../middleware/auth.js';
import { decrypt } from '../cryptoUtils.js';

const router = Router();
router.use(authMiddleware);

const ALLOWED_CLAUDE_MODELS = ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5'];

router.post('/claude', async (req, res) => {
  const { model, prompt, systemInstruction, temperature } = req.body;
  if (!model || !prompt) {
    return res.status(400).json({ error: 'model and prompt are required' });
  }
  if (!ALLOWED_CLAUDE_MODELS.includes(model)) {
    return res.status(400).json({ error: 'Invalid model specified' });
  }

  const row = db.prepare('SELECT key_encrypted FROM api_keys WHERE user_id = ? AND provider = ?')
    .get(req.userId, 'claude');
  if (!row) {
    return res.status(404).json({ error: 'No Claude API key configured. Add one via API Keys settings.' });
  }

  let apiKey;
  try {
    apiKey = decrypt(row.key_encrypted);
  } catch {
    return res.status(500).json({ error: 'Failed to decrypt Claude API key.' });
  }

  try {
    const anthropic = new Anthropic({ apiKey });
    const createParams = {
      model,
      max_tokens: 8096,
      messages: [{ role: 'user', content: prompt }],
    };
    if (systemInstruction) createParams.system = systemInstruction;
    if (temperature !== undefined) createParams.temperature = temperature;

    const response = await anthropic.messages.create(createParams);
    const block = response.content[0];
    res.json({ code: block?.type === 'text' ? block.text : '' });
  } catch (err) {
    const msg = err instanceof Anthropic.APIError
      ? `Anthropic API error: ${err.status} ${err.error?.type ?? ''}`
      : 'Generation failed';
    res.status(502).json({ error: msg });
  }
});

export default router;
