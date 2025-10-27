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

    // Pré-carregar adicionais (se houver) para validação posterior
    const allAdditionalIds = Array.from(new Set(
      items.flatMap(i => Array.isArray(i.additionals) ? i.additionals.map(a => Number(a.additionalId)) : [])
        .filter(id => Number.isFinite(id))
    ));
    const additionalsAll = allAdditionalIds.length > 0
      ? await prisma.additional.findMany({ where: { id: { in: allAdditionalIds } }, include: { category: true } })
      : [];
    const additionalMap = new Map(additionalsAll.map(a => [a.id, a]));

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
      // isDelivery opcional booleano
      if (item.isDelivery !== undefined && typeof item.isDelivery !== 'boolean') {
        return res.status(400).json({ error: 'isDelivery deve ser booleano' });
      }

      // Validar adicionais, se presentes
      if (item.additionals !== undefined) {
        if (!Array.isArray(item.additionals)) {
          return res.status(400).json({ error: 'additionals deve ser um array' });
        }
        // Carregar categorias de adicionais vinculadas ao produto
        const allowedCatsLinks = await prisma.productAdditionalCategory.findMany({ where: { productId: product.id } });
        const allowedCategoryIds = new Set(allowedCatsLinks.map(l => l.additionalCategoryId));

        for (const a of item.additionals) {
          const aid = Number(a.additionalId);
          const qty = Number(a.quantity ?? 1);
          const up = Number(a.unitPrice);
          if (!Number.isFinite(aid) || !additionalMap.has(aid)) {
            return res.status(400).json({ error: `Adicional inválido para produto ${product.name}` });
          }
          if (!Number.isInteger(qty) || qty <= 0) {
            return res.status(400).json({ error: 'Quantidade de adicional inválida' });
          }
          if (!Number.isFinite(up) || up < 0) {
            return res.status(400).json({ error: 'Preço de adicional inválido' });
          }
          // Verificar se a categoria do adicional está permitida para o produto
          const ad = additionalMap.get(aid);
          if (!allowedCategoryIds.has(ad.categoryId)) {
            return res.status(400).json({ error: `Categoria de adicional não permitida para o produto ${product.name}` });
          }
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
      // Somar adicionais, se houver
      if (Array.isArray(item.additionals)) {
        for (const a of item.additionals) {
          const up = Number(a.unitPrice);
          const qty = Number(a.quantity ?? 1);
          total += up * qty;
        }
      }
      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: unitPriceStr,
        isDelivery: item.isDelivery === true ? true : false,
        additionals: Array.isArray(item.additionals)
          ? item.additionals.map(a => ({
              additionalId: Number(a.additionalId),
              quantity: Number(a.quantity ?? 1),
              unitPrice: Number(a.unitPrice).toFixed(2),
            }))
          : [],
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
        const createdItem = await tx.saleItem.create({
          data: {
            saleId: createdSale.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            isDelivery: item.isDelivery,
          },
        });
        if (item.additionals?.length) {
          for (const a of item.additionals) {
            await tx.saleItemAdditional.create({
              data: {
                saleItemId: createdItem.id,
                additionalId: a.additionalId,
                quantity: a.quantity,
                unitPrice: a.unitPrice,
              },
            });
          }
        }
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