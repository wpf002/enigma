import { buildApp } from './app.js';

const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);

buildApp()
  .then((app) => app.listen({ port, host: '0.0.0.0' }).then(() => console.log(`enigma-api listening on :${port}`)))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
