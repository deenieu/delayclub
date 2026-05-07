/**
 * database.js
 * ------------------------------------------------------------------
 * Configuração do banco de dados SQLite usando o módulo NATIVO do
 * Node.js (`node:sqlite`), disponível a partir do Node 22.5+.
 *
 * Vantagens:
 *  - Zero dependências nativas para compilar
 *  - Funciona igual em Linux, macOS e Windows
 *  - API síncrona, simples e familiar
 *
 * Cria o arquivo do banco automaticamente na primeira execução
 * e expõe a instância pronta para uso pelo restante da aplicação.
 * ------------------------------------------------------------------
 */

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

// Garante que a pasta /data existe (onde o arquivo .db será salvo)
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Caminho final do arquivo do banco
const dbPath = path.join(dataDir, 'delay_club.db');

// Abre (ou cria) o banco
const db = new DatabaseSync(dbPath);

// Otimização: WAL (write-ahead logging) acelera escritas
db.exec('PRAGMA journal_mode = WAL;');

/**
 * Cria a tabela de clientes caso ainda não exista.
 * Os campos de data são armazenados como TEXT no formato ISO (YYYY-MM-DD)
 * para facilitar comparação lexicográfica e parsing no front.
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL,
    lead_owner      TEXT    NOT NULL,
    payment_date    TEXT    NOT NULL,   -- YYYY-MM-DD
    payment_amount  REAL    NOT NULL,
    renewal_date    TEXT    NOT NULL,   -- YYYY-MM-DD (sempre = payment_date + 30 dias)
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

module.exports = db;
