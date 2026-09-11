# Registre du projet IPM

> **Ce que fait ce document.** Il consigne l'objectif de chaque écran, l'état
> réel du code en face, et la direction dans laquelle le projet avance. Il ne
> décrit pas *comment* le code est écrit (voir les en-têtes des fichiers, qui
> sont détaillés) mais *pourquoi* il existe et *ce qu'il lui manque*.
>
> `README.md`, `ARCHITECTURE.md` et `.cursorrules` sont ceux du template CoreUI
> d'origine et ne parlent pas de l'IPM. Ce registre est le premier document
> propre au projet.
>
> **Il est vivant.** Chaque constat porte un statut ; le journal en fin de
> document trace les révisions. À corriger dès qu'une observation le contredit.

**Dernière révision : 8 septembre 2026**

Conventions :

| Marque | Sens |
|---|---|
| ✅ | Fait et vérifié sur le serveur en marche |
| 🟡 | Front écrit, backend absent — fonctionne en `localStorage` |
| ⬜ | Écran d'attente, rien de développé |
| ❓ | Hypothèse de ma part, à confirmer avec le métier |

---

## 1. De quoi il s'agit

L'**IPM** (Institution de Prévoyance Maladie) de la **SAR** (Société Africaine
de Raffinage, Sénégal) est la caisse qui couvre les frais de santé du personnel.
L'application remplace un logiciel de gestion antérieur, dont les écrans servent
de référence — les fichiers de configuration y renvoient régulièrement
(« comme l'application d'origine »).

Le métier tient en une phrase : **des collectivités cotisent, des personnes
consomment des soins, la caisse rembourse des prestataires conventionnés, et
tout cela doit tomber en écritures comptables.**

## 2. Vocabulaire — à ne pas confondre

Quatre termes se ressemblent et désignent des choses différentes. C'est la
première source de malentendu sur ce projet.

| Terme | Ce que c'est | Où |
|---|---|---|
| **Adhérent** | La **collectivité** qui cotise — une catégorie de personnel SAR ou une mutuelle. Ni une personne, ni une entreprise cliente. 4 en base. | `/adherents` |
| **Participant** | Le **salarié** couvert. Plusieurs centaines se rattachent aux 4 adhérents. | `/participants` |
| **Bénéficiaire** | Un **ayant droit** du participant (époux, épouse, enfant, ascendant). | onglet « Familles » |
| **Fournisseur de Soins** | Prestataire **médical** conventionné : clinique, pharmacie, labo, cabinet. | `/fournisseurs-de-soins` |
| **Fournisseur Divers** | Tiers **non médical** : fournitures, énergie, transport. Rien à voir avec le précédent malgré le nom. | Données de base |

Deux régimes cohabitent : **IPM** (cotisation partagée SAR / participant) et
**CMM**, la mutuelle (cotisation unique).

## 3. Où l'on va

La trajectoire, lisible dans le code et ses commentaires :

1. **Tout passe par l'API Django.** La migration `localStorage` → API est
   explicitement en cours (`services/referentiels.js`, table `ENDPOINTS_API`).
   Aujourd'hui 9 référentiels sur 13 y sont. Le reste suit.
2. **Données de base devient la source unique du vocabulaire.** Chaque liste
   déroulante du site doit se lire dans un référentiel, jamais en dur.
3. **Le comptable rejoint le médical.** Chaque référentiel porte un compte ;
   les sections *Traitements* et *Comptabilité*, aujourd'hui vides, sont
   destinées à consommer ces règles pour produire des écritures.
4. **L'authentification devient réelle** avant toute donnée de santé réelle.

### L'idée directrice

**Données de base n'est pas un écran de paramètres, c'est le schéma de
l'application exprimé en données.** Une fois le vocabulaire posé — structure,
types, spécialités, comptes — un participant, un fournisseur ou un bon ne sont
que des combinaisons de ces codes. C'est ce qui permet à un écran comme *Bons de
Pharmacie* de tenir en 35 lignes.

Corollaire opérationnel : **on ne supprime jamais une entrée de référentiel**,
on la désactive (`actif`). Les dossiers déjà saisis continuent de pointer
dessus. `optionsChamp.js` va jusqu'à réafficher un code dont l'option a disparu
plutôt que de le faire s'évanouir de l'écran.

---

## 4. Registre page par page

### Tableau de bord — `/tableau-de-bord` ⬜ *(maquette)*

**Objectif.** Vue de synthèse de la caisse : combien d'adhérents et de
participants, combien on dépense, à quelle vitesse on règle.

**État.** Mise en page et couleurs terminées, **chiffres entièrement fictifs**
(`donnees.js` l'assume : *« Aucune donnée réelle ici »*). KPI : adhérents
actifs, participants couverts, dépenses engagées, délai moyen de règlement —
déclinés sur Mois / Trimestre / Exercice. Synthèse : taux de remboursement,
dossiers traités, ticket modérateur, actes conventionnés.

**Pour y arriver.** C'est le seul écran qui n'attend pas un CRUD mais des
**agrégats**. Il dépend donc des Bons et des Traitements : tant qu'aucun acte
n'est enregistré, il n'y a rien à agréger. ❓ Les indicateurs affichés sont-ils
ceux que la direction veut réellement suivre, ou un choix de maquettage ?

*Sert aussi de page d'accueil : `/` et toute URL inconnue y redirigent.*

---

### Données de base — `/donnees-de-base` ✅

**Objectif.** Le vocabulaire de toute l'application. Conteneur de 8 référentiels
rangés en 5 familles dans un rail vertical.

**État.** **Entièrement servi par Django.** C'est la section de référence : le
patron à recopier pour toutes les migrations suivantes.

| Référentiel | Famille | Rôle | Règle de compte |
|---|---|---|---|
| **Structure** | Organisation | Organigramme SAR : Direction / Département / Service, hiérarchisés par `parent`. Codes `DIR001`, `DEP014`, `SRV009`. | — |
| **Type Bénéficiaire** | Adhérents | Lien de parenté (PARTICIPANT, EPOUSE, ENFANT, ASCENDANT). **Liste fermée** par nature. | — |
| **Types de Prestations** | Médical | Acte médical remboursable. | `6020xx` |
| **Spécialités** | Médical | Catégorie de prestataire conventionné (30 entrées) — *pas* la spécialité médicale académique. | `4000xx` |
| **Médicaments** | Médical | Catalogue. Champs propres : `exclus`, `tarif`. Seul référentiel à **action en lot**. | `602006` par défaut (6020 + prestation 06), saisissable |
| **Articles Achat** | Achats | Biens et fournitures (`ART0001…`). | comptes d'achat |
| **Fournisseurs Divers** | Achats | Tiers non médical. Le compte **tient lieu de code**. | `401xxx` |
| **Journaux Comptable** | Comptabilité | Journaux (`B10`, `AC`…), triés en chaîne. | plan comptable |

**Consommé par.** La cascade Direction → Département → Service de la fiche
participant ; le filtre spécialité des fournisseurs ; les listes des Bons.
`index.jsx` précharge le tout **au démarrage de l'application** — preuve que
c'est une infrastructure, pas une page.

---

### Adhérents — `/adherents` ✅

**Objectif.** Gérer les collectivités cotisantes : régime (IPM/CMM), compte
comptable, cotisations, seuils de gestion, point focal.

**État.** Servi par Django (`/api/adherents/`, 4 entrées). Module Django à part
entière, monté à la racine de l'API. Modèle héritant de `Referentiel`.

**À noter.** Le code est séquentiel sur 2 chiffres et le compte le suit :
`01` → `463001`. Les montants sont des `CharField` et non des entiers —
délibéré : *une cotisation absente n'est pas une cotisation nulle*.

---

### Fournisseurs de Soins — `/fournisseurs-de-soins` 🟡

**Objectif.** Les prestataires conventionnés que la caisse rembourse. Fiche
riche : coordonnées, interlocuteur, pièces professionnelles, domiciliation
bancaire.

**État.** **Aucun backend** — vérifié : `/api/fournisseurs-de-soins/` → 404. Les
données sont fabriquées par le navigateur au premier chargement et vivent en
`localStorage`. Chaque poste a sa copie.

**À noter.** Le vocabulaire est celui de la convention, pas de l'activation :
une convention se *suspend* et se *rétablit*. L'état est en sélecteur segmenté
plutôt qu'en interrupteur discret — *rembourser un prestataire dont la
convention est dénoncée serait une erreur de gestion*.

**Pour y arriver.** Référentiel plat : entre directement dans le moule
`Referentiel` / `ReferentielViewSet`. **Migration la plus simple des trois, à
faire en premier** — c'est de la donnée partagée qui n'a rien à faire poste par
poste. À traiter en même temps que la duplication `SPECIALITES` (§6).

**⚠️ Écart avec l'application d'origine (captures du 08/09).** L'écran d'origine
porte **deux onglets** : *Tous les Fournisseurs* et *Demandes d'agrément*. Le
second est **entièrement absent du nouveau projet** (0 occurrence de « agrément »
dans `src/` et `backend/`). C'est le processus d'entrée dans le référentiel : un
prestataire candidate, la demande est instruite, et le fournisseur naît de son
acceptation. Le nouveau code a modélisé le *résultat*, pas le *processus*.

Le formulaire de demande porte : date de dépôt (préremplie), spécialité et raison
sociale obligatoires, email, adresse, et un encadré Contact
(nom · prénoms · fonction · fixe · mobile, préfixe `+221` figé). Ces cinq champs
correspondent un pour un à `contactNom`, `contactPrenoms`, `contactFonction`,
`contactTelephone`, `contactMobile`, **déjà déclarés** dans le config actuel — et
la fiche porte déjà les pièces qu'un agrément vérifie (`carteNumero`, `rcNumero`,
`autorisationNumero` et leurs dates). **La matière est là ; il manque le cycle de
vie.**

❓ L'onglet principal d'origine ne semble pas offrir de bouton « Nouveau », alors
que l'onglet des demandes en a un — ce qui impliquerait qu'**on ne crée jamais un
fournisseur directement**. Le nouveau code propose « Nouveau fournisseur » en
création directe. À confirmer : la capture est rognée à droite.

**Volumétrie réelle : 411 fournisseurs** dans l'application d'origine, contre 104
dans le jeu de démo. L'*Import Excel* de l'écran d'origine est vraisemblablement
la voie par laquelle ils sont entrés — donc le chemin de reprise des données.

**Améliorations délibérées du nouveau code**, à conserver : « Actifs / Suspendus »
devient « Conventionnés / Suspendus », et « désactiver » devient « suspendre la
convention » — le vocabulaire de la convention plutôt que celui de l'informatique.

---

### Participants — `/participants` 🟡

**Objectif.** Les salariés couverts et leurs familles. Quatre onglets :
Participants IPM · Participants Retraités · Nouveau Participant IPM · Familles.

**État.** **Aucun backend.** Deux jeux en `localStorage` : `participants` et
`beneficiaires`.

**Dépend de Données de base** — c'est l'écran le plus couplé : la fiche lit
`structure` pour la cascade Direction → Département → Service (filtrée sur
`type` et `parent`), et les types de bénéficiaires pour les familles.

**Pour y arriver.** Plus délicat que Fournisseurs : ce n'est plus une
nomenclature mais une personne, avec état de contrat (Ouverture / Fermeture /
Radiation), rattachement à un adhérent, et des ayants droit. ❓ Les
bénéficiaires doivent-ils devenir un modèle lié au participant par clé
étrangère, ou rester une table à plat ? (Je penche pour la clé étrangère.)

---

### Bons de Pharmacie — `/documents/bons-pharmacie` 🟡

**Objectif.** Le bon autorise un bénéficiaire à retirer des médicaments chez un
pharmacien conventionné, à la charge de l'IPM. **Premier document émis** de
l'application — les trois autres suivront le même patron.

**État.** **Aucun backend**, `localStorage`.

**À noter — le point de conception le plus intéressant du projet.** Un bon
*« ne porte presque aucune donnée propre : il désigne des tiers déclarés
ailleurs »*. Les listes se lisent dans les référentiels (les pharmacies sont les
fournisseurs de spécialité `06`), jamais en dur, *« un bon ne peut ainsi
désigner que des tiers qui existent réellement »*. C'est la démonstration de
l'idée directrice du §3.

**Pour y arriver.** ⚠️ **Décision à prendre avant d'écrire le modèle.**
L'enregistrement stocke aujourd'hui à la fois les codes (`codeFournisseur`,
`matriculePart`) et les libellés recopiés (`pharmacie`, `participant`,
`beneficiaire`) — le `localStorage` n'ayant pas de jointures. Un vrai backend
voudra des clés étrangères. Recopier le modèle plat irait plus vite ; je le
déconseille sur un document comptable, où les libellés recopiés divergent tôt ou
tard.

---

### Lettres de Garantie · LG Hospitalisation · Bons Optique ⬜

`/documents/lettres-garantie` · `/documents/lg-hospitalisation` ·
`/documents/bons-optique`

**Objectif.** Les trois autres pièces émises au profit des participants.
Annoncées dans le menu, elles mènent à un écran d'attente.

**Pour y arriver.** Elles suivront le patron des Bons de Pharmacie. ❓ Une
lettre de garantie engage la caisse envers un établissement avant l'acte, alors
qu'un bon accompagne une délivrance immédiate — le circuit de validation est
probablement différent, à préciser avec le métier.

---

### Traitements · Comptabilité ⬜ *(hors menu)*

`/traitements` · `/comptabilite`

**Objectif.** ❓ Ce sont les deux sections dont je comprends le moins
l'intention, et ce sont les plus structurantes. D'après les règles de compte
semées partout dans les référentiels, j'y vois le moteur qui transforme les
actes en écritures : liquidation des dossiers, remboursements, génération des
pièces comptables. **À faire préciser en priorité** — tout le travail sur les
comptes n'a de sens que là.

**État.** Retirés du menu (les routes existent encore) : *ce ne sont pas des
pages mais des regroupements, et les annoncer avant d'avoir leur contenu ne
menait qu'à des écrans d'attente*.

---

### Paramètres · Profil ⬜ · Connexion `/login` 🟡

Paramètres et Profil ne sont atteignables que par la barre supérieure.

**Connexion.** Cas différent des autres : le front **appelle réellement** un
backend qui n'existe pas. `services/api.js` tape `/auth/login/`, `/auth/me/`,
`/auth/logout/` ; `config/urls.py` ne monte rien de tel. Les journaux le
montrent : `Not Found: /api/auth/logout/`. Le jeton est prévu
(`localStorage`, en-tête `Token`), l'implémentation Django reste à écrire.

L'application d'origine affiche « Moustapha Mbaye (**Admin**) » : elle gère donc
des comptes **et des rôles**. L'authentification à écrire devra vraisemblablement
en tenir compte, pas seulement ouvrir une session.

---

## 5. Règles transverses

- **Un seul composant pour tous les écrans de liste.** `<Referentiel />` (26 Ko)
  piloté par un descripteur `config.js` : liste, recherche, filtres, pagination,
  création, modification, export. Ajouter un écran = écrire un descripteur.
  Trois pages entières tiennent en 35 lignes.
- **On ne supprime jamais**, on désactive (`actif`).
- **Les codes sont engendrés par l'application**, jamais devinés par
  l'utilisateur (séquentiels, ou préfixe de type + rang).
- **Le compte suit le code**, selon des règles par référentiel (voir tableau §4).
- **Le front nomme en camelCase, la base en snake_case** ; les serializers
  mappent via `source=` pour ne pas polluer le schéma.
- **Navigation en `HashRouter`** (`/#/participants`) : le serveur ne voit jamais
  qu'une seule URL, donc aucune règle de repli SPA à configurer sur IIS.

## 6. Points ouverts

Classés par ce qu'ils coûtent si on les laisse.

| # | Sujet | Constat |
|---|---|---|
| 1 | **Travail non sauvegardé** | `HEAD` date du 13/08 ; tout ce qui a suivi (module adhérents, Bons de Pharmacie, refonte SCSS, `deploy/`) n'existe que sur ce disque. `origin/main` ne l'a pas. |
| 2 | **Aucune authentification** | DRF en `AllowAny`, aucune route `/api/auth/*`. Le site est ouvert en lecture **et en écriture** à tout le réseau local. Bloquant avant toute donnée réelle. |
| 3 | **Accès par le nom de domaine cassé** | `sar-integration.sar.sn` absent de `DJANGO_ALLOWED_HOSTS` → **400** sur chaque appel API. L'interface se charge, les écrans restent vides. Correctif : une ligne dans `backend/.env` + redémarrage du service. |
| 4 | **`SPECIALITES` en double** | La liste vit en base (30 entrées, éditable) **et** en dur dans `services/referentiels.js` (30 chaînes). `fournisseurs-de-soins/config.js` lit le tableau en dur. Conséquence testable : une spécialité ajoutée via Données de base n'apparaît pas dans le filtre des fournisseurs. Identiques aujourd'hui, condamnées à diverger. |
| 5 | **Circuit d'agrément absent** | L'application d'origine gère les *Demandes d'agrément* comme un onglet à part entière du même écran ; le nouveau projet n'en a aucune trace. Voir §4 *Fournisseurs de Soins*. |
| 6 | **`PLAN_COMPTABLE` en dur** | Son propre en-tête l'annonce : *« a vocation à devenir un référentiel à part entière, alimenté par la comptabilité »*. |
| 7 | **`.env.production` non versionné** | Ne contient aucun secret, juste `VITE_API_BASE=/api`, mais sans lui un build sur une machine neuve produit un front inutilisable. |
| 8 | **HTTP en clair, SQLite** | Assumés et documentés dans `deploy/INSTALLATION.md`. SQLite convient à quelques utilisateurs simultanés. |

## 7. Déploiement

Serveur **SAR-INTEGRATION** (10.113.243.179), Windows Server 2022. Une seule
origine, un seul port :

```
IIS :80  →  /          C:\inetpub\ipm       (build du front)
         →  /static/*  backend\staticfiles  (habillage de /admin)
         →  /api/*  ┐  proxy inverse ARR
         →  /admin/*┘  → 127.0.0.1:8000     (Django + waitress, service « IPM-Backend »)
```

Publication après modification : `C:\deploy\IPM\deploy\publier.ps1` (PowerShell
**administrateur** — le venv appartient au compte `Administrateur`). Détail
complet dans `deploy/INSTALLATION.md`.

Propriété utile : le script s'arrête si `npm run build` échoue, **avant** le
`robocopy /MIR`. Un build cassé ne peut donc pas effacer le site en place.

## 8. Prochaines étapes proposées

1. Sauvegarder le travail (commit + push) — §6.1.
2. Corriger `ALLOWED_HOSTS` — §6.3, une ligne, effet immédiat.
3. Migrer **Fournisseurs de Soins** vers Django, et supprimer la duplication
   `SPECIALITES` au passage — §6.4.
4. Faire préciser **Traitements / Comptabilité** : c'est ce qui donne son sens à
   tout le travail sur les comptes.
5. Écrire l'authentification, avant toute donnée réelle.

---

## Journal

| Date | Révision |
|---|---|
| 2026-09-08 | Captures de l'application d'origine (Fournisseurs de Soins) analysées : découverte du circuit *Demandes d'agrément*, absent du projet ; volumétrie réelle 411 fournisseurs ; rôles utilisateurs dans l'original. |
| 2026-09-08 | Création. Analyse du dépôt, du serveur en marche et des 15 routes. Faits vérifiés sur l'API vivante : 9 endpoints, 404 sur `fournisseurs-de-soins`, 400 sur l'accès par FQDN, 4 adhérents, 30 spécialités. |
