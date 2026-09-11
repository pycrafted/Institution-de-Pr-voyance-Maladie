"""
Configuration Django du backend IPM.

Développement modulaire : chaque module métier est une application Django rangée
sous ``apps/``. On démarre avec ``donnees_de_base`` — le module qui porte tous
les référentiels (types de bénéficiaires, prestations, spécialités…). Les modules
suivants (adhérents, participants, prestations…) s'ajouteront de la même façon,
sans toucher au cœur.
"""

from pathlib import Path

from dotenv import load_dotenv
import os

# backend/  (le dossier qui contient manage.py)
BASE_DIR = Path(__file__).resolve().parent.parent

# Charge backend/.env s'il existe (variables locales, secrets).
load_dotenv(BASE_DIR / '.env')

# Les applications métier vivent sous apps/ ; on ajoute ce dossier au chemin
# d'import pour pouvoir les nommer directement (« donnees_de_base ») plutôt que
# « apps.donnees_de_base ».
import sys

sys.path.insert(0, str(BASE_DIR / 'apps'))

# ---------------------------------------------------------------------------
# Sécurité
# ---------------------------------------------------------------------------
SECRET_KEY = os.getenv(
    'DJANGO_SECRET_KEY',
    'dev-secret-key-a-remplacer-en-production',
)

DEBUG = os.getenv('DJANGO_DEBUG', 'True').lower() in ('1', 'true', 'yes')

ALLOWED_HOSTS = os.getenv('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',')

# ---------------------------------------------------------------------------
# Applications
# ---------------------------------------------------------------------------
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Tierces
    'rest_framework',
    'rest_framework.authtoken',
    'corsheaders',
    # Modules métier
    'authentification',
    'donnees_de_base',
    'adherents',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# ---------------------------------------------------------------------------
# Base de données — SQLite en local, suffisant pour le développement.
# ---------------------------------------------------------------------------
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

# ---------------------------------------------------------------------------
# Django REST Framework
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    # L'API porte des données de santé et d'état civil nominatives : elle est
    # fermée par défaut, et le reste dans tous les environnements. La seule
    # vue ouverte est la connexion (cf. apps/authentification/views.py) —
    # aucune autre ne doit redescendre à AllowAny de son côté.
    'DEFAULT_AUTHENTICATION_CLASSES': ['rest_framework.authentication.TokenAuthentication'],
    'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.IsAuthenticated'],
    'DEFAULT_PAGINATION_CLASS': None,
}

# ---------------------------------------------------------------------------
# CORS — le frontend Vite tourne sur http://localhost:3000
# ---------------------------------------------------------------------------
CORS_ALLOWED_ORIGINS = os.getenv(
    'DJANGO_CORS_ORIGINS',
    'http://localhost:3000,http://127.0.0.1:3000',
).split(',')

# ---------------------------------------------------------------------------
# Validation des mots de passe
# ---------------------------------------------------------------------------
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# ---------------------------------------------------------------------------
# Internationalisation
# ---------------------------------------------------------------------------
LANGUAGE_CODE = 'fr-fr'
TIME_ZONE = 'Africa/Dakar'
USE_I18N = True
USE_TZ = True

# ---------------------------------------------------------------------------
# Fichiers statiques
# ---------------------------------------------------------------------------
STATIC_URL = 'static/'

# Destination de « collectstatic ». Hors développement, Django ne sert plus les
# fichiers statiques lui-même : IIS publie ce dossier directement sous /static/,
# ce qui donne à la console d'administration ses feuilles de style.
STATIC_ROOT = BASE_DIR / 'staticfiles'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
