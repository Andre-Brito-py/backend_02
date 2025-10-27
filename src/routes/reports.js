import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import ExcelJS from 'exceljs';

const router = Router();

router.use(authenticate, requireRole('ADMIN'));

function startOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d) { const x = new Date(d); x.setHours(23,59,59,999); return x; }

router.get('/summary', async (req, res) => {
  try {
    const now = new Date();

    const startToday = startOfDay(now);
    const endToday = endOfDay(now);

    const startWeek = new Date(now);
    const day = startWeek.getDay(); // 0=Domingo
    const diff = (day + 6) % 7; // começar na segunda
    startWeek.setDate(startWeek.getDate() - diff);
    const endWeek = endOfDay(new Date());

    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endMonth = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));

    const [today, week, month] = await Promise.all([
      prisma.sale.findMany({ where: { createdAt: { gte: startToday, lte: endToday } } }),
      prisma.sale.findMany({ where: { createdAt: { gte: startWeek, lte: endWeek } } }),
      prisma.sale.findMany({ where: { createdAt: { gte: startMonth, lte: endMonth } } }),
    ]);

    const sum = (arr) => arr.reduce((acc, s) => acc + Number(s.total), 0);

    res.json({
      today: { total: sum(today), count: today.length },
      week: { total: sum(week), count: week.length },
      month: { total: sum(month), count: month.length },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao carregar resumo' });
  }
});

router.get('/revenue-by-day', async (req, res) => {
  try {
    const { start, end, delivery } = req.query;
    const where = {};
    if (start || end) {
      where.createdAt = {};
      if (start) where.createdAt.gte = new Date(start);
      if (end) where.createdAt.lte = new Date(end);
    }
    // Carrega vendas com itens e aplica filtro de delivery/presencial nos itens
    const sales = await prisma.sale.findMany({ where, orderBy: { createdAt: 'asc' }, include: { items: true } });
    const matchDelivery = (i) => delivery === 'delivery' ? i.isDelivery === true : delivery === 'presencial' ? i.isDelivery === false : true;
    const map = new Map();
    for (const s of sales) {
      const d = s.createdAt.toISOString().slice(0,10);
      const totalItems = s.items.filter(matchDelivery).reduce((acc, it) => acc + Number(it.unitPrice) * it.quantity, 0);
      map.set(d, (map.get(d) || 0) + totalItems);
    }
    const data = Array.from(map.entries()).map(([date, total]) => ({ date, total }));
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao carregar faturamento por dia' });
  }
});

router.get('/top-products', async (req, res) => {
  try {
    const { start, end, limit } = req.query;
    const whereSale = {};
    if (start || end) {
      whereSale.createdAt = {};
      if (start) whereSale.createdAt.gte = new Date(start);
      if (end) whereSale.createdAt.lte = new Date(end);
    }

    const sales = await prisma.sale.findMany({
      where: whereSale,
      include: { items: { include: { product: true } } },
    });

    const map = new Map();
    for (const s of sales) {
      for (const i of s.items) {
        const key = i.productId;
        const prev = map.get(key) || { productId: key, name: i.product.name, qty: 0, revenue: 0 };
        prev.qty += i.quantity;
        prev.revenue += Number(i.unitPrice) * i.quantity;
        map.set(key, prev);
      }
    }
    let arr = Array.from(map.values());
    arr.sort((a,b) => b.qty - a.qty);
    if (limit) arr = arr.slice(0, parseInt(limit));
    res.json(arr);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao carregar ranking de produtos' });
  }
});

router.get('/export-xlsx', async (req, res) => {
  try {
    const { start, end, paymentMethodId, productId, delivery } = req.query;
    const where = {};
    if (start || end) {
      where.createdAt = {};
      if (start) where.createdAt.gte = new Date(start);
      if (end) where.createdAt.lte = new Date(end);
    }
    if (paymentMethodId) {
      where.paymentMethodId = parseInt(paymentMethodId);
    }

    // Carrega vendas no período e compõe dados como no dashboard
    let sales = await prisma.sale.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: { items: { include: { product: true } }, paymentMethod: true, user: true },
    });

    // Filtro por produto (aplicado após a consulta pois é relacionamento many-to-many)
    if (productId) {
      const prodId = parseInt(productId);
      sales = sales.filter(sale => 
        sale.items.some(item => item.product.id === prodId)
      );
    }

    // Filtrar itens por delivery/presencial
    const matchDelivery = (i) => delivery === 'delivery' ? i.isDelivery === true : delivery === 'presencial' ? i.isDelivery === false : true;
    sales = sales.map(s => ({ ...s, items: s.items.filter(matchDelivery) })).filter(s => s.items.length > 0);

    // Faturamento por dia (somando subtotais dos itens filtrados)
    const mapByDay = new Map();
    for (const s of sales) {
      const d = s.createdAt.toISOString().slice(0,10);
      const totalItemsDay = s.items.reduce((acc, i) => acc + Number(i.unitPrice) * i.quantity, 0);
      mapByDay.set(d, (mapByDay.get(d) || 0) + totalItemsDay);
    }
    const revenueByDay = Array.from(mapByDay.entries()).map(([date, total]) => ({ date, total }));

    // Top produtos (apenas itens filtrados)
    const mapTop = new Map();
    for (const s of sales) {
      for (const i of s.items) {
        const key = i.productId;
        const prev = mapTop.get(key) || { productId: key, name: i.product.name, qty: 0, revenue: 0 };
        prev.qty += i.quantity;
        prev.revenue += Number(i.unitPrice) * i.quantity;
        mapTop.set(key, prev);
      }
    }
    const topProducts = Array.from(mapTop.values()).sort((a,b) => b.qty - a.qty);

    // Resumo período (com base em itens filtrados)
    const total = sales.reduce((acc, s) => acc + s.items.reduce((a,i)=>a + Number(i.unitPrice) * i.quantity, 0), 0);
    const count = sales.length;
    const totalItems = sales.reduce((acc, s) => acc + s.items.reduce((a,i)=>a+i.quantity,0), 0);
    const avgTicket = count ? total / count : 0;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Sistema de Caixa';
    wb.created = new Date();

    // Sheet Resumo
    const wsResumo = wb.addWorksheet('Resumo');
    wsResumo.columns = [
      { header: 'Indicador', key: 'k', width: 25 },
      { header: 'Valor', key: 'v', width: 30 },
    ];
    wsResumo.getRow(1).font = { bold: true };
    wsResumo.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF2FF' } };
    wsResumo.views = [{ state: 'frozen', ySplit: 1 }];
    wsResumo.autoFilter = { from: 'A1', to: 'B1' };
    wsResumo.addRow({ k: 'Início', v: start ? new Date(start) : '-' });
    wsResumo.addRow({ k: 'Fim', v: end ? new Date(end) : '-' });
    wsResumo.addRow({ k: 'Tipo', v: delivery === 'delivery' ? 'Delivery' : delivery === 'presencial' ? 'Presencial' : 'Todos' });
    wsResumo.addRow({ k: 'Total de vendas', v: count });
    wsResumo.addRow({ k: 'Itens vendidos (qtde)', v: totalItems });
    wsResumo.addRow({ k: 'Faturamento total (R$)', v: total });
    wsResumo.addRow({ k: 'Ticket médio (R$)', v: avgTicket });
    wsResumo.getColumn('v').numFmt = '#,##0.00';

    // Sheet Faturamento por dia
    const wsDia = wb.addWorksheet('FaturamentoPorDia');
    wsDia.columns = [
      { header: 'Data', key: 'date', width: 15 },
      { header: 'Total (R$)', key: 'total', width: 18, style: { numFmt: '#,##0.00' } },
    ];
    wsDia.getRow(1).font = { bold: true };
    wsDia.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF2FF' } };
    wsDia.views = [{ state: 'frozen', ySplit: 1 }];
    wsDia.autoFilter = { from: 'A1', to: 'B1' };
    for (const r of revenueByDay) wsDia.addRow({ date: r.date, total: Number(r.total) });

    // Sheet Top Produtos
    const wsTop = wb.addWorksheet('TopProdutos');
    wsTop.columns = [
      { header: 'Produto', key: 'name', width: 35 },
      { header: 'Quantidade', key: 'qty', width: 15 },
      { header: 'Receita (R$)', key: 'revenue', width: 18, style: { numFmt: '#,##0.00' } },
    ];
    wsTop.getRow(1).font = { bold: true };
    wsTop.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF2FF' } };
    wsTop.views = [{ state: 'frozen', ySplit: 1 }];
    wsTop.autoFilter = { from: 'A1', to: 'C1' };
    for (const t of topProducts) wsTop.addRow({ name: t.name, qty: t.qty, revenue: Number(t.revenue) });

    // Sheet Vendas detalhadas (linha por venda)
    const wsVendas = wb.addWorksheet('Vendas');
    wsVendas.columns = [
      { header: 'Venda ID', key: 'saleId', width: 10 },
      { header: 'Data/Hora', key: 'dt', width: 20, style: { numFmt: 'dd/mm/yyyy hh:mm' } },
      { header: 'Usuário', key: 'user', width: 22 },
      { header: 'Pagamento', key: 'pay', width: 22 },
      { header: 'Itens (resumo)', key: 'items', width: 60 },
      { header: 'Quantidade Total', key: 'qtyTotal', width: 18 },
      { header: 'Total (R$)', key: 'tot', width: 18, style: { numFmt: '#,##0.00' } },
    ];
    wsVendas.getRow(1).font = { bold: true };
    wsVendas.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF2FF' } };
    wsVendas.views = [{ state: 'frozen', ySplit: 1 }];
    wsVendas.autoFilter = { from: 'A1', to: 'G1' };
    for (const s of sales) {
      const totalItems = s.items.reduce((acc, i) => acc + Number(i.unitPrice) * i.quantity, 0);
      wsVendas.addRow({
        saleId: s.id,
        dt: new Date(s.createdAt),
        user: s.user?.name || s.userId,
        pay: s.paymentMethod?.name || s.paymentMethodId,
        items: s.items.map(i => `${i.product.name} x${i.quantity} (R$ ${Number(i.unitPrice).toFixed(2)})`).join('; '),
        qtyTotal: s.items.reduce((a,i)=>a+i.quantity,0),
        tot: Number(totalItems),
      });
    }

    // Sheet Itens da venda (linha por item)
    const wsItens = wb.addWorksheet('ItensVenda');
    wsItens.columns = [
      { header: 'Venda ID', key: 'saleId', width: 10 },
      { header: 'Data/Hora', key: 'dt', width: 20, style: { numFmt: 'dd/mm/yyyy hh:mm' } },
      { header: 'Usuário', key: 'user', width: 22 },
      { header: 'Pagamento', key: 'pay', width: 22 },
      { header: 'Produto', key: 'product', width: 30 },
      { header: 'Categoria', key: 'category', width: 22 },
      { header: 'Quantidade', key: 'qty', width: 14 },
      { header: 'Unitário (R$)', key: 'unit', width: 18, style: { numFmt: '#,##0.00' } },
      { header: 'Subtotal (R$)', key: 'sub', width: 18, style: { numFmt: '#,##0.00' } },
      { header: 'Tipo', key: 'tipo', width: 14 },
    ];
    wsItens.getRow(1).font = { bold: true };
    wsItens.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF2FF' } };
    wsItens.views = [{ state: 'frozen', ySplit: 1 }];
    wsItens.autoFilter = { from: 'A1', to: 'I1' };
    for (const s of sales) {
      for (const i of s.items) {
        const unit = Number(i.unitPrice);
        const sub = unit * i.quantity;
        wsItens.addRow({
          saleId: s.id,
          dt: new Date(s.createdAt),
          user: s.user?.name || s.userId,
          pay: s.paymentMethod?.name || s.paymentMethodId,
          product: i.product.name,
          category: i.product.category || '-',
          qty: i.quantity,
          unit,
          sub,
          tipo: i.isDelivery ? 'Delivery' : 'Presencial',
        });
      }
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="dashboard_${Date.now()}.xlsx"`);

    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao exportar Excel' });
  }
});



router.get('/traffic', async (req, res) => {
  try {
    const { start, end } = req.query;
    const where = {};
    if (start || end) {
      where.createdAt = {};
      if (start) where.createdAt.gte = new Date(start);
      if (end) where.createdAt.lte = new Date(end);
    }
    const sales = await prisma.sale.findMany({ where });
    const byHour = Array.from({ length: 24 }, () => 0);
    const byDay = Array.from({ length: 7 }, () => 0); // 0=Domingo

    for (const s of sales) {
      const d = new Date(s.createdAt);
      byHour[d.getHours()] += 1;
      byDay[d.getDay()] += 1;
    }

    res.json({ byHour, byDay });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao carregar tráfego' });
  }
});

export default router;