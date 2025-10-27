import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// Listar categorias de adicionais
router.get('/', authenticate, async (req, res) => {
  try {
    const categories = await prisma.additionalCategory.findMany({
      orderBy: { name: 'asc' },
    });
    res.json(categories);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar categorias de adicionais' });
  }
});

// Criar categoria de adicional (admin)
router.post('/', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
    const created = await prisma.additionalCategory.create({
      data: { name, description: description || null },
    });
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    // Conflito de nome único
    if (err?.code === 'P2002') {
      return res.status(400).json({ error: 'Já existe uma categoria com este nome' });
    }
    res.status(500).json({ error: 'Erro ao criar categoria de adicional' });
  }
});

// Atualizar categoria de adicional (admin)
router.put('/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description } = req.body;
    const updated = await prisma.additionalCategory.update({
      where: { id },
      data: { name, description: description ?? undefined },
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar categoria de adicional' });
  }
});

// Excluir categoria de adicional (admin)
router.delete('/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const cat = await prisma.additionalCategory.findUnique({ where: { id } });
    if (!cat) return res.status(404).json({ error: 'Categoria não encontrada' });

    const additionsCount = await prisma.additional.count({ where: { categoryId: id } });
    const productLinks = await prisma.productAdditionalCategory.count({ where: { additionalCategoryId: id } });
    if (additionsCount > 0 || productLinks > 0) {
      return res.status(400).json({ error: 'Categoria possui vínculos; exclusão não permitida.' });
    }

    await prisma.additionalCategory.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir categoria de adicional' });
  }
});

export default router;