/**
 * database.js
 * ------------------------------------------------------------------
 * Configuração do banco de dados SQLite usando o módulo NATIVO do
 * Node.js (`node:sqlite`), disponível a partir do Node 22.5+.
 * ------------------------------------------------------------------
 */

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const dataDir = process.env.DB_PATH
  ? path.dirname(process.env.DB_PATH)
  : path.join(__dirname, 'data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DB_PATH || path.join(dataDir, 'delay_club.db');

const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL;');

// Tabela de clientes
db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL,
    lead_owner      TEXT    NOT NULL,
    payment_date    TEXT    NOT NULL,
    payment_amount  REAL    NOT NULL,
    renewal_date    TEXT    NOT NULL,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

// Tabela de usuários
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT    NOT NULL UNIQUE,
    password   TEXT    NOT NULL,
    role       TEXT    NOT NULL DEFAULT 'user',  -- 'admin' ou 'user'
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

// Cria o admin padrão se não existir nenhum usuário
const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
if (userCount === 0) {
  db.prepare(`
    INSERT INTO users (username, password, role) VALUES (?, ?, ?)
  `).run('admin', 'delayclub2025', 'admin');
  console.log('  Usuário admin criado com senha padrão: delayclub2025');
  console.log('  ⚠️  Altere a senha após o primeiro acesso!\n');
}

module.exports = db;
