from django.apps import AppConfig


class AuthentificationConfig(AppConfig):
    """Module « Authentification » : les sessions par jeton de l'API IPM."""

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'authentification'
    verbose_name = 'Authentification'
