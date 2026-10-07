# Puŕ Fermé Creative Studio

Internal tool for generating ad creatives for Meta, Amazon and Flipkart, checked against the Puŕ Fermé claims library.

Work in progress — full setup and deploy instructions land in the final build phase. Quick local start:

```bash
cp .env.example .env.local   # fill in DATABASE_URL etc.
npm install
npm run db:migrate
npm run db:seed
npm run dev
```
