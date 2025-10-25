import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// Listar formas de pagamento (qualquer usuário autenticado)
router.get('/', authenticate, async (req, res) => {
  try {
    const payments = await prisma.paymentMethod.findMany({ orderBy: { name: 'asc' } });
    res.json(payments);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar formas de pagamento' });
  }
});

// Criar (admin)
router.post('/', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
    const created = await prisma.paymentMethod.create({ data: { name } });
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar forma de pagamento' });
  }
});

// Atualizar (admin)
router.put('/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name } = req.body;
    const updated = await prisma.paymentMethod.update({
      where: { id },
      data: { name },
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar forma de pagamento' });
  }
});

// Excluir (admin)
router.delete('/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await prisma.paymentMethod.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir forma de pagamento' });
  }
});

export default router;