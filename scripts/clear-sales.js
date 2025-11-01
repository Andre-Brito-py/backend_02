import dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function clearSales() {
  console.log('Limpando vendas (Sale, SaleItem, SaleItemAdditional)...');
  try {
    const delAdds = await prisma.saleItemAdditional.deleteMany({});
    console.log(`SaleItemAdditionals removidos: ${delAdds.count}`);

    const delItems = await prisma.saleItem.deleteMany({});
    console.log(`SaleItems removidos: ${delItems.count}`);

    const delSales = await prisma.sale.deleteMany({});
    console.log(`Sales removidas: ${delSales.count}`);

    console.log('Concluído. Observação: estoques de produtos não foram ajustados.');
  } catch (e) {
    console.error('Erro ao limpar vendas:', e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

clearSales();