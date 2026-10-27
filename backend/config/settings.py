"""
Configuration Django du backend IPM.

Développement modulaire : chaque module métier est une application Django rangée
sous ``apps/``. On démarre avec ``donnees_de_base`` - le module qui porte tous
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

# Hébergement sur Render (cf. render.yaml) : la plateforme fournit elle-même le
# nom public du service (« xxx.onrender.com »). On l'accepte d'office, sans
# avoir à le recopier dans DJANGO_ALLOWED_HOSTS - l'adresse n'est connue
# qu'une fois le service créé.
RENDER_EXTERNAL_HOSTNAME = os.getenv('RENDER_EXTERNAL_HOSTNAME')
if RENDER_EXTERNAL_HOSTNAME:
    ALLOWED_HOSTS.append(RENDER_EXTERNAL_HOSTNAME)

# Derrière le proxy de Render (ou d'IIS en HTTPS), Django ne voit que du HTTP :
# c'est cet en-tête qui lui dit que le navigateur, lui, est en HTTPS. Sans
# cela, la console d'administration refuserait ses propres formulaires (CSRF).
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
CSRF_TRUSTED_ORIGINS = [
    origine
    for origine in os.getenv('DJANGO_CSRF_TRUSTED_ORIGINS', '').split(',')
    if origine
]
if RENDER_EXTERNAL_HOSTNAME:
    CSRF_TRUSTED_ORIGINS.append(f'https://{RENDER_EXTERNAL_HOSTNAME}')

# Site servi en HTTPS seulement (Render l'impose ; IIS, lui, reste en HTTP sur
# le réseau local) : les cookies de /admin/ ne voyagent qu'en clair chiffré.
# Pas de SECURE_SSL_REDIRECT : c'est le proxy de Render qui redirige, et sa
# sonde de santé parle HTTP au service.
if RENDER_EXTERNAL_HOSTNAME or os.getenv('DJANGO_HTTPS', '').lower() in ('1', 'true', 'yes'):
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

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
    'participants',
    'documents',
    'parametres',
    'traitements',
    'mobile',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    # Sert /static/ (habillage de /admin/) quand aucun serveur web ne le fait
    # devant Django - sur Render, gunicorn est seul. Sous IIS, le répertoire
    # virtuel /static/ répond avant et ce middleware ne voit rien passer.
    'whitenoise.middleware.WhiteNoiseMiddleware',
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
# Base de données - SQLite en local, suffisant pour le développement.
# ---------------------------------------------------------------------------
# Base pilotée par l'environnement (backend/.env, hors Git). Dès que `DB_NAME`
# est défini, l'application utilise **notre PostgreSQL** ; sinon elle retombe sur
# SQLite (pratique en développement). En production, `.env` porte les variables
# PostgreSQL, et c'est donc exclusivement Postgres qui sert les données.
# Sur Render, la base PostgreSQL se présente en une seule variable
# (DATABASE_URL = postgresql://user:motdepasse@hote:port/nom), que l'on
# décompose ici : même moteur, mêmes réglages qu'avec les variables DB_*.
if os.getenv('DATABASE_URL'):
    from urllib.parse import unquote, urlsplit

    _url = urlsplit(os.getenv('DATABASE_URL'))
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': _url.path.lstrip('/'),
            # Décodés : un « @ » ou un « / » dans le mot de passe y est écrit %40, %2F.
            'USER': unquote(_url.username or ''),
            'PASSWORD': unquote(_url.password or ''),
            'HOST': _url.hostname or '',
            'PORT': str(_url.port or 5432),
            'CONN_MAX_AGE': int(os.getenv('DB_CONN_MAX_AGE', '60')),
            'OPTIONS': {
                'sslmode': os.getenv('DB_SSLMODE', 'require'),
                # Django ne regarde que le schéma public, même si PGOPTIONS
                # pose un autre search_path pour un outil lancé à côté (les
                # commandes importer_* lisent le schéma « lamps » de la même
                # base, cf. deploy/CLOUD.md).
                'options': '-c search_path=public',
            },
        }
    }
elif os.getenv('DB_NAME'):
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.getenv('DB_NAME'),
            'USER': os.getenv('DB_USER', 'ipm'),
            'PASSWORD': os.getenv('DB_PASSWORD', ''),
            'HOST': os.getenv('DB_HOST', '127.0.0.1'),
            'PORT': os.getenv('DB_PORT', '5432'),
            # Connexions réutilisées (waitress sert plusieurs requêtes) : évite
            # d'ouvrir une session PostgreSQL à chaque appel.
            'CONN_MAX_AGE': int(os.getenv('DB_CONN_MAX_AGE', '60')),
        }
    }
else:
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
    # vue ouverte est la connexion (cf. apps/authentification/views.py) -
    # aucune autre ne doit redescendre à AllowAny de son côté.
    'DEFAULT_AUTHENTICATION_CLASSES': ['rest_framework.authentication.TokenAuthentication'],
    'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.IsAuthenticated'],
    'DEFAULT_PAGINATION_CLASS': None,
}

# ---------------------------------------------------------------------------
# CORS - le frontend Vite tourne sur http://localhost:3000
# ---------------------------------------------------------------------------
CORS_ALLOWED_ORIGINS = [
    origine.strip()
    for origine in os.getenv(
        'DJANGO_CORS_ORIGINS',
        'http://localhost:3000,http://127.0.0.1:3000',
    ).split(',')
    if origine.strip()
]

# Même chose, en expressions régulières, pour les adresses que l'on ne connaît
# pas d'avance - les prévisualisations Vercel (« https://ipm-xxxx.vercel.app »)
# en changent à chaque branche. Ex. : ^https://ipm-[a-z0-9-]+\.vercel\.app$
CORS_ALLOWED_ORIGIN_REGEXES = [
    motif.strip()
    for motif in os.getenv('DJANGO_CORS_ORIGIN_REGEXES', '').split(',')
    if motif.strip()
]

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

# Versions compressées (gzip, brotli) des statiques, produites par
# collectstatic et servies par WhiteNoise. Pas de « Manifest » : la console
# d'administration ne référence rien que collectstatic ne rassemble, et un
# fichier manquant ne doit pas faire tomber le démarrage.
STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedStaticFilesStorage'},
}

# ---------------------------------------------------------------------------
# Journaux
# ---------------------------------------------------------------------------
# Hors DEBUG, Django n'écrit nulle part la trace d'une erreur 500 (il la
# réserve à un courriel aux ADMINS, qu'on n'a pas) : sur Render, on ne voyait
# que la ligne d'accès de gunicorn. Les erreurs de requête vont donc sur la
# sortie d'erreur, que Render (et le service IIS) journalisent.
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {'simple': {'format': '%(levelname)s %(name)s : %(message)s'}},
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'simple',
        },
    },
    'loggers': {
        'django.request': {'handlers': ['console'], 'level': 'ERROR', 'propagate': False},
        'django.security': {'handlers': ['console'], 'level': 'ERROR', 'propagate': False},
    },
}

# ---------------------------------------------------------------------------
# Caches
# ---------------------------------------------------------------------------
# « default » : limitation de débit de l'identification mobile. « pdf » : les
# documents imprimés déjà fabriqués (documents/cache_pdf.py), une soixantaine
# au plus par processus (~25 Mo), pour tenir dans la mémoire d'un petit serveur.
CACHES = {
    'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'},
    'pdf': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'ipm-pdf',
        'OPTIONS': {'MAX_ENTRIES': 60},
    },
}

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
