import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// Listar adicionais
router.get('/', authenticate, async (req, res) => {
  try {
    const includeSuspended = String(req.query.includeSuspended || '').toLowerCase() === 'true';
    const where = includeSuspended ? {} : { suspended: false };
    const additionals = await prisma.additional.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { category: true },
    });
    res.json(additionals);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar adicionais' });
  }
});

// Criar adicional (admin)
router.post('/', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const { name, price, categoryId } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
    if (categoryId == null) return res.status(400).json({ error: 'Categoria é obrigatória' });
    if (price == null || !Number.isFinite(Number(price))) {
      return res.status(400).json({ error: 'Preço inválido' });
    }
    const created = await prisma.additional.create({
      data: {
        name,
        price: Number(price).toString(),
        categoryId: Number(categoryId),
        suspended: false,
      },
    });
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar adicional' });
  }
});

// Atualizar adicional (admin)
router.put('/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, price, categoryId, suspended } = req.body;
    const updated = await prisma.additional.update({
      where: { id },
      data: {
        name,
        price: price != null ? Number(price).toString() : undefined,
        categoryId: categoryId != null ? Number(categoryId) : undefined,
        suspended: typeof suspended === 'boolean' ? suspended : undefined,
      },
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar adicional' });
  }
});

// Suspender/reativar adicional (admin)
router.patch('/:id/suspended', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { suspended } = req.body;
    if (typeof suspended !== 'boolean') {
      return res.status(400).json({ error: 'Parâmetro "suspended" deve ser boolean' });
    }
    const updated = await prisma.additional.update({ where: { id }, data: { suspended } });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar suspensão do adicional' });
  }
});

// Excluir adicional (admin)
router.delete('/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const add = await prisma.additional.findUnique({ where: { id } });
    if (!add) return res.status(404).json({ error: 'Adicional não encontrado' });

    const used = await prisma.saleItemAdditional.count({ where: { additionalId: id } });
    if (used > 0) {
      return res.status(400).json({ error: 'Adicional já utilizado em vendas; exclusão não permitida.' });
    }

    await prisma.additional.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir adicional' });
  }
});

export default router;