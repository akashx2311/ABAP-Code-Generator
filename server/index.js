import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import apiKeyRoutes from './routes/apikeys.js';
import reportRoutes from './routes/reports.js';
import generateRoutes from './routes/generate.js';

const REQUIRED_ENV = ['JWT_SECRET', 'ENCRYPTION_KEY'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`FATAL: environment variable ${key} is not set`);
    process.exit(1);
  }
}

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(s => s.trim());

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
}));
app.use(express.json({ limit: '5mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/apikeys', apiKeyRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/generate', generateRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  const isProd = process.env.NODE_ENV === 'production';
  res.status(err.status || 500).json({
    error: isProd && !err.status ? 'Internal server error' : (err.message || 'Internal server error'),
  });
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
