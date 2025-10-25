import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// Listar categorias
router.get('/', authenticate, async (req, res) => {
  try {
    const cats = await prisma.category.findMany({ orderBy: { name: 'asc' } });
    res.json(cats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar categorias' });
  }
});

// Criar categoria (admin)
router.post('/', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
    const created = await prisma.category.create({ data: { name } });
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar categoria' });
  }
});

// Atualizar categoria (admin)
router.put('/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name } = req.body;
    const updated = await prisma.category.update({ where: { id }, data: { name } });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar categoria' });
  }
});

// Excluir categoria (admin)
router.delete('/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const cat = await prisma.category.findUnique({ where: { id } });
    if (!cat) return res.status(404).json({ error: 'Categoria não encontrada' });
    await prisma.category.delete({ where: { id } });
    // Produtos permanecem com category (string) igual ao nome antigo; UI pode reatribuir.
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir categoria' });
  }
});

// Listar produtos de uma categoria pelo nome
router.get('/:id/products', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const cat = await prisma.category.findUnique({ where: { id } });
    if (!cat) return res.status(404).json({ error: 'Categoria não encontrada' });
    const products = await prisma.product.findMany({ where: { category: cat.name }, orderBy: { name: 'asc' } });
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar produtos da categoria' });
  }
});

// Adicionar produto à categoria (atribui Product.category = Category.name)
router.post('/:id/products', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { productId } = req.body;
    if (!productId) return res.status(400).json({ error: 'productId é obrigatório' });
    const cat = await prisma.category.findUnique({ where: { id } });
    if (!cat) return res.status(404).json({ error: 'Categoria não encontrada' });
    const updated = await prisma.product.update({ where: { id: parseInt(productId) }, data: { category: cat.name } });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao vincular produto à categoria' });
  }
});

// Remover produto da categoria (atribui Product.category = null)
router.delete('/:id/products/:productId', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const productId = parseInt(req.params.productId);
    const cat = await prisma.category.findUnique({ where: { id } });
    if (!cat) return res.status(404).json({ error: 'Categoria não encontrada' });
    const prod = await prisma.product.findUnique({ where: { id: productId } });
    if (!prod) return res.status(404).json({ error: 'Produto não encontrado' });
    if (prod.category !== cat.name) return res.status(400).json({ error: 'Produto não pertence à categoria informada' });
    await prisma.product.update({ where: { id: productId }, data: { category: null } });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao remover produto da categoria' });
  }
});

export default router;