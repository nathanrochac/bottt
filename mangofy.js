const axios = require("axios");

const api = axios.create({
    baseURL: "https://checkout.mangofy.com.br",
    timeout: 15000,
    headers: {
        Authorization: process.env.MANGOFY_API_KEY,
        "Store-Code": process.env.MANGOFY_STORE_CODE,
        Accept: "application/json",
        "Content-Type": "application/json"
    }
});

function converterParaCentavos(valor) {

    const numero = Number(valor);

    if (isNaN(numero) || numero <= 0) {
        throw new Error("Valor inválido.");
    }

    return Math.round(numero * 100);
}

function gerarCodigoPedido() {

    return `telegram-${Date.now()}`;

}

async function gerarPix(valor) {

    const valorCentavos = converterParaCentavos(valor);

    const body = {

        external_code: gerarCodigoPedido(),

        payment_method: "pix",

        payment_format: "regular",

        installments: 1,

        payment_amount: valorCentavos,

        shipping_amount: 0,

        postback_url:
            process.env.MANGOFY_WEBHOOK_URL ||
            "https://example.com/webhook",

        items: [

            {
                code: "vip-telegram",
                name: "VIP Telegram",
                description: "Acesso VIP",
                quantity: 1,
                price: valorCentavos,
                digital_flag: true
            }

        ],

        customer: {

            name: "Cliente Telegram",

            email: "cliente@email.com",

            document: "52998224725",

            phone: "5511999999999",

            ip: "127.0.0.1"

        },

        pix: {

            expires_in_days: 1

        },

        extra: {

            metadata: {

                origem: "telegram"

            }

        }

    };

    try {

        const response = await api.post("/api/v1/payment", body);

        console.log("====================================");
        console.log("RESPOSTA DA MANGOFY");
        console.log(JSON.stringify(response.data, null, 2));
        console.log("====================================");

        return response.data;

    } catch (error) {

        console.log("====================================");
        console.log("ERRO MANGOFY");
        console.log(error.response?.status);
        console.log(JSON.stringify(error.response?.data, null, 2));
        console.log("====================================");

        throw error;

    }

}

async function verificarPagamento(paymentCode) {

    const response = await api.get(`/api/v1/payment/${paymentCode}`);

    return response.data;

}

module.exports = {

    gerarPix,

    verificarPagamento

};
