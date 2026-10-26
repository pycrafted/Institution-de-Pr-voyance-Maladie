#!/usr/bin/env bash
# Build du backend sur Render (cf. render.yaml, buildCommand).
#
# Tout ce qui précède le démarrage de gunicorn : dépendances, statiques de la
# console d'administration, schéma de base, jeu de départ des référentiels et,
# s'il est demandé, le premier compte administrateur. Chaque étape est
# relançable sans dégât : le script tourne à chaque déploiement.
set -o errexit
set -o pipefail

pip install --upgrade pip
pip install -r requirements.txt

python manage.py collectstatic --noinput
python manage.py migrate --noinput

# Banques (B1..B10) : référentiel sans donnée personnelle, idempotent, confirmé
# sur la vraie base.
python manage.py seed_banques

# Jeu de DÉMONSTRATION (IPM_JEU_DEMO=1 sur Render) : référentiels fictifs,
# adhérents et équipe DSI (mot de passe mobile « 0000 »). À ne JAMAIS activer
# sur une base qui porte les vraies données : seed_donnees_de_base y ajouterait
# des fiches fictives à côté des réelles. La base Render est, depuis le
# 26/10/2026, une restauration de la vraie base ipm_dev (cf. deploy/CLOUD.md).
if [ "${IPM_JEU_DEMO:-}" = "1" ]; then
    python manage.py seed_donnees_de_base
    python manage.py seed_adherents
    python manage.py seed_equipe_dsi || echo "Équipe de démonstration déjà en place."
fi

# Anonymisation des employés, à la demande. La base du nuage est une copie
# des vraies données : noms, dates de naissance, adresses, pièces d'identité
# et photos de 675 salariés de la SAR et de 3 179 ayants droit. Les
# prestataires, le barème et la comptabilité restent réels - ce sont des
# établissements et des règles, pas des personnes.
#
# IPM_ANONYMISER=1 sur Render déclenche le passage au déploiement suivant.
# Le schéma « lamps » de la même base fournit les identités réelles à éviter :
# sans cela, le tirage reconstitue de vraies personnes (36 fois sur 675).
# Relançable sans dégât : la commande s'arrête d'elle-même si c'est déjà fait.
if [ "${IPM_ANONYMISER:-}" = "1" ]; then
    python manage.py anonymiser_participants --matricules --eviter-schema lamps
fi

# Premier compte, pour pouvoir se connecter au front et à /admin/. Les trois
# variables DJANGO_SUPERUSER_USERNAME / _EMAIL / _PASSWORD se renseignent sur
# Render (render.yaml les déclare). Compte déjà créé : la commande échoue, on
# l'ignore - les variables peuvent ensuite être retirées.
if [ -n "${DJANGO_SUPERUSER_EMAIL:-}" ] && [ -n "${DJANGO_SUPERUSER_PASSWORD:-}" ]; then
    python manage.py createsuperuser --noinput || echo "Compte administrateur déjà présent."
fi
