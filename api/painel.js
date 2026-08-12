/* Painel de negócio — a única função do Salavox que lê a base inteira.
 *
 * COMO ELA É TRANCADA, em duas voltas independentes:
 *
 *   1. O token tem de ser de uma sessão válida do Supabase, conferido contra o
 *      Supabase a cada chamada. Não basta parecer um JWT.
 *   2. O e-mail dessa sessão tem de estar em ADMIN_EMAILS, variável de
 *      ambiente da Vercel. Sem a variável, o painel não funciona para ninguém
 *      — inclusive para mim. Fechado por omissão, e não aberto por omissão:
 *      quem esquece de configurar fica de fora, não fica exposto.
 *
 * As funções de banco que ela chama têm a execução revogada de anon e
 * authenticated (ver migrations/003-painel.sql.txt). Mesmo que alguém descubra
 * o nome delas, não há caminho do navegador até lá.
 *
 * Variáveis de ambiente:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   as mesmas de /api/resumo
 *   ADMIN_EMAILS                              lista separada por vírgula
 */

/* Preço em dólares por milhão de tokens. Está aqui, e não no banco, porque é
   informação de fornecedor e muda sem aviso — quando mudar, muda-se um número
   e o painel inteiro se corrige. Conferido no catálogo da Anthropic. */
const PRECO = {
  rapido:  { entrada: 1,  saida: 5  },    // claude-haiku-4-5
  preciso: { entrada: 2,  saida: 10 }     // claude-sonnet-5
};

const MENSALIDADE = { profissional: 19.90, escritorio: 0 };   // escritorio: preço ainda não definido

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'método não permitido' });

  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const admins = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const faltando = [['SUPABASE_URL', sbUrl], ['SUPABASE_SERVICE_ROLE_KEY', sbKey],
                    ['ADMIN_EMAILS', admins.length]].filter(([, v]) => !v).map(([n]) => n);
  if (faltando.length) return res.status(500).json({ erro: 'falta configurar no servidor: ' + faltando.join(', '), faltando });

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ erro: 'entre na sua conta' });

  const quem = await fetch(sbUrl + '/auth/v1/user', {
    headers: { Authorization: 'Bearer ' + token, apikey: sbKey }
  });
  if (!quem.ok) return res.status(401).json({ erro: 'sessão expirada — entre de novo' });
  const usuario = await quem.json();
  const email = String(usuario.email || '').toLowerCase();
  if (admins.indexOf(email) < 0) return res.status(403).json({ erro: 'esta conta não administra o Salavox' });

  const { acao = 'numeros', alvo = '', plano = 'profissional', dias = 30 } = req.body || {};

  const rpc = async (nome, corpo) => {
    const r = await fetch(sbUrl + '/rest/v1/rpc/' + nome, {
      method: 'POST',
      headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo || {})
    });
    if (!r.ok) throw new Error(nome + ' respondeu ' + r.status + ' — a migration 003 já foi aplicada?');
    return r.json();
  };

  try {
    if (acao === 'conta') {
      if (!alvo) return res.status(400).json({ erro: 'informe o e-mail' });
      return res.status(200).json({ conta: await rpc('painel_conta', { p_email: alvo }) });
    }

    if (acao === 'liberar') {
      if (!alvo) return res.status(400).json({ erro: 'informe o e-mail' });
      if (['gratis', 'profissional', 'escritorio'].indexOf(plano) < 0)
        return res.status(400).json({ erro: 'plano inválido' });
      const d = Math.max(0, Math.min(3650, Number(dias) || 0));
      return res.status(200).json({ feito: await rpc('painel_liberar', { p_email: alvo, p_plano: plano, p_dias: d }) });
    }

    if (acao === 'zerar') {
      if (!alvo) return res.status(400).json({ erro: 'informe o e-mail' });
      return res.status(200).json({ feito: await rpc('painel_zerar', { p_email: alvo }) });
    }

    /* números do negócio */
    const n = await rpc('painel_numeros');
    const custo = m => (Number(m.tokens_ent || 0) * PRECO.rapido.entrada +
                        Number(m.tokens_sai || 0) * PRECO.rapido.saida) / 1e6;
    /* O custo por token não distingue qual modelo gastou o quê — a contagem é
       somada num campo só. Enquanto o preciso for uma fração das chamadas, a
       diferença é centavos; quando deixar de ser, isto vira duas colunas.
       Dito aqui para ninguém ler este número como exato. */
    const receita = Number(n.assinantes || 0) * MENSALIDADE.profissional;
    const gasto = custo({ tokens_ent: n.tokens_ent_mes, tokens_sai: n.tokens_sai_mes });

    return res.status(200).json({
      numeros: n,
      dinheiro: {
        receita_mensal: receita,
        custo_ia_mes_usd: gasto,
        precos_usd_por_milhao: PRECO,
        mensalidade: MENSALIDADE.profissional
      },
      meses: (n.meses || []).map(m => ({ ...m, custo_usd: custo(m) }))
    });
  } catch (e) {
    return res.status(502).json({ erro: (e && e.message) || 'não consegui ler o banco' });
  }
}
