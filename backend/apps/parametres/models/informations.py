"""
Informations générales de l'IPM.

Onglet « Informations Générales IPM » de l'écran Paramètres : l'identité de la
caisse - intitulé, adresse, téléphone, fax, boîte postale, courriel -, la
personne à contacter, le logo, et le point qui situe la caisse sur le plan.

Une seule fiche : `actuelles()` la crée au premier appel.
"""

from django.db import models


class InformationsIPM(models.Model):
    intitule = models.CharField('Intitulé', max_length=150, blank=True)
    adresse = models.CharField('Adresse', max_length=255, blank=True)
    telephone = models.CharField('Téléphone fixe', max_length=30, blank=True)
    fax = models.CharField('Fax', max_length=30, blank=True)
    boite_postale = models.CharField('Boîte postale', max_length=30, blank=True)
    email = models.EmailField('Email', blank=True)

    contact_nom = models.CharField('Contact', max_length=120, blank=True)
    contact_telephone = models.CharField('Téléphone du contact', max_length=30, blank=True)
    contact_email = models.EmailField('Email du contact', blank=True)

    # Logo en URL de données, comme la photo d'un participant.
    logo = models.TextField('Logo', blank=True)

    # Le point du plan, comme sur la fiche d'un fournisseur de soins.
    latitude = models.CharField('Latitude', max_length=20, blank=True)
    longitude = models.CharField('Longitude', max_length=20, blank=True)

    modifie_le = models.DateTimeField('Modifié le', auto_now=True)

    class Meta:
        verbose_name = "Informations générales de l'IPM"
        verbose_name_plural = "Informations générales de l'IPM"

    def __str__(self):
        return self.intitule or "Informations générales de l'IPM"

    @classmethod
    def actuelles(cls):
        """La fiche unique ; elle naît vide au premier appel."""
        fiche, _ = cls.objects.get_or_create(pk=1)
        return fiche
