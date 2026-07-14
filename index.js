require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const path = require('path');
const { gerarPix, verificarPagamento } = require('./sync');

if (!process.env.BOT_TOKEN) {
  throw new Error('Variável BOT_TOKEN não configurada.');
}

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const pagamentos = new Map();

console.log('Bot iniciado!');

function formatarValor(valor) {
  return Number(valor).toFixed(2).replace('.', ',');
}

function normalizarStatus(resultado) {
  return String(
    resultado?.payment_status ||
    resultado?.status ||
    resultado?.data?.payment_status ||
    resultado?.data?.status ||
    'pending'
  ).toLowerCase();
}

function pagamentoAprovado(status) {
  return [
    'completed',
    'paid',
    'approved',
    'complete',
    'success'
  ].includes(status);
}

async function responderCallback(query) {
  try {
    await bot.answerCallbackQuery(query.id);
  } catch (error) {
    console.warn(
      'Não foi possível responder callback:',
      error.message
    );
  }
}

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    await bot.sendPhoto(
      chatId,
      path.join(__dirname, 'imagem', '1.png')
    );
  } catch (error) {
    console.warn(
      'Imagem inicial não enviada:',
      error.message
    );
  }

  await bot.sendMessage(
    chatId,
    `Oi! 👋

Escolha uma opção abaixo:`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '👀 Ver opções',
              callback_data: 'ver_mais'
            }
          ]
        ]
      }
    }
  );
});

bot.on('callback_query', async (query) => {
  const chatId = query.message?.chat?.id;

  if (!chatId) {
    return;
  }

  await responderCallback(query);

  try {
    switch (query.data) {
      case 'ver_mais':
        await bot.sendMessage(
          chatId,
          'Escolha o produto:',
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

      case 'videos':
        await enviarApresentacaoProduto(
          chatId,
          'https://raw.githubusercontent.com/ognathan7/telegram-bot/main/imagem/5s.gif',
          `🔥 PACK MAIS ESCOLHIDO

📸 Fotos exclusivas
🎥 Vídeos completos
✅ Acesso após confirmação do pagamento

💰 R$12,90`,
          'comprar_videos'
        );
        break;

      case 'videochamada':
        await enviarApresentacaoProduto(
          chatId,
          'https://raw.githubusercontent.com/ognathan7/telegram-bot/main/imagem/8s.gif',
          `📹 Videochamada particular

⚡ Consulte a disponibilidade antes da compra.

💰 R$15,90`,
          'comprar_videochamada'
        );
        break;

      case 'vip':
        await enviarApresentacaoProduto(
          chatId,
          'https://raw.githubusercontent.com/ognathan7/telegram-bot/main/imagem/4s.gif',
          `💎 VIP WhatsApp

✅ Conteúdo exclusivo
✅ Atualizações frequentes

💰 R$18,90`,
          'comprar_vip'
        );
        break;

      case 'comprar_videos':
        await criarPagamento(
          chatId,
          12.90,
          '🎥 Vídeos e Fotos'
        );
        break;

      case 'comprar_videochamada':
        await criarPagamento(
          chatId,
          15.90,
          '📹 Videochamada Particular'
        );
        break;

      case 'comprar_vip':
        await criarPagamento(
          chatId,
          18.90,
          '💎 VIP WhatsApp'
        );
        break;

      case 'copiar_codigo': {
        const pagamento = pagamentos.get(chatId);

        if (!pagamento?.pixCode) {
          await bot.sendMessage(
            chatId,
            '❌ Nenhum PIX encontrado. Gere um novo pagamento.'
          );
          break;
        }

        await bot.sendMessage(
          chatId,
          pagamento.pixCode
        );
        break;
      }

      case 'ver_qrcode': {
        const pagamento = pagamentos.get(chatId);

        if (!pagamento?.pixCode) {
          await bot.sendMessage(
            chatId,
            '❌ Nenhum PIX encontrado. Gere um novo pagamento.'
          );
          break;
        }

        const qrBuffer = await QRCode.toBuffer(
          pagamento.pixCode,
          {
            type: 'png',
            width: 600,
            margin: 2
          }
        );

        await bot.sendPhoto(
          chatId,
          qrBuffer,
          {
            caption: '📱 Escaneie o QR Code para pagar.'
          }
        );

        break;
      }

      case 'verificar_pagamento':
        await consultarPagamento(chatId);
        break;

      default:
        await bot.sendMessage(
          chatId,
          'Opção não reconhecida. Use /start para recomeçar.'
        );
    }
  } catch (error) {
    console.error('Erro no callback:', error);

    await bot.sendMessage(
      chatId,
      `❌ ${error.message || 'Erro inesperado.'}`
    );
  }
});

async function enviarApresentacaoProduto(
  chatId,
  animacao,
  texto,
  callbackCompra
) {
  try {
    await bot.sendAnimation(chatId, animacao);
  } catch (error) {
    console.warn(
      'Animação não enviada:',
      error.message
    );
  }

  await bot.sendMessage(
    chatId,
    texto,
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '💳 Comprar',
              callback_data: callbackCompra
            }
          ]
        ]
      }
    }
  );
}

async function criarPagamento(
  chatId,
  valor,
  produto
) {
  await bot.sendMessage(
    chatId,
    '⏳ Gerando seu PIX...'
  );

  const pix = await gerarPix(
    valor,
    {
      name: 'Cliente Telegram',
      email: 'cliente@email.com',
      document: '52998224725',
      phone: '61999999999'
    },
    produto
  );

  console.log(
    'PIX RETORNO:',
    JSON.stringify(pix)
  );

  const pixCode =
    pix?.pix_code ||
    pix?.pix_qrcode_text ||
    pix?.pix?.pix_qrcode_text;

  const paymentCode =
    pix?.identifier ||
    pix?.payment_code;

  if (!pixCode || !paymentCode) {
    throw new Error(
      `Resposta inválida da Sync Pay: ${JSON.stringify(pix)}`
    );
  }

  pagamentos.set(
    chatId,
    {
      pixCode,
      paymentCode,
      valor,
      produto,
      aprovado: false,
      criadoEm: Date.now()
    }
  );

  await bot.sendMessage(
    chatId,
    `✅ PIX gerado!

Produto: ${produto}
Valor: R$ ${formatarValor(valor)}

Use o botão abaixo para copiar o código ou visualizar o QR Code.`
  );

  await bot.sendMessage(
    chatId,
    pixCode
  );

  await bot.sendMessage(
    chatId,
    'Após pagar, clique em verificar:',
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '✅ Verificar pagamento',
              callback_data: 'verificar_pagamento'
            }
          ],
          [
            {
              text: '📋 Copiar código',
              callback_data: 'copiar_codigo'
            }
          ],
          [
            {
              text: '🔳 Ver QR Code',
              callback_data: 'ver_qrcode'
            }
          ]
        ]
      }
    }
  );
}

async function consultarPagamento(chatId) {
  const pagamento = pagamentos.get(chatId);

  if (!pagamento?.paymentCode) {
    await bot.sendMessage(
      chatId,
      '❌ Nenhum pagamento encontrado. Gere um novo PIX.'
    );
    return;
  }

  if (pagamento.aprovado) {
    await bot.sendMessage(
      chatId,
      '✅ Este pagamento já foi aprovado.'
    );
    return;
  }

  await bot.sendMessage(
    chatId,
    '⏳ Verificando pagamento...'
  );

  const resultado = await verificarPagamento(
    pagamento.paymentCode
  );

  const status = normalizarStatus(resultado);

  console.log(
    'STATUS PAGAMENTO:',
    status,
    JSON.stringify(resultado)
  );

  if (pagamentoAprovado(status)) {
    pagamento.aprovado = true;
    pagamentos.set(chatId, pagamento);

    const mensagemEntrega =
      process.env.MENSAGEM_ENTREGA ||
      'Pagamento confirmado. Entre em contato com o atendimento para receber o produto.';

    await bot.sendMessage(
      chatId,
      `✅ Pagamento aprovado!

${mensagemEntrega}`
    );

    return;
  }

  await bot.sendMessage(
    chatId,
    `⏳ Pagamento ainda não identificado.

Status atual: ${status}

Aguarde alguns segundos e tente novamente.`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🔄 Verificar novamente',
              callback_data: 'verificar_pagamento'
            }
          ]
        ]
      }
    }
  );
}

bot.on('polling_error', (error) => {
  console.error(
    'Erro no polling do Telegram:',
    error.message
  );
});

process.on('unhandledRejection', (error) => {
  console.error(
    'Promise rejeitada:',
    error
  );
});

process.on('uncaughtException', (error) => {
  console.error(
    'Erro não tratado:',
    error
  );
});