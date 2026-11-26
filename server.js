const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const mysql = require('mysql2/promise');

const app = express();
const PORT = 3000;

app.use(express.json());

const pgPool = new Pool({
  host: '127.0.0.1',
  port: 5432,
  database: 'step03_app',
  user: 'postgres',
  password: 'minhashamaz',
});

const mysqlPool = mysql.createPool({
  host: '127.0.0.1',
  port: 3307,
  database: 'step03_mysql',
  user: 'root',
  password: 'Minhashamaz123',
  waitForConnections: true,
  connectionLimit: 5,
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/test-pg', async (req, res) => {
  try {
    const result = await pgPool.query(
      'SELECT current_database() AS db, COUNT(*)::int AS table_count FROM information_schema.tables WHERE table_schema = $1',
      ['public']
    );
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/test-mysql', async (req, res) => {
  try {
    const [rows] = await mysqlPool.query(
      'SELECT DATABASE() AS db, COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema = DATABASE()'
    );
    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ ok: false, error: 'Email and password are required' });
  }

  try {
    const result = await pgPool.query(
      'SELECT * FROM users WHERE email = $1 LIMIT 1',
      [email.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ ok: false, error: 'User not found' });
    }

    const user = result.rows[0];
    const hash = crypto.createHash('sha256').update(password).digest('hex');
    const storedPassword = user.password_hash || user.password || '';
    const matches = storedPassword === password || storedPassword === hash;

    if (!matches) {
      return res.status(401).json({ ok: false, error: 'Invalid password' });
    }

    return res.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// Projects CRUD
app.get('/api/projects', async (req, res) => {
  const userId = Number(req.query.userId || 1);
  try {
    const result = await pgPool.query(
      'SELECT * FROM projects WHERE user_id = $1 ORDER BY id DESC',
      [userId]
    );
    res.json({ ok: true, projects: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/projects', async (req, res) => {
  const { userId = 1, title } = req.body || {};
  if (!title || !String(title).trim()) {
    return res.status(400).json({ ok: false, error: 'Project title is required' });
  }

  try {
    const result = await pgPool.query(
      'INSERT INTO projects (user_id, title) VALUES ($1, $2) RETURNING *',
      [Number(userId), String(title).trim()]
    );
    res.status(201).json({ ok: true, project: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.put('/api/projects/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { title } = req.body || {};
  if (!title || !String(title).trim()) {
    return res.status(400).json({ ok: false, error: 'Updated title is required' });
  }

  try {
    const result = await pgPool.query(
      'UPDATE projects SET title = $1 WHERE id = $2 RETURNING *',
      [String(title).trim(), id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Project not found' });
    }
    res.json({ ok: true, project: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete('/api/projects/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    const result = await pgPool.query(
      'DELETE FROM projects WHERE id = $1 RETURNING id',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Project not found' });
    }
    res.json({ ok: true, deletedId: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Tasks CRUD
app.get('/api/tasks', async (req, res) => {
  const projectId = req.query.projectId ? Number(req.query.projectId) : null;
  try {
    const result = projectId
      ? await pgPool.query('SELECT * FROM tasks WHERE project_id = $1 ORDER BY id DESC', [projectId])
      : await pgPool.query('SELECT * FROM tasks ORDER BY id DESC');
    res.json({ ok: true, tasks: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/tasks', async (req, res) => {
  const { projectId, title, status = 'todo' } = req.body || {};
  if (!projectId || !title || !String(title).trim()) {
    return res.status(400).json({ ok: false, error: 'Project ID and task title are required' });
  }

  try {
    const result = await pgPool.query(
      'INSERT INTO tasks (project_id, title, status) VALUES ($1, $2, $3) RETURNING *',
      [Number(projectId), String(title).trim(), String(status).trim() || 'todo']
    );
    res.status(201).json({ ok: true, task: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.put('/api/tasks/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { title, status } = req.body || {};
  try {
    const result = await pgPool.query(
      'UPDATE tasks SET title = COALESCE($1, title), status = COALESCE($2, status) WHERE id = $3 RETURNING *',
      [
        title && String(title).trim() ? String(title).trim() : null,
        status && String(status).trim() ? String(status).trim() : null,
        id,
      ]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Task not found' });
    }
    res.json({ ok: true, task: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    const result = await pgPool.query(
      'DELETE FROM tasks WHERE id = $1 RETURNING id',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Task not found' });
    }
    res.json({ ok: true, deletedId: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Test server running at http://127.0.0.1:${PORT}`);
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});