-- Persuasion we never fake: fear or shame is blocked; urgency and popularity need to be true.
INSERT INTO "compliance_terms" ("label", "regex", "severity", "platform", "product_slug")
SELECT v.label, v.regex, v.severity, NULL, NULL
FROM (VALUES
  ('Fear or shame framing', '\bbad (mom|mum|mother|dad|father|parent)s?\b|\bpoison\w*|killing (you|your)|\btoxic\b|\bashamed\b|feel guilty', 'red'),
  ('Urgency / scarcity (only if real)', '\bhurry\b|last chance|selling fast|only \d+ left|limited stock|few left|ends tonight|don''?t miss out|before it''?s gone|while stocks last', 'amber'),
  ('Popularity claim (needs real numbers)', 'best[\s-]?sell\w*|thousands of (happy )?customers|lakhs? of (happy )?customers|everyone(''?s| is) (loving|buying|talking)|\bviral\b|cult favou?rite', 'amber')
) AS v(label, regex, severity)
WHERE NOT EXISTS (SELECT 1 FROM "compliance_terms" t WHERE t."label" = v.label AND t."product_slug" IS NULL);
