console.log("CLIENT_ID:", process.env.SYNCPAY_CLIENT_ID);
console.log("CLIENT_SECRET:", process.env.SYNCPAY_CLIENT_SECRET);

const axios = require('axios');

const BASE_URL = 'https://api.syncpayments.com.br';

async function gerarToken() {
  console.log('Gerando token...');

  const response = await axios.post(
    `${BASE_URL}/api/partner/v1/auth-token`,
    {
      client_id: process.env.SYNCPAY_CLIENT_ID,
      client_secret: process.env.SYNCPAY_CLIENT_SECRET
    },
    { timeout: 15000 }
  );

  console.log('Token OK');
  return response.data.access_token;
}

async function gerarPix(valor) {
  console.log('Gerando PIX...');

  const token = await gerarToken();

  const response = await axios.post(
    `${BASE_URL}/api/partner/v1/cash-in`,
    {
      amount: valor,
      description: 'VIP Telegram',
      webhook_url: 'https://example.com/webhook',
      client: {
  name: 'Cliente Telegram',
  cpf: '12345678900',
  email: 'cliente@email.com',
  phone: '11999999999'
            }
    },
    {
      timeout: 15000,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json'
      }
    }
  );

  console.log('PIX OK');
  return response.data;
}

module.exports = { gerarPix };