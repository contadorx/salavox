/* Webhook do Asaas — o único lugar que transforma dinheiro em acesso.
 *
 * QUAL EVENTO LIBERA, E POR QUÊ NÃO É O QUE A DOCUMENTAÇÃO SUGERE
 *
 * O Asaas distingue `PAYMENT_CONFIRMED` (o cliente pagou) de `PAYMENT_RECEIVED`
 * (o dinheiro está disponível na conta Asaas). A documentação recomenda o
 * segundo por ser o mais seguro para quem recebe — e seria, se a pergunta fosse
 * "já posso contar com esse dinheiro". A pergunta aqui é outra: "esta pessoa
 * pagou?". No cartão, a liquidação leva semanas; esperar por ela significaria
 * alguém pagar hoje e usar o produto no mês que vem.
 *
 * Então libera no CONFIRMED, aceita o RECEIVED por cima sem contar de novo
 * (idempotência no banco), e **retira o acesso** em estorno e chargeback, que
 * é onde o risco de verdade mora. Trocar um mês de risco por uma experiência
 * que funciona é a escolha certa a R$ 19,90.
 *
 * O QUE ESTA FUNÇÃO PRECISA DEVOLVER: 2xx. Qualquer outra coisa faz o Asaas
 * reenfileirar e, depois de quinze falhas seguidas, interromper a fila inteira
 * — inclusive os eventos de outros clientes. Por isso erro interno também
 * responde 200, com o motivo registrado no log.
 *
 * Variáveis de ambiente:
 *   ASAAS_WEBHOOK_TOKEN        o mesmo token configurado na tela de webhooks
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

const DIAS_POR_CICLO = 31;   // um pouco mais que o mês, para ninguém ficar sem acesso na virada

const LIBERAM = ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'];
const CORTAM  = ['PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED',
                 'PAYMENT_AWAITING_CHARGEBACK_REVERSAL', 'PAYMENT_RECEIVED_IN_CASH_UNDONE'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'método não permitido' });

  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const segredo = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!sbUrl || !sbKey || !segredo) {
    console.error('webhook sem configuração');
    return res.status(500).json({ erro: 'servidor sem configuração' });
  }

  /* A porta. Sem isto, qualquer pessoa que descubra o endereço se dá um ano de
     plano profissional com um `curl`. É a comparação mais importante do
     arquivo. */
  const veio = req.headers['asaas-access-token'];
  if (!veio || String(veio) !== String(segredo)) {
    console.error('webhook recusado: token ausente ou diferente');
    return res.status(401).json({ erro: 'não autorizado' });
  }

  const corpo = req.body || {};
  const evento = corpo.event;
  const pagamento = corpo.payment || {};
  const cliente = pagamento.customer;

  const rpc = async (nome, dados) => {
    const r = await fetch(sbUrl + '/rest/v1/rpc/' + nome, {
      method: 'POST',
      headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(dados)
    });
    if (!r.ok) throw new Error(nome + ' respondeu ' + r.status);
    return r.json();
  };

  try {
    if (!cliente) return res.status(200).json({ ignorado: 'evento sem cliente', evento });

    if (LIBERAM.indexOf(evento) >= 0) {
      const r = await rpc('cobranca_aplicar', {
        p_cobranca: cliente, p_pagamento: pagamento.id || evento, p_dias: DIAS_POR_CICLO
      });
      if (!r || !r.achou) {
        // pagamento de alguém que não está na nossa base: não é erro nosso, e
        // devolver 2xx impede o Asaas de ficar reenviando para sempre
        console.error('webhook: cliente do Asaas sem perfil correspondente', cliente);
        return res.status(200).json({ ignorado: 'cliente sem perfil' });
      }
      return res.status(200).json({ aplicado: !r.repetido, ate: r.assinante_ate });
    }

    if (CORTAM.indexOf(evento) >= 0) {
      const r = await rpc('cobranca_revogar', { p_cobranca: cliente });
      return res.status(200).json({ revogado: !!(r && r.achou) });
    }

    return res.status(200).json({ ignorado: evento });
  } catch (e) {
    /* Erro nosso não pode virar falha de entrega: quinze seguidas param a fila
       do Asaas inteira, inclusive os eventos que dariam certo. Registra e
       devolve 2xx. */
    console.error('webhook falhou', (e && e.message) || e);
    return res.status(200).json({ erro_registrado: true });
  }
}
