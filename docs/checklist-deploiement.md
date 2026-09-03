# Checklist de tests avant mise en production — Suivi Santé

> À exécuter **après chaque déploiement** (recette puis production) et après toute migration.
> Cochez chaque point ; toute case décochée = déploiement à ne pas considérer comme validé.

## 1. Authentification et accès

- [ ] **Connexion** avec un compte valide (chaque rôle concerné) → accès à l'application
- [ ] **Connexion refusée** avec mot de passe incorrect → message d'erreur, pas d'accès
- [ ] **Limitation de connexion** : 5 échecs sur un même compte → compteur d'échecs atomique, blocage temporaire (verrouillage) puis déblocage après la fenêtre
- [ ] **Changement de mot de passe** (menu profil) → ancien requis, nouveau ≥ 8 caractères avec lettres et chiffres, reconnexion nécessaire
- [ ] **Mot de passe oublié / réinitialisation** → flux complet fonctionnel
- [ ] **Déconnexion** → retour à l'écran de connexion, session invalide (bouton retour = refusé)
- [ ] **Rôles** : un compte non-administrateur n'accède pas aux écrans d'administration (utilisateurs, technique, configuration) — ni par l'interface, ni par appel direct aux API (réponse 401/403)

## 2. Données (CRUD et consultation)

Pour chaque entité principale — sociétés, assurés/bénéficiaires, prestataires, dossiers, contrats, courriels :

- [ ] **Création** d'un enregistrement complet → enregistré et affiché dans la liste
- [ ] **Rejet des données invalides** : champs requis vides, `typeBeneficiaire` inconnu, statut inconnu → erreur 400 explicite (validation Zod), rien n'est enregistré
- [ ] **Modification** (y compris via les PATCH de l'application) → champs modifiés correctement, champs inconnus rejetés
- [ ] **Suppression** → confirmation demandée, suppression effective ; suppression d'une société avec assurés/dossiers existants → refusée proprement
- [ ] **Recherche** par nom/référence → résultats pertinents
- [ ] **Filtres** (statut, société, dates) → résultats conformes
- [ ] **Isolation multi-sociétés** : les données d'une société ne sont jamais visibles depuis le contexte d'une autre

## 3. Finance (montants, plafonds, budgets)

- [ ] **Plafonds** : création/modification d'un plafond → valeur > 0 obligatoire ; saisie de 0, négatif, texte → refusée
- [ ] **Montants négatifs refusés partout** : appels de fonds, remboursements, dossiers → erreur 400, aucun impact sur les budgets (correction Zod)
- [ ] **Montants non numériques refusés** ("abc", null, objet) → erreur 400, pas d'erreur serveur 500
- [ ] **Appels de fonds** : création → montant déduit du budget correctement (une seule source de vérité) ; modification → recalcul cohérent
- [ ] **Remboursements** : montant, coefficient de barème (0–1), taux de couverture (0–100) validés ; calcul du reste à charge correct
- [ ] **Budgets** : budgetUtilise cohérent après création/modification/suppression d'appels de fonds
- [ ] **Barèmes** : calcul d'un acte (module santé/simuler) → montants conformes au barème en vigueur

## 4. Imports (Excel/ISA)

- [ ] **Fichier valide** : import d'un Excel conforme → récapitulatif correct, données créées, historique d'import enregistré
- [ ] **Fichier incorrect** (format non Excel, PDF renommé) → rejeté avec message clair, rien importé
- [ ] **Fichier vide** (aucune ligne) → traité proprement (avertissement), pas d'erreur 500
- [ ] **Fichier trop volumineux** (> 15 Mo) → refusé avant traitement
- [ ] **Colonnes manquantes** → rejeté avec indication des colonnes attendues
- [ ] **Valeurs incorrectes** (montants négatifs, dates invalides, types inconnus) → lignes rejetées avec rapport d'erreurs ligne à ligne, lignes valides documentées

## 5. Robustesse générale

- [ ] **JSON malformé** envoyé à une API (curl) → 400 « Données invalides », pas de 500
- [ ] **Champs inconnus** dans un POST/PATCH → ignorés ou rejetés, jamais enregistrés
- [ ] **Webhooks** (Telegram/WhatsApp/Messenger) : signature invalide refusée, limitation par IP active
- [ ] **Redémarrage du service** : les compteurs de limitation survivent (stockage Redis/Postgres partagé)
- [ ] **Journal d'audit** : les actions sensibles (suppression utilisateur, modifications paramétrage) sont tracées

## 6. Après une migration de base (en plus des sections ci-dessus)

- [ ] `npm run db:migrate:status` → « Database schema is up to date! »
- [ ] Toutes les énumérations/statuts affichés correctement (aucun libellé brut)
- [ ] Historiques et tables enrichies (audit journal) remplissent leurs champs
- [ ] Aucune donnée perdue : comptages comparés à l'avant-déploiement (sociétés, assurés, dossiers, remboursements, appels de fonds)

---

**En cas d'anomalie bloquante :** stopper l'application, évaluer, et si nécessaire restaurer la
sauvegarde pré-déploiement (`bash scripts/restore-db.sh <fichier>`) puis revenir à la version
applicative précédente.
