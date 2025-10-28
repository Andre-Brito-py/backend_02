import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

router.use(authenticate, requireRole('ADMIN'));

// Obter configurações (cria padrão se não existir)
router.get('/', async (req, res) => {
  try {
    let setting = await prisma.setting.findFirst();
    if (!setting) {
      setting = await prisma.setting.create({ data: { recentSalesLimit: 10, recentSalesEnabled: true, darkMode: false } });
    }
    res.json(setting);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao carregar configurações' });
  }
});

// Atualizar configurações
router.put('/', async (req, res) => {
  try {
    const { recentSalesLimit, recentSalesEnabled, darkMode } = req.body;
    const limit = parseInt(recentSalesLimit);
    if (!Number.isInteger(limit) || limit <= 0 || limit > 500) {
      return res.status(400).json({ error: 'Limite de vendas recentes deve ser um número entre 1 e 500' });
    }
    const enabled = typeof recentSalesEnabled === 'boolean' ? recentSalesEnabled : true;
    const isDark = typeof darkMode === 'boolean' ? darkMode : false;
    let setting = await prisma.setting.findFirst();
    if (!setting) {
      setting = await prisma.setting.create({ data: { recentSalesLimit: limit, recentSalesEnabled: enabled, darkMode: isDark } });
    } else {
      setting = await prisma.setting.update({ where: { id: setting.id }, data: { recentSalesLimit: limit, recentSalesEnabled: enabled, darkMode: isDark } });
    }
    res.json(setting);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar configurações' });
  }
});

export default router;