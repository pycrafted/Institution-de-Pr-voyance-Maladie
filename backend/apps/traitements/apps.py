from django.apps import AppConfig


class TraitementsConfig(AppConfig):
    """Module « Traitements » : les factures des prestataires et leur liquidation."""

    default_auto_field = 'django.db.models.BigAutoField'
    name = 'traitements'
    verbose_name = 'Traitements'
