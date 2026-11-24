/** Vérifie le contenu de la base de recette locale (comptes créés par le seed). */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const nb = await db.utilisateur.count();
console.log('NB_UTILISATEURS =', nb);
const users = await db.utilisateur.findMany({
  select: { email: true, nom: true, role: true, actif: true },
  orderBy: { email: 'asc' },
});
for (const u of users) console.log(`- ${u.email} | ${u.role} | actif=${u.actif}`);
const societes = await db.societe.count();
const dossiers = await db.dossier.count();
const baremes = await db.bareme.count();
console.log(`SOCietes=${societes} DOSSIERS=${dossiers} BAREMES=${baremes}`);

await db.$disconnect();
