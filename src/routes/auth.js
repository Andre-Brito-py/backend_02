import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { prisma } from '../utils/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';

dotenv.config();

const router = Router();

// Registro público desabilitado
router.post('/register', async (req, res) => {
  return res.status(403).json({ error: 'Registro público desabilitado' });
});

// Criar perfil CAIXA (somente admin)
router.post('/cashiers', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const { name, login, password, email } = req.body;
    if (!name || !login || !password) return res.status(400).json({ error: 'Nome, login e senha são obrigatórios' });
    const exists = await prisma.user.findUnique({ where: { login } });
    if (exists) return res.status(400).json({ error: 'Login já existe' });
    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, login, email: email || null, password: hashed, role: 'CAIXA' },
    });
    res.status(201).json({ id: user.id, name: user.name, login: user.login, role: user.role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar caixa' });
  }
});

// Listar usuários (somente admin)
router.get('/users', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const { role } = req.query;
    const where = role ? { role } : {};
    const users = await prisma.user.findMany({ where, select: { id: true, name: true, login: true, role: true, createdAt: true } });
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar usuários' });
  }
});

// Login por login (não email)
router.post('/login', async (req, res) => {
  try {
    const { login, password } = req.body;
    if (!login || !password) return res.status(400).json({ error: 'Login e senha são obrigatórios' });
    const user = await prisma.user.findUnique({ where: { login } });
    if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Credenciais inválidas' });
    const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, user: { id: user.id, name: user.name, login: user.login, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao autenticar' });
  }
});

// Editar senha de caixa (somente admin)
router.put('/cashiers/:id/password', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Senha é obrigatória' });
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== 'CAIXA') return res.status(404).json({ error: 'Caixa não encontrado' });
    const hashed = await bcrypt.hash(password, 10);
    await prisma.user.update({ where: { id }, data: { password: hashed } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar senha' });
  }
});

// Desabilitar senha de caixa (somente admin)
router.delete('/cashiers/:id/password', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== 'CAIXA') return res.status(404).json({ error: 'Caixa não encontrado' });
    const random = await bcrypt.hash(`${Date.now()}_${Math.random()}`, 10);
    await prisma.user.update({ where: { id }, data: { password: random } });
    res.json({ success: true, message: 'Senha desabilitada. Defina uma nova para reativar.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao desabilitar senha' });
  }
});

// Editar dados de caixa (somente admin)
router.put('/cashiers/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, login, email } = req.body;
    if (!name || !login) return res.status(400).json({ error: 'Nome e login são obrigatórios' });
    
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== 'CAIXA') return res.status(404).json({ error: 'Caixa não encontrado' });
    
    // Verificar se o login já existe em outro usuário
    if (login !== user.login) {
      const existingUser = await prisma.user.findUnique({ where: { login } });
      if (existingUser) return res.status(400).json({ error: 'Login já existe' });
    }
    
    const updatedUser = await prisma.user.update({
      where: { id },
      data: { name, login, email: email || null }
    });
    
    res.json({ 
      id: updatedUser.id, 
      name: updatedUser.name, 
      login: updatedUser.login, 
      email: updatedUser.email,
      role: updatedUser.role 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar dados do caixa' });
  }
});

// Excluir perfil de caixa (somente admin)
router.delete('/cashiers/:id', authenticate, requireRole('ADMIN'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== 'CAIXA') return res.status(404).json({ error: 'Caixa não encontrado' });
    const salesCount = await prisma.sale.count({ where: { userId: id } });
    if (salesCount > 0) return res.status(400).json({ error: 'Caixa possui vendas vinculadas; exclusão não permitida.' });
    await prisma.user.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir caixa' });
  }
});
// Perfil
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json({ id: user.id, name: user.name, login: user.login, role: user.role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao carregar perfil' });
  }
});

export default router;