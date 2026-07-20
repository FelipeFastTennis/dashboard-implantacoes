// api/sults.js — Proxy serverless para a API do Sults
// Roda no servidor da Vercel (sem CORS) e repassa para o dashboard.
// A API Key fica segura aqui, nunca exposta no navegador.
//
// CACHE DE 12 HORAS: a primeira chamada de cada projeto no período busca da
// API do Sults e guarda o resultado no CDN da Vercel. Todas as chamadas
// seguintes (por 12h) são servidas do cache, sem tocar a API — o que
// praticamente elimina o erro 429 para os usuários.
//
// Inclui também retry automático com backoff para 429, no lado do servidor.

const CACHE_SEGUNDOS = 12 * 60 * 60; // 12 horas

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { path, ...query } = req.query;

  if (!path) {
    return res.status(400).json({ error: 'Parâmetro "path" é obrigatório' });
  }

  const params = new URLSearchParams(query).toString();
  const url = `https://api.sults.com.br/api/v1${path}${params ? '?' + params : ''}`;

  const MAX_RETRIES = 5;
  for (let tentativa = 0; tentativa <= MAX_RETRIES; tentativa++) {
    try {
      const apiRes = await fetch(url, {
        headers: {
          'Authorization': process.env.SULTS_API_KEY,
          'Content-Type': 'application/json;charset=UTF-8'
        }
      });

      if (apiRes.status === 429) {
        if (tentativa < MAX_RETRIES) {
          const espera = 500 * Math.pow(2, tentativa);
          await new Promise(r => setTimeout(r, espera));
          continue;
        }
        return res.status(429).json({ error: 'Rate limit persistente após retries' });
      }

      if (!apiRes.ok) {
        return res.status(apiRes.status).json({
          error: `API Sults retornou ${apiRes.status}`,
          url: url
        });
      }

      const data = await apiRes.json();

      // CACHE DE 12 HORAS no CDN da Vercel.
      // s-maxage = quanto tempo o CDN serve a resposta em cache sem ir à origem.
      // stale-while-revalidate = serve o cache antigo enquanto atualiza em background.
      res.setHeader(
        'Cache-Control',
        `s-maxage=${CACHE_SEGUNDOS}, stale-while-revalidate=${CACHE_SEGUNDOS}`
      );
      return res.status(200).json(data);

    } catch (err) {
      if (tentativa < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 500 * Math.pow(2, tentativa)));
        continue;
      }
      return res.status(500).json({ error: err.message, url: url });
    }
  }
}
