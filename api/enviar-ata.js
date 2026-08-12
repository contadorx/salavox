/* Função da camada paga: manda a ata por e-mail, com a assinatura de quem
   enviou e a marca do Salavox no rodapé.
 *
 * Aqui o texto da ata sai do computador de quem usa — por ordem dele, para o
 * destinatário que ele escolheu. Nada fica guardado deste lado: o corpo do
 * e-mail é montado, entregue ao serviço de envio e descartado.
 *
 * Variáveis de ambiente:
 *   RESEND_API_KEY             chave do serviço de envio
 *   REMETENTE                  ex.: ata@salavox.com  (domínio verificado)
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

const LIMITE = 300000;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'método não permitido' });

  const envio = process.env.RESEND_API_KEY;
  const remetente = process.env.REMETENTE;
  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!envio || !remetente || !sbUrl || !sbKey) return res.status(500).json({ erro: 'servidor sem configuração' });

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ erro: 'entre na sua conta para enviar a ata' });

  const { para, assunto, corpo, assinatura } = req.body || {};
  if (!para || !corpo) return res.status(400).json({ erro: 'faltou destinatário ou conteúdo' });
  const destinos = String(para).split(/[,;\s]+/).filter(e => /.+@.+\..+/.test(e)).slice(0, 10);
  if (!destinos.length) return res.status(400).json({ erro: 'nenhum e-mail válido na lista' });

  const quem = await fetch(sbUrl + '/auth/v1/user', {
    headers: { Authorization: 'Bearer ' + token, apikey: sbKey }
  });
  if (!quem.ok) return res.status(401).json({ erro: 'sessão expirada — entre de novo' });
  const usuario = await quem.json();

  const perfil = await (await fetch(
    sbUrl + '/rest/v1/perfis?id=eq.' + usuario.id + '&select=plano,assinante_ate',
    { headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey } })).json();
  const p = perfil && perfil[0];
  if (!p || p.plano === 'gratis' || !p.assinante_ate || new Date(p.assinante_ate) < new Date()) {
    return res.status(402).json({ erro: 'o envio por e-mail é do plano profissional' });
  }

  const escapar = t => String(t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const html =
    `<div style="font:15px/1.6 ui-sans-serif,system-ui,sans-serif;color:#1C2A27;max-width:640px">` +
    `<pre style="white-space:pre-wrap;font:inherit;margin:0">${escapar(String(corpo).slice(0, LIMITE))}</pre>` +
    (assinatura ? `<p style="margin-top:24px">${escapar(assinatura)}</p>` : '') +
    `<hr style="border:0;border-top:1px solid #E4E9E7;margin:28px 0 12px">` +
    `<p style="font-size:12.5px;color:#93A29E;margin:0">Ata gerada pelo ` +
    `<a href="https://salavox.com" style="color:#2F6F66;font-weight:700">Salavox</a> — a gravação e a ` +
    `transcrição aconteceram no computador de quem gravou, sem passar por servidor nenhum.</p></div>`;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + envio, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: remetente,
      to: destinos,
      reply_to: usuario.email,          // a resposta vai para quem enviou, não para nós
      subject: assunto || 'Ata da reunião',
      html
    })
  });

  if (!r.ok) {
    console.error('resend', r.status, (await r.text()).slice(0, 200));
    return res.status(502).json({ erro: 'o envio falhou agora — tente de novo' });
  }

  await fetch(sbUrl + '/rest/v1/rpc/contar_email', {
    method: 'POST',
    headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_perfil: usuario.id })
  }).catch(() => {});

  return res.status(200).json({ enviados: destinos.length });
}
