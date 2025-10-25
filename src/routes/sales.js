import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Registrar venda (caixa ou admin)
router.post('/', authenticate, async (req, res) => {
  try {
    const { paymentMethodId, items } = req.body;
    if (!paymentMethodId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Forma de pagamento e itens são obrigatórios' });
    }

    // Carregar produtos e validar estoque
    const productIds = items.map(i => i.productId);
    const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
    const productMap = new Map(products.map(p => [p.id, p]));

    for (const item of items) {
      const product = productMap.get(item.productId);
      if (!product) return res.status(400).json({ error: `Produto ${item.productId} não encontrado` });
      if (item.quantity <= 0) return res.status(400).json({ error: 'Quantidade inválida' });
      // Se estoque for rastreado (>=0), validar quantidade
      if (product.stock >= 0 && product.stock < item.quantity) {
        return res.status(400).json({ error: `Estoque insuficiente para ${product.name}` });
      }
      // Validar preço unitário quando produto é de preço variável
      if (product.variablePrice) {
        const up = Number(item.unitPrice);
        if (!Number.isFinite(up) || up <= 0) {
          return res.status(400).json({ error: `Preço unitário inválido para ${product.name}` });
        }
      }
    }

    // Calcular total e preparar itens
    let total = 0;
    const preparedItems = items.map(item => {
      const product = productMap.get(item.productId);
      let unitPriceStr;
      if (product.variablePrice) {
        const up = Number(item.unitPrice);
        unitPriceStr = up.toFixed(2);
        total += up * item.quantity;
      } else {
        const unitPrice = Number(product.price);
        unitPriceStr = unitPrice.toFixed(2);
        total += unitPrice * item.quantity;
      }
      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: unitPriceStr,
      };
    });

    // Transação: criar venda, itens e atualizar estoque
    const sale = await prisma.$transaction(async (tx) => {
      const createdSale = await tx.sale.create({
        data: {
          userId: req.user.userId,
          paymentMethodId,
          total: total.toFixed(2),
        },
      });

      for (const item of preparedItems) {
        await tx.saleItem.create({
          data: {
            saleId: createdSale.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          },
        });
        // Atualizar estoque somente quando rastreado
        const current = productMap.get(item.productId);
        if (current.stock >= 0) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: current.stock - item.quantity },
          });
        }
      }

      return createdSale;
    });

    res.status(201).json(sale);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao registrar venda' });
  }
});

// Listar vendas com filtros
router.get('/', authenticate, async (req, res) => {
  try {
    const { start, end, productId, paymentMethodId } = req.query;

    const where = {};
    if (paymentMethodId) where.paymentMethodId = parseInt(paymentMethodId);
    if (req.user.role === 'CAIXA') where.userId = req.user.userId; // caixa vê apenas suas vendas
    if (start || end) {
      where.createdAt = {};
      if (start) where.createdAt.gte = new Date(start);
      if (end) where.createdAt.lte = new Date(end);
    }

    const sales = await prisma.sale.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: true,
        paymentMethod: true,
        items: { include: { product: true } },
      },
    });

    // Filtrar por produtoId no nível dos itens
    const filtered = productId
      ? sales.filter(s => s.items.some(i => i.productId === parseInt(productId)))
      : sales;

    res.json(filtered);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar vendas' });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const sale = await prisma.sale.findUnique({
      where: { id },
      include: {
        user: true,
        paymentMethod: true,
        items: { include: { product: true } },
      },
    });
    if (!sale) return res.status(404).json({ error: 'Venda não encontrada' });
    if (req.user.role === 'CAIXA' && sale.userId !== req.user.userId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    res.json(sale);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao carregar venda' });
  }
});

export default router;