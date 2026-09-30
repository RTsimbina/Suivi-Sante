<!-- Titre suggéré : type(scope): description — ex. fix(prestataires): … -->

## Description

<!-- Que fait cette pull request et pourquoi ? Lien vers l'issue concernée : Fixes #… -->

## Type de changement

- [ ] `feat` — nouvelle fonctionnalité
- [ ] `fix` — correction de bug
- [ ] `docs` — documentation seule
- [ ] `refactor` — réorganisation sans changement de comportement
- [ ] `test` — tests uniquement
- [ ] `chore` — CI, dépendances, tooling

## Base de données

- [ ] Aucun changement de `prisma/schema.prisma`
- [ ] Migration incluse et **autosuffisante** (rejouable : `IF NOT EXISTS`, gardes `DO $$ … $$`)
- [ ] Migration appliquée en production **avant** ce déploiement (workflow « Migration base de données »)
- [ ] Commit marqué `[skip deploy]` si le déploiement doit être différé

## Checklist

- [ ] `npm run test` : 0 échec
- [ ] `npx tsc --noEmit` : 0 erreur
- [ ] Nouveaux tests couvrant la fonctionnalité ou le correctif
- [ ] Isolation multi-sociétés respectée sur les routes API touchées
- [ ] Actions sensibles journalisées dans l'audit (création / modification / suppression)
- [ ] Aucun secret ni variable d'environnement commité
- [ ] Documentation à jour (README, `docs/*`) si le comportement documenté change

## Notes de relecture

<!-- Points d'attention, captures d'écran, décisions discutées… -->
