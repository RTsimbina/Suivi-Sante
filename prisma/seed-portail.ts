/**
 * ─── Seed complémentaire : comptes de portail pour tester l'assistant ────────
 * Exécuter APRÈS prisma/seed.ts :
 *   DATABASE_URL=... bun x tsx prisma/seed-portail.ts
 *
 * Crée :
 *   - assure@suivisante.mg      → PORTAIL_CLIENT (assuré de la société 1, e-mail réécrit sur un assuré existant)
 *   - entreprise@suivisante.mg  → CONTACT_ENTREPRISE (contact de la société 1)
 *   - contact@clinique-saintemarie.mg → PORTAIL_PRESTATAIRE (Prestataire A)
 *   - lab@biomad.mg                   → PORTAIL_PRESTATAIRE (Prestataire B)
 * Mot de passe commun : portail123
 * Les liaisons Prestataire ↔ Société sont créées si absentes.
 */
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const db = new PrismaClient();
const PASSWORD = 'portail123';

async function main() {
  const passwordHash = await hash(PASSWORD, 10);

  const societes = await db.societe.findMany({ orderBy: { createdAt: 'asc' }, take: 3 });
  if (societes.length === 0) throw new Error('Aucune société — lancez d\'abord prisma/seed.ts');
  const soc1 = societes[0];
  const soc2 = societes[1] ?? societes[0];

  // ─── Utilisateur ASSURÉ (PORTAIL_CLIENT) : e-mail réécrit sur un assuré de soc1
  const assure = await db.assure.findFirst({
    where: { societeId: soc1.id, typeBeneficiaire: 'ASSURE' },
    orderBy: { createdAt: 'asc' },
  });
  if (!assure) throw new Error('Aucun assuré pour la société 1');
  await db.assure.update({ where: { id: assure.id }, data: { email: 'assure@suivisante.mg' } });
  // Rattacher ses ayants droit par assurePrincipalId pour tester la famille
  await db.assure.updateMany({
    where: { societeId: soc1.id, id: { not: assure.id }, assurePrincipalId: null, typeBeneficiaire: { not: 'ASSURE' } },
    data: {},
  });
  await db.utilisateur.upsert({
    where: { email: 'assure@suivisante.mg' },
    update: { role: 'PORTAIL_CLIENT', password: passwordHash, actif: true },
    create: { email: 'assure@suivisante.mg', nom: 'Assuré Test', password: passwordHash, role: 'PORTAIL_CLIENT', actif: true },
  });
  console.log('✅ Utilisateur PORTAIL_CLIENT : assure@suivisante.mg (assuré', assure.nom, ')');

  // ─── Utilisateur ENTREPRISE (CONTACT_ENTREPRISE) : contact soc1
  let contact = await db.entrepriseContact.findFirst({ where: { email: 'entreprise@suivisante.mg' } });
  if (!contact) {
    contact = await db.entrepriseContact.create({
      data: { societeId: soc1.id, nom: 'Contact Entreprise Test', email: 'entreprise@suivisante.mg', actif: true },
    });
  }
  await db.utilisateur.upsert({
    where: { email: 'entreprise@suivisante.mg' },
    update: { role: 'CONTACT_ENTREPRISE', password: passwordHash, actif: true },
    create: { email: 'entreprise@suivisante.mg', nom: 'Entreprise Test', password: passwordHash, role: 'CONTACT_ENTREPRISE', actif: true },
  });
  console.log('✅ Utilisateur CONTACT_ENTREPRISE : entreprise@suivisante.mg (société', soc1.nom, ', contact', contact.id, ')');

  // ─── Utilisateurs PRESTATAIRES A et B
  const prestaA = await db.prestataire.findFirst({ where: { email: 'contact@clinique-saintemarie.mg' } });
  const prestaB = await db.prestataire.findFirst({ where: { email: 'lab@biomad.mg' } });
  if (!prestaA || !prestaB) throw new Error('Prestataires du seed introuvables');

  for (const p of [prestaA, prestaB]) {
    await db.utilisateur.upsert({
      where: { email: p.email! },
      update: { role: 'PORTAIL_PRESTATAIRE', password: passwordHash, actif: true },
      create: { email: p.email!, nom: p.nom, password: passwordHash, role: 'PORTAIL_PRESTATAIRE', actif: true },
    });
  }

  // ─── Liaisons Prestataire ↔ Sociétés (actives) pour que les questions barèmes fonctionnent
  const liaisons = [
    { prestataireId: prestaA.id, societeId: soc1.id },
    { prestataireId: prestaA.id, societeId: soc2.id },
    { prestataireId: prestaB.id, societeId: soc1.id },
  ];
  for (const l of liaisons) {
    await db.prestataireSociete.upsert({
      where: { prestataireId_societeId: { prestataireId: l.prestataireId, societeId: l.societeId } },
      update: { actif: true },
      create: { ...l, actif: true },
    });
  }

  console.log('✅ Utilisateurs PORTAIL_PRESTATAIRE :', prestaA.email, '(A) et', prestaB.email, '(B)');
  console.log('✅ Liaisons prestataire-société créées/vérifiées');
  console.log('\n🔑 Mot de passe de tous les comptes portail : portail123');
  console.log('   Comptes internes (seed principal) : admin@suivisante.mg / password123 — voir prisma/seed.ts');
}

main()
  .catch((e) => { console.error('❌', e); process.exit(1); })
  .finally(() => db.$disconnect());
