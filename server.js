/**
 * server.js
 * ------------------------------------------------------------------
 * Backend principal do Delay Club Manager.
 * - Serve os arquivos estáticos da pasta /public
 * - Expõe a API REST em /api/*
 * - Autenticação via sessão com usuários no banco de dados
 * - Banco de dados: Turso (SQLite na nuvem)
 * - Notificações WhatsApp via Twilio
 * ------------------------------------------------------------------
 */

const path = require('path');
const express = require('express');
const session = require('express-session');
const https = require('https');
const { db, init } = require('./database');

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

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
  }

  try {
    const { rows } = await db.execute({
      sql: 'SELECT * FROM users WHERE username = ?',
      args: [username.toLowerCase().trim()]
    });
    const user = rows[0];

    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
    }

    req.session.user = { id: Number(user.id), username: user.username, role: user.role };
    res.json({ ok: true, role: user.role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao fazer login.' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Não autorizado.' });
  res.json(req.session.user);
});

// ---- Rotas de gerenciamento de usuários (somente admin) -----------------

app.get('/api/users', requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.execute('SELECT id, username, role, created_at FROM users ORDER BY created_at ASC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar usuários.' });
  }
});

app.post('/api/users', requireAdmin, async (req, res) => {
  const { username, password, role } = req.body || {};

  if (!username || !username.trim()) return res.status(400).json({ error: 'Nome de usuário é obrigatório.' });
  if (!password || password.length < 4) return res.status(400).json({ error: 'Senha deve ter ao menos 4 caracteres.' });
  if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: 'Perfil inválido.' });

  try {
    const { rows } = await db.execute({
      sql: 'SELECT id FROM users WHERE username = ?',
      args: [username.toLowerCase().trim()]
    });
    if (rows.length > 0) return res.status(409).json({ error: 'Esse nome de usuário já existe.' });

    const result = await db.execute({
      sql: 'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
      args: [username.toLowerCase().trim(), password, role]
    });
    const { rows: created } = await db.execute({
      sql: 'SELECT id, username, role, created_at FROM users WHERE id = ?',
      args: [result.lastInsertRowid]
    });
    res.status(201).json(created[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar usuário.' });
  }
});

app.put('/api/users/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { password, role } = req.body || {};

  try {
    const { rows } = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [id] });
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    if (req.session.user.id === id && role && role !== 'admin') {
      return res.status(400).json({ error: 'Você não pode remover seu próprio perfil de admin.' });
    }

    if (password && password.length < 4) return res.status(400).json({ error: 'Senha deve ter ao menos 4 caracteres.' });
    if (role && !['admin', 'user'].includes(role)) return res.status(400).json({ error: 'Perfil inválido.' });

    const newPassword = password || user.password;
    const newRole = role || user.role;

    await db.execute({ sql: 'UPDATE users SET password = ?, role = ? WHERE id = ?', args: [newPassword, newRole, id] });
    const { rows: updated } = await db.execute({
      sql: 'SELECT id, username, role, created_at FROM users WHERE id = ?',
      args: [id]
    });
    res.json(updated[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar usuário.' });
  }
});

app.delete('/api/users/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);

  if (req.session.user.id === id) {
    return res.status(400).json({ error: 'Você não pode excluir sua própria conta.' });
  }

  try {
    const result = await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [id] });
    if (result.rowsAffected === 0) return res.status(404).json({ error: 'Usuário não encontrado.' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir usuário.' });
  }
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

app.get('/api/clients', async (req, res) => {
  const { role, username } = req.session.user;
  try {
    const { rows } = role === 'admin'
      ? await db.execute('SELECT id, name, lead_owner, payment_date, payment_amount, renewal_date FROM clients ORDER BY renewal_date ASC')
      : await db.execute({
          sql: 'SELECT id, name, lead_owner, payment_date, payment_amount, renewal_date FROM clients WHERE lead_owner = ? ORDER BY renewal_date ASC',
          args: [username]
        });
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar clientes.' });
  }
});

app.post('/api/clients', async (req, res) => {
  const check = validateClientPayload(req.body);
  if (!check.ok) return res.status(400).json({ error: check.error });

  const { name, lead_owner, payment_date, payment_amount } = req.body;
  const { role, username } = req.session.user;

  if (role !== 'admin' && lead_owner.trim() !== username) {
    return res.status(403).json({ error: 'Você só pode cadastrar clientes sob seu próprio nome.' });
  }

  const renewal_date = addDays(payment_date, 30);

  try {
    const result = await db.execute({
      sql: 'INSERT INTO clients (name, lead_owner, payment_date, payment_amount, renewal_date) VALUES (?, ?, ?, ?, ?)',
      args: [name.trim(), lead_owner.trim(), payment_date, Number(payment_amount), renewal_date]
    });
    const { rows } = await db.execute({ sql: 'SELECT * FROM clients WHERE id = ?', args: [result.lastInsertRowid] });
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar cliente.' });
  }
});

app.put('/api/clients/:id', async (req, res) => {
  const id = Number(req.params.id);
  const check = validateClientPayload(req.body);
  if (!check.ok) return res.status(400).json({ error: check.error });

  const { name, lead_owner, payment_date, payment_amount } = req.body;
  const { role, username } = req.session.user;
  const renewal_date = addDays(payment_date, 30);

  try {
    const { rows: existing } = await db.execute({ sql: 'SELECT id, lead_owner FROM clients WHERE id = ?', args: [id] });
    if (existing.length === 0) return res.status(404).json({ error: 'Cliente não encontrado.' });

    if (role !== 'admin' && existing[0].lead_owner !== username) {
      return res.status(403).json({ error: 'Você não tem permissão para editar este cliente.' });
    }
    if (role !== 'admin' && lead_owner.trim() !== username) {
      return res.status(403).json({ error: 'Você não pode alterar o dono do lead.' });
    }

    await db.execute({
      sql: `UPDATE clients SET name = ?, lead_owner = ?, payment_date = ?, payment_amount = ?, renewal_date = ?, updated_at = datetime('now') WHERE id = ?`,
      args: [name.trim(), lead_owner.trim(), payment_date, Number(payment_amount), renewal_date, id]
    });
    const { rows } = await db.execute({ sql: 'SELECT * FROM clients WHERE id = ?', args: [id] });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar cliente.' });
  }
});

app.delete('/api/clients/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { role, username } = req.session.user;

  try {
    const { rows: existing } = await db.execute({ sql: 'SELECT id, lead_owner FROM clients WHERE id = ?', args: [id] });
    if (existing.length === 0) return res.status(404).json({ error: 'Cliente não encontrado.' });

    if (role !== 'admin' && existing[0].lead_owner !== username) {
      return res.status(403).json({ error: 'Você não tem permissão para excluir este cliente.' });
    }

    await db.execute({ sql: 'DELETE FROM clients WHERE id = ?', args: [id] });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir cliente.' });
  }
});

app.post('/api/clients/:id/renew', async (req, res) => {
  const id = Number(req.params.id);
  const { role, username } = req.session.user;
  const newPaymentDate = todayStr();
  const newRenewalDate = addDays(newPaymentDate, 30);

  try {
    const { rows: existing } = await db.execute({ sql: 'SELECT id, lead_owner FROM clients WHERE id = ?', args: [id] });
    if (existing.length === 0) return res.status(404).json({ error: 'Cliente não encontrado.' });

    if (role !== 'admin' && existing[0].lead_owner !== username) {
      return res.status(403).json({ error: 'Você não tem permissão para renovar este cliente.' });
    }

    await db.execute({
      sql: `UPDATE clients SET payment_date = ?, renewal_date = ?, updated_at = datetime('now') WHERE id = ?`,
      args: [newPaymentDate, newRenewalDate, id]
    });
    const { rows } = await db.execute({ sql: 'SELECT * FROM clients WHERE id = ?', args: [id] });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao renovar cliente.' });
  }
});

app.get('/api/summary', async (req, res) => {
  const { role, username } = req.session.user;
  const isAdmin = role === 'admin';

  try {
    const today = todayStr();
    const monthPrefix = today.slice(0, 7);

    const { rows: activeRows } = isAdmin
      ? await db.execute({ sql: 'SELECT COUNT(*) AS c FROM clients WHERE renewal_date >= ?', args: [today] })
      : await db.execute({ sql: 'SELECT COUNT(*) AS c FROM clients WHERE renewal_date >= ? AND lead_owner = ?', args: [today, username] });

    const { rows: expiredRows } = isAdmin
      ? await db.execute({ sql: 'SELECT COUNT(*) AS c FROM clients WHERE renewal_date < ?', args: [today] })
      : await db.execute({ sql: 'SELECT COUNT(*) AS c FROM clients WHERE renewal_date < ? AND lead_owner = ?', args: [today, username] });

    const { rows: monthlyRows } = isAdmin
      ? await db.execute({ sql: "SELECT COALESCE(SUM(payment_amount), 0) AS total FROM clients WHERE substr(payment_date, 1, 7) = ?", args: [monthPrefix] })
      : await db.execute({ sql: "SELECT COALESCE(SUM(payment_amount), 0) AS total FROM clients WHERE substr(payment_date, 1, 7) = ? AND lead_owner = ?", args: [monthPrefix, username] });

    const { rows: byOwner } = isAdmin
      ? await db.execute('SELECT lead_owner, COUNT(*) AS count FROM clients GROUP BY lead_owner ORDER BY count DESC, lead_owner ASC')
      : await db.execute({ sql: 'SELECT lead_owner, COUNT(*) AS count FROM clients WHERE lead_owner = ? GROUP BY lead_owner', args: [username] });

    res.json({
      active:       Number(activeRows[0].c),
      expired:      Number(expiredRows[0].c),
      monthlyTotal: Number(monthlyRows[0].total),
      byOwner
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao gerar resumo.' });
  }
});

// ---- Notificações WhatsApp via Twilio -----------------------------------

function sendWhatsApp(message) {
  return new Promise((resolve, reject) => {
    const sid   = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from  = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';
    const to    = process.env.NOTIFY_WHATSAPP_TO;

    if (!sid || !token || !to) {
      console.warn('  Twilio não configurado — notificação ignorada.');
      return resolve();
    }

    const body = new URLSearchParams({
      From: from,
      To:   `whatsapp:${to}`,
      Body: message
    }).toString();

    const options = {
      hostname: 'api.twilio.com',
      path:     `/2010-04-01/Accounts/${sid}/Messages.json`,
      method:   'POST',
      headers: {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Authorization':  'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log('  ✅ WhatsApp enviado com sucesso.');
          resolve();
        } else {
          console.error('  ❌ Erro Twilio:', data);
          reject(new Error(data));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function checkAndNotify() {
  console.log('  🔔 Verificando clientes vencendo amanhã...');
  try {
    const tomorrow = addDays(todayStr(), 1);
    const { rows } = await db.execute({
      sql: 'SELECT name, lead_owner, renewal_date FROM clients WHERE renewal_date = ? ORDER BY name ASC',
      args: [tomorrow]
    });

    if (rows.length === 0) {
      console.log('  Nenhum cliente vencendo amanhã.');
      return;
    }

    const lista = rows.map(c => `• ${c.name} (${c.lead_owner})`).join('\n');
    const mensagem =
      `⚠️ *Delay Club — Renovações de amanhã (${tomorrow.split('-').reverse().join('/')})*\n\n` +
      `${lista}\n\n` +
      `Total: ${rows.length} cliente(s)`;

    await sendWhatsApp(mensagem);
  } catch (err) {
    console.error('  Erro ao verificar notificações:', err);
  }
}

// Agenda o job para rodar todo dia às 08:00 (horário do servidor)
// Para alterar: scheduleDaily(HORA, MINUTO, checkAndNotify)
// Exemplo: scheduleDaily(9, 30, checkAndNotify) → roda às 09:30
function scheduleDaily(hour, minute, fn) {
  function getNextDelay() {
    const now = new Date();
    const next = new Date();
    next.setHours(hour, minute, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next - now;
  }

  function loop() {
    setTimeout(() => { fn(); loop(); }, getNextDelay());
  }

  loop();
  console.log(`  📅 Notificações agendadas para ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')} todo dia.`);
}

// ---- Fallback para SPA --------------------------------------------------
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---- Inicialização ------------------------------------------------------
init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n  Delay Club Manager rodando em: http://localhost:${PORT}\n`);
    });

    scheduleDaily(14, 50, checkAndNotify);
  })
  .catch(err => {
    console.error('Erro ao inicializar banco de dados:', err);
    process.exit(1);
  });
