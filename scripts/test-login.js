import dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const user = await prisma.user.findUnique({ where: { login: 'AdminTeste' } });
  console.log('User exists:', !!user);
  if (user) {
    console.log('Hashed password length:', user.password?.length);
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });