/* ───── DADOS ──────────────────────────────────────────── */
const produtos = {
  baiaoTrad: { nome:'🍲 Baião Tradicional', preco:8,  categoria:'baiao'  },
  baiaoCrem: { nome:'🥘 Baião Cremoso',     preco:8,  categoria:'baiao'  },
  porco:     { nome:'🐷 Espeto de Porco',   preco:7,  categoria:'espeto' },
  boi:       { nome:'🐄 Espeto de Boi',     preco:7,  categoria:'espeto' },
  frango:    { nome:'🍗 Espeto de Frango',  preco:7,  categoria:'espeto' },
  linguica:  { nome:'🌭 Espeto de Linguiça',preco:7,  categoria:'espeto' },
  refri1:    { nome:'🥤 Guaraná 1L',        preco:7,  categoria:'refri'  },
  refri15:   { nome:'🥤 Refrigerante 1,5L', preco:13, categoria:'refri'  },
  refri2:    { nome:'🥤 Refrigerante 2L',   preco:15, categoria:'refri'  },
  refriLata: { nome:'🥤 Refrigerante Lata', preco:5,  categoria:'refri'  }
};

const sabores = ['Coca-Cola','Fanta','Guaraná','Cajuína'];

/* ───── ESTADO ─────────────────────────────────────────── */
let carrinho = {};
Object.keys(produtos).forEach(p => { carrinho[p] = 0; });

let pedidos = {};
let proximoNumero = 1;
let db = null;

/* Modal */
let editKey = null;
let editCarrinho = {};

/* ───── FIREBASE ───────────────────────────────────────── */
function salvarConfigFirebase(){
  const url = document.getElementById('inputFirebaseUrl').value.trim();
  if(!url || !url.includes('firebase')){
    toast('URL inválida', true);
    return;
  }
  localStorage.setItem('firebase_url', url);
  document.getElementById('setupOverlay').style.display = 'none';
  iniciarFirebase(url);
}

function iniciarFirebase(url){
  try{
    if(!firebase.apps.length){
      firebase.initializeApp({ databaseURL: url });
    }
    db = firebase.database();

    db.ref('.info/connected').on('value', snap => {
      const ok = snap.val() === true;
      const dot = document.getElementById('statusDot');
      dot.style.background = ok ? '#22C55E' : '#EF4444';
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

function renderCardapio(carrinhoLocal, fnAlterar, isModal){
  const categorias = {
    baiao:  { label: '🍲 Baiões', ids: [] },
    espeto: { label: '🍢 Espetos', ids: [] },
    refri:  { label: '🥤 Bebidas', ids: [] }
  };

  Object.entries(produtos).forEach(([id, p]) => {
    categorias[p.categoria].ids.push(id);
  });

  return Object.entries(categorias).map(([cat, { label, ids }]) => {
    const items = ids.map(id => {
      const p = produtos[id];
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
              <button class="qty-btn minus" onclick="${fnAlterar}('${id}',-1)">−</button>
              <div class="qty-number" id="${prefix}q-${id}">${qtd}</div>
              <button class="qty-btn plus" onclick="${fnAlterar}('${id}',1)">+</button>
            </div>
          </div>
          ${id.includes('refri') && id !== 'refri1'
            ? `<select class="refri-select" id="${prefix}sabor-${id}">
                <option value="">Escolha o sabor...</option>
                ${sabores.map(s => `<option value="${s}">${s}</option>`).join('')}
               </select>`
            : ''
          }
        </div>
      `;
    }).join('');

    return `
      <div>
        <div class="cat-label">${label}</div>
        ${items}
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
  Object.entries(carrinho).forEach(([id,qtd]) => {
    total += qtd * produtos[id].preco;
  });
  document.getElementById('total').textContent = moeda(total);
}

function finalizarPedido(){
  if(!db){ toast('Banco não conectado!', true); return; }
  const cliente = document.getElementById('cliente').value.trim();
  if(!cliente){ toast('Informe o nome do cliente', true); return; }
  if(!Object.values(carrinho).some(q => q > 0)){ toast('Adicione pelo menos 1 item', true); return; }

  const pagamento = document.getElementById('pagamento').value;
  const { itens, total, erro } = montarItens(carrinho, false);
  if(erro){ toast(erro, true); return; }

  db.ref('pedidos').push({
    id: proximoNumero,
    cliente,
    itens,
    total,
    pagamento,
    pago: false,
    entregue: false,
    obs: document.getElementById('obs').value.trim(),
    hora: new Date().toLocaleTimeString('pt-BR',{ hour:'2-digit', minute:'2-digit' }),
    timestamp: Date.now()
  })
  .then(() => { limpar(); toast('✅ Pedido criado!'); })
  .catch(() => { toast('Erro ao salvar', true); });
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
      if(!sabor){ return { itens:null, total:0, erro:'Escolha o sabor do refrigerante' }; }
      nome += ` (${sabor})`;
    }

    itens[nome] = qtd;
    total += qtd * produtos[id].preco;
  }

  return { itens, total, erro:null };
}

/* ───── MODAL ──────────────────────────────────────────── */
function abrirModal(key){
  const p = pedidos[key];
  if(!p) return;
  editKey = key;

  document.getElementById('editCliente').value = p.cliente || '';
  document.getElementById('editObs').value = p.obs || '';
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
        if(sel){ sel.value = sabor; }
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
  if(el){ el.textContent = editCarrinho[id]; }
  atualizarTotalEdit();
}

function atualizarTotalEdit(){
  let total = 0;
  Object.entries(editCarrinho).forEach(([id,qtd]) => {
    total += qtd * produtos[id].preco;
  });
  document.getElementById('editTotal').textContent = moeda(total);
}

function salvarEdicao(){
  if(!db || !editKey){ toast('Erro interno', true); return; }
  const cliente = document.getElementById('editCliente').value.trim();
  if(!cliente){ toast('Informe o nome do cliente', true); return; }
  if(!Object.values(editCarrinho).some(q => q > 0)){ toast('Adicione pelo menos 1 item', true); return; }

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
    .catch(() => { toast('Erro ao salvar', true); });
}

document.getElementById('editModal').addEventListener('click', function(e){
  if(e.target === this){ fecharModal(); }
});

/* ───── RENDER PEDIDOS ─────────────────────────────────── */
function renderPedidos(){
  const lista = document.getElementById('listaPedidos');
  const termo = (document.getElementById('search')?.value || '').toLowerCase();

  let arr = Object.entries(pedidos).map(([key, p]) => ({ ...p, _key: key }))
    .sort((a,b) => (b.timestamp||0) - (a.timestamp||0));

  if(termo){
    arr = arr.filter(p => p.cliente.toLowerCase().includes(termo));
  }

  if(!arr.length){
    lista.innerHTML = `<div class="card" style="text-align:center;color:var(--text-muted);">Nenhum pedido encontrado.</div>`;
    return;
  }

  lista.innerHTML = arr.map(p => {
    const semPag = !p.pagamento;
    return `
      <div class="order-card ${p.entregue ? 'entregue' : ''} ${semPag && !p.entregue ? 'sem-pagamento' : ''}">
        <div class="order-top">
          <div>
            <div class="order-client">#${String(p.id).padStart(3,'0')} — ${p.cliente}</div>
            <div class="order-time">🕐 ${p.hora}${p.editadoEm ? ' · editado às ' + p.editadoEm : ''}</div>
          </div>
          <div class="order-status-tags">
            <span class="status-tag ${p.entregue ? 'tag-entregue' : 'tag-pendente'}">${p.entregue ? '✅ Entregue' : '⏳ Pendente'}</span>
            <span class="status-tag ${p.pago ? 'tag-pago' : 'tag-naopago'}">${p.pago ? '💰 Pago' : '💸 Não pago'}</span>
            <span class="status-tag ${semPag ? 'tag-sempag' : 'tag-pagamento'}">${semPag ? '❓ Não informado' : '💳 ' + p.pagamento}</span>
          </div>
        </div>
        <div class="order-items">
          ${Object.entries(p.itens).map(([nome,qtd]) => `
            <div class="order-item">
              <span>${nome}</span>
              <strong>×${qtd}</strong>
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

/* ───── AÇÕES ──────────────────────────────────────────── */
function entregar(key){
  db.ref('pedidos/' + key + '/entregue').set(true)
    .then(() => { toast('✅ Pedido entregue!'); });
}

function marcarPago(key){
  const atual = pedidos[key]?.pago || false;
  db.ref('pedidos/' + key + '/pago').set(!atual)
    .then(() => { toast(atual ? 'Pagamento desmarcado' : '💰 Marcado como pago'); });
}

function excluir(key){
  if(!confirm('Excluir este pedido?')){ return; }
  db.ref('pedidos/' + key).remove()
    .then(() => { toast('Pedido excluído'); });
}

function zerarDia(){
  if(!db) return;
  if(!confirm('Zerar TODOS os pedidos do dia?\n\nEssa ação não pode ser desfeita!')){ return; }
  db.ref('pedidos').remove()
    .then(() => { toast('Pedidos zerados!'); });
}

/* ───── RESUMO ─────────────────────────────────────────── */
function renderResumo(){
  let faturamento = 0, pagos = 0, entregues = 0;
  const porPagamento = {};
  // Contagem separada por categoria
  const contagemBaiao  = {};  // { nome: { qtd, total } }
  const contagemEspeto = {};
  const contagemRefri  = {};

  // Normaliza string removendo emojis, espaços extras e conteúdo entre parênteses
  function normalizar(str){
    return str
      .replace(/\(.*?\)/g, '')           // remove (sabor)
      .replace(/[\u{1F300}-\u{1FFFF}]/gu, '') // remove emojis
      .replace(/[^\w\sÀ-ú]/g, '')        // remove símbolos restantes
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function identificarCategoria(nomeItem){
    const nNome = normalizar(nomeItem);
    // Tenta match exato normalizado com os produtos cadastrados
    for(const [id, prod] of Object.entries(produtos)){
      if(nNome.includes(normalizar(prod.nome))){
        return prod.categoria;
      }
    }
    // Fallback por palavras-chave
    if(nNome.includes('baiao') || nNome.includes('baião')) return 'baiao';
    if(nNome.includes('espeto')) return 'espeto';
    if(nNome.includes('refrigerante') || nNome.includes('guarana') || nNome.includes('guaraná') || nNome.includes('lata')) return 'refri';
    return 'outro';
  }

  function precoUnitario(nomeItem){
    const nNome = normalizar(nomeItem);
    for(const [id, prod] of Object.entries(produtos)){
      if(nNome.includes(normalizar(prod.nome))) return prod.preco;
    }
    return 0;
  }

  Object.values(pedidos).forEach(p => {
    faturamento += p.total || 0;
    if(p.pago) pagos++;
    if(p.entregue) entregues++;

    const forma = p.pagamento || 'Não informado';
    porPagamento[forma] = (porPagamento[forma] || 0) + (p.total || 0);

    if(p.itens){
      Object.entries(p.itens).forEach(([nomeItem, qtd]) => {
        const cat = identificarCategoria(nomeItem);
        const preco = precoUnitario(nomeItem);
        const subtotal = qtd * preco;

        if(cat === 'baiao'){
          contagemBaiao[nomeItem] = contagemBaiao[nomeItem] || { qtd:0, total:0 };
          contagemBaiao[nomeItem].qtd += qtd;
          contagemBaiao[nomeItem].total += subtotal;
        } else if(cat === 'espeto'){
          contagemEspeto[nomeItem] = contagemEspeto[nomeItem] || { qtd:0, total:0 };
          contagemEspeto[nomeItem].qtd += qtd;
          contagemEspeto[nomeItem].total += subtotal;
        } else if(cat === 'refri'){
          contagemRefri[nomeItem] = contagemRefri[nomeItem] || { qtd:0, total:0 };
          contagemRefri[nomeItem].qtd += qtd;
          contagemRefri[nomeItem].total += subtotal;
        }
      });
    }
  });

  /* Totais por categoria */
  const totalBaiao  = Object.values(contagemBaiao).reduce((s,v)  => s + v.total, 0);
  const totalEspeto = Object.values(contagemEspeto).reduce((s,v) => s + v.total, 0);

  /* Estatísticas gerais */
  document.getElementById('fatTotal').textContent        = moeda(faturamento);
  document.getElementById('pedidosTotal').textContent    = Object.keys(pedidos).length;
  document.getElementById('pagosTotal').textContent      = pagos;
  document.getElementById('entreguesTotal').textContent  = entregues;

  /* Por pagamento */
  const resumoPag = document.getElementById('resumoPagamento');
  if(resumoPag){
    if(!Object.keys(porPagamento).length){
      resumoPag.innerHTML = `<p class="empty-msg">Nenhum dado ainda</p>`;
    } else {
      resumoPag.innerHTML = Object.entries(porPagamento).sort((a,b) => b[1] - a[1])
        .map(([forma, valor]) => `
          <div class="resumo-row">
            <span class="resumo-row-name">💳 ${forma}</span>
            <span class="resumo-row-val">${moeda(valor)}</span>
          </div>
        `).join('');
    }
  }

  /* Baiões */
  const resumoBaiao = document.getElementById('resumoBaiao');
  const lucroBaiao  = document.getElementById('lucroBaiao');
  if(lucroBaiao) lucroBaiao.textContent = moeda(totalBaiao);
  if(resumoBaiao){
    if(!Object.keys(contagemBaiao).length){
      resumoBaiao.innerHTML = `<p class="empty-msg">Nenhum baião vendido ainda</p>`;
    } else {
      resumoBaiao.innerHTML = Object.entries(contagemBaiao).sort((a,b) => b[1].qtd - a[1].qtd)
        .map(([nome, { qtd, total }]) => `
          <div class="resumo-row">
            <span class="resumo-row-name">${nome}</span>
            <div style="display:flex;align-items:center;gap:10px;">
              <span class="resumo-row-qty">${qtd} un</span>
              <span class="resumo-row-val">${moeda(total)}</span>
            </div>
          </div>
        `).join('');
    }
  }

  /* Espetos */
  const resumoEspeto = document.getElementById('resumoEspeto');
  const lucroEspeto  = document.getElementById('lucroEspeto');
  if(lucroEspeto) lucroEspeto.textContent = moeda(totalEspeto);
  if(resumoEspeto){
    if(!Object.keys(contagemEspeto).length){
      resumoEspeto.innerHTML = `<p class="empty-msg">Nenhum espeto vendido ainda</p>`;
    } else {
      resumoEspeto.innerHTML = Object.entries(contagemEspeto).sort((a,b) => b[1].qtd - a[1].qtd)
        .map(([nome, { qtd, total }]) => `
          <div class="resumo-row">
            <span class="resumo-row-name">${nome}</span>
            <div style="display:flex;align-items:center;gap:10px;">
              <span class="resumo-row-qty">${qtd} un</span>
              <span class="resumo-row-val">${moeda(total)}</span>
            </div>
          </div>
        `).join('');
    }
  }

  /* Refrigerantes */
  const resumoRefri = document.getElementById('resumoRefri');
  if(resumoRefri){
    if(!Object.keys(contagemRefri).length){
      resumoRefri.innerHTML = `<p class="empty-msg">Nenhum refrigerante vendido ainda</p>`;
    } else {
      resumoRefri.innerHTML = Object.entries(contagemRefri).sort((a,b) => b[1].qtd - a[1].qtd)
        .map(([nome, { qtd }]) => `
          <div class="resumo-row">
            <span class="resumo-row-name">${nome}</span>
            <span class="resumo-row-qty">${qtd} un</span>
          </div>
        `).join('');
    }
  }
}

/* ───── UTILITÁRIOS ────────────────────────────────────── */
function limpar(){
  Object.keys(carrinho).forEach(k => { carrinho[k] = 0; });
  iniciarProdutos();
  atualizarTotal();
  document.getElementById('cliente').value = '';
  document.getElementById('obs').value = '';
  document.getElementById('pagamento').value = '';
}

function moeda(v){
  return 'R$ ' + Number(v).toFixed(2).replace('.',',');
}

let toastTimer = null;
function toast(msg, isError = false){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error' : '');
  if(toastTimer){ clearTimeout(toastTimer); }
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 2800);
}

/* ───── TABS ───────────────────────────────────────────── */
function goTab(id, event){
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`panel-${id}`).classList.add('active');
  event.currentTarget.classList.add('active');
  if(id === 'resumo'){ renderResumo(); }
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
  if(url){
    document.getElementById('setupOverlay').style.display = 'none';
    iniciarFirebase(url);
  } else {
    document.getElementById('setupOverlay').style.display = 'flex';
  }
});
