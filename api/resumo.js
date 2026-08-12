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

const MODELOS = {
  rapido:  'claude-haiku-4-5',
  preciso: 'claude-sonnet-4-5'
};

const LIMITE_TEXTO = 400000;   // ~100 mil tokens: reunião muito longa é cortada, não recusada

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'método não permitido' });

  const chave = process.env.ANTHROPIC_API_KEY;
  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!chave || !sbUrl || !sbKey) return res.status(500).json({ erro: 'servidor sem configuração' });

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
    return res.status(402).json({
      erro: premium
        ? 'a cota de resumos no modelo preciso acabou este mês'
        : 'a cota de resumos deste mês acabou — ou a assinatura não está ativa'
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
  return res.status(200).json({ texto, restante });
}
