/* Assinar e cancelar — a ponte com o Asaas.
 *
 * O QUE ELA FAZ: cria (ou reaproveita) o cliente no Asaas, cria a assinatura
 * mensal e devolve o endereço de pagamento para o navegador abrir. Quem escreve
 * a data de validade NÃO é esta função — é o webhook, quando o pagamento é
 * confirmado. Liberar aqui seria liberar antes de receber.
 *
 * POR QUE PEDE CPF/CNPJ: o Asaas exige `cpfCnpj` para criar cliente. Não é
 * escolha nossa, e é razoável no Brasil — quem assina vai querer nota. O dado
 * vai para o Asaas e o que fica do nosso lado é só o identificador que ele
 * devolve.
 *
 * Variáveis de ambiente:
 *   ASAAS_API_KEY   chave da API ($aact_prod_… ou $aact_hmlg_… no sandbox)
 *   ASAAS_URL       https://api.asaas.com/v3  (sandbox: https://api-sandbox.asaas.com/v3)
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

const MENSALIDADE = 19.90;
const AGENTE = 'Salavox/1.0 (Node.js)';   // o Asaas exige User-Agent em contas novas

const soDigitos = t => String(t || '').replace(/\D/g, '');

/* CPF e CNPJ conferidos aqui, antes de sair daqui. O Asaas recusa documento
   inválido com uma mensagem em inglês que não ajuda ninguém; é mais gentil (e
   mais barato) dizer na hora que o número está errado. */
function documentoValido(d) {
  const n = soDigitos(d);
  if (n.length === 11) {
    if (/^(\d)\1{10}$/.test(n)) return false;
    for (const [ate, pos] of [[9, 10], [10, 11]]) {
      let soma = 0;
      for (let i = 0; i < ate; i++) soma += Number(n[i]) * (pos - i);
      const dig = (soma * 10) % 11 % 10;
      if (dig !== Number(n[ate])) return false;
    }
    return true;
  }
  if (n.length === 14) {
    if (/^(\d)\1{13}$/.test(n)) return false;
    const conta = ate => {
      const pesos = ate === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2];
      let soma = 0;
      for (let i = 0; i < ate; i++) soma += Number(n[i]) * pesos[i];
      const r = soma % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return conta(12) === Number(n[12]) && conta(13) === Number(n[13]);
  }
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'método não permitido' });

  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const asaasKey = process.env.ASAAS_API_KEY;
  const asaasUrl = (process.env.ASAAS_URL || 'https://api.asaas.com/v3').replace(/\/+$/, '');
  const faltando = [['SUPABASE_URL', sbUrl], ['SUPABASE_SERVICE_ROLE_KEY', sbKey],
                    ['ASAAS_API_KEY', asaasKey]].filter(([, v]) => !v).map(([n]) => n);
  if (faltando.length) return res.status(500).json({ erro: 'falta configurar no servidor: ' + faltando.join(', '), faltando });

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ erro: 'entre na sua conta para assinar' });

  const quem = await fetch(sbUrl + '/auth/v1/user', {
    headers: { Authorization: 'Bearer ' + token, apikey: sbKey }
  });
  if (!quem.ok) return res.status(401).json({ erro: 'sessão expirada — entre de novo' });
  const usuario = await quem.json();

  const asaas = async (caminho, opcoes = {}) => {
    const r = await fetch(asaasUrl + caminho, {
      ...opcoes,
      headers: { access_token: asaasKey, 'Content-Type': 'application/json',
                 'User-Agent': AGENTE, ...(opcoes.headers || {}) }
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      const detalhe = (d.errors && d.errors[0] && d.errors[0].description) || ('HTTP ' + r.status);
      const e = new Error(detalhe);
      e.doAsaas = true;
      throw e;
    }
    return d;
  };

  const rpc = async (nome, corpo) => {
    const r = await fetch(sbUrl + '/rest/v1/rpc/' + nome, {
      method: 'POST',
      headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo || {})
    });
    if (!r.ok) throw new Error(nome + ' respondeu ' + r.status + ' — a migration 004 já foi aplicada?');
    return r.json();
  };

  const perfilAtual = async () => {
    const r = await fetch(sbUrl + '/rest/v1/perfis?select=id,email,plano,assinante_ate,cobranca_id,assinatura_id' +
                          '&id=eq.' + encodeURIComponent(usuario.id), {
      headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey }
    });
    const d = await r.json().catch(() => []);
    return Array.isArray(d) ? d[0] : null;
  };

  const { acao = 'assinar', nome = '', documento = '', telefone = '' } = req.body || {};

  try {
    const perfil = await perfilAtual();
    if (!perfil) return res.status(404).json({ erro: 'conta não encontrada' });

    /* ---------- cancelar ---------- */
    if (acao === 'cancelar') {
      if (!perfil.assinatura_id) return res.status(400).json({ erro: 'não há assinatura ativa para cancelar' });
      await asaas('/subscriptions/' + encodeURIComponent(perfil.assinatura_id), { method: 'DELETE' });
      /* O acesso NÃO é cortado agora, de propósito: o mês já foi pago. A
         validade que está no perfil segue valendo e simplesmente não é
         renovada, porque não haverá próxima cobrança. Cortar aqui seria vender
         trinta dias e entregar dez. */
      await rpc('cobranca_guardar', { p_perfil: usuario.id, p_cobranca: perfil.cobranca_id, p_assinatura: null });
      return res.status(200).json({ cancelada: true, vale_ate: perfil.assinante_ate });
    }

    /* ---------- assinar ---------- */
    if (!String(nome).trim() || String(nome).trim().length < 3)
      return res.status(400).json({ erro: 'informe o nome de quem vai constar na cobrança' });
    if (!documentoValido(documento))
      return res.status(400).json({ erro: 'o CPF ou CNPJ informado não é válido' });

    let cliente = perfil.cobranca_id;
    if (!cliente) {
      const c = await asaas('/customers', {
        method: 'POST',
        body: JSON.stringify({
          name: String(nome).trim(),
          cpfCnpj: soDigitos(documento),
          email: perfil.email,
          mobilePhone: soDigitos(telefone) || undefined,
          externalReference: usuario.id,
          notificationDisabled: false
        })
      });
      cliente = c.id;
    }

    const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const assinatura = await asaas('/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        customer: cliente,
        /* UNDEFINED deixa quem paga escolher entre Pix, boleto e cartão na
           própria tela do Asaas. Fixar em cartão fecharia a porta do Pix, que
           é como boa parte do Brasil prefere pagar. */
        billingType: 'UNDEFINED',
        value: MENSALIDADE,
        nextDueDate: amanha,
        cycle: 'MONTHLY',
        description: 'Salavox — plano profissional (mensal)',
        externalReference: usuario.id
      })
    });

    await rpc('cobranca_guardar', { p_perfil: usuario.id, p_cobranca: cliente, p_assinatura: assinatura.id });

    /* O endereço de pagamento mora na primeira cobrança da assinatura, não na
       assinatura. Se ela ainda não tiver sido gerada, não se inventa um link:
       diz-se que a cobrança chega por e-mail, que é o que de fato acontece. */
    let pagar = null;
    try {
      const cobrancas = await asaas('/subscriptions/' + encodeURIComponent(assinatura.id) + '/payments');
      const primeira = (cobrancas.data || [])[0];
      pagar = (primeira && (primeira.invoiceUrl || primeira.bankSlipUrl)) || null;
    } catch (e) {}

    return res.status(200).json({
      assinatura: assinatura.id,
      pagar,
      valor: MENSALIDADE,
      aviso: pagar ? null : 'A cobrança foi criada e o Asaas vai enviá-la para o seu e-mail.'
    });
  } catch (e) {
    const msg = (e && e.message) || 'não consegui falar com o meio de pagamento';
    // erro do fornecedor volta com o texto dele; o resto vira 502 sem detalhe
    return res.status(e && e.doAsaas ? 400 : 502).json({ erro: msg });
  }
}
