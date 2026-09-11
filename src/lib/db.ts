import { PrismaClient } from '@prisma/client'
// Effet de bord voulu : sérialisation JSON des Decimal en number (affichage).
// Les calculs métier restent en Decimal — voir src/lib/money.ts.
import './decimal-serialization'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db