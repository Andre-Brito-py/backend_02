import dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function resetDatabase() {
  console.log('Iniciando limpeza de dados...');

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) {
    console.log('Nenhum usuário ADMIN encontrado. Abortando.');
    return;
  }

  // Remover itens de venda primeiro (dependências)
  const delItems = await prisma.saleItem.deleteMany({});
  console.log(`SaleItems removidos: ${delItems.count}`);

  // Remover vendas
  const delSales = await prisma.sale.deleteMany({});
  console.log(`Sales removidas: ${delSales.count}`);

  // Remover usuários que não são ADMIN
  const delUsers = await prisma.user.deleteMany({ where: { role: { not: 'ADMIN' } } });
  console.log(`Usuários não-ADMIN removidos: ${delUsers.count}`);

  // Opcional: manter produtos, categorias e formas de pagamento
  console.log('Mantidos: Products, Categories, PaymentMethod.');

  console.log('Limpeza concluída.');
}

resetDatabase()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });