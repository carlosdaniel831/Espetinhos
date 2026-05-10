const produtos = {
  baiaoTrad:{ nome:'🍲 Baião Tradicional', preco:8 },
  baiaoCrem:{ nome:'🥘 Baião Cremoso', preco:8 },
  porco:{ nome:'🐷 Espeto de Porco', preco:7 },
  boi:{ nome:'🐄 Espeto de Boi', preco:7 },
  frango:{ nome:'🍗 Espeto de Frango', preco:7 },
  linguica:{ nome:'🌭 Espeto de Linguiça', preco:7 },
  refri1:{ nome:'🥤 Guaraná 1L', preco:7 },
  refri15:{ nome:'🥤 Refrigerante 1,5L', preco:13 },
  refri2:{ nome:'🥤 Refrigerante 2L', preco:15 },
  refriLata:{ nome:'🥤 Refrigerante Lata', preco:5 }
};

const sabores = ['Coca-Cola','Fanta','Guaraná','Cajuína'];

let carrinho = {};
Object.keys(produtos).forEach(p => { carrinho[p] = 0; });

let pedidos = {};
let proximoNumero = 1;
let db = null;

function salvarConfigFirebase(){
  const url = document.getElementById('inputFirebaseUrl').value.trim();
  if(!url || !url.includes('firebase')){ toast('URL inválida'); return; }
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
  } catch(e){ toast('Erro ao conectar'); console.error(e); }
}

function calcularProximoNumero(){
  const nums = Object.values(pedidos).map(p => p.id || 0);
  proximoNumero = nums.length > 0 ? Math.max(...nums) + 1 : 1;
}

function atualizarNumPedido(){
  document.getElementById('pedidoNumero').textContent = '#' + String(proximoNumero).padStart(3,'0');
}

function iniciarProdutos(){
  document.getElementById('products').innerHTML = Object.entries(produtos).map(([id,p]) => `
    <div class="product">
      <div class="product-top">
        <div class="product-info">
          <strong>${p.nome}</strong>
          <p>${moeda(p.preco)}</p>
        </div>
        <div class="qty-wrap">
          <button class="qty-btn minus" onclick="alterar('${id}',-1)">-</button>
          <div class="qty-number" id="q-${id}">0</div>
          <button class="qty-btn plus" onclick="alterar('${id}',1)">+</button>
        </div>
      </div>
      ${id.includes('refri') && id !== 'refri1' ? `
        <select class="refri-select" id="sabor-${id}">
          <option value="">Escolha o sabor</option>
          ${sabores.map(s=>`<option value="${s}">${s}</option>`).join('')}
        </select>` : ''}
    </div>
  `).join('');
}

function alterar(id, valor){
  carrinho[id] = Math.max(0, carrinho[id] + valor);
  document.getElementById(`q-${id}`).textContent = carrinho[id];
  atualizarTotal();
}

function atualizarTotal(){
  let total = 0;
  Object.entries(carrinho).forEach(([id,qtd]) => { total += qtd * produtos[id].preco; });
  document.getElementById('total').textContent = moeda(total);
}

function finalizarPedido(){
  if(!db){ toast('Banco não conectado!'); return; }
  const cliente = document.getElementById('cliente').value.trim();
  if(!cliente){ toast('Informe o cliente'); return; }
  if(!Object.values(carrinho).some(q=>q>0)){ toast('Adicione itens'); return; }
  const itens = {};
  let total = 0;
  for(const [id,qtd] of Object.entries(carrinho)){
    if(qtd > 0){
      let nome = produtos[id].nome;
      if(id.includes('refri') && id !== 'refri1'){
        const sabor = document.getElementById(`sabor-${id}`).value;
        if(!sabor){ toast('Escolha o sabor do refrigerante'); return; }
        nome += ` (${sabor})`;
      }
      itens[nome] = qtd;
      total += qtd * produtos[id].preco;
    }
  }
  db.ref('pedidos').push({
    id: proximoNumero, cliente, itens, total,
    pago: false, entregue: false,
    obs: document.getElementById('obs').value,
    hora: new Date().toLocaleTimeString('pt-BR',{ hour:'2-digit', minute:'2-digit' }),
    timestamp: Date.now()
  }).then(() => { limpar(); toast('Pedido criado'); })
    .catch(() => toast('Erro ao salvar'));
}

function renderPedidos(){
  const lista = document.getElementById('listaPedidos');
  const termo = (document.getElementById('search')?.value || '').toLowerCase();
  let arr = Object.entries(pedidos)
    .map(([key,p]) => ({ ...p, _key: key }))
    .sort((a,b) => (b.timestamp||0) - (a.timestamp||0));
  if(termo) arr = arr.filter(p => p.cliente.toLowerCase().includes(termo));
  if(!arr.length){ lista.innerHTML = `<div class="card">Nenhum pedido encontrado.</div>`; return; }
  lista.innerHTML = arr.map(p => `
    <div class="order-card ${p.entregue ? 'entregue' : ''}">
      <div class="order-top">
        <div>
          <div class="order-client">#${String(p.id).padStart(3,'0')} - ${p.cliente}</div>
          <div class="order-time">🕐 ${p.hora}</div>
        </div>
        <div>
          ${p.entregue ? '✅ Entregue' : '⏳ Pendente'}<br><br>
          ${p.pago ? '💰 Pago' : '💸 Não Pago'}
        </div>
      </div>
      <div class="order-items">
        ${Object.entries(p.itens).map(([nome,qtd]) => `
          <div class="order-item"><span>${nome}</span><strong>x${qtd}</strong></div>
        `).join('')}
      </div>
      ${p.obs ? `<div style="margin-top:14px;color:#c7a98a;">📝 ${p.obs}</div>` : ''}
      <div class="order-total">${moeda(p.total)}</div>
      <div class="order-actions">
        ${!p.entregue ? `<button class="small-btn done-btn" onclick="entregar('${p._key}')">Entregue</button>` : ''}
        <button class="small-btn pay-btn" onclick="marcarPago('${p._key}')">${p.pago ? 'Pago ✓' : 'Marcar Pago'}</button>
        <button class="small-btn delete-btn" onclick="excluir('${p._key}')">Excluir</button>
      </div>
    </div>
  `).join('');
}

function entregar(key){
  db.ref('pedidos/'+key+'/entregue').set(true).then(()=>toast('Pedido entregue'));
}

function marcarPago(key){
  db.ref('pedidos/'+key+'/pago').set(!pedidos[key]?.pago).then(()=>toast('Pagamento atualizado'));
}

function excluir(key){
  if(!confirm('Excluir este pedido?')) return;
  db.ref('pedidos/'+key).remove().then(()=>toast('Pedido excluído'));
}

function renderResumo(){
  let faturamento=0, pagos=0, entregues=0;
  Object.values(pedidos).forEach(p => {
    faturamento += p.total||0;
    if(p.pago) pagos++;
    if(p.entregue) entregues++;
  });
  document.getElementById('fatTotal').textContent = moeda(faturamento);
  document.getElementById('pedidosTotal').textContent = Object.keys(pedidos).length;
  document.getElementById('pagosTotal').textContent = pagos;
  document.getElementById('entreguesTotal').textContent = entregues;
}

function limpar(){
  Object.keys(carrinho).forEach(k => { carrinho[k]=0; });
  iniciarProdutos();
  atualizarTotal();
  document.getElementById('cliente').value='';
  document.getElementById('obs').value='';
}

function moeda(v){ return 'R$ '+v.toFixed(2).replace('.',','); }

function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2000);
}

function goTab(id,event){
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.getElementById(`panel-${id}`).classList.add('active');
  event.target.classList.add('active');
  if(id==='resumo') renderResumo();
}

function relogio(){
  document.getElementById('clock').textContent =
    new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
}

setInterval(relogio,1000);
relogio();
iniciarProdutos();
atualizarTotal();

window.addEventListener('load', ()=>{
  const url = localStorage.getItem('firebase_url');
  if(url){ document.getElementById('setupOverlay').style.display='none'; iniciarFirebase(url); }
  else { document.getElementById('setupOverlay').style.display='flex'; }
});
