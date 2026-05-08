/* =====================================================================
   Delay Club Manager — Frontend
   Vanilla JS. Conversa com a API REST do back-end.
   ===================================================================== */

// ---------- Estado global ----------
const state = {
  clients: [],          // lista completa vinda da API
  filters: {
    search: '',
    owner: '',
    status: ''
  },
  editingId: null,      // id do cliente em edição (null = novo)
  confirmCallback: null, // callback do modal de confirmação
  currentUser: null     // usuário logado (preenchido no boot via /api/me)
};

// ---------- Elementos do DOM ----------
const $ = (sel) => document.querySelector(sel);

const els = {
  topbarDate:    $('#topbarDate'),

  sumActive:     $('#sumActive'),
  sumExpired:    $('#sumExpired'),
  sumMonthly:    $('#sumMonthly'),
  sumOwners:     $('#sumOwners'),

  searchInput:   $('#searchInput'),
  filterOwner:   $('#filterOwner'),
  filterStatus:  $('#filterStatus'),

  btnAdd:        $('#btnAdd'),

  clientsTable:  $('#clientsTable'),
  clientsTbody:  $('#clientsTbody'),
  clientsCards:  $('#clientsCards'),
  emptyState:    $('#emptyState'),

  modal:         $('#modal'),
  modalTitle:    $('#modalTitle'),
  clientForm:    $('#clientForm'),
  clientId:      $('#clientId'),
  fName:         $('#fName'),
  fOwner:        $('#fOwner'),
  fPaymentDate:  $('#fPaymentDate'),
  fAmount:       $('#fAmount'),
  fRenewalPreview: $('#fRenewalPreview'),
  ownersList:    $('#ownersList'),
  formError:     $('#formError'),

  confirmModal:  $('#confirmModal'),
  confirmTitle:  $('#confirmTitle'),
  confirmMessage:$('#confirmMessage'),
  btnConfirmOk:  $('#btnConfirmOk'),

  toast:         $('#toast')
};

// =====================================================================
// HELPERS
// =====================================================================

/** Data de hoje no formato YYYY-MM-DD (UTC, igual ao backend). */
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Soma N dias a uma data ISO. */
function addDaysISO(dateISO, days) {
  const [y, m, d] = dateISO.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Formata YYYY-MM-DD -> DD/MM/YYYY para exibição. */
function formatDateBR(dateISO) {
  if (!dateISO) return '—';
  const [y, m, d] = dateISO.split('-');
  return `${d}/${m}/${y}`;
}

/** Formata número como moeda BRL. */
function formatBRL(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(value) || 0);
}

/**
 * Calcula o status do cliente comparando renewal_date com a data de hoje.
 * Devolve 'ativo' | 'vence-hoje' | 'vencido'.
 */
function computeStatus(renewalISO) {
  const today = todayISO();
  if (renewalISO === today) return 'vence-hoje';
  if (renewalISO < today)   return 'vencido';
  return 'ativo';
}

const STATUS_LABEL = {
  'ativo':      'Ativo',
  'vence-hoje': 'Vence hoje',
  'vencido':    'Vencido'
};

/** Mostra um toast (mensagem flutuante temporária). */
function showToast(message, type = 'success') {
  els.toast.textContent = message;
  els.toast.className = `toast toast--${type} toast--show`;
  els.toast.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    els.toast.classList.remove('toast--show');
    setTimeout(() => { els.toast.hidden = true; }, 250);
  }, 2400);
}

/** Wrapper para fetch que já trata JSON e erros. */
async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  let data = null;
  try { data = await res.json(); } catch (_) { /* sem body */ }
  if (!res.ok) {
    const msg = (data && data.error) || `Erro ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

// =====================================================================
// CARGA E RENDERIZAÇÃO
// =====================================================================

/** Busca clientes + resumo e re-renderiza tudo. */
async function loadAll() {
  try {
    const [clients, summary] = await Promise.all([
      api('/api/clients'),
      api('/api/summary')
    ]);
    state.clients = clients;
    renderSummary(summary);
    renderOwnerFilter();
    renderOwnersDatalist();
    renderClients();
  } catch (err) {
    console.error(err);
    showToast('Erro ao carregar dados.', 'error');
  }
}

/** Preenche os 4 cards de resumo. */
function renderSummary(summary) {
  els.sumActive.textContent  = summary.active;
  els.sumExpired.textContent = summary.expired;
  els.sumMonthly.textContent = formatBRL(summary.monthlyTotal);

  if (!summary.byOwner.length) {
    els.sumOwners.innerHTML = '<li class="owner-list__empty">Sem dados</li>';
  } else {
    els.sumOwners.innerHTML = summary.byOwner
      .map(o => `<li><span>${escapeHTML(o.lead_owner)}</span><strong>${o.count}</strong></li>`)
      .join('');
  }
}

/** Popula o select de filtro por dono do lead com opções únicas. */
function renderOwnerFilter() {
  const owners = [...new Set(state.clients.map(c => c.lead_owner))].sort((a, b) =>
    a.localeCompare(b, 'pt-BR')
  );
  const current = state.filters.owner;
  els.filterOwner.innerHTML =
    '<option value="">Todos</option>' +
    owners.map(o => `<option value="${escapeAttr(o)}">${escapeHTML(o)}</option>`).join('');
  // Se o dono filtrado ainda existir, mantém a seleção
  if (owners.includes(current)) els.filterOwner.value = current;
  else state.filters.owner = '';
}

/** Datalist no formulário com sugestões dos donos já cadastrados. */
function renderOwnersDatalist() {
  const owners = [...new Set(state.clients.map(c => c.lead_owner))].sort();
  els.ownersList.innerHTML = owners
    .map(o => `<option value="${escapeAttr(o)}"></option>`)
    .join('');
}

/** Aplica filtros + busca e renderiza tabela e cards. */
function renderClients() {
  const { search, owner, status } = state.filters;
  const term = search.trim().toLowerCase();

  const filtered = state.clients.filter(c => {
    if (term && !c.name.toLowerCase().includes(term)) return false;
    if (owner && c.lead_owner !== owner) return false;
    if (status && computeStatus(c.renewal_date) !== status) return false;
    return true;
  });

  if (filtered.length === 0) {
    els.clientsTbody.innerHTML = '';
    els.clientsCards.innerHTML = '';
    els.emptyState.hidden = false;
    return;
  }
  els.emptyState.hidden = true;

  // ---- Linhas da tabela (desktop) ----
  els.clientsTbody.innerHTML = filtered.map(c => {
    const st = computeStatus(c.renewal_date);
    return `
      <tr>
        <td><span class="client-name">${escapeHTML(c.name)}</span></td>
        <td>${escapeHTML(c.lead_owner)}</td>
        <td class="cell-date">${formatDateBR(c.payment_date)}</td>
        <td class="cell-amount">${formatBRL(c.payment_amount)}</td>
        <td class="cell-date">${formatDateBR(c.renewal_date)}</td>
        <td><span class="badge badge--${st}">${STATUS_LABEL[st]}</span></td>
        <td class="cell-actions">
          <div class="row-actions">
            <button class="btn-icon btn-icon--renew" title="Renovar (define hoje como pagamento)"
                    data-action="renew" data-id="${c.id}">⟳</button>
            <button class="btn-icon" title="Editar"
                    data-action="edit"  data-id="${c.id}">✎</button>
            <button class="btn-icon btn-icon--del" title="Excluir"
                    data-action="del"   data-id="${c.id}">×</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // ---- Cards (mobile) ----
  els.clientsCards.innerHTML = filtered.map(c => {
    const st = computeStatus(c.renewal_date);
    return `
      <div class="client-card">
        <div class="client-card__head">
          <span class="client-name">${escapeHTML(c.name)}</span>
          <span class="badge badge--${st}">${STATUS_LABEL[st]}</span>
        </div>
        <div class="client-card__owner">Dono do lead: <strong>${escapeHTML(c.lead_owner)}</strong></div>
        <dl class="client-card__grid">
          <div><dt>Pagamento</dt><dd>${formatDateBR(c.payment_date)}</dd></div>
          <div><dt>Valor</dt><dd>${formatBRL(c.payment_amount)}</dd></div>
          <div><dt>Renovação</dt><dd>${formatDateBR(c.renewal_date)}</dd></div>
        </dl>
        <div class="client-card__actions">
          <button class="btn-icon btn-icon--renew" title="Renovar"
                  data-action="renew" data-id="${c.id}">⟳</button>
          <button class="btn-icon" title="Editar"
                  data-action="edit"  data-id="${c.id}">✎</button>
          <button class="btn-icon btn-icon--del" title="Excluir"
                  data-action="del"   data-id="${c.id}">×</button>
        </div>
      </div>
    `;
  }).join('');
}

/** Pequenos helpers para evitar XSS ao montar HTML. */
function escapeHTML(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function escapeAttr(str) { return escapeHTML(str); }

// =====================================================================
// MODAL DE CADASTRO / EDIÇÃO
// =====================================================================

function openModal(client = null) {
  state.editingId = client ? client.id : null;
  els.modalTitle.textContent = client ? 'Editar cliente' : 'Novo cliente';
  els.formError.hidden = true;

  if (client) {
    els.clientId.value     = client.id;
    els.fName.value        = client.name;
    els.fOwner.value       = client.lead_owner;
    els.fPaymentDate.value = client.payment_date;
    els.fAmount.value      = client.payment_amount;
  } else {
    els.clientForm.reset();
    els.clientId.value = '';
    els.fPaymentDate.value = todayISO(); // novo cliente: pagamento = hoje por padrão

    // Pré-preenche o dono do lead com o usuário logado
    if (state.currentUser) {
      els.fOwner.value = state.currentUser.username;
    }
  }
  updateRenewalPreview();
  els.modal.hidden = false;
  setTimeout(() => els.fName.focus(), 50);
}

function closeModal() {
  els.modal.hidden = true;
  state.editingId = null;
}

/** Atualiza o preview da data de renovação ao digitar a data de pagamento. */
function updateRenewalPreview() {
  const d = els.fPaymentDate.value;
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    els.fRenewalPreview.textContent = '—';
    return;
  }
  els.fRenewalPreview.textContent = formatDateBR(addDaysISO(d, 30));
}

/** Submit do formulário: cria ou atualiza. */
async function handleSubmit(e) {
  e.preventDefault();
  els.formError.hidden = true;

  const payload = {
    name:           els.fName.value.trim(),
    lead_owner:     els.fOwner.value.trim(),
    payment_date:   els.fPaymentDate.value,
    payment_amount: Number(els.fAmount.value)
  };

  // Validação básica no client (o servidor revalida)
  if (!payload.name || !payload.lead_owner || !payload.payment_date || isNaN(payload.payment_amount)) {
    els.formError.textContent = 'Preencha todos os campos obrigatórios.';
    els.formError.hidden = false;
    return;
  }
  if (payload.payment_amount < 0) {
    els.formError.textContent = 'O valor pago não pode ser negativo.';
    els.formError.hidden = false;
    return;
  }

  try {
    if (state.editingId) {
      await api(`/api/clients/${state.editingId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      showToast('Cliente atualizado.');
    } else {
      await api('/api/clients', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showToast('Cliente cadastrado.');
    }
    closeModal();
    await loadAll();
  } catch (err) {
    els.formError.textContent = err.message;
    els.formError.hidden = false;
  }
}

// =====================================================================
// MODAL DE CONFIRMAÇÃO (genérico)
// =====================================================================

function askConfirm({ title, message, okLabel = 'Confirmar', onConfirm }) {
  els.confirmTitle.textContent = title;
  els.confirmMessage.textContent = message;
  els.btnConfirmOk.textContent = okLabel;
  state.confirmCallback = onConfirm;
  els.confirmModal.hidden = false;
}

function closeConfirm() {
  els.confirmModal.hidden = true;
  state.confirmCallback = null;
}

// =====================================================================
// AÇÕES (renovar / editar / excluir)
// =====================================================================

async function actionRenew(client) {
  askConfirm({
    title: 'Renovar cliente',
    message: `Deseja renovar "${client.name}"? A data do pagamento será atualizada para hoje e a renovação para daqui a 30 dias.`,
    okLabel: 'Renovar',
    onConfirm: async () => {
      try {
        await api(`/api/clients/${client.id}/renew`, { method: 'POST' });
        showToast('Cliente renovado.');
        await loadAll();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  });
}

function actionEdit(client) {
  openModal(client);
}

async function actionDelete(client) {
  askConfirm({
    title: 'Excluir cliente',
    message: `Tem certeza que deseja excluir "${client.name}"? Esta ação não pode ser desfeita.`,
    okLabel: 'Excluir',
    onConfirm: async () => {
      try {
        await api(`/api/clients/${client.id}`, { method: 'DELETE' });
        showToast('Cliente excluído.');
        await loadAll();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  });
}

// =====================================================================
// EVENT BINDINGS
// =====================================================================

function bindEvents() {
  // Filtros
  els.searchInput.addEventListener('input', (e) => {
    state.filters.search = e.target.value;
    renderClients();
  });
  els.filterOwner.addEventListener('change', (e) => {
    state.filters.owner = e.target.value;
    renderClients();
  });
  els.filterStatus.addEventListener('change', (e) => {
    state.filters.status = e.target.value;
    renderClients();
  });

  // Adicionar
  els.btnAdd.addEventListener('click', () => openModal());

  // Modal de cadastro
  els.modal.addEventListener('click', (e) => {
    if (e.target.dataset.close === 'true') closeModal();
  });
  els.clientForm.addEventListener('submit', handleSubmit);
  els.fPaymentDate.addEventListener('input', updateRenewalPreview);

  // Modal de confirmação
  els.confirmModal.addEventListener('click', (e) => {
    if (e.target.dataset.closeConfirm === 'true') closeConfirm();
  });
  els.btnConfirmOk.addEventListener('click', async () => {
    const cb = state.confirmCallback;
    closeConfirm();
    if (cb) await cb();
  });

  // ESC fecha modais
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!els.modal.hidden) closeModal();
      if (!els.confirmModal.hidden) closeConfirm();
    }
  });

  // Delegação para os botões de ação dentro da lista
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action][data-id]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const client = state.clients.find(c => c.id === id);
    if (!client) return;
    switch (btn.dataset.action) {
      case 'renew': actionRenew(client); break;
      case 'edit':  actionEdit(client);  break;
      case 'del':   actionDelete(client); break;
    }
  });
}

// =====================================================================
// BOOT
// =====================================================================

function setTopbarDate() {
  const d = new Date();
  const fmt = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  });
  els.topbarDate.textContent = fmt.format(d);
}

document.addEventListener('DOMContentLoaded', async () => {
  setTopbarDate();
  bindEvents();

  // Carrega o usuário logado uma única vez.
  // Também controla a visibilidade do link de admin no menu.
  try {
    state.currentUser = await api('/api/me');
    if (state.currentUser?.role === 'admin') {
      const nav = document.getElementById('navUsuarios');
      if (nav) nav.style.display = 'inline-flex';
    }
  } catch (_) {}

  loadAll();
});
