import dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function resetDatabase() {
  console.log('Iniciando limpeza completa de dados...');

  // 1) Itens de venda adicionais -> Itens de venda -> Vendas
  const delSaleItemAdds = await prisma.saleItemAdditional.deleteMany({});
  console.log(`SaleItemAdditionals removidos: ${delSaleItemAdds.count}`);

  const delSaleItems = await prisma.saleItem.deleteMany({});
  console.log(`SaleItems removidos: ${delSaleItems.count}`);

  const delSales = await prisma.sale.deleteMany({});
  console.log(`Sales removidas: ${delSales.count}`);

  // 2) Vínculos produto <-> categorias de adicionais
  const delProdAddCats = await prisma.productAdditionalCategory.deleteMany({});
  console.log(`ProductAdditionalCategory vínculos removidos: ${delProdAddCats.count}`);

  // 3) Adicionais e suas categorias
  const delAdditionals = await prisma.additional.deleteMany({});
  console.log(`Additionals removidos: ${delAdditionals.count}`);

  const delAddCats = await prisma.additionalCategory.deleteMany({});
  console.log(`AdditionalCategories removidas: ${delAddCats.count}`);

  // 4) Produtos e categorias
  const delProducts = await prisma.product.deleteMany({});
  console.log(`Products removidos: ${delProducts.count}`);

  const delCategories = await prisma.category.deleteMany({});
  console.log(`Categories removidas: ${delCategories.count}`);

  // 5) Usuários que não são ADMIN (caixas)
  const delUsers = await prisma.user.deleteMany({ where: { role: { not: 'ADMIN' } } });
  console.log(`Usuários não-ADMIN removidos: ${delUsers.count}`);

  // Mantemos PaymentMethod e o usuário ADMIN.
  console.log('Mantidos: PaymentMethod(s) e ADMIN.');

  console.log('Limpeza concluída.');
}

resetDatabase()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });