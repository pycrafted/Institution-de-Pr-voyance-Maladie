from django.apps import AppConfig


class MobileConfig(AppConfig):
    """
    Module « Mobile » : l'API de l'application IPM Mobile (pwa/), où
    l'employé émet lui-même ses bons de pharmacie. Aucun modèle : il lit et
    écrit ceux des autres modules.
    """

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'mobile'
    verbose_name = 'Mobile'
