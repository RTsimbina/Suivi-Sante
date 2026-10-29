# Portail Prestataire — architecture & consolidations

> Espace externe des prestataires de soins : périmètre, chaîne de confiance,
> les 5 API du portail, les consolidations apportées au module et les
> scénarios de validation associés à la suite de tests d'isolation.

---

## 1. Rôle et périmètre

Le rôle externe `PRESTATAIRE` (8 rôles — 5 internes, 3 externes) dispose
d'un espace dédié `/portail-prestataire` avec six onglets : **Tableau de
bord**, **Barèmes**, **Actes médicaux**, **Assurés**, **Factures /
Règlements** et **Assistant IA**. Le principe directeur est la réutilisation
stricte des modèles existants — aucun modèle parallèle :

| Concept portail | Modèle plateforme |
|---|---|
| Acte médical | `Dossier` (prestataireId renseigné) — vue médicale |
| Facture | `Dossier` de catégorie `REGLEMENT_PRESTATAIRE` (règlement direct) |
| Société cliente | Convention `PrestataireSociete` (convention active / inactive) |
| Barème applicable | `Bareme { societeId, prestation, active }` — même résolution que `plafond-check.ts` |
| Statut de facture | DÉRIVÉ du workflow du dossier (jamais stocké) : `REJETE → REJETEE`, `PAYE (ou payé ≥ dû) → REGLEE`, `0 < payé < dû → PARTIELLEMENT_REGLEE`, `VALIDE / EN_COMPTABILITE / EN_PAIEMENT → VALIDEE`, `EN_ANALYSE → EN_TRAITEMENT`, `RECU → SOUMISE` |

Les dossiers `REMBOURSEMENT_ASSURE` sont réglés à l'assuré — ils apparaissent
en vue Actes mais jamais dans la vue financière du prestataire.

## 2. Chaîne de confiance (isolation serveur)

La résolution d'identité vit dans `src/lib/portail-prestataire-server.ts`
(`resoudreIdentitePortailPrestataire`) et s'applique aux 5 routes
`/api/portail-prestataire*` :

1. **JWT signé** — le rôle et le `prestataireId` (résolu AU LOGIN par
   e-mail) y sont portés 8 h ;
2. **Re-résolution par e-mail** — si le token ne porte pas la liaison
   (session ouverte avant création/correction de la fiche) ou pointe vers
   une fiche supprimée, la résolution repart de l'e-mail authentifié du
   token — jamais d'une entrée navigateur ;
3. **Anti-manipulation** — un `?prestataireId=` fourni par le navigateur qui
   ne correspond PAS à l'identité serveur est rejeté (403) AVANT tout accès
   base, sans révéler d'information sur la cible ;
4. **Fail-closed** — sans liaison vérifiable, 403 actionnable (jamais de
   service de données vides silencieuses) ;
5. **RBAC central** — `API_PERMISSIONS` (default-deny) n'admet que
   `PRESTATAIRE` et `ADMINISTRATEUR` sur le portail ; `ADMINISTRATEUR` obtient
   le mode démonstration (aucune donnée prestataire) ; tout autre rôle interne
   est refusé deux fois (proxy + re-vérification serveur).

Les filtres navigateur (`societeId`, `assureId`, `typeActe`, `statut`,
`search`, période) ne peuvent que **restreindre** le périmètre — jamais
l'élargir : un `societeId` étranger aboutit à une liste vide, pas aux données
d'autrui.

## 3. Les 5 API du portail

| Route | Contenu | Points clés |
|---|---|---|
| `GET /api/portail-prestataire` | Profil, sociétés clientes, KPI période, derniers actes | KPI factures par **agrégat SQL unique** (paramétré, périmètre lié), compteurs dérivés exactement de `deriveStatutFacture` |
| `GET /api/portail-prestataire/actes` | Actes paginés (filtres restrictifs) | Pagination serveur bornée (1–50), libellés français |
| `GET /api/portail-prestataire/factures` | Factures `REGLEMENT_PRESTATAIRE` paginées + totaux | **Tout en SQL** (consolidation C1, cf. §4) |
| `GET /api/portail-prestataire/baremes` | Barèmes par société cliente et prestation parente | Conventions inactives marquées (actes refusés par le plateau) |
| `GET /api/portail-prestataire/assures` | `scope=clients` (convention ACTIVE, données minimales, NSS masqué) ou `scope=mes-actes` | Intersection sociétés — un id étranger ne renvoie rien ; NSS jamais servi en clair |

## 4. Consolidations

### C1 — Exactitude de la liste factures au-delà de 2 000 lignes

**Avant** : la route factures chargeait `take: 2000` dossiers puis dérivait
statut, filtre, pagination et totaux **en mémoire**. Au-delà de 2 000
factures de règlement : les factures 2001+ étaient invisibles (pagination
circulant dans l'ensemble tronqué) et les totaux (`montantFacture`,
`montantRegule`, `solde`) étaient calculés sur l'ensemble tronqué — même
classe de défaut que celle corrigée sur les KPI du tableau de bord.

**Après** : toute la dérivation vit en base. Une CTE `base` (périmètre +
filtres navigateur, `du = COALESCE(montantValide, montantReclame, 0)`)
alimente une CTE `derivees` dont le `CASE` SQL reproduit **exactement** la
précédence de `deriveStatutFacture` (`REJETEE` préempte tout, puis
`PARTIELLEMENT_REGLEE`, puis `REGLEE`, puis les statuts de workflow) et
calcule le solde (`0` si rejetée, sinon `GREATEST(du − payé, 0)`). Deux
requêtes paramétrées :

- **page** : `SELECT … COUNT(*) OVER() AS total … ORDER BY dateReception
  DESC, id DESC OFFSET/LIMIT` (pagination et total EN BASE, décalage borné) ;
- **totaux** : `SUM(montantReclame) / SUM(montantPaye) / SUM(solde)` sur
  l'ensemble filtré (précision `Decimal` conservée côté base).

Le filtre `statutFacture` (liste blanche `STATUTS_FACTURE`) est appliqué en
base aux deux requêtes — une valeur non déclarée est ignorée, jamais
interpolée. La forme de réponse est inchangée (aucun impact frontend).

### C2 — Garde d'ambiguïté de la liaison e-mail (miroir SPEC-6 sociétés)

**Avant** : l'unicité de l'e-mail sur les fiches Prestataire est la règle par
défaut (détection de doublons → 409, cf. `prestataire-doublons.ts`), mais une
**exception de doublon** validée par un administrateur (groupe
d'établissements partageant l'e-mail de facturation) rendait la liaison
portail **silencieusement imprévisible** : `resoudreLiaisonPrestataire`
prenait la fiche la plus ancienne (`findFirst`) sans trace ni garde — au
login comme au portail, les données servies pouvaient être celles d'une fiche
inattendue.

**Après** — la résolution contrôlée
(`resoudreLiaisonPrestataireAvecControle`, `src/lib/liaison-prestataire.ts`)
expose trois statuts :

| Statut | Signification | Effet sur les appelants |
|---|---|---|
| `AUCUNE` | aucune fiche ne porte l'e-mail | login : pas de liaison ; portail : 403 actionnable |
| `OK` | résolution déterministe | comportement normal |
| `AMBIGU` (≥ 2 fiches) | liaison imprévisible | **portail : 403 fail-closed** ; **création/modification de compte : 409** ; login : aucune liaison dans le token + trace serveur |

Toute ambiguïté est tracée côté serveur (`console.error` actionnable :
corriger les fiches dans GESTION → Prestataires, e-mail distinct par
établissement) — sans jamais révéler d'identité de fiche à l'utilisateur.
La garde est appliquée aux quatre points d'entrée de la liaison :

1. **Login** (`src/lib/auth.ts`) — pas de `prestataireId` dans le token si
   l'e-mail est ambigu ;
2. **Portail** (`portail-prestataire-server.ts`) — re-résolution refusée
   (403) en cas d'ambiguïté, dans les deux chemins (liaison absente du token,
   id périmé) ;
3. **Création de compte** (`POST /api/utilisateurs`) — 409 actionnable ;
4. **Modification de compte** (`PUT /api/utilisateurs`) — 409 si l'e-mail
   final ou la bascule de rôle crée une ambiguïté.

Le comportement historique (`resoudreLiaisonPrestataire`, retour `null` en
cas d'ambiguïté) est préservé pour les appelants non critiques et reste
testé.

## 5. Scénarios de validation ↔ tests

Tous les scénarios sont exécutés par
`src/app/api/portail-prestataire/isolation.test.ts` (handlers appelés
directement, JWT simulé — comme un attaquant qui forgerait ses appels API),
`src/lib/liaison-prestataire.test.ts` et
`src/app/api/utilisateurs/route.test.ts` :

| # | Scénario | Vérification |
|---|---|---|
| S1 | Accès direct sans session | 401 sur toutes les routes du portail |
| S2 | Rôle interne (ACCUEIL, TECHNIQUE…) | 403 (défense en profondeur) + RBAC default-deny |
| S3 | Administrateur | mode démonstration : aucune donnée prestataire |
| S4 | Prestataire A → périmètre A | toutes les lectures DB (findMany / count / groupBy / `$queryRaw`) contraintes par `prestataireId = A` en paramètre lié |
| S5 | A manipule `?prestataireId=B` | 403, **aucune requête base**, rien sur B dans la réponse |
| S6 | Compte sans fiche (e-mail orphelin) | 403 actionnable (fail-closed) |
| S7 | Id périmé / liaison absente du token | re-résolution par e-mail (auto-réparation) ou 403 |
| S8 | E-mail partagé par plusieurs fiches | 403 portail (aucune donnée), 409 création de compte, login sans liaison — trace serveur |
| S9 | Filtres navigateur | intersection uniquement : `societeId` étranger → liste vide ; statut dérivé invalide → filtre ignoré ; pagination bornée |
| S10 | Données minimales assurés | NSS masqué (jamais servi en clair), conventions actives uniquement |
| S11 | Statuts de facture dérivés | précédence SQL identique à `deriveStatutFacture` (tripwire), labels français, totaux base |

## 6. Recommandations (hors périmètre de cette consolidation)

- **Fiche-level** : lors d'une création/modification de fiche Prestataire
  avec un e-mail déjà porté par une autre fiche ET utilisé par un compte
  `PRESTATAIRE` existant, signaler l'impact portail dans le message de
  doublon (aujourd'hui la garde joue à la création de compte et au portail,
  pas à la fiche).
- **Volume** : si les dossiers de règlement dépassent régulièrement quelques
  milliers de lignes, ajouter un index composite
  `(prestataireId, categorieDossier, dateReception)` pour les requêtes
  factures/KPI.
- **Export** : un export CSV des factures du périmètre (côté serveur, mêmes
  contraintes) est la demande la plus probable du métier.
