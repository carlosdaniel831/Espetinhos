const produtos = {

  baiaoTrad:{
    nome:'🍲 Baião Tradicional',
    preco:8
  },

  baiaoCrem:{
    nome:'🥘 Baião Cremoso',
    preco:8
  },

  porco:{
    nome:'🐷 Espeto de Porco',
    preco:7
  },

  boi:{
    nome:'🐄 Espeto de Boi',
    preco:7
  },

  frango:{
    nome:'🍗 Espeto de Frango',
    preco:7
  },

  linguica:{
    nome:'🌭 Espeto de Linguiça',
    preco:7
  },

  refri15:{
    nome:'🥤 Refrigerante 1,5L',
    preco:13
  },

  refri2:{
    nome:'🥤 Refrigerante 2L',
    preco:15
  },

  refriLata:{
    nome:'🥤 Refrigerante Lata',
    preco:5
  }

};

const sabores = [
  'Coca-Cola',
  'Fanta',
  'Guaraná',
  'Cajuína'
];

let carrinho = {};

Object.keys(produtos).forEach(p=>{
  carrinho[p]=0;
});

let pedidos =
  JSON.parse(localStorage.getItem('pedidos')) || [];

let pedidoAtual =
  pedidos.length + 1;

/* PRODUTOS */

function iniciarProdutos(){

  const wrap =
    document.getElementById('products');

  wrap.innerHTML =
    Object.entries(produtos).map(([id,p]) => `

      <div class="product">

        <div class="product-top">

          <div class="product-info">

            <strong>
              ${p.nome}
            </strong>

            <p>
              ${moeda(p.preco)}
            </p>

          </div>

          <div class="qty-wrap">

            <button
              class="qty-btn minus"
              onclick="alterar('${id}',-1)">
              -
            </button>

            <div
              class="qty-number"
              id="q-${id}">
              0
            </div>

            <button
              class="qty-btn plus"
              onclick="alterar('${id}',1)">
              +
            </button>

          </div>

        </div>

        ${id.includes('refri') ? `

          <select
            class="refri-select"
            id="sabor-${id}">

            <option value="">
              Escolha o sabor
            </option>

            ${sabores.map(s=>`

              <option value="${s}">
                ${s}
              </option>

            `).join('')}

          </select>

        ` : ''}

      </div>

    `).join('');
}

/* ALTERAR */

function alterar(id,valor){

  carrinho[id] =
    Math.max(0,carrinho[id]+valor);

  document.getElementById(`q-${id}`).textContent =
    carrinho[id];

  atualizarTotal();
}

/* TOTAL */

function atualizarTotal(){

  let total = 0;

  Object.entries(carrinho).forEach(([id,qtd])=>{

    total += qtd * produtos[id].preco;

  });

  document.getElementById('total').textContent =
    moeda(total);
}

/* FINALIZAR */

function finalizarPedido(){

  const cliente =
    document.getElementById('cliente').value.trim();

  if(!cliente){

    toast('Informe o cliente');

    return;
  }

  if(!Object.values(carrinho).some(q=>q>0)){

    toast('Adicione itens');

    return;
  }

  const itens = {};

  let total = 0;

  for(const [id,qtd] of Object.entries(carrinho)){

    if(qtd>0){

      let nome =
        produtos[id].nome;

      if(id.includes('refri')){

        const sabor =
          document.getElementById(`sabor-${id}`).value;

        if(!sabor){

          toast('Escolha o sabor do refrigerante');

          return;
        }

        nome += ` (${sabor})`;
      }

      itens[nome] = qtd;

      total += qtd * produtos[id].preco;
    }
  }

  pedidos.unshift({

    id:pedidoAtual,

    cliente,

    itens,

    total,

    pago:false,

    entregue:false,

    obs:document.getElementById('obs').value,

    hora:new Date().toLocaleTimeString('pt-BR',{

      hour:'2-digit',
      minute:'2-digit'

    })

  });

  pedidoAtual++;

  salvar();

  limpar();

  renderPedidos();

  renderResumo();

  toast('Pedido criado');
}

/* PEDIDOS */

function renderPedidos(){

  const lista =
    document.getElementById('listaPedidos');

  const termo =
    document.getElementById('search')
    .value
    .toLowerCase();

  const filtrados =
    pedidos.filter(p=>

      p.cliente
      .toLowerCase()
      .includes(termo)

    );

  if(!filtrados.length){

    lista.innerHTML = `

      <div class="card">

        Nenhum pedido encontrado.

      </div>

    `;

    return;
  }

  lista.innerHTML =
    filtrados.map(p=>{

      const itens =
        Object.entries(p.itens).map(([nome,qtd])=>`

          <div class="order-item">

            <span>
              ${nome}
            </span>

            <strong>
              x${qtd}
            </strong>

          </div>

        `).join('');

      return `

        <div class="order-card ${p.entregue ? 'entregue' : ''}">

          <div class="order-top">

            <div>

              <div class="order-client">

                #${p.id} - ${p.cliente}

              </div>

              <div class="order-time">

                🕐 ${p.hora}

              </div>

            </div>

            <div>

              ${p.entregue ? '✅ Entregue' : '⏳ Pendente'}

              <br><br>

              ${p.pago ? '💰 Pago' : '💸 Não Pago'}

            </div>

          </div>

          <div class="order-items">

            ${itens}

          </div>

          ${p.obs ? `

            <div
              style="
                margin-top:14px;
                color:#c7a98a;
              ">

              📝 ${p.obs}

            </div>

          ` : ''}

          <div class="order-total">

            ${moeda(p.total)}

          </div>

          <div class="order-actions">

            ${!p.entregue ? `

              <button
                class="small-btn done-btn"
                onclick="entregar(${p.id})">

                Entregue

              </button>

            ` : ''}

            <button
              class="small-btn pay-btn"
              onclick="marcarPago(${p.id})">

              ${p.pago ? 'Pago' : 'Marcar Pago'}

            </button>

            <button
              class="small-btn delete-btn"
              onclick="excluir(${p.id})">

              Excluir

            </button>

          </div>

        </div>

      `;

    }).join('');
}

/* ENTREGAR */

function entregar(id){

  const pedido =
    pedidos.find(p=>p.id===id);

  if(pedido){

    pedido.entregue = true;

    salvar();

    renderPedidos();

    renderResumo();

    toast('Pedido entregue');
  }
}

/* PAGAMENTO */

function marcarPago(id){

  const pedido =
    pedidos.find(p=>p.id===id);

  if(pedido){

    pedido.pago = !pedido.pago;

    salvar();

    renderPedidos();

    renderResumo();

    toast('Pagamento atualizado');
  }
}

/* EXCLUIR */

function excluir(id){

  pedidos =
    pedidos.filter(p=>p.id!==id);

  salvar();

  renderPedidos();

  renderResumo();

  toast('Pedido excluído');
}

/* RESUMO */

function renderResumo(){

  let faturamento = 0;

  let pagos = 0;

  let entregues = 0;

  pedidos.forEach(p=>{

    faturamento += p.total;

    if(p.pago){
      pagos++;
    }

    if(p.entregue){
      entregues++;
    }

  });

  document.getElementById('fatTotal').textContent =
    moeda(faturamento);

  document.getElementById('pedidosTotal').textContent =
    pedidos.length;

  document.getElementById('pagosTotal').textContent =
    pagos;

  document.getElementById('entreguesTotal').textContent =
    entregues;
}

/* UTIL */

function moeda(v){

  return 'R$ ' +
    v.toFixed(2)
    .replace('.',',');
}

function salvar(){

  localStorage.setItem(
    'pedidos',
    JSON.stringify(pedidos)
  );
}

function limpar(){

  Object.keys(carrinho).forEach(k=>{
    carrinho[k]=0;
  });

  iniciarProdutos();

  atualizarTotal();

  document.getElementById('cliente').value='';

  document.getElementById('obs').value='';

  document.getElementById('pedidoNumero').textContent =
    '#' + String(pedidoAtual).padStart(3,'0');
}

function toast(msg){

  const t =
    document.getElementById('toast');

  t.textContent = msg;

  t.classList.add('show');

  setTimeout(()=>{

    t.classList.remove('show');

  },2000);
}

function goTab(id,event){

  document.querySelectorAll('.panel')
    .forEach(p=>p.classList.remove('active'));

  document.querySelectorAll('.tab')
    .forEach(t=>t.classList.remove('active'));

  document.getElementById(`panel-${id}`)
    .classList.add('active');

  event.target.classList.add('active');

  if(id==='resumo'){
    renderResumo();
  }
}

function relogio(){

  const d = new Date();

  document.getElementById('clock').textContent =

    d.toLocaleTimeString('pt-BR',{

      hour:'2-digit',
      minute:'2-digit'

    });
}

setInterval(relogio,1000);

relogio();

iniciarProdutos();

renderPedidos();

renderResumo();

atualizarTotal();

document.getElementById('pedidoNumero').textContent =
  '#' + String(pedidoAtual).padStart(3,'0');
