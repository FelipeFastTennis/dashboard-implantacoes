// api/sults.js — Proxy serverless para a API do Sults
// Roda no servidor da Vercel (sem CORS) e repassa para o dashboard.
// A API Key fica segura aqui, nunca exposta no navegador.

export default async function handler(req, res) {
  // Libera CORS para o próprio dashboard
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Responde preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // O caminho da API vem no parâmetro "path"
  // Ex: /api/sults?path=/implantacao/projeto&start=0&limit=30
  const { path, ...query } = req.query;

  if (!path) {
    return res.status(400).json({ error: 'Parâmetro "path" é obrigatório' });
  }

  // Reconstrói a query string (start, limit, etc.)
  const params = new URLSearchParams(query).toString();
  const url = `https://api.sults.com.br/api/v1${path}${params ? '?' + params : ''}`;

  try {
    const apiRes = await fetch(url, {
      headers: {
        'Authorization': process.env.SULTS_API_KEY,
        'Content-Type': 'application/json;charset=UTF-8'
      }
    });

    if (!apiRes.ok) {
      return res.status(apiRes.status).json({
        error: `API Sults retornou ${apiRes.status}`,
        url: url
      });
    }

    const data = await apiRes.json();
    // Cache leve para reduzir chamadas repetidas
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: err.message, url: url });
  }
}
