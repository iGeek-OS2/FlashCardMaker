# FlashMaker Web ⚡️

A web app that automatically generates flashcards from your PDFs using AI.  
Convert lecture notes and documents into interactive study cards with just a few clicks.

---

## ✨ Key Features

- **AI Card Generation**: AI extracts key concepts from your PDF and turns them into question-and-answer flashcards.  
- **Multiple PDF Support**: Upload and analyze multiple PDF files at once.  
- **Detailed AI Explanations**: Get in-depth explanations for terms and concepts with a single click.  
- **Visualize Learning Results**: See your performance with a results graph after each quiz session.  
- **Import / Export**: Save and load your flashcards in JSON format, or export them as a WordHolic-compatible CSV file.  

---

## 🛠️ Tech Stack

- **Frontend**: HTML, CSS, JavaScript  
  - Tailwind CSS  
  - pdf.js  
  - marked.js  
- **Backend / AI**: Cloudflare Workers & Cloudflare AI  

---

## 🚀 Setup Guide

This application requires a proxy server running on Cloudflare Workers to function correctly.

### Prerequisites
- A [Cloudflare account](https://dash.cloudflare.com/)  
- Node.js  
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)  

---

### Steps

1. **Install Wrangler and log in to Cloudflare**
   ```bash
   npm install -g wrangler
   wrangler login
   ```

2. **Create a new Worker project**
   ```bash
   wrangler init flashmaker-api-proxy
   ```
   - Choose the "Hello World" script  
   - Select "No" for TypeScript  

3. **Create `wrangler.toml` and `src/index.js`**

   **wrangler.toml**
   ```toml
   name = "flashmaker-api-proxy"
   main = "src/index.js"
   compatibility_date = "2024-03-20"
   ```

   **src/index.js**
   ```javascript
   export default {
     async fetch(request, env, ctx) {
       // Handle CORS preflight requests
       if (request.method === 'OPTIONS') {
         return handleOptions(request);
       }

       if (request.method !== 'POST') {
         return new Response('Expected POST', { status: 405 });
       }

       const requestBody = await request.json();

       // The Cloudflare AI API endpoint
       const cf_api_url = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/${requestBody.model || 'google/gemma-2-9b-it'}`;

       // Forward the request to the Cloudflare AI API
       const cf_request = new Request(cf_api_url, {
           method: "POST",
           headers: {
               "Authorization": `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
               "Content-Type": "application/json"
           },
           body: JSON.stringify(requestBody)
       });

       const response = await fetch(cf_request);
       const responseData = await response.json();

       // Return the AI's response to the frontend
       return new Response(JSON.stringify(responseData.result), {
         headers: { 'Content-Type': 'application/json', ...corsHeaders },
       });
     },
   };

   const corsHeaders = {
     'Access-Control-Allow-Origin': '*',
     'Access-Control-Allow-Methods': 'POST, OPTIONS',
     'Access-Control-Allow-Headers': 'Content-Type',
   };

   function handleOptions(request) {
     if (request.headers.get('Origin') && request.headers.get('Access-Control-Request-Method') && request.headers.get('Access-Control-Request-Headers')) {
       return new Response(null, { headers: corsHeaders });
     } else {
       return new Response(null, { headers: { Allow: 'POST, OPTIONS' } });
     }
   }
   ```

4. **Set your Cloudflare Account ID and API Token as secrets**
   ```bash
   wrangler secret put CLOUDFLARE_ACCOUNT_ID
   wrangler secret put CLOUDFLARE_API_TOKEN
   ```
   - The `CLOUDFLARE_API_TOKEN` requires **Workers AI** permissions  

5. **Deploy the Worker and copy the resulting URL**
   ```bash
   wrangler deploy
   ```

6. **Configure and deploy the frontend**
   - In `script.js`, replace the placeholder `PROXY_SERVER_URL` with the Worker URL from step 5  
   - Deploy the frontend files (HTML, CSS, JS) to any static hosting service  

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).  
