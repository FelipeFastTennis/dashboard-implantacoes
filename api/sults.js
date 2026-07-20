// api/sults.js — Proxy serverless para a API do Sults
// Roda no servidor da Vercel (sem CORS) e repassa para o dashboard.
// A API Key fica segura aqui, nunca exposta no navegador.
//
// Inclui retry automático com backoff para erros 429 (rate limit),
// resolvido no lado do servidor onde é mais confiável.

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

  // Retry com backoff exponencial para 429
  const MAX_RETRIES = 5;
  for (let tentativa = 0; tentativa <= MAX_RETRIES; tentativa++) {
    try {
      const apiRes = await fetch(url, {
        headers: {
          'Authorization': process.env.SULTS_API_KEY,
          'Content-Type': 'application/json;charset=UTF-8'
        }
      });

      // 429 = rate limit → espera e tenta de novo
      if (apiRes.status === 429) {
        if (tentativa < MAX_RETRIES) {
          const espera = 500 * Math.pow(2, tentativa); // 0.5s, 1s, 2s, 4s, 8s
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
      // Cache no CDN da Vercel: 5 min. Chamadas repetidas nem tocam a API do Sults.
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
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
