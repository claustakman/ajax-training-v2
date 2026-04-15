import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authRoutes } from './routes/auth';
import { teamRoutes } from './routes/teams';
import { userRoutes } from './routes/users';
import { trainingRoutes } from './routes/trainings';
import { exerciseRoutes } from './routes/exercises';
import { quarterRoutes } from './routes/quarters';
import { sectionTypeRoutes } from './routes/section_types';
import { boardRoutes } from './routes/board';
import { holdsportRoutes } from './routes/holdsport';
import { aiRoutes } from './routes/ai';
import { templateRoutes } from './routes/templates';

export type Env = {
  DB: D1Database;
  STORAGE: R2Bucket;
  JWT_SECRET: string;
  ANTHROPIC_API_KEY: string;
  HS_TOKEN: string;
};

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

app.route('/api/auth', authRoutes);
app.route('/api/teams', teamRoutes);
app.route('/api/users', userRoutes);
app.route('/api/trainings', trainingRoutes);
app.route('/api/exercises', exerciseRoutes);
app.route('/api/quarters', quarterRoutes);
app.route('/api/section-types', sectionTypeRoutes);
app.route('/api/board', boardRoutes);
app.route('/api/holdsport', holdsportRoutes);
app.route('/api/ai', aiRoutes);
app.route('/api/templates', templateRoutes);

app.notFound(c => c.json({ error: 'Not found' }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;
