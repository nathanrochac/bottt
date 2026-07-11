const axios = require('axios');

const BASE_URL = 'https://checkout.mangofy.com.br';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    Authorization: process.env.MANGOFY_API_KEY,
    'Store-Code': process.env.MANGOFY_STORE_CODE,
    Accept: 'application/json',
    'Content-Type': 'application/json'
  }
});

/**
 * Converte reais para centavos.
 * Exemplo: 10.50 => 1050
 */
function converterParaCentavos(valor) {
  const numero = Number(valor);

  if (!Number.isFinite(numero) || numero <= 0) {
    throw new Error('O valor do PIX deve ser maior que zero.');
  }

  return Math.round(numero * 100);
}

/**
 * Gera um código único para identificar o pedido.
 */
function gerarCodigoPedido() {
  return `telegram-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

async function gerarPix(valor, cliente = {}) {
  console.log('Gerando PIX Mangofy...');

  const valorCentavos = converterParaCentavos(valor);
  const codigoPedido = gerarCodigoPedido();

  const body = {
    external_code: codigoPedido,
    payment_method: 'pix',
    payment_format: 'regular',
    installments: 1,
    payment_amount: valorCentavos,
    shipping_amount: 0,

    postback_url:
      process.env.MANGOFY_WEBHOOK_URL ||
      'https://example.com/webhook',

    items: [
      {
        code: 'vip-telegram',
        name: 'VIP Telegram',
        description: 'Acesso ao grupo VIP do Telegram',
        quantity: 1,
        price: valorCentavos,
        digital_flag: true
      }
    ],

    customer: {
      email: cliente.email || 'cliente@email.com',
      name: cliente.name || cliente.nome || 'Cliente Telegram',
      document:
        cliente.document ||
        cliente.cpf ||
        '12345678900',
      phone:
        cliente.phone ||
        cliente.telefone ||
        '5511999999999',
      ip: cliente.ip || '127.0.0.1'
    },

    pix: {
      expires_in_days: 1
    },

    extra: {
      metadata: {
        origem: 'telegram',
        tipo_produto: 'vip'
      }
    }
  };

  try {
    const response = await api.post('/api/v1/payment', body);

    console.log('PIX Mangofy gerado:', response.data.payment_code);

    return response.data;
  } catch (error) {
    console.error(
      'Erro ao gerar PIX Mangofy:',
      error.response?.data || error.message
    );

    throw new Error(
      error.response?.data?.message ||
      'Não foi possível gerar o PIX na Mangofy.'
    );
  }
}

async function verificarPagamento(paymentCode) {
  if (!paymentCode) {
    throw new Error('O payment_code é obrigatório.');
  }

  console.log('Verificando pagamento Mangofy:', paymentCode);

  try {
    const response = await api.get(
      `/api/v1/payment/${encodeURIComponent(paymentCode)}`
    );

    return response.data;
  } catch (error) {
    console.error(
      'Erro ao consultar pagamento Mangofy:',
      error.response?.data || error.message
    );

    if (error.response?.status === 404) {
      throw new Error('Pagamento não encontrado na Mangofy.');
    }

    throw new Error(
      error.response?.data?.message ||
      'Não foi possível verificar o pagamento.'
    );
  }
}

module.exports = {
  gerarPix,
  verificarPagamento
};
