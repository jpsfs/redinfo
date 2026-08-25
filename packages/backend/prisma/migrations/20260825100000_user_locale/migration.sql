-- Bilingual coverage (ADO #180, phase 1): the UI language a person chose.
--
-- NULL on every existing row on purpose — see the column's doc comment in
-- schema.prisma. A default of 'pt' would be indistinguishable from a choice
-- and would break the "browser decides for a first-time user" rule.
ALTER TABLE "User" ADD COLUMN "locale" VARCHAR(2);
