# Question router (optional)

The voice guide works without this. When it is deployed and its address is set in `app/config.js`, a spoken or typed question that is not one of the listed questions is sent here, and a Claude model decides which of the eight questions it matches. The app still builds the answer from its own figures. If the router is slow or unreachable, the app falls back to keyword matching.

## Deploy with the Cloudflare dashboard

1. Sign in at dash.cloudflare.com, open Workers & Pages, create a Worker named `khetsat-router`.
2. Open the code editor, replace the code with the contents of `router.js`, and deploy.
3. In the Worker's Settings, under Variables and Secrets, add a **secret** named `KHETSAT_API_KEY` with the Anthropic API key.
4. Copy the Worker's address (it ends in `.workers.dev`) into `app/config.js` as `aiUrl`.

## Or with the command line

```
cd worker
npx wrangler login
npx wrangler deploy
npx wrangler secret put KHETSAT_API_KEY
```

## Notes

- The key lives only in Cloudflare. Never put it in this repository or in the web page.
- Set a spending limit on the key in the Anthropic console.
- Requests are accepted only from the live site and from localhost:8000. Questions are cut to 300 characters and the model may reply with one word only.
- The question text is sent to Anthropic's API. Nothing else about the user is sent.
- `KHETSAT_MODEL` (optional variable) changes the model without editing the code.
