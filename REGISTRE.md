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
**CMM**, la mutuelle (cotisation unique). L'IPM couvre les **salariés en
activité** (`01 IPM SAR PERSONNEL MOO`, `02 IPM SAR PERSONNEL CADRES`) ; les
anciens salariés passent aux deux mutuelles (`03 CMM CR-SAR`, `04 CMM
NCR-SAR`). C'est le **régime de l'adhérent** qui fait d'un participant un
retraité — il n'y a pas de case à part.

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

### Participants — `/participants` ✅

**Objectif.** Les salariés couverts et leurs familles. Quatre onglets :
Participants IPM · Participants Retraités · Nouveau Participant IPM · Familles.

**État.** Servi par l'API (`/api/participants/`, `/api/beneficiaires/`). Un
bénéficiaire porte une clé étrangère vers son participant, et son type vient du
référentiel « Types de bénéficiaire ».

**Dépend de Données de base** — c'est l'écran le plus couplé : la fiche lit
`structure` pour la cascade Direction → Département → Service (filtrée sur
`type` et `parent`), et les types de bénéficiaires pour les familles.

**Identifiants**, comme l'application d'origine :

- participant : **quatre chiffres** (`0949`), montrés après le code de la
  société sur les documents (`01-0949`). Le mobile complète les zéros de tête,
  pour que l'employé tape son matricule comme il le dit (« 949 ») ;
- bénéficiaire : société, matricule du participant, **code du type et rang**
  dans ce type — `01-0949-21` est la première épouse (type 2). Composé par le
  serveur, jamais saisi ; ni le matricule ni le porteur ne se changent ensuite.

**Un seul cycle de vie** : l'état du dossier (En Attente → Actif → Suspendu →
Résilié / Radié). L'état du contrat (Ouverture / Fermeture / Radiation) et les
dates de sortie **s'en déduisent** au serveur — y compris lors d'un changement
d'état en lot, qui n'envoie que l'état. Pas de désactivation à côté : là où
l'état est en colonne, il est la seule sortie, et une fiche ne se supprime
jamais (HTTP 405).

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

**Taux de prise en charge.** Le barème est un **produit complet** : chaque
société × chaque nature de prestation × chaque qualité de bénéficiaire. Il
décide, facture par facture, de la part IPM et de celle du participant. D'où
deux règles :

- une ligne **ne se supprime pas** (HTTP 405) — une combinaison absente n'est
  pas « zéro », c'est un trou que personne ne voit ; un taux qui ne s'applique
  plus se met à 0 ;
- l'écran montre le barème **entier**, les combinaisons sans taux comprises,
  marquées « à définir » et réglables d'un clic.

Le **compte** ne se saisit jamais : c'est celui de la nature de prestation
(602004 pour OPTIQUE), que la charge ira débiter à la comptabilisation.

Un **taux exceptionnel** vise une personne et l'emporte sur celui de sa
société ; il se retire, lui, sans rien trouer. Il est refusé sur un dossier
résilié ou radié.

❓ **Le barème n'est encore lu par aucun document** : l'application émet des
bons et des lettres, elle ne liquide pas de factures. C'est le module qui
manque pour que ces taux servent.

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
- **Navigation en `BrowserRouter`** (`/participants`) : les adresses n'ont plus
  de dièse — elles se mettent en favori et se partagent telles quelles. En
  contrepartie IIS porte une règle de repli (`deploy/web.config`, « Repli
  SPA ») qui renvoie `index.html` pour tout chemin qui n'est ni un fichier ni
  le domaine de Django.

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
| 2026-10-08 | **Découverte du module « Règlements »** (Traitements → Règlements : le PAIEMENT des factures, après liquidation/compta). 9 captures ajoutées (`docs/lamps/captures/51-59`) et modèle décodé dans `lamps_analyse` : le règlement est porté par `factures` (`etat` P/C/R/T, `delai` → échéance = date + délai, `typereglmt` C/V/E/T, `numreglmt`, `datereglmt`, `montant_reglmt`, `acompte`) + chéquier `table_cheques` (banque, journal, `to_print`). États dérivés : Non Echue/Echue/Reglée/Comptabilisée/Annulée. Modal de paiement multi-factures + **acompte** (paiement partiel) ; Éditions (Factures à Payer/non Payées, Lettres Chèque, Ordre de Virement par banque) ; actions A Payer / Annuler. **À construire côté IPM** (app Règlements + modal + éditions + écritures de paiement, circuit compta à décoder). Doc : `docs/lamps/modele-de-donnees.md` §17. |
| 2026-10-07 | **« Créer bon manuel » implémenté** (page de traitement d'une facture). Bouton bleu (comme l'original) qui ouvre un modal : **Participant & bénéficiaire** (participant de la société, type bénéf, nom) + **Saisie des actes** acte par acte (même logique 85/87 que la liquidation). Back : nouveau type de document `manuel` (migration `traitements/0004`) + action `creer-bon-manuel` qui crée un `LiquidationBon` (numéro « BMI… », séquence propre) rattaché à la facture et aussitôt liquidé ; il compte dans l'écart et se détache comme un bon rattaché (le crayon « modifier » est masqué pour un manuel - on détache/recrée). Testé de bout en bout (création 201 → bons traités → facture « En cours » → détachement 204). |
| 2026-10-07 | **Constat (capture facture divers) : « Créer bon manuel » à implémenter.** La page de traitement d'une facture **divers** (99999 FOURNISSEURS DIVERS SOINS) utilise la **même** interface que les soins : en-tête, **Liste des bons en instance** (sans colonne Montant, OK chez nous), écart, et trois boutons **Créer bon manuel · Valider facture · Fermer**. Chez nous, `FactureDetails.jsx` a Valider / Comptabiliser / Fermer **mais pas « Créer bon manuel »** (bleu) - créer un bon directement depuis le traitement, sans document préexistant (surtout pour les divers). **À construire.** Doc enrichie : `docs/lamps/modele-de-donnees.md` §15. |
| 2026-10-07 | **Sauvegarde des taux de prise en charge** (barème partiel reçu du métier). Le métier n'a envoyé qu'une partie des taux ; ils sont saisis dans `ipm` (720 taux, 180 × 4 sociétés) et **sauvegardés** dans le dépôt : `backend/apps/parametres/data/taux.json` (repérés par codes société / nature de prestation / type de bénéficiaire, stables d'une base à l'autre). Nouvelle commande `python manage.py importer_taux` (idempotente, update_or_create ; option `--fichier`) pour recharger après toute reconstruction, et pour y déposer le **barème complet** quand il arrivera (mêmes champs). Testé : 720 rechargés. |
| 2026-10-06 | **Stats des tableaux : contenu LAMPS + pastille près du titre** (design uniquement). Pastille « Total : N » remise sur tous les tableaux (défaut dans `Referentiel`, lignes visibles, opt-out `sansStats`), puis affinée d'après les captures LAMPS : contenu détaillé là où l'original le montre - **Participants IPM/Retraités** « Total Participants: N - Epoux(se): N - Enfant: N » (+ légende société quand une société est filtrée), **Familles** « Epoux: N / Epouses: N / Enfants: N / Autres: N », **Fournisseurs de soins** « Total Fournisseurs: N », **Demandes d'agrément** « Total Demandes: N » ; les autres gardent « Total : N ». **Placement : pastille à côté du titre de la card**, comme Données de base (« Structure - Total : 13 »). Pages à onglets (participants, fournisseurs, factures) : `Referentiel` remonte ses stats au parent via la prop `onStats`, qui pose la pastille dans le groupe du titre (H1 + pastille, bouton à droite) ; le compte se met à jour au changement d'onglet. Adhérents : passé en `barreCompacte` pour que sa pastille rejoigne son titre h2 (comme documents/données de base). Classe `.ddb-stats-pastille` + `.prt-titre-groupe`. Helpers `statsBeneficiaires`/`legendeStats` remis dans la config participants. Vérifié Playwright (7 vues) + captures. Déployé front sans redémarrage backend. |
| 2026-10-06 | **Nomenclatures de présentation rendues distinctes du réel** (anti-fuite en démo ; données uniquement). Après diagnostic comparant `ipm` et `ipm_dev`, plusieurs référentiels étaient encore identiques. Commande `python manage.py distinguer_presentation` (à lancer sur `ipm`) : contenu ET nombre désormais différents de la vraie base pour **médicaments** (240 réels → 25 génériques INN fictifs), **articles d'achat** (12 → 8), **structures** (47 → 49, libellés en noms de code Alpha/Bêta/Orion…), **fournisseurs divers** (16 → 9), **journaux** (32 → 26, libellés « DEMO », code `IF` conservé). Garde ce qui casserait l'app : les 9 codes de structure cités par des participants et le journal `IF`. **Laissés identiques (exception explicite du client) : spécialités, types de prestations, types de bénéficiaire** - codes structurels universels, non confidentiels. Vérifié : 0 libellé commun sur les 5 référentiels traités, app cohérente, API live OK. |
| 2026-10-06 | **Deux bases de données : présentation et développement.** Mise en place de la séparation demandée par le client. **`ipm`** reste la base de **présentation** (données fictives : participants anonymisés, 14 fournisseurs de soins démo, structures/divers/journaux masqués) et **reste la base déployée** (`.env` `DB_NAME=ipm` inchangé - rien de réel n'est exposé sur .179). Création de **`ipm_dev`** = base de **développement** avec les **vraies données**, construite à neuf (migrate + seeds + imports réels, SANS les commandes d'anonymisation/masquage) : 412 fournisseurs de soins réels (CSV), 4 adhérents réels (CSV), journaux/fournisseurs divers/structures réels (CREDIT DU SENEGAL, SONATEL, QHSE/REXAS, HOPITAL LE DANTEC, IRESSEF...), 47 structures (dont 6 ajoutées manuellement, reconstituées), 240 médicaments, 179 actes, 40 participants. Bascule par `DB_NAME` (`load_dotenv(override=False)` : la variable shell prime ; en déployé, changer `.env` + redémarrer `IPM-Backend`). **Quelle base déployer est un choix** (client) : `ipm_dev` pourra être déployée pendant les phases de dev (accès verrouillé par identifiants) et `ipm` remise pour les présentations ; aujourd'hui = présentation = `ipm`. Les vraies données de `ipm_dev` ne sont jamais poussées sur git. Compte/token copiés depuis `ipm`. Bug latent repéré : `seed_donnees_de_base._fournisseurs_de_soins` plante sur une spécialité '29' inexistante (contourné ; sans effet, les vrais fournisseurs viennent du CSV). |
| 2026-10-06 | **Masquage des référentiels internes réels** (données uniquement, aucune structure touchée, aucune réduction). Commande `python manage.py masquer_donnees_internes` : remplace par du **fictif** les 3 listes qui exposaient du réel SAR - **Structures** (organigramme : 47 entités renommées, hiérarchie DIR/DEP/SRV et parents conservés), **Fournisseurs divers** (16 : noms + coordonnées fictifs, compte 401xxx gardé), **Journaux comptables** (32 : vrais noms de banques remplacés, CREDIT DU SENEGAL -> BANQUE DU LITTORAL, ECOBANK -> BANQUE DE L'UNION ; libellés comptables génériques conservés). La **nomenclature médicale standard reste intacte** (spécialités, types de prestations, médicaments, articles) : non confidentielle, identique à LAMPS (choix explicite du client). Vérifié : 0 vrai nom résiduel. |
| 2026-10-06 | **Fournisseurs de soins réduits à un jeu de démonstration** (données uniquement, aucune structure touchée). Après anonymisation, 411 fiches restaient une volumétrie de prod, pas une vitrine : commande `python manage.py fournisseurs_soins_demo` ramène la liste à **14 fiches** fictives lisibles - une par grande spécialité (pharmacie ×2, dentaire, clinique, généraliste, gynéco, pédiatre, optique, ophtalmo, labo, hôpital, imagerie, ORL) + le sentinelle « FOURNISSEURS DIVERS SOINS ». Les fiches encore citées par un document/facture/demande (FK **PROTECT**) sont **toujours conservées** (ici les 2 du seul bon de pharmacie), donc rien n'est cassé. 398 fiches en trop supprimées ; vérifié API (14 servies) + intégrité du bon. Même esprit que le petit échantillon de participants. La vraie base reste dans `lamps_analyse.fournisseurs`. |
| 2026-10-06 | **Anonymisation des fournisseurs de soins** (données personnelles / établissements réels). Commande `python manage.py anonymiser_fournisseurs_soins` : remplace les 411 vrais prestataires par une **liste fictive cohérente** - nom selon la spécialité (PHARMACIE/HOPITAL/CLINIQUE/LABORATOIRE + quartier de Dakar, CABINET `<spé>` pour les praticiens), adresse / téléphones / contact / banque / numéros officiels inventés, GPS effacé. Le code, la spécialité et le compte comptable sont conservés (les documents qui citent le fournisseur par son code continuent de marcher). Sentinelle « FOURNISSEURS DIVERS SOINS » (99999) et fiche technique spé 98 gardées telles quelles. Appliqué en prod (411/412). La **vraie base reste dans `lamps_analyse.fournisseurs`**. À relancer après tout nouvel import de vrais fournisseurs. |
| 2026-10-05 | **Anonymisation des participants & familles** (RGPD / données personnelles). Commande `python manage.py anonymiser_participants` : remplace noms et prénoms réels par des **inventés** — prénoms tirés selon le sexe et **distincts dans chaque famille**, noms remappés de façon **cohérente** (les familles qui partageaient un nom le partagent toujours : enfants du père, conjoint, ascendant). Noms en MAJUSCULES (convention app), comparaison insensible à la casse. Appliqué en prod (11 participants, 26 bénéficiaires). Les vrais noms restent dans `lamps_analyse`. À relancer après tout nouvel import de vraies personnes. |
| 2026-10-05 | **Traitements → Factures — Tranche 4** (comptabilisation ; **cycle complet**). Décodage de la table `compta` : journal **IF**, écriture équilibrée — fournisseur **crédité** sur le compte de sa spécialité (400xxx, tiers = code), chaque bon **débite** la prestation (602xxx = part IPM) et le participant (`4110`+société = 411001…004, tiers = société-matricule = ticket). Modèle **`EcritureCompta`** + `comptabilisation.py` ; actions `comptabiliser` (Traitée→Comptabilisée) et `ecritures`. Bouton « Comptabiliser » (page traitement + liste), affichage des écritures (D=C). Divers : circuit non décodé, à faire. Vérifié API + UI (équilibre 50 000=50 000). **Module Traitements : les 4 tranches livrées** (réception→traitement→liquidation→comptabilisation). |
| 2026-10-05 | **Traitements → Factures — Tranche 3** (liquidation acte par acte, capture 39). Modal `LiquidationBonModal.jsx` : entête bon + écart, saisie par **prestation** (types-prestations) avec **QP.IPM pré-rempli 85/87 %** sur le frais réel, ajustable (QP.PART, QP.Assur, Frais Exclus, Ajustement, Quantité) ; « Valider » ajoute la ligne, « Enregistrer » → endpoint `liquider` qui remplit `LiquidationBon.actes` (lignesprest) et recalcule les totaux. Ouvert depuis les bons en instance (liquider) ou les bons traités (modifier). Vérifié API + UI (qpipm 43 500 = 87 %, actes persistés). **Tranche 4** : comptabilisation. |
| 2026-10-05 | **Traitements → Factures — Tranche 2** (traitement d'une facture, capture 38). Modèle **`LiquidationBon`** (ligne « bon traité ») + agrégation des **bons en instance** à travers les 4 modèles de documents (bons du prestataire, même société, non traités). **Moteur de liquidation** (`liquidation.py`) : 85/15 actifs, 87/13 retraités, non-couverts types 5/6. Page **Traitement** (`FactureDetails.jsx`) : rattacher (liquidation auto ajustable), détacher, **Écart** (Montant Net − Σ F.réels), **Valider** (Reçue→En cours→Traitée). Action « Traiter la facture » sur la liste + route `/traitements/factures/:id`. Vérifié API + UI (qpipm 87 % sur société retraitée). **Tranches 3-4** : liquidation acte par acte (capture 39) + comptabilisation. |
| 2026-10-05 | **Traitements → Factures — Tranche 1** (nouveau module, le cœur de LAMPS, construit par tranches). Nouvelle app Django **`traitements`** + modèle **`Facture`** (tout le cycle de vie : réception → traitement → compta → paiement ; Tranche 1 n'en remplit que la réception). Écran **Liste** à 2 sous-onglets (Fournisseurs de Soins / Fournisseurs Divers), 19 colonnes du cycle de vie (capture 36), filtres Exercice/Société/État(/Spécialité) + bouton **Réceptionner une facture** ; **modal Réception** (capture 37 : Société → Spécialité/Fournisseur → Entête → F.réel−Remise−Ristourne−QP.Agent = **Montant Net** calculé serveur + cases Remb. Ticket / Facture d'avoir). Menu « Traitements » remis. Vérifié API + UI (soins & divers). **À venir (tranches 2-4)** : traitement (rattacher les bons + écart), liquidation acte par acte (85/15), valider + comptabiliser — barème métier attendu pour les grilles optique/dentaire. Détail : `docs/lamps/modele-de-donnees.md` §15. |
| 2026-10-05 | **Bon Optique** aligné sur LAMPS (4ᵉ et dernier document). Rétro-ingénierie sur `lamps_analyse` : `documents_ipm`/`typedoc='BCI'` (1 337), liquidé en une ligne `lignesprest` `codeprest='04'`. L'écran d'édition réel (capture 27) est le **patron standard** (Participant · Bénéficiaire · Prescripteur · Fournisseur opticien + « Saisir les actes »), **pas** la ligne designation/PU/remise. Les « actes » optique = 4 articles spé 04 (Montures, Verres, Montures & Verres, Traitement). **Éditeur sur-mesure supprimé** → formulaire générique + `selection-actes` (filtré spé 04 de l'opticien) ; articles en JSON (`BonOptique.actes`), montants **calculés** serveur, PDF adapté (migration `documents/0010`). Les **4 documents** partagent le même mécanisme. Détail : `docs/lamps/modele-de-donnees.md` §14. |
| 2026-10-05 | **LG Hospitalisation** alignée sur LAMPS. Rétro-ingénierie sur `lamps_analyse` : le document est `documents_ipm`/**`typedoc='LHI'`** (143) — **préfixe corrigé `LGH`→`LHI`** (modèle). « Saisir les actes » **implémenté** : même sélecteur que la lettre de garantie, filtré sur la spécialité du **prestataire** (hôpital→actes HOPITAUX spé 03, clinique→spé 08), acte + quantité + **tarif saisi** ; Remise conservée. Saisie **unifiée en JSON** (`LettreHospitalisation.actes`) ; table liée `ActeHospitalisation` supprimée (migration `documents/0009`). Composant générique `selection-actes` étendu (`prestataireDe`). Détail : `docs/lamps/modele-de-donnees.md` §14. |
| 2026-10-05 | **Lettres de Garantie** alignées sur LAMPS. Rétro-ingénierie sur `lamps_analyse` : la lettre est `documents_ipm`/`typedoc='LGI'` (45 906), `codefourn`=prestataire + `codepresc`=prescripteur + `natprest`, liquidée en lignes `lignesprest` **agrégées par spécialité** (jamais une par acte). Nomenclature `actes` LAMPS (6 197) = 6 018 médicaments (spé 06) + **179 actes hors pharmacie**. Nouveau référentiel **`Acte`** (`donnees_de_base_acte`, 179 importés via `importer_actes`) ; « Saisir les actes » **implémenté** en **sélection** filtrée par spécialité du prestataire (acte + quantité + **tarif saisi**) ; persistance JSON (`LettreGarantie.actes`, migrations `donnees_de_base/0022`, `documents/0008`). Composant générique `type: 'selection-actes'`. Détail : `docs/lamps/modele-de-donnees.md` §14. |
| 2026-10-05 | **Bons de Pharmacie** alignés sur LAMPS. Rétro-ingénierie sur `lamps_analyse` : le bon est `documents_ipm`/`typedoc='BPI'` (66 429 bons), liquidé en **une** ligne `lignesprest` `codeprest='06'` (jamais une par médicament) ; divers = `99999`/spé 99. « Saisir les médicaments » **implémenté** comme une **sélection** depuis le catalogue (`donnees_de_base_medicament`, 240 réfs, prestation 06) + quantités ; `nb_articles` déduit ; persistance JSON sur le bon (migration `documents/0007`). Détail : `docs/lamps/modele-de-donnees.md` §14. |
| 2026-09-08 | Captures de l'application d'origine (Fournisseurs de Soins) analysées : découverte du circuit *Demandes d'agrément*, absent du projet ; volumétrie réelle 411 fournisseurs ; rôles utilisateurs dans l'original. |
| 2026-09-08 | Création. Analyse du dépôt, du serveur en marche et des 15 routes. Faits vérifiés sur l'API vivante : 9 endpoints, 404 sur `fournisseurs-de-soins`, 400 sur l'accès par FQDN, 4 adhérents, 30 spécialités. |
