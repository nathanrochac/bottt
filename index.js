require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const path = require('path');

const {
  gerarPix,
  verificarPagamento
} = require('./sync');

if (!process.env.BOT_TOKEN) {
  throw new Error('A variável BOT_TOKEN não foi configurada.');
}

const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: true
});

/*
 * Armazena temporariamente os pagamentos em memória.
 *
 * Observação: ao reiniciar o Railway, esses dados são apagados.
 * Para persistência definitiva, futuramente use um banco de dados.
 */
const pagamentos = {};

/*
 * Produtos disponíveis.
 */
const PRODUTOS = {
  videos: {
    nome: '🎥 Vídeos e Fotos',
    valor: 12.90,
    entregaUrl: process.env.VIDEOS_DELIVERY_URL
  },

  videochamada: {
    nome: '📹 Videochamada Particular',
    valor: 15.90,
    entregaUrl: process.env.VIDEOCHAMADA_CONTACT_URL
  },

  vip: {
    nome: '💎 VIP Vitalício + WhatsApp',
    valor: 18.90,
    entregaUrl: process.env.VIP_DELIVERY_URL
  }
};

function formatarValor(valor) {
  return Number(valor)
    .toFixed(2)
    .replace('.', ',');
}

function obterNomeCliente(usuario = {}) {
  const nomeCompleto = [
    usuario.first_name,
    usuario.last_name
  ]
    .filter(Boolean)
    .join(' ')
    .trim();

  return nomeCompleto || 'Cliente Telegram';
}

function obterDadosCliente(query) {
  const usuario = query?.from || {};

  /*
   * O sync.js exige nome, CPF, e-mail e telefone.
   *
   * Para produção, o ideal é solicitar esses dados ao cliente
   * antes de gerar o PIX.
   */
  return {
    name: obterNomeCliente(usuario),
    email: `telegram${usuario.id || Date.now()}@cliente.com`,
    document: process.env.DEFAULT_CUSTOMER_CPF || '52998224725',
    phone: process.env.DEFAULT_CUSTOMER_PHONE || '61999999999'
  };
}

function extrairStatusPagamento(resultado = {}) {
  const status =
    resultado.payment_status ||
    resultado.status ||
    resultado.data?.payment_status ||
    resultado.data?.status ||
    'pending';

  return String(status).trim().toLowerCase();
}

function pagamentoFoiAprovado(status) {
  return [
    'completed',
    'complete',
    'paid',
    'approved',
    'succeeded',
    'success'
  ].includes(status);
}

function extrairMensagemErro(error) {
  const resposta = error?.response?.data;

  if (typeof resposta === 'string') {
    return resposta;
  }

  if (resposta?.message) {
    return resposta.message;
  }

  if (resposta) {
    return JSON.stringify(resposta);
  }

  return error?.message || 'Erro desconhecido.';
}

async function responderCallback(query) {
  try {
    await bot.answerCallbackQuery(query.id);
  } catch {
    /*
     * Ignora erros de callback expirado.
     */
  }
}

async function enviarCodigoPix(chatId, pixCode) {
  /*
   * Enviado sem Markdown para evitar erro caso o código PIX
   * contenha caracteres especiais.
   */
  await bot.sendMessage(
    chatId,
    `📋 Copie o código PIX abaixo:\n\n${pixCode}`
  );
}

async function enviarBotoesPagamento(chatId) {
  await bot.sendMessage(
    chatId,
    'Após efetuar o pagamento, clique no botão abaixo ⬇️',
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '✅ Verificar Pagamento',
              callback_data: 'verificar_pagamento'
            }
          ],
          [
            {
              text: '📋 Copiar Código',
              callback_data: 'copiar_codigo'
            }
          ],
          [
            {
              text: '📱 Ver QR Code',
              callback_data: 'ver_qrcode'
            }
          ]
        ]
      }
    }
  );
}

async function criarPagamento(
  chatId,
  produto,
  dadosCliente
) {
  if (!produto) {
    throw new Error('Produto não encontrado.');
  }

  await bot.sendMessage(
    chatId,
    '⏳ Gerando seu PIX...'
  );

  console.log(
    `[PIX] Gerando cobrança para o chat ${chatId}:`,
    produto.nome,
    produto.valor
  );

  const pix = await gerarPix(
    produto.valor,
    dadosCliente,
    produto.nome
  );

  const pixCode =
    pix?.pix_code ||
    pix?.pix_qrcode_text ||
    pix?.pix?.pix_qrcode_text ||
    pix?.data?.pix_code ||
    pix?.data?.pix_qrcode_text;

  const paymentCode =
    pix?.identifier ||
    pix?.payment_code ||
    pix?.id ||
    pix?.data?.identifier ||
    pix?.data?.payment_code ||
    pix?.data?.id;

  if (!pixCode) {
    throw new Error(
      `A Sync Pay não retornou o código PIX. Retorno: ${JSON.stringify(
        pix
      )}`
    );
  }

  if (!paymentCode) {
    throw new Error(
      `A Sync Pay não retornou o identificador do pagamento. Retorno: ${JSON.stringify(
        pix
      )}`
    );
  }

  pagamentos[chatId] = {
    pixCode,
    paymentCode,
    valor: produto.valor,
    produto: produto.nome,
    entregaUrl: produto.entregaUrl,
    aprovado: false,
    criadoEm: new Date().toISOString()
  };

  console.log(
    `[PIX] Cobrança criada. Chat: ${chatId}. Identificador: ${paymentCode}`
  );

  await bot.sendMessage(
    chatId,
    `✅ Como realizar o pagamento:

1. Abra o aplicativo do seu banco.
2. Selecione a opção "Pagar" ou "PIX".
3. Escolha "PIX Copia e Cola".
4. Cole o código enviado abaixo.
5. Confira o valor e confirme o pagamento.

📦 Produto: ${produto.nome}
💰 Valor: R$ ${formatarValor(produto.valor)}`
  );

  await enviarCodigoPix(chatId, pixCode);
  await enviarBotoesPagamento(chatId);
}

async function entregarProduto(chatId, pagamento) {
  let mensagem = `✅ Pagamento aprovado!

📦 Produto: ${pagamento.produto}
💰 Valor: R$ ${formatarValor(pagamento.valor)}

Seu pagamento foi confirmado com sucesso.`;

  if (pagamento.entregaUrl) {
    mensagem += `\n\n🔗 Acesse sua compra:\n${pagamento.entregaUrl}`;
  } else {
    mensagem += `

📩 A entrega será realizada pelo responsável pelo atendimento.

Caso necessário, aguarde o contato para receber o produto adquirido.`;
  }

  await bot.sendMessage(chatId, mensagem);
}

/*
 * Comando inicial.
 */
bot.onText(/\/start(?:\s|$)/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const imagemInicial = path.join(
      __dirname,
      'imagem',
      '1.png'
    );

    await bot.sendPhoto(chatId, imagemInicial);

    await bot.sendMessage(
      chatId,
      `Oiie 😏

Vi que você entrou aqui e resolvi te mostrar uma prévia rapidinha...
Mas isso é só uma parte 👀🔥

Entrando aqui, você ganha:

📁 +700 Mídias
🔥 Conteúdos exclusivos
🎁 Sorteios semanais
🔞 Fotos e vídeos exclusivos VIP
🎥 Opções de atendimento particular

👇 Escolha uma opção abaixo:`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '👀 Ver Mais',
                callback_data: 'ver_mais'
              }
            ]
          ]
        }
      }
    );
  } catch (error) {
    console.error(
      '[START]',
      extrairMensagemErro(error)
    );

    await bot.sendMessage(
      chatId,
      `❌ Não foi possível iniciar o atendimento.

${extrairMensagemErro(error)}`
    );
  }
});

/*
 * Botões do bot.
 */
bot.on('callback_query', async (query) => {
  const chatId = query.message?.chat?.id;

  if (!chatId) {
    return;
  }

  await responderCallback(query);

  try {
    switch (query.data) {
      case 'ver_mais': {
        await bot.sendMessage(
          chatId,
          `Depois que você entrar, não vai mais ficar só nas prévias 👀🔥

O que você quer ver?`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '🎥 Vídeos e Fotos - R$12,90',
                    callback_data: 'videos'
                  }
                ],
                [
                  {
                    text: '📞 Videochamada - R$15,90',
                    callback_data: 'videochamada'
                  }
                ],
                [
                  {
                    text: '💎 VIP WhatsApp - R$18,90',
                    callback_data: 'vip'
                  }
                ]
              ]
            }
          }
        );

        break;
      }

      case 'videos': {
        await bot.sendAnimation(
          chatId,
          'https://raw.githubusercontent.com/ognathan7/telegram-bot/main/imagem/5s.gif'
        );

        await bot.sendMessage(
          chatId,
          `🔥 PACK MAIS ESCOLHIDO

📸 Fotos exclusivas
🎥 Vídeos completos
😈 Conteúdo completo e sem cortes

✔️ Acesso após confirmação do pagamento
✔️ Entrega do conteúdo adquirido
✔️ Tudo liberado de uma vez

💰 Apenas R$12,90

👇 Desbloqueie agora`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '💳 Comprar',
                    callback_data: 'comprar_videos'
                  }
                ]
              ]
            }
          }
        );

        break;
      }

      case 'videochamada': {
        await bot.sendAnimation(
          chatId,
          'https://raw.githubusercontent.com/ognathan7/telegram-bot/main/imagem/8s.gif'
        );

        await bot.sendMessage(
          chatId,
          `📹 Videochamada Particular

⚡️ Consulte os horários disponíveis
😏 Atendimento individual

💰 R$15,90

Reserve abaixo 👇`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '💳 Comprar',
                    callback_data: 'comprar_videochamada'
                  }
                ]
              ]
            }
          }
        );

        break;
      }

      case 'vip': {
        await bot.sendAnimation(
          chatId,
          'https://raw.githubusercontent.com/ognathan7/telegram-bot/main/imagem/4s.gif'
        );

        await bot.sendMessage(
          chatId,
          `💎 VIP Vitalício + WhatsApp

✔️ +600 mídias
✔️ Conteúdo novo
✔️ Vídeos completos
✔️ Conteúdo exclusivo
✔️ Atualizações

💰 R$18,90

👇 Garanta seu acesso agora`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '💳 Comprar',
                    callback_data: 'comprar_vip'
                  }
                ]
              ]
            }
          }
        );

        break;
      }

      case 'comprar_videos': {
        await criarPagamento(
          chatId,
          PRODUTOS.videos,
          obterDadosCliente(query)
        );

        break;
      }

      case 'comprar_videochamada': {
        await criarPagamento(
          chatId,
          PRODUTOS.videochamada,
          obterDadosCliente(query)
        );

        break;
      }

      case 'comprar_vip': {
        await criarPagamento(
          chatId,
          PRODUTOS.vip,
          obterDadosCliente(query)
        );

        break;
      }

      case 'copiar_codigo': {
        const pagamento = pagamentos[chatId];

        if (!pagamento) {
          await bot.sendMessage(
            chatId,
            '❌ Nenhum PIX encontrado. Clique em comprar novamente.'
          );

          break;
        }

        await enviarCodigoPix(
          chatId,
          pagamento.pixCode
        );

        break;
      }

      case 'ver_qrcode': {
        const pagamento = pagamentos[chatId];

        if (!pagamento) {
          await bot.sendMessage(
            chatId,
            '❌ Nenhum PIX encontrado. Clique em comprar novamente.'
          );

          break;
        }

        const qrBuffer = await QRCode.toBuffer(
          pagamento.pixCode,
          {
            type: 'png',
            width: 700,
            margin: 2,
            errorCorrectionLevel: 'M'
          }
        );

        await bot.sendPhoto(
          chatId,
          qrBuffer,
          {
            caption: `📱 Escaneie este QR Code para pagar.

💰 Valor: R$ ${formatarValor(pagamento.valor)}
📦 Produto: ${pagamento.produto}`
          }
        );

        break;
      }

      case 'verificar_pagamento': {
        const pagamento = pagamentos[chatId];

        if (!pagamento) {
          await bot.sendMessage(
            chatId,
            '❌ Nenhum pagamento encontrado. Clique em comprar novamente.'
          );

          break;
        }

        if (pagamento.aprovado) {
          await bot.sendMessage(
            chatId,
            '✅ Este pagamento já foi confirmado.'
          );

          if (pagamento.entregaUrl) {
            await bot.sendMessage(
              chatId,
              `🔗 Acesse sua compra:\n${pagamento.entregaUrl}`
            );
          }

          break;
        }

        await bot.sendMessage(
          chatId,
          '⏳ Verificando pagamento...'
        );

        const resultado = await verificarPagamento(
          pagamento.paymentCode
        );

        const status = extrairStatusPagamento(
          resultado
        );

        console.log(
          `[PIX] Consulta. Chat: ${chatId}. Identificador: ${pagamento.paymentCode}. Status: ${status}`
        );

        if (pagamentoFoiAprovado(status)) {
          pagamento.aprovado = true;
          pagamento.aprovadoEm =
            new Date().toISOString();

          await entregarProduto(
            chatId,
            pagamento
          );
        } else {
          await bot.sendMessage(
            chatId,
            `⏳ Pagamento ainda não identificado.

Status atual: ${status || 'pending'}

Caso já tenha realizado o pagamento, aguarde alguns segundos e clique novamente em "Verificar Pagamento".`
          );
        }

        break;
      }

      default: {
        console.log(
          `[BOT] Callback desconhecido: ${query.data}`
        );
      }
    }
  } catch (error) {
    const mensagemErro = extrairMensagemErro(error);

    console.error(
      `[BOT] Erro no chat ${chatId}:`,
      mensagemErro
    );

    await bot.sendMessage(
      chatId,
      `❌ Não foi possível concluir a operação.

${mensagemErro}`
    );
  }
});

/*
 * Evita excesso de logs no Railway.
 */
bot.on('polling_error', (error) => {
  console.error(
    '[TELEGRAM POLLING]',
    error?.message || error
  );
});

bot.on('webhook_error', (error) => {
  console.error(
    '[TELEGRAM WEBHOOK]',
    error?.message || error
  );
});

process.on('unhandledRejection', (error) => {
  console.error(
    '[UNHANDLED REJECTION]',
    error?.message || error
  );
});

process.on('uncaughtException', (error) => {
  console.error(
    '[UNCAUGHT EXCEPTION]',
    error?.message || error
  );
});

console.log('Bot iniciado!');