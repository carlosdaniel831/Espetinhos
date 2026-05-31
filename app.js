/* ───── DADOS ──────────────────────────────────────────── */
const produtos = {
  baiaoTrad: { nome:'🍲 Baião Tradicional', preco:8 },
  baiaoCrem: { nome:'🥘 Baião Cremoso',     preco:8 },
  porco:     { nome:'🐷 Espeto de Porco',   preco:7 },
  boi:       { nome:'🐄 Espeto de Boi',     preco:7 },
  frango:    { nome:'🍗 Espeto de Frango',  preco:7 },
  linguica:  { nome:'🌭 Espeto de Linguiça',preco:7 },
  refri1:    { nome:'🥤 Guaraná 1L',        preco:7 },
  refri15:   { nome:'🥤 Refrigerante 1,5L', preco:13 },
  refri2:    { nome:'🥤 Refrigerante 2L',   preco:15 },
  refriLata: { nome:'🥤 Refrigerante Lata', preco:5 }
};

const sabores = ['Coca-Cola','Fanta','Guaraná','Cajuína'];

/* ───── ESTADO ─────────────────────────────────────────── */
let carrinho = {};
Object.keys(produtos).forEach(p => { carrinho[p] = 0; });

let pedidos = {};
let proximoNumero = 1;
let db = null;

// Estado do modal de edição
let editKey = null;
let editCarrinho = {};

/* ───── FIREBASE ───────────────────────────────────────── */
function salvarConfigFirebase(){
  const url = document.getElementById('inputFirebaseUrl').value.trim();
  if(!url || !url.includes('firebase')){ toast('URL inválida', true); return; }
  localStorage.setItem('firebase_url', url);
  document.getElementById('setupOverlay').style.display = 'none';
  iniciarFirebase(url);
}

function iniciarFirebase(url){
  try{
    if(!firebase.apps.length) firebase.initializeApp({ databaseURL: url });
    db = firebase.database();

    db.ref('.info/connected').on('value', snap => {
      const ok = snap.val() === true;
      document.getElementById('statusDot').style.background = ok ? '#21C45D' : '#E74C3C';
      document.getElementById('statusTexto').textContent = ok ? 'Online' : 'Offline';
    });

    db.ref('pedidos').on('value', snap => {
      pedidos = snap.val() || {};
      calcularProximoNumero();
      renderPedidos();
      renderResumo();
      atualizarNumPedido();
    });
  } catch(e){
    toast('Erro ao conectar', true);
    console.error(e);
  }
}

function calcularProximoNumero(){
  const nums = Object.values(pedidos).map(p => p.id || 0);
  proximoNumero = nums.length > 0 ? Math.max(...nums) + 1 : 1;
}

function atualizarNumPedido(){
  document.getElementById('pedidoNumero').textContent = '#' + String(proximoNumero).padStart(3,'0');
}

/* ───── CARDÁPIO ───────────────────────────────────────── */
function iniciarProdutos(){
  document.getElementById('products').innerHTML = renderCardapio(carrinho, 'alterar', false);
}

/**
 * Renderiza os cards de produto de forma reutilizável.
 * @param {Object} carrinhoLocal  - objeto { prodId: qtd }
 * @param {string} fnAlterar      - nome da função JS chamada pelos botões
 * @param {boolean} isModal       - true = dentro do modal de edição
 */
function renderCardapio(carrinhoLocal, fnAlterar, isModal){
  return Object.entries(produtos).map(([id, p]) => {
    const qtd = carrinhoLocal[id] || 0;
    const prefix = isModal ? 'edit-' : '';
    return `
      <div class="product">
        <div class="product-top">
          <div class="product-info">
            <strong>${p.nome}</strong>
            <p>${moeda(p.preco)}</p>
          </div>
          <div class="qty-wrap">
            <button class="qty-btn minus" onclick="${fnAlterar}('${id}',-1)">-</button>
            <div class="qty-number" id="${prefix}q-${id}">${qtd}</div>
            <button class="qty-btn plus"  onclick="${fnAlterar}('${id}',1)">+</button>
          </div>
        </div>
        ${id.includes('refri') && id !== 'refri1' ? `
          <select class="refri-select" id="${prefix}sabor-${id}">
            <option value="">Escolha o sabor</option>
            ${sabores.map(s=>`<option value="${s}">${s}</option>`).join('')}
          </select>` : ''}
      </div>
    `;
  }).join('');
}

/* ───── NOVO PEDIDO ────────────────────────────────────── */
function alterar(id, valor){
  carrinho[id] = Math.max(0, (carrinho[id] || 0) + valor);
  document.getElementById(`q-${id}`).textContent = carrinho[id];
  atualizarTotal();
}

function atualizarTotal(){
  let total = 0;
  Object.entries(carrinho).forEach(([id,qtd]) => { total += qtd * produtos[id].preco; });
  document.getElementById('total').textContent = moeda(total);
}

function finalizarPedido(){
  if(!db){ toast('Banco não conectado!', true); return; }

  const cliente = document.getElementById('cliente').value.trim();
  if(!cliente){ toast('Informe o nome do cliente', true); return; }

  if(!Object.values(carrinho).some(q => q > 0)){
    toast('Adicione pelo menos 1 item', true); return;
  }

  const pagamento = document.getElementById('pagamento').value;

  const { itens, total, erro } = montarItens(carrinho, false);
  if(erro){ toast(erro, true); return; }

  db.ref('pedidos').push({
    id:        proximoNumero,
    cliente,
    itens,
    total,
    pagamento,
    pago:      false,
    entregue:  false,
    obs:       document.getElementById('obs').value.trim(),
    hora:      new Date().toLocaleTimeString('pt-BR',{ hour:'2-digit', minute:'2-digit' }),
    timestamp: Date.now()
  })
  .then(() => { limpar(); toast('✅ Pedido criado!'); })
  .catch(() => toast('Erro ao salvar', true));
}

/**
 * Transforma o carrinho em objeto de itens { nome: qtd } e calcula total.
 * Retorna { itens, total, erro }
 */
function montarItens(carrinhoLocal, isModal){
  const prefix = isModal ? 'edit-' : '';
  const itens = {};
  let total = 0;
  for(const [id, qtd] of Object.entries(carrinhoLocal)){
    if(qtd <= 0) continue;
    let nome = produtos[id].nome;
    if(id.includes('refri') && id !== 'refri1'){
      const sel = document.getElementById(`${prefix}sabor-${id}`);
      const sabor = sel ? sel.value : '';
      if(!sabor) return { itens:null, total:0, erro:'Escolha o sabor do refrigerante' };
      nome += ` (${sabor})`;
    }
    itens[nome] = qtd;
    total += qtd * produtos[id].preco;
  }
  return { itens, total, erro:null };
}

/* ───── MODAL DE EDIÇÃO ────────────────────────────────── */
function abrirModal(key){
  const p = pedidos[key];
  if(!p) return;
  editKey = key;

  document.getElementById('editCliente').value  = p.cliente || '';
  document.getElementById('editObs').value      = p.obs     || '';
  document.getElementById('editPagamento').value = p.pagamento || '';

  editCarrinho = {};
  Object.keys(produtos).forEach(id => { editCarrinho[id] = 0; });

  for(const [nomeCompleto, qtd] of Object.entries(p.itens || {})){
    for(const [id, prod] of Object.entries(produtos)){
      if(nomeCompleto.startsWith(prod.nome.replace(/\s*\(.*\)$/,'').trim())){
        editCarrinho[id] = qtd;
        break;
      }
    }
  }

  document.getElementById('editProdutos').innerHTML = renderCardapio(editCarrinho, 'alterarEdit', true);

  for(const [nomeCompleto] of Object.entries(p.itens || {})){
    const match = nomeCompleto.match(/\((.+)\)$/);
    if(!match) continue;
    const sabor = match[1];
    for(const [id, prod] of Object.entries(produtos)){
      if(id.includes('refri') && id !== 'refri1' && nomeCompleto.startsWith(prod.nome)){
        const sel = document.getElementById(`edit-sabor-${id}`);
        if(sel) sel.value = sabor;
      }
    }
  }

  atualizarTotalEdit();
  document.getElementById('editModal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function fecharModal(){
  document.getElementById('editModal').style.display = 'none';
  document.body.style.overflow = '';
  editKey = null;
}

function alterarEdit(id, valor){
  editCarrinho[id] = Math.max(0, (editCarrinho[id] || 0) + valor);
  const el = document.getElementById(`edit-q-${id}`);
  if(el) el.textContent = editCarrinho[id];
  atualizarTotalEdit();
}

function atualizarTotalEdit(){
  let total = 0;
  Object.entries(editCarrinho).forEach(([id,qtd]) => { total += qtd * produtos[id].preco; });
  document.getElementById('editTotal').textContent = moeda(total);
}

function salvarEdicao(){
  if(!db || !editKey){ toast('Erro interno', true); return; }

  const cliente = document.getElementById('editCliente').value.trim();
  if(!cliente){ toast('Informe o nome do cliente', true); return; }

  if(!Object.values(editCarrinho).some(q => q > 0)){
    toast('Adicione pelo menos 1 item', true); return;
  }

  const pagamento = document.getElementById('editPagamento').value;
  const { itens, total, erro } = montarItens(editCarrinho, true);
  if(erro){ toast(erro, true); return; }

  const updates = {
    cliente,
    obs: document.getElementById('editObs').value.trim(),
    pagamento,
    itens,
    total,
    editadoEm: new Date().toLocaleTimeString('pt-BR',{ hour:'2-digit', minute:'2-digit' })
  };

  db.ref('pedidos/' + editKey).update(updates)
    .then(() => { fecharModal(); toast('✅ Pedido atualizado!'); })
    .catch(() => toast('Erro ao salvar', true));
}

/* Fechar modal ao clicar no fundo */
document.getElementById('editModal').addEventListener('click', function(e){
  if(e.target === this) fecharModal();
});

/* ───── RENDER PEDIDOS ─────────────────────────────────── */
function renderPedidos(){
  const lista = document.getElementById('listaPedidos');
  const termo = (document.getElementById('search')?.value || '').toLowerCase();

  let arr = Object.entries(pedidos)
    .map(([key, p]) => ({ ...p, _key: key }))
    .sort((a,b) => (b.timestamp||0) - (a.timestamp||0));

  if(termo) arr = arr.filter(p => p.cliente.toLowerCase().includes(termo));

  if(!arr.length){
    lista.innerHTML = `<div class="card" style="text-align:center;color:#B58B67;">Nenhum pedido encontrado.</div>`;
    return;
  }

  lista.innerHTML = arr.map(p => {
    const semPag = !p.pagamento;
    return `
      <div class="order-card ${p.entregue ? 'entregue' : ''} ${semPag && !p.entregue ? 'sem-pagamento' : ''}">
        <div class="order-top">
          <div>
            <div class="order-client">#${String(p.id).padStart(3,'0')} — ${p.cliente}</div>
            <div class="order-time">🕐 ${p.hora}${p.editadoEm ? ` &nbsp;·&nbsp; ✏️ editado ${p.editadoEm}` : ''}</div>
          </div>
          <div class="order-status-tags">
            <span class="status-tag ${p.entregue ? 'tag-entregue' : 'tag-pendente'}">${p.entregue ? '✅ Entregue' : '⏳ Pendente'}</span>
            <span class="status-tag ${p.pago ? 'tag-pago' : 'tag-naopago'}">${p.pago ? '💰 Pago' : '💸 Não pago'}</span>
            <span class="status-tag ${semPag ? 'tag-sempag' : 'tag-pagamento'}">${semPag ? '❓ Pag. não inf.' : '💳 '+p.pagamento}</span>
          </div>
        </div>

        <div class="order-items">
          ${Object.entries(p.itens).map(([nome,qtd]) => `
            <div class="order-item">
              <span>${nome}</span>
              <strong>x${qtd}</strong>
            </div>
          `).join('')}
        </div>

        ${p.obs ? `<div class="order-obs">📝 ${p.obs}</div>` : ''}

        <div class="order-total">${moeda(p.total)}</div>

        <div class="order-actions">
          ${!p.entregue ? `<button class="small-btn done-btn" onclick="entregar('${p._key}')">✅ Entregue</button>` : ''}
          <button class="small-btn edit-btn" onclick="abrirModal('${p._key}')">✏️ Editar</button>
          <button class="small-btn pay-btn" onclick="marcarPago('${p._key}')">${p.pago ? '💰 Pago' : '💳 Marcar Pago'}</button>
          <button class="small-btn delete-btn" onclick="excluir('${p._key}')">🗑</button>
        </div>
      </div>
    `;
  }).join('');
}
