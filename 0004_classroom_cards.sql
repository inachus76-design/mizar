ALTER TABLE classroom_tools ADD COLUMN icon TEXT NOT NULL DEFAULT '✦';
ALTER TABLE classroom_tools ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE classroom_tools ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 1;
UPDATE classroom_tools SET sort_order = MIN(id, 9999);
