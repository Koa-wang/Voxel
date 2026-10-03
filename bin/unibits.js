#!/usr/bin/env node
import('../dist/cli.js')
  .then((m) => m.run())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
