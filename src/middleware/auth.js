import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { prisma } from '../utils/prisma.js';

dotenv.config();

export function authenticate(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: 'Token não fornecido' });
  const [type, token] = header.split(' ');
  if (type !== 'Bearer' || !token) return res.status(401).json({ error: 'Formato de token inválido' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

export function requireRole(role) {
  return async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
      if (req.user.role !== role) {
        return res.status(403).json({ error: 'Acesso negado' });
      }
      next();
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Erro de autorização' });
    }
  };
}

export async function attachUser(req, res, next) {
  if (!req.user?.userId) return next();
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    req.userEntity = user;
  } catch (e) {
    console.error('Erro ao carregar usuário:', e);
  }
  next();
}