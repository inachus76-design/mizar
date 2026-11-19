import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync('public', { recursive: true });
mkdirSync('migrations', { recursive: true });
copyFileSync('index.html', 'public/index.html');
copyFileSync('classroom.mjs', 'public/classroom.mjs');
copyFileSync('0001_initial.sql', 'migrations/0001_initial.sql');
copyFileSync('0002_guestbook_limits.sql', 'migrations/0002_guestbook_limits.sql');
copyFileSync('0003_classroom_settings.sql', 'migrations/0003_classroom_settings.sql');
copyFileSync('0004_classroom_cards.sql', 'migrations/0004_classroom_cards.sql');
