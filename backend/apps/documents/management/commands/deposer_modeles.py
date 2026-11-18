"""
Dépose en base les gabarits PDF officiels posés sur le disque.

À lancer sur un serveur qui a les fichiers (celui de l'IPM) pour que les
serveurs qui ne les ont pas (un hébergeur dont le conteneur est reconstruit à
chaque déploiement) puissent imprimer : les deux lisent la même base.

    python manage.py deposer_modeles
    python manage.py deposer_modeles --dossier C:\\chemin\\vers\\les\\modeles
    python manage.py deposer_modeles --etat      (ne dépose rien, montre l'état)
"""

from pathlib import Path

from django.core.cache import caches
from django.core.management.base import BaseCommand, CommandError

from documents.models import ModelePdf
from documents.modeles import DOSSIER_MODELES
from documents.views.modele_pdf import NOMS_ATTENDUS


class Command(BaseCommand):
    help = 'Dépose en base les gabarits PDF officiels (bon de pharmacie, optique, lettre de garantie).'

    def add_arguments(self, parseur):
        parseur.add_argument(
            '--dossier',
            help=f'Dossier contenant les gabarits (défaut : {DOSSIER_MODELES}).',
        )
        parseur.add_argument(
            '--etat', action='store_true',
            help='Montre ce qui est déposé en base, sans rien écrire.',
        )

    def handle(self, *args, **options):
        if options['etat']:
            self._etat()
            return

        dossier = Path(options['dossier']) if options['dossier'] else DOSSIER_MODELES
        if not dossier.is_dir():
            raise CommandError(f'Dossier introuvable : {dossier}')

        deposes = 0
        for nom in NOMS_ATTENDUS:
            source = dossier / nom
            if not source.is_file():
                self.stdout.write(self.style.WARNING(f'  absent du disque  {nom}'))
                continue
            octets = source.read_bytes()
            if not octets.startswith(b'%PDF-'):
                raise CommandError(f"{source} n'est pas un PDF (en-tête « %PDF- » absent).")
            enregistrement = ModelePdf.deposer(nom, octets)
            deposes += 1
            self.stdout.write(self.style.SUCCESS(
                f'  déposé            {nom}  {enregistrement.taille} octets  '
                f'{enregistrement.empreinte[:12]}'
            ))

        if deposes:
            # Les PDF déjà fabriqués l'ont été avec l'ancien gabarit.
            caches['pdf'].clear()
        self.stdout.write(f'\n{deposes} gabarit(s) sur {len(NOMS_ATTENDUS)} déposé(s) depuis {dossier}.')

    def _etat(self):
        en_base = {m.nom: m for m in ModelePdf.objects.all()}
        for nom in NOMS_ATTENDUS:
            enregistrement = en_base.get(nom)
            sur_disque = 'oui' if (DOSSIER_MODELES / nom).is_file() else 'non'
            if enregistrement is None:
                self.stdout.write(f'  {nom:24} disque: {sur_disque:3}  base: absent')
            else:
                self.stdout.write(
                    f'  {nom:24} disque: {sur_disque:3}  base: {enregistrement.taille} octets, '
                    f'déposé le {enregistrement.depose_le:%d/%m/%Y à %H:%M}'
                )
