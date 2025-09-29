export default {
  async fetch(request, env) {
    // 1. CORS Preflight Requestの処理
    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }

    // 2. OpenRouter APIエンドポイントのURLを構築
    const url = new URL('https://openrouter.ai/api/v1/chat/completions');

    // 3. 元のリクエストからヘッダーとボディをコピーし、認証ヘッダーを追加
    const headers = new Headers(request.headers);
    headers.set('Authorization', `Bearer ${env.OPENROUTER_API_KEY}`);
    headers.set('Host', 'openrouter.ai'); // OpenRouterが必要とする場合がある

    // 4. OpenRouterへリクエストを転送
    const response = await fetch(url, {
      method: request.method,
      headers: headers,
      body: request.body,
    });

    // 5. OpenRouterからのレスポンスをクライアントに返す (CORSヘッダー付き)
    const newResponse = new Response(response.body, response);
    // 本番環境では '*' の代わりにデプロイ先のGitHub Pagesのドメインを指定することを強く推奨します
    // 例: newResponse.headers.set('Access-Control-Allow-Origin', 'https://your-username.github.io');
    newResponse.headers.set('Access-Control-Allow-Origin', '*'); 
    newResponse.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type');

    return newResponse;
  },
};

// CORS Preflight Requestを処理する関数
function handleOptions(request) {
  const headers = request.headers;
  if (
    headers.get('Origin') !== null &&
    headers.get('Access-Control-Request-Method') !== null &&
    headers.get('Access-Control-Request-Headers') !== null
  ) {
    // Handle CORS preflight requests.
    return new Response(null, {
      headers: {
        // ここも本番ではGitHub Pagesのドメインを指定してください
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } else {
    // Handle standard OPTIONS request.
    return new Response(null, {
      headers: {
        Allow: 'POST, OPTIONS',
      },
    });
  }
}
