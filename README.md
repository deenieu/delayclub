# Delay Club Manager

Sistema web simples para controlar os clientes do grupo VIP **Delay Club**.
Substitui a planilha de controle por uma interface web limpa, com banco de dados persistente.

---

## ✨ Funcionalidades

- Cadastrar, editar e excluir clientes
- Cálculo automático da **Data de Renovação** (Data do Pagamento + 30 dias)
- **Status automático** por cliente:
  - 🟢 **Ativo** — ainda não venceu
  - 🟡 **Vence hoje** — renovação é hoje
  - 🔴 **Vencido** — passou da data de renovação
- Botão **Renovar** (atualiza o pagamento para hoje e gera nova renovação em +30 dias)
- Filtros por **Dono do Lead** e por **Status**
- Busca por **nome do cliente**
- Resumo no topo:
  - Total de clientes ativos
  - Total de vencidos
  - Total recebido no mês corrente
  - Quantidade de clientes por dono do lead
- Interface **responsiva** (computador e celular)
- Banco de dados **SQLite** (persistência em arquivo)

---

## 📦 Tecnologias

- **Back-end:** Node.js + Express
- **Banco de dados:** SQLite (módulo nativo `node:sqlite`, sem dependências para compilar)
- **Front-end:** HTML + CSS + JavaScript puro (sem build / sem framework)

> Usamos o módulo nativo `node:sqlite` que vem embutido no Node 22.5+.
> Por isso a instalação é instantânea — não precisa compilar nada nativo.

---

## 📂 Estrutura do projeto

```
delay-club-manager/
├── package.json          # dependências e scripts
├── server.js             # servidor Express + rotas da API
├── database.js           # configuração do SQLite e schema da tabela
├── seed.js               # script para popular dados de exemplo
├── README.md
├── data/
│   └── delay_club.db     # criado automaticamente na 1ª execução
└── public/               # front-end (servido estático pelo Express)
    ├── index.html
    ├── styles.css
    └── app.js
```

---

## 🚀 Como rodar

### 1. Pré-requisitos
- **Node.js 22.5 ou superior** (que já inclui o `npm`)
  - Para verificar: `node --version`
  - Download: <https://nodejs.org/> (baixe a versão **LTS**, que é a 22.x)
  - O sistema usa o módulo SQLite nativo do Node 22.5+, então não há dependências nativas para compilar.

### 2. Instalar as dependências

Abra o terminal dentro da pasta do projeto e rode:

```bash
npm install
```

### 3. (Opcional) Carregar dados de exemplo

Para testar o sistema com 12 clientes pré-cadastrados (em diferentes status: ativos, vencidos e vencendo hoje):

```bash
npm run seed
```

> ⚠️ Esse comando **apaga** os clientes existentes e recria a base de exemplo.
> Pule este passo se quiser começar com a base vazia.

### 4. Iniciar o servidor

```bash
npm start
```

Você verá no console:

```
  Delay Club Manager rodando em: http://localhost:3000
```

### 5. Abrir no navegador

Acesse: **<http://localhost:3000>**

Pronto! O sistema já está funcionando.

---

## 🧑‍💻 Como usar

### Cadastrar um cliente
1. Clique em **“+ Adicionar Cliente”** no canto superior direito.
2. Preencha:
   - Nome do cliente
   - Dono do lead (digite ou escolha um já existente)
   - Data do pagamento
   - Valor pago
3. A **Data de Renovação** aparece automaticamente (pagamento + 30 dias).
4. Clique em **Salvar**.

### Filtrar clientes
- Use a **busca por nome** para encontrar rapidamente um cliente.
- Use os filtros de **Dono do lead** e **Status** para segmentar a lista.

### Renovar um cliente
- Clique no botão **⟳** (verde) na linha do cliente.
- Confirme a renovação.
- A data do pagamento vira **hoje** e a renovação é recalculada para daqui a 30 dias.

### Editar / Excluir
- **✎** edita o cliente
- **×** exclui o cliente (pede confirmação)

---

## 🔌 Endpoints da API

Caso queira integrar com outro sistema, todos os dados também ficam disponíveis via API REST:

| Método  | Rota                       | Descrição                                          |
|---------|----------------------------|----------------------------------------------------|
| GET     | `/api/clients`             | Lista todos os clientes                            |
| POST    | `/api/clients`             | Cria um cliente                                    |
| PUT     | `/api/clients/:id`         | Atualiza um cliente                                |
| DELETE  | `/api/clients/:id`         | Remove um cliente                                  |
| POST    | `/api/clients/:id/renew`   | Renova (pagamento = hoje, renovação = hoje + 30d)  |
| GET     | `/api/summary`             | Retorna o resumo (totais e contagem por dono)      |

**Exemplo de payload (POST/PUT):**

```json
{
  "name": "Maria Silva",
  "lead_owner": "Marina",
  "payment_date": "2026-05-07",
  "payment_amount": 297.00
}
```

---

## 💾 Sobre os dados

- O banco é um arquivo SQLite em `data/delay_club.db`.
- Os dados ficam salvos no disco e **persistem** entre reinícios do servidor.
- Para fazer backup: basta copiar esse arquivo.
- Para começar do zero: apague o arquivo (será recriado vazio na próxima execução).

---

## ⚙️ Mudar a porta

Por padrão o servidor sobe em `3000`. Para usar outra porta:

```bash
PORT=8080 npm start          # Linux / macOS
$env:PORT=8080; npm start    # Windows PowerShell
```

---

## 📝 Licença

MIT — uso interno do Delay Club.
