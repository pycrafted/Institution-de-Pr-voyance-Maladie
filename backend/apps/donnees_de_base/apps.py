from django.apps import AppConfig


class DonneesDeBaseConfig(AppConfig):
    """Module « Données de base » : tous les référentiels de l'application."""

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'donnees_de_base'
    verbose_name = 'Données de base'
