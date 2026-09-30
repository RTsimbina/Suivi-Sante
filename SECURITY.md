# Politique de sécurité

## Versions prises en charge

Seule la branche `main` (déployée en production sur Vercel) reçoit les
correctifs de sécurité. Les tags et commits antérieurs ne sont pas pris en
charge : mettez d'abord à jour votre copie locale.

| Branche / version | Prise en charge |
| --- | --- |
| `main` (production Vercel) | Correctifs de sécurité appliqués en priorité |
| Tags et commits antérieurs | Non pris en charge |

## Signaler une vulnérabilité

**N'ouvrez jamais d'issue publique pour signaler une vulnérabilité.**

Voie privilégiée — signalement privé GitHub :

1. Ouvrez l'onglet **Security** du dépôt ;
2. Cliquez sur **Report a vulnerability** (signalement privé) ;
3. Décrivez la vulnérabilité en suivant la liste ci-dessous.

À défaut, contactez le mainteneur [@RTsimbina](https://github.com/RTsimbina)
par message direct sur GitHub.

Merci d'inclure, lorsque c'est possible :

- une description claire de la vulnérabilité et de son impact potentiel ;
- les composants concernés (route API, page, composant, workflow, script) ;
- les étapes de reproduction ou un scénario de preuve de concept minimal ;
- le rôle / niveau de privilège nécessaire pour exploiter le problème ;
- une suggestion de correctif, si vous en avez une.

## Notre engagement

- **Accusé de réception** : sous 72 heures ;
- **Évaluation** : gravité estimée (avec reproduction contrôlée) sous 7 jours ;
- **Correctif** : publié sur `main` puis déployé, avec priorité selon la
  gravité (une vulnérabilité critique visant les données de santé ou
  l'isolation multi-sociétés est traitée en urgence) ;
- **Transparence** : le rapporteur est informé de l'avancement ; crédit
  attribué dans le correctif si le rapporteur le souhaite ;
- **Publication coordonnée** : la divulgation publique n'intervient qu'une
  fois le correctif déployé, en accord avec le rapporteur.

## Périmètre

Dans le périmètre :

- l'application Next.js (routes API, pages, portails client et prestataire) ;
- l'isolation multi-sociétés et le contrôle d'accès par rôle
  (`src/lib/authorize.ts`, `src/lib/data-isolation.ts`) ;
- le service de messagerie (`src/lib/mail/*`) et ses points d'entrée machine ;
- les workflows GitHub Actions (healthcheck, mail-process, migrate, seed, ci) ;
- les scripts d'exploitation (`scripts/*`).

Hors périmètre :

- les tests de déni de service, le spam ou la surcharge volontaire des
  services (Vercel, Neon, relais SMTP) ;
- l'ingénierie sociale des utilisateurs ou des hébergeurs ;
- les tests réalisés sur des données réelles de production ;
- toute action modifiant ou détruisant des données.

## Règles projet liées à la sécurité

- Aucun secret (`DATABASE_URL`, `CRON_SECRET`, `MAIL_API_KEY`,
  `VERCEL_PROTECTION_BYPASS`, jetons d'accès…) ne doit être commité, ni en
  clair, ni dans les tests, ni dans les journaux ;
- En cas de fuite suspectée : rotation immédiate des credentials concernés
  (Neon, Vercel, GitHub) et synchronisation des secrets GitHub ↔ Vercel ;
- La structure de la base de production ne doit jamais être modifiée hors
  migrations Prisma appliquées de façon contrôlée (`prisma migrate deploy`) ;
- La table d'audit est immuable par conception (déclencheur de base
  interdisant `UPDATE` / `DELETE`) — ne pas chercher à contourner ce
  mécanisme ;
- Le protocole d'exploitation (healthcheck, file d'attente de courriels)
  utilise des en-têtes de protection dédiés ; ne publiez jamais la valeur de
  `VERCEL_PROTECTION_BYPASS`.
