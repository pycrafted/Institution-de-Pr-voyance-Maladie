# -*- coding: utf-8 -*-
"""
Reprend l'identité RÉELLE de l'IPM (``infos_ipm`` de LAMPS).

Une seule ligne, mais c'est celle qui s'imprime en tête des bons et des
lettres : « IPM DE LA SAR », Zone Industrielle, les téléphones, la boîte
postale, l'adresse électronique et la personne à contacter. Notre fiche
Paramètres était restée vide depuis sa création.

    DB_NAME=vrai_base python manage.py importer_informations_ipm

Ce qui n'est pas repris : le LOGO (LAMPS n'en tient pas), les coordonnées
GPS (idem - elles sont à nous), et les quatre compteurs ``nb_*`` de
l'origine, qui sont des totaux recalculables et non des réglages.
"""

from django.core.management.base import BaseCommand

from donnees_de_base.lamps import ajouter_arguments, lire, texte
from parametres.models import InformationsIPM

INFOS = """
    select intitule, adresse, tel_fixe, fax, boite_postal, email,
           contact, tel_contact, email_contact
    from infos_ipm
    limit 1
"""


class Command(BaseCommand):
    help = "Reprend l'identité réelle de l'IPM depuis LAMPS."

    def add_arguments(self, parser):
        ajouter_arguments(parser)

    def handle(self, *args, **options):
        lignes = lire(options, INFOS)
        if not lignes:
            self.stdout.write(self.style.WARNING('Aucune ligne dans infos_ipm : rien à reprendre.'))
            return

        intitule, adresse, tel, fax, bp, email, contact, tel_contact, email_contact = lignes[0]
        fiche = InformationsIPM.objects.first() or InformationsIPM()
        fiche.intitule = texte(intitule, 150)
        fiche.adresse = texte(adresse, 255)
        fiche.telephone = texte(tel, 30)
        fiche.fax = texte(fax, 30)
        fiche.boite_postale = texte(bp, 30)
        fiche.email = texte(email, 254)
        fiche.contact_nom = texte(contact, 120)
        fiche.contact_telephone = texte(tel_contact, 30)
        fiche.contact_email = texte(email_contact, 254)
        fiche.save()

        self.stdout.write(f'Informations IPM reprises : {fiche.intitule or "(sans intitulé)"}')
