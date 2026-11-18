import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync('public', { recursive: true });
mkdirSync('migrations', { recursive: true });
copyFileSync('index.html', 'public/index.html');
copyFileSync('0001_initial.sql', 'migrations/0001_initial.sql');
