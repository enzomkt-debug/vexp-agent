require('dotenv').config();

const REQUIRED = [
  'ANTHROPIC_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'GITHUB_TOKEN',
  'GITHUB_REPO',
  'PUBLER_API_KEY',
  'PUBLER_WORKSPACE_ID',
  'PUBLER_INSTAGRAM_ACCOUNT_ID',
];

const missing = REQUIRED.filter(key => !process.env[key]);

if (missing.length) {
  console.error('[FATAL] Variáveis de ambiente obrigatórias ausentes:');
  missing.forEach(key => console.error(`  - ${key}`));
  process.exit(1);
}

console.log('[validate-env] Todas as variáveis obrigatórias presentes.');
