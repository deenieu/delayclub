/**
 * seed.js
 * ------------------------------------------------------------------
 * Popula o banco de dados com clientes de exemplo para teste.
 * Uso: npm run seed
 *
 * O script gera datas de pagamento relativas a HOJE para que sempre
 * existam clientes em todos os status (ativo, vence hoje, vencido).
 * ------------------------------------------------------------------
 */

const db = require('./database');

/** Soma N dias a uma data e devolve string YYYY-MM-DD (UTC). */
function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const today = new Date().toISOString().slice(0, 10);

// Cada cliente recebe um "offset" de dias em relação a hoje na data de pagamento.
// Como a renovação é payment_date + 30 dias:
//   offset = -45  -> vencido há 15 dias
//   offset = -30  -> vence HOJE
//   offset = -10  -> ativo, vence em 20 dias
//   offset = 0    -> ativo, vence em 30 dias
const sample = [
  { name: 'Ana Beatriz Souza',     lead_owner: 'Marina',  offset: -45, amount: 297.00 },
  { name: 'Carlos Eduardo Lima',   lead_owner: 'Rafael',  offset: -38, amount: 297.00 },
  { name: 'Daniela Ferreira',      lead_owner: 'Marina',  offset: -32, amount: 497.00 },
  { name: 'Eduardo Tavares',       lead_owner: 'Bruno',   offset: -30, amount: 297.00 },
  { name: 'Fernanda Castro',       lead_owner: 'Rafael',  offset: -25, amount: 297.00 },
  { name: 'Gabriel Mendes',        lead_owner: 'Bruno',   offset: -20, amount: 497.00 },
  { name: 'Helena Rodrigues',      lead_owner: 'Marina',  offset: -15, amount: 297.00 },
  { name: 'Igor Almeida',          lead_owner: 'Bruno',   offset: -10, amount: 297.00 },
  { name: 'Julia Pereira',         lead_owner: 'Rafael',  offset: -5,  amount: 497.00 },
  { name: 'Lucas Oliveira',        lead_owner: 'Marina',  offset: -2,  amount: 297.00 },
  { name: 'Mariana Costa',         lead_owner: 'Rafael',  offset:  0,  amount: 297.00 },
  { name: 'Nicolas Santos',        lead_owner: 'Bruno',   offset:  0,  amount: 497.00 }
];

console.log('Limpando tabela de clientes...');
db.exec("DELETE FROM clients;");
db.exec("DELETE FROM sqlite_sequence WHERE name = 'clients';");

const insert = db.prepare(`
  INSERT INTO clients (name, lead_owner, payment_date, payment_amount, renewal_date)
  VALUES (?, ?, ?, ?, ?)
`);

// Transação manual (mais rápido + atomicidade)
db.exec('BEGIN');
try {
  for (const c of sample) {
    const paymentDate = addDays(today, c.offset);
    const renewalDate = addDays(paymentDate, 30);
    insert.run(c.name, c.lead_owner, paymentDate, c.amount, renewalDate);
  }
  db.exec('COMMIT');
} catch (err) {
  db.exec('ROLLBACK');
  throw err;
}

console.log(`OK! ${sample.length} clientes de exemplo cadastrados.`);
console.log('Você já pode iniciar o servidor com: npm start');
