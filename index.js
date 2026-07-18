require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const path = require('path');

const { gerarPix, verificarPagamento } = require('./syncpay');
const { enviarEventoTikTok } = require('./tiktok');

const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: true
});

const pagamentos = {};

console.log('Bot iniciado!');

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    await bot.sendPhoto(
      chatId,
      path.join(__dirname, 'imagem', 'IMG_096.jpg')
    );

    await bot.sendMessage(
      chatId,
      `Oiie 😏

Vi que você entrou aqui e resolvi te mostrar uma prévia rapidinha...
Mas isso é só uma parte 👀🔥

Entrando aqui, você ganha:

📁 +700 mídias
🔥 Conteúdos exclusivos
🎁 Sorteios semanais
🔞 Fotos e vídeos VIP
🎥 Conteúdos novos frequentemente

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
    console.error('Erro no /start:', error.message);

    await bot.sendMessage(
      chatId,
      '❌ Não foi possível iniciar o atendimento. Tente novamente.'
    );
  }
});

bot.on('callback_query', async (query) => {
  const chatId = query.message?.chat?.id;

  if (!chatId) {
    return;
  }

  try {
    await bot.answerCallbackQuery(query.id);

    switch (query.data) {
      case 'ver_mais':
        await bot.sendMessage(
          chatId,
          `Depois que você entrar, não vai mais ficar só nas prévias 👀🔥

O que você quer ver?`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '🎁 PROMOÇÃO - R$7,90',
                    callback_data: 'promocao'
                  }
                ],
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

      case 'promocao':
        await bot.sendAnimation(
          chatId,
          'https://raw.githubusercontent.com/ognathan7/telegram-bot/main/imagem/4s.gif'
        );

        await bot.sendMessage(
          chatId,
          `🎁 PROMOÇÃO ESPECIAL

🔥 Oferta por tempo limitado

✔️ Conteúdo exclusivo
✔️ Entrega automática
✔️ Acesso imediato após o pagamento

💰 De R$12,90 por apenas R$7,90

👇 Aproveite a promoção`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '💳 Comprar por R$7,90',
                    callback_data: 'comprar_promocao'
                  }
                ]
              ]
            }
          }
        );
        break;

      case 'videos':
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

✔️ Acesso imediato após pagamento
✔️ Entrega automática
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

      case 'videochamada':
        await bot.sendAnimation(
          chatId,
          'https://raw.githubusercontent.com/ognathan7/telegram-bot/main/imagem/8s.gif'
        );

        await bot.sendMessage(
          chatId,
          `📹 Videochamada Particular

⚡ Poucos horários disponíveis hoje
😏 Atendimento individual e exclusivo

💰 R$15,90

Reserve antes que os horários acabem 👇`,
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

      case 'vip':
        await bot.sendAnimation(
          chatId,
          'https://raw.githubusercontent.com/ognathan7/telegram-bot/main/imagem/4s.gif'
        );

        await bot.sendMessage(
          chatId,
          `💎 VIP Vitalício + WhatsApp

✔️ +600 mídias
✔️ Conteúdo novo todos os dias
✔️ Vídeos completos
✔️ Sem censura
✔️ Atualizações frequentes

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

      case 'comprar_promocao':
        await criarPagamento(
          chatId,
          7.90,
          '🎁 PROMOÇÃO'
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
          '💎 VIP Vitalício + WhatsApp'
        );
        break;

      case 'copiar_codigo':
        if (!pagamentos[chatId]?.pixCode) {
          await bot.sendMessage(
            chatId,
            '❌ Nenhum PIX encontrado. Clique em comprar novamente.'
          );
          break;
        }

        await bot.sendMessage(
          chatId,
          `📋 Copie o código PIX abaixo:

<code>${escapeHtml(pagamentos[chatId].pixCode)}</code>`,
          {
            parse_mode: 'HTML'
          }
        );
        break;

      case 'ver_qrcode':
        if (!pagamentos[chatId]?.pixCode) {
          await bot.sendMessage(
            chatId,
            '❌ Nenhum PIX encontrado. Clique em comprar novamente.'
          );
          break;
        }

        const qrBuffer = await QRCode.toBuffer(
          pagamentos[chatId].pixCode
        );

        await bot.sendPhoto(
          chatId,
          qrBuffer,
          {
            caption: '📱 Escaneie este QR Code para pagar.'
          }
        );
        break;

      case 'verificar_pagamento':
        await processarVerificacaoPagamento(chatId);
        break;

      default:
        await bot.sendMessage(
          chatId,
          '❌ Opção não reconhecida. Digite /start para começar novamente.'
        );
        break;
    }
  } catch (error) {
    console.error('ERRO COMPLETO:');
    console.error(error);

    const mensagemErro =
      error.response?.data?.message ||
      error.response?.data ||
      error.message ||
      'Erro desconhecido';

    await bot.sendMessage(
      chatId,
      `❌ Ocorreu um erro: ${formatarErro(mensagemErro)}`
    );
  }
});

async function criarPagamento(chatId, valor, produto) {
  await bot.sendMessage(
    chatId,
    '⏳ Gerando seu PIX...'
  );

  try {
    await enviarEventoTikTok(
      'InitiateCheckout',
      chatId,
      valor,
      produto
    );
  } catch (error) {
    console.error(
      'Erro ao enviar InitiateCheckout para o TikTok:',
      error.message
    );
  }

  const pix = await gerarPix(valor);

  console.log(
    'PIX RETORNO:',
    JSON.stringify(pix, null, 2)
  );

  const pixCode =
    pix?.pix_code ||
    pix?.data?.pix_code ||
    pix?.qr_code ||
    pix?.data?.qr_code ||
    pix?.copy_paste ||
    pix?.data?.copy_paste;

  const identifier =
    pix?.identifier ||
    pix?.data?.identifier ||
    pix?.reference_id ||
    pix?.data?.reference_id ||
    pix?.id ||
    pix?.data?.id;

  if (!pixCode) {
    throw new Error(
      'A API não retornou o código PIX.'
    );
  }

  if (!identifier) {
    throw new Error(
      'A API não retornou o identificador do pagamento.'
    );
  }

  pagamentos[chatId] = {
    pixCode,
    identifier,
    valor,
    produto,
    aprovado: false,
    criadoEm: Date.now()
  };

  console.log(
    'IDENTIFIER SALVO:',
    pagamentos[chatId].identifier
  );

  await bot.sendMessage(
    chatId,
    `✅ Como realizar o pagamento:

1. Abra o aplicativo do seu banco.
2. Selecione a opção "Pagar" ou "PIX".
3. Escolha "PIX Copia e Cola".
4. Cole o código abaixo e finalize o pagamento.

📦 Produto: ${produto}
💰 Valor: ${formatarMoeda(valor)}`
  );

  await bot.sendMessage(
    chatId,
    `📋 Copie o código abaixo:

<code>${escapeHtml(pixCode)}</code>`,
    {
      parse_mode: 'HTML'
    }
  );

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

async function processarVerificacaoPagamento(chatId) {
  const pagamento = pagamentos[chatId];

  if (!pagamento) {
    await bot.sendMessage(
      chatId,
      '❌ Nenhum pagamento encontrado. Escolha um produto novamente.'
    );
    return;
  }

  if (pagamento.aprovado) {
    await bot.sendMessage(
      chatId,
      `✅ Este pagamento já foi aprovado.

📦 Produto: ${pagamento.produto}
💰 Valor: ${formatarMoeda(pagamento.valor)}`
    );
    return;
  }

  await bot.sendMessage(
    chatId,
    '⏳ Verificando pagamento...'
  );

  const resultado = await verificarPagamento(
    pagamento.identifier
  );

  const status = obterStatusPagamento(resultado);

  console.log(
    'Status pagamento:',
    status
  );

  const statusNormalizado = String(status || '')
    .trim()
    .toLowerCase();

  const statusAprovados = [
    'completed',
    'complete',
    'paid',
    'approved',
    'success',
    'succeeded',
    'confirmed'
  ];

  if (statusAprovados.includes(statusNormalizado)) {
    pagamento.aprovado = true;
    pagamento.aprovadoEm = Date.now();

    try {
      await enviarEventoTikTok(
        'Purchase',
        chatId,
        pagamento.valor,
        pagamento.produto
      );
    } catch (error) {
      console.error(
        'Erro ao enviar Purchase para o TikTok:',
        error.message
      );
    }

    await bot.sendMessage(
      chatId,
      `✅ Pagamento aprovado!

📦 Produto: ${pagamento.produto}
💰 Valor pago: ${formatarMoeda(pagamento.valor)}

Seu pedido foi confirmado com sucesso.`
    );

    return;
  }

  await bot.sendMessage(
    chatId,
    `⏳ Pagamento ainda não identificado.

Status atual: ${status || 'pendente'}

Se você já realizou o pagamento, aguarde alguns segundos e clique novamente em "Verificar Pagamento".`
  );
}

function obterStatusPagamento(resultado) {
  return (
    resultado?.data?.status ||
    resultado?.status ||
    resultado?.data?.payment_status ||
    resultado?.payment_status ||
    resultado?.data?.transaction?.status ||
    resultado?.transaction?.status
  );
}

function formatarMoeda(valor) {
  return Number(valor).toLocaleString(
    'pt-BR',
    {
      style: 'currency',
      currency: 'BRL'
    }
  );
}

function escapeHtml(texto) {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatarErro(error) {
  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return 'Erro inesperado.';
  }
}

bot.on('polling_error', (error) => {
  console.error(
    'Erro no polling do Telegram:',
    error.message
  );
});

process.on('unhandledRejection', (error) => {
  console.error(
    'Erro não tratado:',
    error
  );
});

process.on('uncaughtException', (error) => {
  console.error(
    'Exceção não tratada:',
    error
  );
});
