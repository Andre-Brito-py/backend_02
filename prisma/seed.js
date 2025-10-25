import dotenv from 'dotenv';
dotenv.config();
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createRandomSalesForPeriod({ startDate, endDate }) {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) {
    console.log('Nenhum usuário ADMIN encontrado. Abortando geração de vendas.');
    return;
  }

  const products = await prisma.product.findMany();
  if (!products || products.length === 0) {
    console.log('Nenhum produto encontrado. Criando produtos de exemplo para testes...');
    const sample = [
      { name: 'Produto A', price: 9.9 },
      { name: 'Produto B', price: 19.9 },
      { name: 'Produto C', price: 14.5 },
      { name: 'Produto D', price: 7.75 },
      { name: 'Produto E', price: 29.0 },
    ];
    for (const p of sample) {
      await prisma.product.create({ data: { name: p.name, price: p.price } });
    }
  }
  const productsList = await prisma.product.findMany();

  const paymentMethods = await prisma.paymentMethod.findMany();
  if (!paymentMethods || paymentMethods.length === 0) {
    console.log('Nenhuma forma de pagamento encontrada, criando padrão...');
    const payments = ['Dinheiro', 'PIX', 'Cartão de Crédito', 'Cartão de Débito'];
    for (const name of payments) {
      await prisma.paymentMethod.upsert({ where: { name }, update: {}, create: { name } });
    }
  }
  const pmList = await prisma.paymentMethod.findMany();

  function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function choice(arr) { return arr[rand(0, arr.length - 1)]; }

  const msPerDay = 24 * 60 * 60 * 1000;
  const days = Math.floor((endDate - startDate) / msPerDay) + 1;

  let totalSalesCreated = 0;

  for (let d = 0; d < days; d++) {
    const dayStart = new Date(startDate.getTime() + d * msPerDay);
    // criar entre 6 e 14 vendas por dia
    const salesCount = rand(6, 14);

    for (let s = 0; s < salesCount; s++) {
      const createdAt = new Date(dayStart);
      createdAt.setHours(rand(9, 20), rand(0, 59), rand(0, 59), rand(0, 999));

      // itens por venda entre 1 e 3
      const itemsCount = rand(1, 3);
      const chosenProducts = [];
      for (let i = 0; i < itemsCount; i++) {
        chosenProducts.push(choice(productsList));
      }

      // construir itens e total
      let total = 0;
      const saleItemsData = chosenProducts.map((prod) => {
        const qty = rand(1, 5);
        const unitPriceNumber = Number(prod.price);
        total += unitPriceNumber * qty;
        return {
          productId: prod.id,
          quantity: qty,
          unitPrice: unitPriceNumber,
        };
      });

      const pm = choice(pmList);

      const sale = await prisma.sale.create({
        data: {
          total: Number(total.toFixed(2)),
          paymentMethodId: pm.id,
          userId: admin.id,
          createdAt,
          items: { create: saleItemsData },
        },
        include: { items: true },
      });

      totalSalesCreated++;
    }
  }

  console.log(`Vendas geradas: ${totalSalesCreated}`);
}

async function main() {
  console.log('Seeding database...');

  // Criar formas de pagamento padrão
  const payments = ['Dinheiro', 'PIX', 'Cartão de Crédito', 'Cartão de Débito'];
  for (const name of payments) {
    await prisma.paymentMethod.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  // Usuário admin padrão
  const adminLogin = 'AdminTeste';
  const adminExists = await prisma.user.findUnique({ where: { login: adminLogin } });
  if (!adminExists) {
    const hashed = await bcrypt.hash('admin@123', 10);
    await prisma.user.create({
      data: {
        name: 'Admin Teste',
        login: adminLogin,
        password: hashed,
        role: 'ADMIN',
      },
    });
    console.log('Admin criado: login=AdminTeste / senha=admin@123');
  } else {
    console.log('Admin já existe.');
  }

  // Gerar vendas aleatórias entre 19 e 25/10 do ano atual
  const year = new Date().getFullYear();
  const start = new Date(year, 9, 19, 0, 0, 0, 0); // mês 9 = Outubro
  const end = new Date(year, 9, 25, 23, 59, 59, 999);
  await createRandomSalesForPeriod({ startDate: start, endDate: end });

  console.log('Seed concluído.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });