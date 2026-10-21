-- Claim rules from the 2026 marketing playbook: sugar wording and fibre claims; infant-food mentions on every platform.
INSERT INTO "compliance_terms" ("label", "regex", "severity", "platform", "product_slug")
SELECT v.label, v.regex, v.severity, NULL, v.product_slug
FROM (VALUES
  ('Sugar-free / zero sugar', '\bsugar[\s-]?free|zero[\s-]sugar|\bno sugar\b|0\s?g sugar', 'red', NULL),
  ('No added sugar (product has jaggery)', 'no added sugar|without added sugar|no sugar added', 'red', 'choc'),
  ('No added sugar (product has jaggery)', 'no added sugar|without added sugar|no sugar added', 'red', 'bfast'),
  ('No added sugar (product has jaggery)', 'no added sugar|without added sugar|no sugar added', 'red', 'pbr'),
  ('No added sugar', 'no added sugar|without added sugar|no sugar added', 'amber', NULL),
  ('Naturally sweetened', 'naturally sweet\w*', 'amber', NULL),
  ('High fibre / fibre-rich', 'high[\s-]fib(re|er)|fib(re|er)[\s-]rich', 'amber', NULL)
) AS v(label, regex, severity, product_slug)
WHERE NOT EXISTS (
  SELECT 1 FROM "compliance_terms" t WHERE t."label" = v.label AND t."product_slug" IS NOT DISTINCT FROM v.product_slug
);
--> statement-breakpoint
UPDATE "compliance_terms" SET "platform" = NULL, "regex" = '\binfant\w*|\bbab(y|ies)\b|\b6\s?[-–]\s?24\s?months?\b' WHERE "label" = 'Infant / baby / 6–24 months';
--> statement-breakpoint
-- The six creative pillars as angles (added only if missing).
UPDATE "brand_settings" SET "angles" = "angles" || ARRAY(
  SELECT a FROM unnest(ARRAY[
    'Real customer evidence (real, permissioned quotes only)',
    'Product education (texture, how to use, what''s inside)',
    'Offer and trial (discovery pack, launch offer)',
    'Everyday relevance (office bag, travel, breakfast)'
  ]) AS a WHERE NOT (a = ANY("angles"))
) WHERE "id" = 1;
