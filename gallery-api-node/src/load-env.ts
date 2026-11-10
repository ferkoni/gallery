import { existsSync } from 'node:fs';

// Loads .env for development. Imported by main.ts before AppModule: ConfigModule reads the
// environment when AppModule is imported, and static imports run before main.ts's own code.
// Variables already set win over .env, as in production, where there is no .env.
if (existsSync('.env')) process.loadEnvFile('.env');
