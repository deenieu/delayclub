/**
 * server.js
 * ------------------------------------------------------------------
 * Backend principal do Delay Club Manager.
 * - Serve os arquivos estáticos da pasta /public
 * - Expõe a API REST em /api/*
 * - Autenticação via sessão com usuários no banco de dados
 * ------------------------------------------------------------------
 */

const path = require('path');
const express = require('express');
const session = require('express-session');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// ---- Middlewares globais ------------------------------------------------
app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || 'delay-club-secret-key-mude-isso',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 8 * 60 * 60 * 1000
  }
}));

// ---- Middlewares de autenticação ----------------------------------------

function requireAuth(req, res, next) {
  const publicPaths = ['/login.html', '/api/login', '/styles.css'];
  if (publicPaths.includes(req.path)) return next();

  if (!req.session || !req.session.user) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Não autorizado.' });
    }
    return res.redirect('/login.html');
  }

  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user || req.session.user.role !== 'admin') {
    if (req.path.startsWith('/api/')) {
      return res.status(403).json({ error: 'Acesso restrito a administradores.' });
    }
    return res.redirect('/');
  }
  next();
}

app.use(requireAuth);
app.use(express.static(path.join(__dirname, 'public')));

// ---- Rotas de autenticação ----------------------------------------------

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.toLowerCase().trim());

  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  }

  req.session.user = { id: user.id, username: user.username, role: user.role };
  res.json({ ok: true, role: user.role });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// Retorna os dados do usuário logado (usado pelo front para exibir nome/role)
app.get('/api/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Não autorizado.' });
  res.json(req.session.user);
});

// ---- Rotas de gerenciamento de usuários (somente admin) -----------------

// Lista todos os usuários
app.get('/api/users', requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, username, role, created_at FROM users ORDER BY created_at ASC').all();
  res.json(users);
});

// Cria novo usuário
app.post('/api/users', requireAdmin, (req, res) => {
  const { username, password, role } = req.body || {};

  if (!username || !username.trim()) return res.status(400).json({ error: 'Nome de usuário é obrigatório.' });
  if (!password || password.length < 4) return res.status(400).json({ error: 'Senha deve ter ao menos 4 caracteres.' });
  if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: 'Perfil inválido.' });

  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username.toLowerCase().trim());
  if (exists) return res.status(409).json({ error: 'Esse nome de usuário já existe.' });

  const result = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(
    username.toLowerCase().trim(), password, role
  );
  const created = db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

// Atualiza senha e/ou perfil de um usuário
app.put('/api/users/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { password, role } = req.body || {};

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

  if (req.session.user.id === id && role && role !== 'admin') {
    return res.status(400).json({ error: 'Você não pode remover seu próprio perfil de admin.' });
  }

  if (password && password.length < 4) return res.status(400).json({ error: 'Senha deve ter ao menos 4 caracteres.' });
  if (role && !['admin', 'user'].includes(role)) return res.status(400).json({ error: 'Perfil inválido.' });

  const newPassword = password || user.password;
  const newRole = role || user.role;

  db.prepare('UPDATE users SET password = ?, role = ? WHERE id = ?').run(newPassword, newRole, id);
  const updated = db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(id);
  res.json(updated);
});

// Remove um usuário
app.delete('/api/users/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);

  if (req.session.user.id === id) {
    return res.status(400).json({ error: 'Você não pode excluir sua própria conta.' });
  }

  const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'Usuário não encontrado.' });
  res.json({ ok: true });
});

// ---- Helpers ------------------------------------------------------------

function addDays(dateStr, days) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function validateClientPayload(body) {
  if (!body) return { ok: false, error: 'Corpo da requisição vazio.' };
  const { name, lead_owner, payment_date, payment_amount } = body;

  if (!name || typeof name !== 'string' || !name.trim())
    return { ok: false, error: 'Nome do cliente é obrigatório.' };
  if (!lead_owner || typeof lead_owner !== 'string' || !lead_owner.trim())
    return { ok: false, error: 'Dono do lead é obrigatório.' };
  if (!payment_date || !/^\d{4}-\d{2}-\d{2}$/.test(payment_date))
    return { ok: false, error: 'Data de pagamento inválida (use YYYY-MM-DD).' };
  if (payment_amount === undefined || payment_amount === null || isNaN(Number(payment_amount)))
    return { ok: false, error: 'Valor pago inválido.' };
  if (Number(payment_amount) < 0)
    return { ok: false, error: 'Valor pago não pode ser negativo.' };
  return { ok: true };
}

// ---- Rotas da API de clientes -------------------------------------------

app.get('/api/clients', (req, res) => {
  const { role, username } = req.session.user;
  try {
    const rows = role === 'admin'
      ? db.prepare(`
          SELECT id, name, lead_owner, payment_date, payment_amount, renewal_date
          FROM clients ORDER BY renewal_date ASC
        `).all()
      : db.prepare(`
          SELECT id, name, lead_owner, payment_date, payment_amount, renewal_date
          FROM clients WHERE lead_owner = ? ORDER BY renewal_date ASC
        `).all(username);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar clientes.' });
  }
});

app.post('/api/clients', (req, res) => {
  const check = validateClientPayload(req.body);
  if (!check.ok) return res.status(400).json({ error: check.error });

  const { name, lead_owner, payment_date, payment_amount } = req.body;
  const { role, username } = req.session.user;

  // Usuário comum só pode cadastrar clientes com seu próprio username
  if (role !== 'admin' && lead_owner.trim() !== username) {
    return res.status(403).json({ error: 'Você só pode cadastrar clientes sob seu próprio nome.' });
  }

  const renewal_date = addDays(payment_date, 30);

  try {
    const result = db.prepare(`
      INSERT INTO clients (name, lead_owner, payment_date, payment_amount, renewal_date)
      VALUES (?, ?, ?, ?, ?)
    `).run(name.trim(), lead_owner.trim(), payment_date, Number(payment_amount), renewal_date);

    const created = db.prepare('SELECT * FROM clients WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar cliente.' });
  }
});

app.put('/api/clients/:id', (req, res) => {
  const id = Number(req.params.id);
  const check = validateClientPayload(req.body);
  if (!check.ok) return res.status(400).json({ error: check.error });

  const { name, lead_owner, payment_date, payment_amount } = req.body;
  const { role, username } = req.session.user;
  const renewal_date = addDays(payment_date, 30);

  try {
    const exists = db.prepare('SELECT id, lead_owner FROM clients WHERE id = ?').get(id);
    if (!exists) return res.status(404).json({ error: 'Cliente não encontrado.' });

    // Usuário comum só pode editar clientes que são dele
    if (role !== 'admin' && exists.lead_owner !== username) {
      return res.status(403).json({ error: 'Você não tem permissão para editar este cliente.' });
    }

    // Usuário comum não pode mudar o lead_owner
    if (role !== 'admin' && lead_owner.trim() !== username) {
      return res.status(403).json({ error: 'Você não pode alterar o dono do lead.' });
    }

    db.prepare(`
      UPDATE clients
      SET name = ?, lead_owner = ?, payment_date = ?, payment_amount = ?,
          renewal_date = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(name.trim(), lead_owner.trim(), payment_date, Number(payment_amount), renewal_date, id);

    const updated = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar cliente.' });
  }
});

app.delete('/api/clients/:id', (req, res) => {
  const id = Number(req.params.id);
  const { role, username } = req.session.user;

  try {
    const exists = db.prepare('SELECT id, lead_owner FROM clients WHERE id = ?').get(id);
    if (!exists) return res.status(404).json({ error: 'Cliente não encontrado.' });

    // Usuário comum só pode excluir clientes que são dele
    if (role !== 'admin' && exists.lead_owner !== username) {
      return res.status(403).json({ error: 'Você não tem permissão para excluir este cliente.' });
    }

    db.prepare('DELETE FROM clients WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir cliente.' });
  }
});

app.post('/api/clients/:id/renew', (req, res) => {
  const id = Number(req.params.id);
  const { role, username } = req.session.user;
  const newPaymentDate = todayStr();
  const newRenewalDate = addDays(newPaymentDate, 30);

  try {
    const exists = db.prepare('SELECT id, lead_owner FROM clients WHERE id = ?').get(id);
    if (!exists) return res.status(404).json({ error: 'Cliente não encontrado.' });

    // Usuário comum só pode renovar clientes que são dele
    if (role !== 'admin' && exists.lead_owner !== username) {
      return res.status(403).json({ error: 'Você não tem permissão para renovar este cliente.' });
    }

    db.prepare(`
      UPDATE clients SET payment_date = ?, renewal_date = ?, updated_at = datetime('now') WHERE id = ?
    `).run(newPaymentDate, newRenewalDate, id);

    const updated = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao renovar cliente.' });
  }
});

app.get('/api/summary', (req, res) => {
  const { role, username } = req.session.user;
  const isAdmin = role === 'admin';

  try {
    const today = todayStr();
    const monthPrefix = today.slice(0, 7);

    const active = isAdmin
      ? db.prepare('SELECT COUNT(*) AS c FROM clients WHERE renewal_date >= ?').get(today).c
      : db.prepare('SELECT COUNT(*) AS c FROM clients WHERE renewal_date >= ? AND lead_owner = ?').get(today, username).c;

    const expired = isAdmin
      ? db.prepare('SELECT COUNT(*) AS c FROM clients WHERE renewal_date < ?').get(today).c
      : db.prepare('SELECT COUNT(*) AS c FROM clients WHERE renewal_date < ? AND lead_owner = ?').get(today, username).c;

    const monthlyTotal = isAdmin
      ? db.prepare(
          "SELECT COALESCE(SUM(payment_amount), 0) AS total FROM clients WHERE substr(payment_date, 1, 7) = ?"
        ).get(monthPrefix).total
      : db.prepare(
          "SELECT COALESCE(SUM(payment_amount), 0) AS total FROM clients WHERE substr(payment_date, 1, 7) = ? AND lead_owner = ?"
        ).get(monthPrefix, username).total;

    // Admin vê todos os donos; usuário comum vê só ele mesmo
    const byOwner = isAdmin
      ? db.prepare(`
          SELECT lead_owner, COUNT(*) AS count FROM clients
          GROUP BY lead_owner ORDER BY count DESC, lead_owner ASC
        `).all()
      : db.prepare(`
          SELECT lead_owner, COUNT(*) AS count FROM clients
          WHERE lead_owner = ?
          GROUP BY lead_owner
        `).all(username);

    res.json({ active, expired, monthlyTotal, byOwner });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao gerar resumo.' });
  }
});

// ---- Fallback para SPA --------------------------------------------------
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---- Inicialização ------------------------------------------------------
app.listen(PORT, () => {
  console.log(`\n  Delay Club Manager rodando em: http://localhost:${PORT}\n`);
});


//temporario
app.get('/api/dbsize', requireAdmin, (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'delay_club.db');
  const stats = fs.statSync(dbPath);
  res.json({ bytes: stats.size, kb: (stats.size / 1024).toFixed(2) });
});