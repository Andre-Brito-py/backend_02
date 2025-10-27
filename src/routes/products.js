import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// Listar produtos (qualquer usuário autenticado)
router.get('/', authenticate, async (req, res) => {
  try {
    const includeSuspended = String(req.query.includeSuspended || '').toLowerCase() === 'true';
    const where = includeSuspended ? {} : { suspended: false };
    const products = await prisma.product.findMany({ where, orderBy: { name: 'asc' } });
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar produtos' });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao carregar produto' });
  }
});

// Criar produto (admin)
router.post('/', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const { name, price, category, stock, variablePrice } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });

    const vp = !!variablePrice;
    let priceNumber;
    if (vp) {
      // Para produtos de preço variável, permitir preço ausente e salvar 0.00
      priceNumber = Number.isFinite(price) ? Number(price) : 0;
    } else {
      if (price == null || !Number.isFinite(Number(price))) {
        return res.status(400).json({ error: 'Preço inválido' });
      }
      priceNumber = Number(price);
    }

    const created = await prisma.product.create({
      data: {
        name,
        price: priceNumber.toString(),
        category: category || null,
        // Quando não informado, considerar estoque ilimitado (sentinela -1)
        stock: stock ?? -1,
        variablePrice: vp,
        suspended: false,
      },
    });
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar produto' });
  }
});

// Atualizar produto (admin)
router.put('/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, price, category, stock, variablePrice, suspended } = req.body;
    const updated = await prisma.product.update({
      where: { id },
      data: {
        name,
        price: price != null ? price.toString() : undefined,
        category,
        stock,
        variablePrice: typeof variablePrice === 'boolean' ? variablePrice : undefined,
        suspended: typeof suspended === 'boolean' ? suspended : undefined,
      },
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar produto' });
  }
});

// Suspender/reativar produto (admin)
router.patch('/:id/suspended', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { suspended } = req.body;
    if (typeof suspended !== 'boolean') {
      return res.status(400).json({ error: 'Parâmetro "suspended" deve ser boolean' });
    }
    const updated = await prisma.product.update({ where: { id }, data: { suspended } });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar suspensão do produto' });
  }
});

// Excluir produto (admin)
router.delete('/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const prod = await prisma.product.findUnique({ where: { id } });
    if (!prod) return res.status(404).json({ error: 'Produto não encontrado' });

    // Impedir exclusão se houver vendas vinculadas
    const linkedCount = await prisma.saleItem.count({ where: { productId: id } });
    if (linkedCount > 0) {
      return res.status(400).json({ error: 'Produto possui vendas vinculadas; exclusão não permitida.' });
    }

    await prisma.product.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    // Violação de chave estrangeira (fallback)
    if (err?.code === 'P2003') {
      return res.status(400).json({ error: 'Produto possui vínculos; exclusão não permitida.' });
    }
    res.status(500).json({ error: 'Erro ao excluir produto' });
  }
});

export default router;

// --- Vínculos de categorias de adicionais por produto ---
// Listar categorias de adicionais vinculadas a um produto
router.get('/:id/additional-categories', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const links = await prisma.productAdditionalCategory.findMany({
      where: { productId: id },
      include: { additionalCategory: true },
      orderBy: { additionalCategory: { name: 'asc' } },
    });
    const categories = links.map(l => l.additionalCategory);
    res.json(categories);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar categorias de adicionais do produto' });
  }
});

// Atualizar vínculos de categorias de adicionais do produto (admin)
router.put('/:id/additional-categories', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { categoryIds } = req.body; // array de ids
    if (!Array.isArray(categoryIds)) {
      return res.status(400).json({ error: 'categoryIds deve ser um array' });
    }

    // Normalizar para números únicos
    const desired = [...new Set(categoryIds.map(n => Number(n)).filter(n => Number.isFinite(n)))];

    // Ler vínculos atuais
    const currentLinks = await prisma.productAdditionalCategory.findMany({ where: { productId: id } });
    const current = new Set(currentLinks.map(l => l.additionalCategoryId));

    const toAdd = desired.filter(cid => !current.has(cid));
    const toRemove = currentLinks.filter(l => !desired.includes(l.additionalCategoryId)).map(l => l.id);

    await prisma.$transaction([
      ...toRemove.map(linkId => prisma.productAdditionalCategory.delete({ where: { id: linkId } })),
      ...toAdd.map(cid => prisma.productAdditionalCategory.create({ data: { productId: id, additionalCategoryId: cid } })),
    ]);

    const result = await prisma.productAdditionalCategory.findMany({
      where: { productId: id },
      include: { additionalCategory: true },
      orderBy: { additionalCategory: { name: 'asc' } },
    });
    res.json(result.map(r => r.additionalCategory));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar categorias de adicionais do produto' });
  }
});