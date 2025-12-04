#!/usr/bin/env node

import { main } from './index';

main().catch(error => {
  // Use console.error, log.error requires initialization
  console.error('Failed to start server:', error);
  process.exit(1);
});
