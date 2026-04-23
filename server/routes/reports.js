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
  try {
    report.input_parameters = JSON.parse(report.input_parameters || '[]');
    report.tables = JSON.parse(report.tables || '[]');
  } catch {
    return res.status(500).json({ error: 'Stored report data is corrupt' });
  }
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
