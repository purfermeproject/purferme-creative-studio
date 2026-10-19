ALTER TABLE "brand_settings" ADD COLUMN "example_ads" text DEFAULT 'EXAMPLE 1 (Meta, 9:16 UGC, Chocolate Cookies)
Hook (0–2s): "My 4:30 meeting could''ve been an email. My snack couldn''t."
Visual: laptop on mute, steel tumbler of cutting chai, one cookie dunked and held a second too long.
On-screen: "Foxtail millet + rolled oats. No maida." → "Sweetened with jaggery." → "12 cookies. Hide them from your team."
VO: "It''s the crunch that makes the call bearable."

EXAMPLE 2 (Meta static 4:5, Breakfast Cookies)
Headline: "Your morning coffee''s new crunch-mate."
Visual: pack beside a filter-coffee davara tumbler, a few cardamom pods, morning window light.
Line: "23.8% foxtail millet. Cardamom, cinnamon, almonds. Scan the QR to see where it grew."

EXAMPLE 3 (Amazon SB video 16:9, muted, Ragi & Cocoa Peanut Butter)
0–2s: pack on white, text "Ragi + cocoa + jaggery".
2–6s: knife swirl on toast, text "No refined sugar".
6–10s: spoon straight from the jar, text "Spreadably elite."
10–14s: pack + logo, text "Shop now".' NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_settings" ADD COLUMN "avoid_phrases" text DEFAULT 'guilt-free
indulge
indulgence
elevate
game-changer
fuel your day
snack smarter
healthy twist
goodness of
power-packed
wholesome goodness
taste of tradition
treat yourself
delicious and nutritious
best of both worlds
say goodbye to
look no further
unlock
level up
perfect blend' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "story" text DEFAULT '' NOT NULL;