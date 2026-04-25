import { handler } from '../build/handler.js';
import compression from 'compression';
import polka from 'polka';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

// Dynamic HTML responses from SvelteKit SSR aren't compressed by adapter-node.
// Adding `compression` middleware at the Node layer handles them (and any other
// dynamic endpoint) in gzip/brotli so LHCI scores `uses-text-compression` pass
// and real users get smaller transfers.
polka()
  .use(compression())
  .use(handler)
  .listen(port, host, () => {
    console.log(`Listening on ${host}:${port}`);
  });
