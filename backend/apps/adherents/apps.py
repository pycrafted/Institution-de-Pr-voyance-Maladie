from django.apps import AppConfig


class AdherentsConfig(AppConfig):
    """Module « Adhérents » : les collectivités qui cotisent à l'IPM."""

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'adherents'
    verbose_name = 'Adhérents'
