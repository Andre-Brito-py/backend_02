# Backend — Sistema de Caixa (Node/Express + Prisma)

Este repositório contém apenas o backend (API) do sistema de caixa. Está pronto para deploy na Render com banco PostgreSQL (Neon).

## Tecnologias
- Node.js + Express
- Prisma ORM (PostgreSQL)
- JWT (autenticação)

## Variáveis de ambiente (.env)
```
PORT=4000
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public
JWT_SECRET=sua_chave_segura
# Múltiplas origens separadas por vírgula
CORS_ORIGINS=https://seu-frontend.vercel.app,http://localhost:3000
```

## Scripts
- `npm run dev` — desenvolvimento
- `npm start` — produção
- `npm run prisma:generate` — gerar client
- `npm run prisma:push` — aplicar schema no banco
- `npm run prisma:seed` — dados de exemplo (admin + vendas)
- `npm run reset:db` — limpa vendas e usuários não-ADMIN (mantém admin)

## Fluxo de Setup Local
```bash
npm install
npm run prisma:generate
npm run prisma:push
# opcional: popular dados
npm run prisma:seed
# para limpar base antes de ir a produção
npm run reset:db
npm run dev
```

## Deploy na Render
1. Crie um Web Service na Render apontando para este repositório (root: `backend/` se necessário).
2. Build Command: `npm install && npm run prisma:generate`
3. Start Command: `npm run prisma:push && npm start`
4. Variáveis de ambiente:
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `CORS_ORIGINS` (inclua o domínio da Vercel)
5. Teste `GET /health`.

## Rotas Principais
- `POST /api/auth/login` — login
- `GET /api/sales` — listar vendas
- `POST /api/sales` — criar venda
- `GET /api/reports/revenue-by-day` — receita por dia
- `GET /api/categories`, `GET /api/products`, `GET /api/payments`

## Observações
- O seed cria `AdminTeste / admin@123`. Mude a senha após deploy.
- Antes de entregar, rode `npm run reset:db` para zerar vendas e remover caixas (mantendo apenas ADMIN).