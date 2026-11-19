CREATE TRIGGER IF NOT EXISTS guestbook_validate_insert
BEFORE INSERT ON guestbook
WHEN length(NEW.name) NOT BETWEEN 1 AND 20
  OR length(NEW.message) NOT BETWEEN 1 AND 200
  OR trim(NEW.name, char(9, 10, 11, 12, 13, 32, 160, 12288)) = ''
  OR trim(NEW.message, char(9, 10, 11, 12, 13, 32, 160, 12288)) = ''
  OR instr(NEW.name, char(0)) > 0
  OR instr(NEW.message, char(0)) > 0
BEGIN
  SELECT RAISE(ABORT, 'Invalid guestbook entry');
END;
