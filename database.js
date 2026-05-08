/**
 * database.js
 * ------------------------------------------------------------------
 * Configuração do banco de dados usando Turso (SQLite na nuvem).
 * Utiliza o cliente @libsql/client.
 * ------------------------------------------------------------------
 */

const { createClient } = require('@libsql/client');

const db = createClient({
  url:       process.env.TURSO_URL,
  authToken: process.env.TURSO_TOKEN
});

/**
 * Inicializa as tabelas e o usuário admin padrão.
 * Como o cliente Turso é assíncrono, exportamos uma Promise
 * que o server.js aguarda antes de subir o Express.
 */
async function init() {
  // Tabela de clientes
  await db.execute(`
    CREATE TABLE IF NOT EXISTS clients (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT    NOT NULL,
      lead_owner      TEXT    NOT NULL,
      payment_date    TEXT    NOT NULL,
      payment_amount  REAL    NOT NULL,
      renewal_date    TEXT    NOT NULL,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Tabela de usuários
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      username   TEXT    NOT NULL UNIQUE,
      password   TEXT    NOT NULL,
      role       TEXT    NOT NULL DEFAULT 'user',
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Cria o admin padrão se não existir nenhum usuário
  const { rows } = await db.execute('SELECT COUNT(*) AS c FROM users');
  if (Number(rows[0].c) === 0) {
    await db.execute({
      sql: 'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
      args: ['admin', 'delayclub2025', 'admin']
    });
    console.log('  Usuário admin criado com senha padrão: delayclub2025');
    console.log('  ⚠️  Altere a senha após o primeiro acesso!\n');
  }
}

module.exports = { db, init };
