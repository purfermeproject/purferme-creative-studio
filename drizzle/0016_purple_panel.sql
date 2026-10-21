-- Brand panel and text band move to the brand purple (a brown panel hid brown packs). Only kits still on the old defaults change; the new column default is in 0017.
UPDATE "brand_settings"
SET "kit" = jsonb_set(jsonb_set("kit", '{colors,primary}', '"#2d1b54"'), '{colors,band}', '"#2d1b54"')
WHERE lower("kit"->'colors'->>'primary') = '#6b3f2a' AND lower("kit"->'colors'->>'band') = '#2b1d14';
