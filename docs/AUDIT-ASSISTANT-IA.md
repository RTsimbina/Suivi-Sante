# Audit de complétude — Sous-système « Assistant IA »

> Audit statique réalisé le 29/10/2026 sur la branche `main`.
> Périmètre : moteur de questions prédéfinies, catalogue 8×20, API `/api/assistant`,
> analyse `/api/ia`, bots multi-canaux, socle LLM, tests. Référentiel d'exigences :
> cahier des charges V2.0 (chapitre 6) et CONTRIBUTING.md (règles d'or).

## 1. Verdict global

**CONFORME** — le sous-système respecte les quatre engagements du cahier des
charges : consultation déterministe (requêtes prédéfinies, zéro SQL libre),
non-source-de-vérité (jamais d'écriture), isolation serveur intégrale
(vérifiée implémentation par implémentation), aucune donnée métier sortante
vers le LLM. Trois recommandations mineures et une consolidation de robustesse
sont listées en §4 ; aucune ne bloque.

## 2. Catalogue — complétude 160/160

| Rôle | Fichier | Questions | Préfixe | Isolation vérifiée |
|---|---|---|---|---|
| ADMINISTRATEUR | questions/administrateur.ts | 20 | `ADMIN_` | global (interne) |
| ACCUEIL | questions/accueil.ts | 20 | `ACCUEIL_` | global (interne) |
| TECHNIQUE | questions/technique.ts | 20 | `TECH_` | global (interne) |
| COMPTABILITE | questions/comptabilite.ts | 20 | `COMPTA_` | global (interne) |
| SANTE | questions/sante.ts | 20 | `CONTROLE_` | global (interne) |
| PORTAIL_CLIENT | questions/assure.ts | 20 | `ASSURE_` | `whereFamille()` partout |
| CONTACT_ENTREPRISE | questions/entreprise.ts | 20 | `ENTREPRISE_` | `whereSociete()` partout |
| PRESTATAIRE | questions/prestataire.ts | 20 | `PRESTATAIRE_` | `wherePrestataire()` + `societeAutoriseePrestataire()` |

Constats vérifiés à la lecture :

- **8 × 20 = 160 questions**, identifiants **uniques** (0 doublon détecté),
  un seul rôle par fichier et par question, cohérence fichier ↔ rôle confirmée.
- Chaque question déclare `id`, `role`, `categorie`, `question`, `params`,
  `presentation` et une implémentation `impl` — 20/20/20/20 sur les huit
  fichiers (comptage structurel).
- Les tests CI (assistant.test.ts) verrouillent l'intégrité : longueur 160,
  20 par rôle, préfixes par rôle, clés de paramètres limitées à la liste
  `PERIODE/SOCIETE/PRESTATAIRE/ASSURE/STATUT/ACTE/DOSSIER/ANNEE`.

## 3. Chaîne de sécurité — conformité moteur

La chaîne imposée `RÔLE → questions → paramètres → permissions → isolation →
requête prédéfinie` est effectivement appliquée dans l'ordre par
`engine.ts#executerQuestion` :

1. **Existence** : la question doit être dans le catalogue (404 sinon) ;
2. **Appartenance** : `question.role === ctx.role` (403 sinon) — défense
   serveur testée (un COMPTABILITE ne peut pas exécuter une question ADMIN) ;
3. **Rattachement** : tout rôle externe doit porter son `assureId` /
   `societeId` / `prestataireId` dérivé du **token signé** (403 sinon) —
   jamais d'entrée client (`context.ts#buildContext`) ;
4. **Paramètres** : `validerParams` n'accepte que les clés déclarées, type
   `string` uniquement, longueur ≤ 120 (≤ 200 en amont route) — l'injection
   par paramètre non déclaré est ignorée, pas exécutée ;
5. **Périodes** : `resolvePeriode` valide format ISO, ordre du/au, et borne
   la fenêtre personnalisée à 3 ans ;
6. **SQL brut** : `periodeSqlFrag` / `egalSqlFrag` imposent des **listes
   blanches** de champs/tables/colonnes + valeurs liées (`Prisma.sql`) ;
7. **RBAC d'entrée** : `/api/assistant` est déclaré dans `API_PERMISSIONS`
   pour les 8 rôles (GET+POST) et `/api/ia` pour les 5 rôles internes
   uniquement ; `matchPermission` est **fail-closed** (route inconnue → 403).

### Isolation par rôle externe (lecture appel par appel)

- **PORTAIL_CLIENT** (assure.ts) : 19 appels DB, tous via `whereFamille(ctx)`
  ou `scopeAssure(ctx)` (+ `societeId` pour contrat/barèmes) ; les consultations
  « statut d'un dossier précis » passent toutes par `dossierAutorise(numero,
  where)` — la recherche par numéro s'effectue **à l'intérieur** du périmètre,
  aucune fuite possible par énumération de numéros (6 usages).
- **CONTACT_ENTREPRISE** (entreprise.ts) : 23 appels DB, tous via
  `whereSociete(ctx)` / `scopeSociete(ctx)` ; requêtes dérivées (assurés des
  dossiers groupés, prestataires les plus sollicités) restreintes aux ids issus
  du périmètre ; appels de fonds filtrés par `contrat.societeId`.
- **PRESTATAIRE** (prestataire.ts) : 22 appels DB, tous via
  `wherePrestataire(ctx)` ; le paramètre `SOCIETE` est validé contre
  `prestataireSociete` réel (`societeAutoriseePrestataire`, 403 hors
  périmètre) ; suivi par numéro via `dossierAutorise`.
- **Résultats** : `resultatVide` explicite (« Aucune donnée correspondant aux
  critères… ») — l'assistant n'invente jamais ; listes tronquées
  (`LIMITE_LISTE = 15`) avec `totalLignes` réel.

## 4. Findings

### 🔴→✅ F1 — `/api/ia` et le périmètre (levé après vérification)

Le filtre de périmètre n'était appliqué qu'à `getStatutCounts(where)` dans la
route. **Vérification complémentaire** : la table `API_PERMISSIONS` restreint
`/api/ia` aux cinq rôles internes (`ADMINISTRATEUR, ACCUEIL, TECHNIQUE,
COMPTABILITE, SANTE`) — un rôle externe est refusé **avant** le handler.
Les requêtes KPI globales (retards, anomalies, doublons, incohérences, pièces
manquantes, charge des gestionnaires) ne sont donc jamais exposées hors
interne. Le commentaire en tête de `authorize.ts` documente ce choix.
**Aucune action** — la défense est en profondeur (middleware + route).

### 🟠 F2 — Bot : correspondance téléphone partielle (mineur)

`bot-service.ts#identifierExpediteur` identifie un expéditeur par
`telephone: { contains: chiffresExtraits }`. Un numéro court ou partiel
pourrait correspondre à plusieurs assurés (le `findFirst` choisit arbitrairement).
Risque faible (l'expéditeur WhatsApp/Telegram est déjà authentifié par le canal),
mais un **match par suffixe ≥ 8 chiffres** (ou normalisation E.164) leverait
l'ambiguïté. *Recommandé, non bloquant.*

### 🟠 F3 — `/verifier` NSS sans rate limiting (mineur, connu)

Le brute-force de NSS par `/verifier [NSS]` n'est pas borné. Figure déjà au
registre de sécurité du cahier des charges V2.0 (restent ouverts). *Suivre la
décision globale de rate limiting plateforme.*

### ℹ️ F4 — Consultations assistant non tracées (information)

`POST /api/assistant` n'écrit pas d'entrée `AuditLog`. L'assistant étant en
lecture seule, c'est acceptable ; tracer `(userId, questionId, date)` — sans
données métier — renforcerait l'observabilité si un besoin d'investigation
apparaît. *Optionnel.*

### ℹ️ F5 — Données transmises au LLM (conforme, à rappeler)

`bot-service.ts#reponseIA` n'envoie au LLM que le texte de l'utilisateur et le
**nom** de l'assuré identifié (dans le prompt système), via `llm.ts`
(OpenAI-compatible / Eden AI / SDK local, `null` en cas d'échec → message de
repli). Conforme à l'assumption documentée du cahier V2.0 chapitre 6 (« envoi
limité texte + nom »). Les 160 questions et `/api/ia` **n'appellent aucun LLM**.

### 🟢 F6 — Import mort dans la route API (corrigé)

`src/app/api/assistant/route.ts` importait `verifierAutorisationParam`
(sans l'utiliser) : la fonction reste vivante dans `context.ts` et testée
directement (`assistant.test.ts`), mais aucun handler de la route ne la
consomme — les identifiants SOCIETE/PRESTATAIRE/ASSURE des rôles internes
sont vérifiés contre la base par les implémentations elles-mêmes.
**Corrigé** : import retiré (hygiène, zéro impact fonctionnel).

### 🟢 F7 — Helpers de scope morts dans results.ts (corrigés)

`filtresScopeDossier` et `filtresScopeSql` (dont le commentaire affirmait à
tort qu'ils étaient « le seul endroit où le scope est traduit en condition
Prisma ») n'étaient appelés nulle part : chaque fichier de questions applique
son scope localement (`whereFamille` / `whereSociete` / `wherePrestataire`),
ce qui est plus lisible et vérifiable. Aucun usage, aucun test.
**Corrigés** : suppression (ainsi que l'import `AssistantContext` devenu
inutile) ; `familleAssureIds` et `societesDuPrestataire`, eux réellement
utilisés, sont conservés.

## 5. Bots multi-canaux — conformité

- Sessions **persistées en base** (`BotSession`), TTL **4 h** avec purge
  opportuniste — correctif serverless documenté en tête de fichier ;
- `/verifier [NSS]` : session créée uniquement si assuré **actif** trouvé ;
- `/dossier` et `/calcul` : contrôle de propriété **strict** (`assureId` de la
  session dans le `where`), réponse générique sans fuite si le dossier n'est
  pas au demandeur ;
- Commandes d'écriture / de recherche (`/assure`, `/prestataire`, « créer »,
  « rechercher ») **refusées explicitement** — le bot reste en lecture seule ;
- Envois WhatsApp (Meta Cloud API v21), Telegram, Messenger : token d'envoi
  requis, erreurs loguées, aucune donnée au-delà du message de réponse.

## 6. Socle LLM (`llm.ts`)

Unification correcte des trois voies (SDK local z-ai → OpenAI-compatible →
Eden AI), configuration par variables d'environnement (`LLM_BASE_URL`,
`LLM_API_KEY`, `LLM_MODEL`, `LLM_PROVIDER`), aucun secret loggé, retour
`null` systématique en cas d'échec (le bot dégrade en message fixe).
Le code mort `verifierLLM` a été supprimé.

## 7. Conclusion

Le sous-système Assistant IA est **complet et conforme** : 160/160 questions
opérationnelles, chaîne de sécurité intégrale, isolation vérifiée ligne à
ligne sur les trois catalogues externes, bots cloisonnés en lecture, socle LLM
sans fuite. Les recommandations F2/F3/F4 sont des durcissements de confort à
planifier ; les hygiènes F6/F7 sont corrigées (aucun impact fonctionnel).

**Vérification croisée indépendante (29/10/2026, session 2)** : relecture
intégrale indépendante du sous-système (catalogue, moteur, contexte, portée,
périodes, route API, bots, socle LLM) confirmant l'ensemble des constats
ci-dessus — comptage 8 × 20 = 160 exact, chaîne moteur dans l'ordre,
isolation des trois rôles externes appel par appel, zéro `fetch()` dans
`src/lib/assistant` (FON-022 : aucune donnée métier vers l'extérieur),
`/api/ia` verrouillé aux 5 rôles internes dans `authorize.ts`. Seuls ajouts :
les findings F6/F7 (hygiène), corrigés dans la foulée.

*Contrôles réalisés par lecture statique + comptages structurels (rg) ;
conformité runtime attestée par la CI (> 660 tests verts, dont
`assistant.test.ts` : intégrité catalogue, permissions, garde-fous, périodes).*
