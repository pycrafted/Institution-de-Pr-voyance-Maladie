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

# Référentiels (types de bénéficiaires, prestations…) : idempotent.
python manage.py seed_donnees_de_base

# Jeu de démonstration, pour pouvoir se servir de l'application IPM Mobile :
# les quatre adhérents et l'équipe DSI (mot de passe mobile « 0000 »). Activé
# par IPM_JEU_DEMO=1 sur Render. L'équipe refuse de s'installer par-dessus des
# participants existants : on s'en contente, c'est qu'elle est déjà là.
if [ "${IPM_JEU_DEMO:-}" = "1" ]; then
    python manage.py seed_adherents
    python manage.py seed_equipe_dsi || echo "Équipe de démonstration déjà en place."
fi

# Premier compte, pour pouvoir se connecter au front et à /admin/. Les trois
# variables DJANGO_SUPERUSER_USERNAME / _EMAIL / _PASSWORD se renseignent sur
# Render (render.yaml les déclare). Compte déjà créé : la commande échoue, on
# l'ignore - les variables peuvent ensuite être retirées.
if [ -n "${DJANGO_SUPERUSER_EMAIL:-}" ] && [ -n "${DJANGO_SUPERUSER_PASSWORD:-}" ]; then
    python manage.py createsuperuser --noinput || echo "Compte administrateur déjà présent."
fi
