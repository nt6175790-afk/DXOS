import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DemoSeedError } from './demo/seed-demo-dataset';
import { seedDemoActivity } from './demo/seed-demo-activity';

// Local demo only: attendance, leave and meeting activity around today for the AI assistant demo.
// Run after seed:demo and seed:demo-roles (employees need leave:create to submit their own requests).
const envPath = resolve(__dirname, '../.env');
if (!process.env.DATABASE_URL && existsSync(envPath)) process.loadEnvFile(envPath);

seedDemoActivity(process.env).then((result) => {
  console.log(JSON.stringify({ status: 'ok', ...result }, null, 2));
}).catch((error: unknown) => {
  console.error(error instanceof DemoSeedError ? error.code : error instanceof Error ? `${error.name}: ${error.message}` : 'Demo activity seed failed.');
  process.exitCode = 1;
});
