# Backend IPM

API du projet IPM, en Django + Django REST Framework. Développement **modulaire** :
chaque module métier est une application Django rangée sous `apps/`.

## Modules

| Module            | Dossier                    | Contenu                                            |
| ----------------- | -------------------------- | -------------------------------------------------- |
| `donnees_de_base` | `apps/donnees_de_base/`    | Tous les référentiels (types de bénéficiaire, …).  |

Le module `donnees_de_base` s'appuie sur un socle commun — modèle `Referentiel`
(+ `ReferentielAvecCompte` pour ceux qui portent un compte comptable),
serializer et ViewSet de base — car tous les référentiels partagent la même
mécanique (code / libellé / activation). Ajouter un référentiel = ajouter un
fichier dans `models/`, `serializers/`, `views/` et une ligne dans `urls.py`.

Référentiels déjà branchés :

- **Type de bénéficiaire** (`types-beneficiaires`)
- **Type de prestation** (`types-prestations`) — + compte
- **Spécialité** (`specialites`) — + compte
- **Article d'achat** (`articles-achat`) — + compte

## Prérequis

- Python 3.12+ (testé sur 3.14)

## Installation (une seule fois)

```bash
cd backend

# 1. Environnement virtuel
python -m venv .venv

# 2. Activer (PowerShell)
.venv\Scripts\Activate.ps1
#   ou Git Bash :  source .venv/Scripts/activate

# 3. Dépendances
pip install -r requirements.txt

# 4. Base de données + jeu de départ
python manage.py migrate
python manage.py seed_donnees_de_base
```

## Lancer le serveur

```bash
python manage.py runserver 8000
```

L'API répond sur `http://localhost:8000/api/`.

## Endpoints

Chaque référentiel expose le même jeu d'URL, sous
`/api/donnees-de-base/<referentiel>/` où `<referentiel>` vaut
`types-beneficiaires`, `types-prestations`, `specialites` ou `articles-achat` :

| Méthode | URL                                     | Rôle                        |
| ------- | --------------------------------------- | --------------------------- |
| GET     | `/<referentiel>/`                       | Lister                      |
| POST    | `/<referentiel>/`                       | Créer                       |
| PATCH   | `/<referentiel>/{id}/`                  | Modifier                    |
| DELETE  | `/<referentiel>/{id}/`                  | Supprimer                   |
| POST    | `/<referentiel>/{id}/basculer-activation/` | Activer / désactiver     |
| POST    | `/<referentiel>/modifier-en-lot/`       | Modifier plusieurs entrées  |

## Console d'administration

```bash
python manage.py createsuperuser
# puis http://localhost:8000/admin/
```
