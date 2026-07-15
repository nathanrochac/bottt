require('dotenv').config();

const axios = require('axios');

const BASE_URL = String(
  process.env.SYNC_BASE_URL || 'https://app.syncpayments.com.br'
)
  .replace(/\/+$/, '')
  .replace(/\/api$/, '');

const CLIENT_ID = process.env.SYNC_CLIENT_ID;
const CLIENT_SECRET = process.env.SYNC_CLIENT_SECRET;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

let tokenCache = {
  accessToken: null,
  expiresAt: 0
};

function validarConfiguracao() {
  const faltando = [];

  if (!BASE_URL) faltando.push('SYNC_BASE_URL');
  if (!CLIENT_ID) faltando.push('SYNC_CLIENT_ID');
  if (!CLIENT_SECRET) faltando.push('SYNC_CLIENT_SECRET');

  if (faltando.length > 0) {
    throw new Error(
      `Variáveis ausentes no .env: ${faltando.join(', ')}`
    );
  }
}

function limparTexto(valor) {
  return String(valor || '').trim();
}

function somenteNumeros(valor) {
  return limparTexto(valor).replace(/\D/g, '');
}

function validarCliente(cliente = {}) {
  const name = limparTexto(cliente.name);
  const cpf = somenteNumeros(
    cliente.cpf ||
    cliente.document
  );
  const email = limparTexto(cliente.email);
  const phone = somenteNumeros(cliente.phone);

  if (!name) {
    throw new Error('O nome do cliente é obrigatório.');
  }

  if (!/^\d{11}$/.test(cpf)) {
    throw new Error('O CPF do cliente deve possuir 11 números.');
  }

  if (!email || !email.includes('@')) {
    throw new Error('O e-mail do cliente é inválido.');
  }

  if (!/^\d{10,11}$/.test(phone)) {
    throw new Error(
      'O telefone deve possuir 10 ou 11 números, sem o código 55.'
    );
  }

  return {
    name,
    cpf,
    email,
    phone
  };
}

function extrairMensagemErro(error) {
  const resposta = error.response?.data;

  if (typeof resposta === 'string') {
    return resposta;
  }

  if (resposta?.message) {
    return resposta.message;
  }

  if (resposta?.error) {
    return resposta.error;
  }

  if (resposta?.errors) {
    return JSON.stringify(resposta.errors);
  }

  return error.message || 'Erro desconhecido na Sync Pay.';

}

async function autenticar() {
  validarConfiguracao();

  const agora = Date.now();

  /*
   * Reutiliza o token enquanto ele ainda estiver válido.
   * A margem de 60 segundos evita usar um token prestes a expirar.
   */
  if (
    tokenCache.accessToken &&
    agora < tokenCache.expiresAt - 60_000
  ) {
    return tokenCache.accessToken;
  }

  try {
    const resposta = await axios.post(
      `${BASE_URL}/api/partner/v1/auth-token`,
      {
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET
      },
      {
        timeout: 20_000,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        }
      }
    );

    const accessToken =
      resposta.data?.access_token ||
      resposta.data?.token;

    if (!accessToken) {
      throw new Error(
        `A Sync Pay não retornou access_token. Resposta: ${JSON.stringify(
          resposta.data
        )}`
      );
    }

    const expiresIn = Number(resposta.data?.expires_in) || 3600;

    tokenCache = {
      accessToken,
      expiresAt: agora + expiresIn * 1000
    };

    return accessToken;
  } catch (error) {
    tokenCache = {
      accessToken: null,
      expiresAt: 0
    };

    throw new Error(
      `Erro ao autenticar na Sync Pay: ${extrairMensagemErro(error)}`
    );
  }
}

async function requisicaoAutenticada(config, tentarNovamente = true) {
  const token = await autenticar();

  try {
    return await axios({
      ...config,
      baseURL: BASE_URL,
      timeout: config.timeout || 20_000,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...config.headers
      }
    });
  } catch (error) {
    /*
     * Caso o token seja recusado, limpa o cache,
     * gera outro token e repete a requisição uma vez.
     */
    if (error.response?.status === 401 && tentarNovamente) {
      tokenCache = {
        accessToken: null,
        expiresAt: 0
      };

      return requisicaoAutenticada(config, false);
    }

    throw error;
  }
}

/**
 * Cria uma cobrança PIX.
 *
 * @param {number} valor Valor em reais. Exemplo: 12.90
 * @param {object} cliente Dados do cliente
 * @param {string} descricao Descrição do produto
 */
async function gerarPix(
  valor,
  cliente = {},
  descricao = 'Compra pelo Telegram'
) {
  validarConfiguracao();

  const amount = Number(valor);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('O valor do PIX deve ser maior que zero.');
  }

  const dadosCliente = validarCliente(cliente);

  const payload = {
    amount: Number(amount.toFixed(2)),
    description: limparTexto(descricao) || 'Compra pelo Telegram',
    client: dadosCliente
  };

  if (WEBHOOK_URL) {
    payload.webhook_url = WEBHOOK_URL;
  }

  try {
  console.log('[SYNCPAY] Criando PIX:', {
    amount: payload.amount,
    description: payload.description,
    client: payload.client,
    webhook: payload.webhook_url || null
  });

  const resposta = await requisicaoAutenticada({
      method: 'POST',
      url: '/api/partner/v1/cash-in',
      data: payload
    });

    const dados = resposta.data || {};

    if (!dados.pix_code) {
      throw new Error(
        dados.message ||
        `A Sync Pay não retornou o código PIX. Resposta: ${JSON.stringify(
          dados
        )}`
      );
    }

    if (!dados.identifier) {
      throw new Error(
        `A Sync Pay não retornou o identificador da transação. Resposta: ${JSON.stringify(
          dados
        )}`
      );
    }

    /*
     * Mantém os campos originais da Sync Pay e também devolve
     * os nomes que o seu index.js antigo espera.
     */
    return {
      ...dados,

      pix_code: dados.pix_code,
      identifier: dados.identifier,

      pix_qrcode_text: dados.pix_code,
      payment_code: dados.identifier,

      pix: {
        pix_qrcode_text: dados.pix_code
      }
    };
  } catch (error) {
    throw new Error(
      `Erro ao gerar PIX na Sync Pay: ${extrairMensagemErro(error)}`
    );
  }
}

/**
 * Consulta uma transação usando o identifier retornado na criação do PIX.
 */
async function verificarPagamento(identifier) {
  validarConfiguracao();

  const transactionIdentifier = limparTexto(identifier);

  if (!transactionIdentifier) {
    throw new Error('O identificador do pagamento é obrigatório.');
  }

  try {
    const resposta = await requisicaoAutenticada({
      method: 'GET',
      url: `/api/partner/v1/transaction/${encodeURIComponent(
        transactionIdentifier
      )}`
    });

    const respostaOriginal = resposta.data || {};
    const transacao = respostaOriginal.data || respostaOriginal;

    const statusOriginal =
      transacao.status ||
      transacao.payment_status ||
      'pending';

    const status = String(statusOriginal).toLowerCase();

    /*
     * Inclui payment_status para continuar compatível
     * com a verificação existente no seu index.js.
     */
    return {
      ...respostaOriginal,
      data: transacao,
      status,
      payment_status: status
    };
  } catch (error) {
    throw new Error(
      `Erro ao consultar pagamento na Sync Pay: ${extrairMensagemErro(error)}`
    );
  }
}

function limparToken() {
  tokenCache = {
    accessToken: null,
    expiresAt: 0
  };
}

module.exports = {
  autenticar,
  gerarPix,
  verificarPagamento,
  limparToken
};
