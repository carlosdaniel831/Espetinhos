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
const idsRefri = ['refri1','refri15','refri2','refriLata'];

/* ───── ESTADO ─────────────────────────────────────────── */
let carrinho = {};
Object.keys(produtos).forEach(p => { carrinho[p] = 0; });

let pedidos = {};
let proximoNumero = 1;
let db = null;
let editKey = null;
let editCarrinho = {};
let filtroAtivo = 'todos';

/* ───── FIREBASE ───────────────────────────────────────── */
function salvarConfigFirebase(){
  const url = document.getElementById('inputFirebaseUrl').value.trim();
  if(!url || !url.includes('firebase')){ toast('URL inválida', 'error'); return; }
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
      const dot = document.getElementById('statusDot');
      document.getElementById('statusTexto').textContent = ok ? 'Online' : 'Offline';
      if(ok){ dot.classList.add('online'); } else { dot.classList.remove('online'); }
    });

    db.ref('pedidos').on('value', snap => {
      pedidos = snap.val() || {};
      calcularProximoNumero();
      renderPedidos();
      renderResumo();
      atualizarNumPedido();
      atualizarBadge();
    });
  } catch(e){
    toast('Erro ao conectar', 'error');
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

function atualizarBadge(){
  const pendentes = Object.values(pedidos).filter(p => !p.entregue).length;
  const badge = document.getElementById('badgePendentes');
  if(pendentes > 0){
    badge.textContent = pendentes;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

/* ───── CARDÁPIO ───────────────────────────────────────── */
function iniciarProdutos(){
  document.getElementById('products').innerHTML = renderCardapio(carrinho, 'alterar', false);
}

function renderCardapio(carrinhoLocal, fnAlterar, isModal){
  return Object.entries(produtos).map(([id, p]) => {
    const qtd = carrinhoLocal[id] || 0;
    const prefix = isModal ? 'edit-' : '';
    return `
      <div class="product ${qtd > 0 ? 'has-item' : ''}" id="${prefix}prod-${id}">
        <div class="product-top">
          <div>
            <div class="product-name">${p.nome}</div>
            <div class="product-price">${moeda(p.preco)}</div>
          </div>
          <div class="qty-wrap">
            <button class="qty-btn minus" onclick="${fnAlterar}('${id}',-1)">−</button>
            <div class="qty-number" id="${prefix}q-${id}">${qtd}</div>
            <button class="qty-btn plus"  onclick="${fnAlterar}('${id}',1)">+</button>
          </div>
        </div>
        ${id.includes('refri') && id !== 'refri1' ? `
          <select class="select-field" id="${prefix}sabor-${id}" style="margin-top:12px;">
            <option value="">Escolha o sabor</option>
            ${sabores.map(s=>`<option value="${s}">${s}</option>`).join('')}
          </select>` : ''}
      </div>`;
  }).join('');
}

/* ───── NOVO PEDIDO ────────────────────────────────────── */
function alterar(id, valor){
  carrinho[id] = Math.max(0, (carrinho[id] || 0) + valor);
  const el = document.getElementById(`q-${id}`);
  if(el) el.textContent = carrinho[id];

  // Destaque visual no card
  const card = document.getElementById(`prod-${id}`);
  if(card){
    card.classList.toggle('has-item', carrinho[id] > 0);
  }

  atualizarTotal();
  atualizarCartCounter();
}

function atualizarTotal(){
  let total = 0;
  Object.entries(carrinho).forEach(([id,qtd]) => { total += qtd * produtos[id].preco; });
  document.getElementById('total').textContent = moeda(total);
}

function atualizarCartCounter(){
  const total = Object.values(carrinho).reduce((a,b) => a+b, 0);
  const counter = document.getElementById('cartCounter');
  const qtdEl   = document.getElementById('cartQtd');
  if(counter && qtdEl){
    qtdEl.textContent = total;
    counter.style.display = total > 0 ? 'block' : 'none';
  }
}

function finalizarPedido(){
  if(!db){ toast('Banco não conectado!', 'error'); return; }

  const cliente = document.getElementById('cliente').value.trim();
  if(!cliente){ toast('Informe o nome do cliente', 'error'); return; }

  if(!Object.values(carrinho).some(q => q > 0)){
    toast('Adicione pelo menos 1 item', 'error'); return;
  }

  const pagamento = document.getElementById('pagamento').value;
  const { itens, total, erro } = montarItens(carrinho, false);
  if(erro){ toast(erro, 'error'); return; }

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
  .then(() => { limpar(); toast('Pedido criado!', 'success'); })
  .catch(() => toast('Erro ao salvar', 'error'));
}

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

  document.getElementById('editCliente').value   = p.cliente || '';
  document.getElementById('editObs').value       = p.obs     || '';
  document.getElementById('editPagamento').value = p.pagamento || '';

  editCarrinho = {};
  Object.keys(produtos).forEach(id => { editCarrinho[id] = 0; });

  for(const [nomeCompleto, qtd] of Object.entries(p.itens || {})){
    for(const [id, prod] of Object.entries(produtos)){
      const nomeBase = prod.nome.replace(/\s*\(.*\)$/,'').trim();
      if(nomeCompleto.startsWith(nomeBase)){
        editCarrinho[id] = qtd; break;
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
  const card = document.getElementById(`edit-prod-${id}`);
  if(card) card.classList.toggle('has-item', editCarrinho[id] > 0);
  atualizarTotalEdit();
}

function atualizarTotalEdit(){
  let total = 0;
  Object.entries(editCarrinho).forEach(([id,qtd]) => { total += qtd * produtos[id].preco; });
  document.getElementById('editTotal').textContent = moeda(total);
}

function salvarEdicao(){
  if(!db || !editKey){ toast('Erro interno', 'error'); return; }
  const cliente = document.getElementById('editCliente').value.trim();
  if(!cliente){ toast('Informe o nome do cliente', 'error'); return; }
  if(!Object.values(editCarrinho).some(q => q > 0)){
    toast('Adicione pelo menos 1 item', 'error'); return;
  }
  const pagamento = document.getElementById('editPagamento').value;
  const { itens, total, erro } = montarItens(editCarrinho, true);
  if(erro){ toast(erro, 'error'); return; }

  db.ref('pedidos/' + editKey).update({
    cliente,
    obs: document.getElementById('editObs').value.trim(),
    pagamento, itens, total,
    editadoEm: new Date().toLocaleTimeString('pt-BR',{ hour:'2-digit', minute:'2-digit' })
  })
  .then(() => { fecharModal(); toast('Pedido atualizado!', 'success'); })
  .catch(() => toast('Erro ao salvar', 'error'));
}

document.getElementById('editModal').addEventListener('click', function(e){
  if(e.target === this) fecharModal();
});

/* ───── FILTRO ─────────────────────────────────────────── */
function setFiltro(filtro, event){
  filtroAtivo = filtro;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  renderPedidos();
}

/* ───── RENDER PEDIDOS ─────────────────────────────────── */
function renderPedidos(){
  const lista = document.getElementById('listaPedidos');
  const termo = (document.getElementById('search')?.value || '').toLowerCase();

  let arr = Object.entries(pedidos)
    .map(([key, p]) => ({ ...p, _key: key }))
    .sort((a,b) => (b.timestamp||0) - (a.timestamp||0));

  if(termo) arr = arr.filter(p => p.cliente.toLowerCase().includes(termo));

  if(filtroAtivo === 'pendentes')    arr = arr.filter(p => !p.entregue);
  if(filtroAtivo === 'entregues')    arr = arr.filter(p => p.entregue);
  if(filtroAtivo === 'semPagamento') arr = arr.filter(p => !p.pagamento);

  if(!arr.length){
    lista.innerHTML = `<div class="card" style="text-align:center;color:var(--text3);padding:32px;">Nenhum pedido encontrado.</div>`;
    return;
  }

  lista.innerHTML = arr.map(p => {
    const semPag = !p.pagamento;
    return `
      <div class="order-card ${p.entregue ? 'entregue' : ''} ${semPag && !p.entregue ? 'sem-pagamento' : ''}">
        <div class="order-head">
          <div>
            <div class="order-num">Pedido #${String(p.id).padStart(3,'0')}</div>
            <div class="order-client">${p.cliente}</div>
            <div class="order-meta">🕐 ${p.hora}${p.editadoEm ? ` · ✏️ editado ${p.editadoEm}` : ''}</div>
          </div>
          <div class="order-tags">
            <span class="tag ${p.entregue ? 'tag-green' : 'tag-orange'}">${p.entregue ? '✅ Entregue' : '⏳ Pendente'}</span>
            <span class="tag ${p.pago ? 'tag-green' : 'tag-red'}">${p.pago ? '💰 Pago' : '💸 Não pago'}</span>
            <span class="tag ${semPag ? 'tag-muted' : 'tag-amber'}">${semPag ? '❓ Pag. não inf.' : '💳 ' + p.pagamento}</span>
          </div>
        </div>

        <div class="order-items-box">
          ${Object.entries(p.itens).map(([nome,qtd]) => `
            <div class="order-item">
              <span>${nome}</span>
              <strong>× ${qtd}</strong>
            </div>`).join('')}
        </div>

        ${p.obs ? `<div class="order-obs">📝 ${p.obs}</div>` : ''}

        <div class="order-total-row">
          <span style="font-size:.8rem;color:var(--text3);letter-spacing:1px;text-transform:uppercase;font-weight:600;">Total</span>
          <div class="order-total">${moeda(p.total)}</div>
        </div>

        <div class="order-actions">
          ${!p.entregue ? `<button class="small-btn done-btn" onclick="entregar('${p._key}')">✅ Entregue</button>` : ''}
          <button class="small-btn edit-btn"   onclick="abrirModal('${p._key}')">✏️ Editar</button>
          <button class="small-btn pay-btn"    onclick="marcarPago('${p._key}')">${p.pago ? '💰 Pago' : '💳 Pagar'}</button>
          <button class="small-btn delete-btn" onclick="excluir('${p._key}')">🗑</button>
        </div>
      </div>`;
  }).join('');
}

/* ───── AÇÕES ──────────────────────────────────────────── */
function entregar(key){
  db.ref('pedidos/'+key+'/entregue').set(true).then(() => toast('Pedido entregue!', 'success'));
}

function marcarPago(key){
  const atual = pedidos[key]?.pago || false;
  db.ref('pedidos/'+key+'/pago').set(!atual)
    .then(() => toast(atual ? 'Pagamento desmarcado' : 'Marcado como pago', 'success'));
}

function excluir(key){
  if(!confirm('Excluir este pedido?')) return;
  db.ref('pedidos/'+key).remove().then(() => toast('Pedido excluído', 'success'));
}

function zerarDia(){
  if(!db) return;
  if(!confirm('Zerar TODOS os pedidos do dia?\n\nEssa ação não pode ser desfeita!')) return;
  db.ref('pedidos').remove().then(() => toast('Pedidos zerados!', 'success'));
}

/* ───── RESUMO ─────────────────────────────────────────── */
function renderResumo(){
  let faturamento=0, pagos=0, entregues=0;
  const porPagamento = {};
  const refriVendidos = {};
  let refriTotal=0, refriQtd=0;

  Object.values(pedidos).forEach(p => {
    faturamento += p.total || 0;
    if(p.pago)     pagos++;
    if(p.entregue) entregues++;
    const forma = p.pagamento || 'Não informado';
    porPagamento[forma] = (porPagamento[forma] || 0) + (p.total||0);

    Object.entries(p.itens || {}).forEach(([nomeItem, qtd]) => {
      let produtoEncontrado = null;
      for(const [rid, prod] of Object.entries(produtos)){
        if(!rid.includes('refri')) continue;
        const nomeBase = prod.nome.replace(/\s*\(.*\)$/,'').trim();
        if(nomeItem.startsWith(nomeBase)){ produtoEncontrado = prod; break; }
      }
      if(!produtoEncontrado) return;
      const precoUnit = produtoEncontrado.preco;
      if(!refriVendidos[nomeItem]) refriVendidos[nomeItem] = { qtd:0, total:0 };
      refriVendidos[nomeItem].qtd   += qtd;
      refriVendidos[nomeItem].total += qtd * precoUnit;
      refriTotal += qtd * precoUnit;
      refriQtd   += qtd;
    });
  });

  document.getElementById('fatTotal').textContent       = moeda(faturamento);
  document.getElementById('pedidosTotal').textContent   = Object.keys(pedidos).length;
  document.getElementById('pagosTotal').textContent     = pagos;
  document.getElementById('entreguesTotal').textContent = entregues;

  // Por pagamento
  const resumoPag = document.getElementById('resumoPagamento');
  if(resumoPag){
    if(!Object.keys(porPagamento).length){
      resumoPag.innerHTML = '<p class="empty-msg">Nenhum dado ainda</p>';
    } else {
      resumoPag.innerHTML = Object.entries(porPagamento)
        .sort((a,b) => b[1]-a[1])
        .map(([forma,valor]) => `
          <div class="resumo-row">
            <span>${forma}</span>
            <strong>${moeda(valor)}</strong>
          </div>`).join('');
    }
  }

  // Refrigerantes
  const resumoRefri = document.getElementById('resumoRefri');
  if(!resumoRefri) return;
  if(!Object.keys(refriVendidos).length){
    resumoRefri.innerHTML = '<p class="empty-msg">Nenhum refrigerante vendido ainda</p>';
  } else {
    resumoRefri.innerHTML =
      Object.entries(refriVendidos)
        .sort((a,b) => b[1].qtd - a[1].qtd)
        .map(([nome, dados]) => `
          <div class="resumo-row">
            <span>${nome}</span>
            <span style="display:flex;gap:16px;align-items:center;">
              <span style="color:var(--text3);font-size:.8rem;">× ${dados.qtd}</span>
              <strong>${moeda(dados.total)}</strong>
            </span>
          </div>`).join('') +
      `<div class="resumo-total-row">
        <span style="font-size:.75rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text3);">Total (${refriQtd} unid.)</span>
        <strong style="color:var(--fire2);font-size:1.1rem;">${moeda(refriTotal)}</strong>
      </div>`;
  }
}

/* ───── UTILITÁRIOS ────────────────────────────────────── */
function limpar(){
  Object.keys(carrinho).forEach(k => { carrinho[k] = 0; });
  iniciarProdutos();
  atualizarTotal();
  atualizarCartCounter();
  document.getElementById('cliente').value   = '';
  document.getElementById('obs').value       = '';
  document.getElementById('pagamento').value = '';
}

function moeda(v){
  return 'R$ ' + Number(v).toFixed(2).replace('.',',');
}

let toastTimer = null;
function toast(msg, tipo = ''){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (tipo ? ' ' + tipo : '');
  if(toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 2800);
}

/* ───── TABS ───────────────────────────────────────────── */
function goTab(id, event){
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`panel-${id}`).classList.add('active');
  event.currentTarget.classList.add('active');
  if(id === 'resumo') renderResumo();
}

/* ───── RELÓGIO ────────────────────────────────────────── */
function relogio(){
  document.getElementById('clock').textContent =
    new Date().toLocaleTimeString('pt-BR',{ hour:'2-digit', minute:'2-digit' });
}
setInterval(relogio, 1000);
relogio();

/* ───── INIT ───────────────────────────────────────────── */
iniciarProdutos();
atualizarTotal();

window.addEventListener('load', () => {
  const url = localStorage.getItem('firebase_url');
  setTimeout(() => {
    document.getElementById('loadingScreen').classList.add('hidden');
    if(url){
      document.getElementById('setupOverlay').style.display = 'none';
      iniciarFirebase(url);
    } else {
      document.getElementById('setupOverlay').style.display = 'flex';
    }
  }, 1800);
});
