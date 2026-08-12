/* Função da camada paga: recebe o texto da ata, pede o resumo à Anthropic e
   devolve. Roda na Vercel, não no navegador.
 *
 * POR QUE ELA EXISTE: a chave da Anthropic não pode estar no navegador. Quem
 * abrir o inspetor a copia e gasta na conta do dono. Aqui ela é variável de
 * ambiente e nunca sai do servidor.
 *
 * O QUE ELA NÃO FAZ, e é de propósito: não escreve o texto da ata em lugar
 * nenhum. Não há banco, não há log do conteúdo, não há retenção. O texto passa,
 * é usado e vai embora com a resposta. A única coisa que sobra é o contador de
 * uso, que conta quantas vezes — nunca o quê.
 *
 * Variáveis de ambiente necessárias:
 *   ANTHROPIC_API_KEY          chave da Anthropic
 *   SUPABASE_URL               https://<projeto>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY  chave de serviço (NUNCA no navegador)
 */

/* Os dois modelos oferecidos. O "preciso" era o Sonnet 4.5 e passou ao Sonnet 5
   em 12/08/2026: mais capaz e mais barato que o anterior. Conferido no catálogo
   da Anthropic, não deduzido — nome de modelo envelhece rápido, e apontar para
   um que saiu do ar derruba a funcionalidade inteira sem aviso. */
const MODELOS = {
  rapido:  'claude-haiku-4-5',
  preciso: 'claude-sonnet-5'
};

const LIMITE_TEXTO = 400000;   // ~100 mil tokens: reunião muito longa é cortada, não recusada

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'método não permitido' });

  const chave = process.env.ANTHROPIC_API_KEY;
  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  /* Dizer QUAL variável falta, pelo nome. "Servidor sem configuração" é a
     mensagem que faz alguém abrir o painel da Vercel e olhar para cinco campos
     sem saber qual. O nome da variável é público — só o valor é segredo. */
  const faltando = [['ANTHROPIC_API_KEY', chave], ['SUPABASE_URL', sbUrl],
                    ['SUPABASE_SERVICE_ROLE_KEY', sbKey]].filter(([, v]) => !v).map(([n]) => n);
  if (faltando.length) return res.status(500).json({
    erro: 'falta configurar no servidor: ' + faltando.join(', '), faltando });

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ erro: 'entre na sua conta para usar a IA do Salavox' });

  const { prompt, modelo = 'rapido' } = req.body || {};
  if (!prompt || typeof prompt !== 'string') return res.status(400).json({ erro: 'sem texto para resumir' });

  /* 1. quem é */
  const quem = await fetch(sbUrl + '/auth/v1/user', {
    headers: { Authorization: 'Bearer ' + token, apikey: sbKey }
  });
  if (!quem.ok) return res.status(401).json({ erro: 'sessão expirada — entre de novo' });
  const usuario = await quem.json();

  /* 2. tem plano e cota? A cota é consumida ANTES de chamar a IA: é onde o
        dinheiro é gasto, e falhar depois de gastar seria o pior dos mundos. */
  const premium = modelo === 'preciso';
  const cota = await fetch(sbUrl + '/rest/v1/rpc/consumir_ia', {
    method: 'POST',
    headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_perfil: usuario.id, p_premium: premium })
  });
  const restante = await cota.json();
  if (!cota.ok || restante < 0) {
    /* A recusa precisa dizer o que fazer a seguir. Quem esgotou a degustação
       está a um passo de assinar; quem recebe "cota esgotada" e ponto final
       fecha a aba. */
    return res.status(402).json({
      erro: premium
        ? 'o modelo preciso é do plano profissional (ou a cota dele acabou este mês)'
        : 'seus resumos de cortesia acabaram — o plano profissional tem 30 por mês, R$ 19,90',
      assinar: true
    });
  }

  /* 3. resumo */
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': chave,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: MODELOS[modelo] || MODELOS.rapido,
      max_tokens: 1800,
      messages: [{ role: 'user', content: String(prompt).slice(0, LIMITE_TEXTO) }]
    })
  });

  if (!r.ok) {
    const detalhe = await r.text();
    console.error('anthropic', r.status, detalhe.slice(0, 300));   // o erro, nunca o texto da ata
    return res.status(502).json({ erro: 'a IA não respondeu agora — tente de novo em instantes' });
  }

  const d = await r.json();
  const texto = (d.content || []).map(c => c.text || '').join('').trim();

  /* Guarda quantos tokens custou — números, nunca conteúdo. Sem isto o painel
     só saberia estimar o custo por cenário, e cifra estimada apresentada como
     fato é como se erra um preço. Falhar aqui não pode derrubar o resumo que já
     está pronto e já foi pago: o erro é registrado e a resposta segue. */
  const uso = d.usage || {};
  try {
    await fetch(sbUrl + '/rest/v1/rpc/somar_tokens', {
      method: 'POST',
      headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_perfil: usuario.id,
                             p_ent: uso.input_tokens || 0, p_sai: uso.output_tokens || 0 })
    });
  } catch (e) { console.error('somar_tokens', e.message); }

  return res.status(200).json({ texto, restante });
}
