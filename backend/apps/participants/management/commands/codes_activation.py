"""
Codes d'activation de l'application mobile, en nombre (lancement du vrai mot
de passe) : un code par employé dont le dossier est actif et qui n'a pas
encore choisi son mot de passe, écrits dans un fichier CSV à distribuer.

    python manage.py codes_activation --csv codes.csv
    python manage.py codes_activation --csv codes.csv --matricules 0949 1100
    python manage.py codes_activation --csv codes.csv --tous   # même déjà activés

Le fichier contient des codes EN CLAIR : à remettre en main propre, puis à
détruire. Chaque nouveau code remplace le précédent de l'employé.
"""



from csv import writer as csv_writer

from django.core.management.base import BaseCommand, CommandError

from mobile.views import _le_dossier_courant
from participants.models import Participant


class Command(BaseCommand):
    help = "Génère les codes d'activation de l'application mobile dans un fichier CSV."

    def add_arguments(self, parser):
        parser.add_argument('--csv', required=True, help='Fichier CSV à écrire.')
        parser.add_argument('--matricules', nargs='*', help='Seulement ces matricules.')
        parser.add_argument(
            '--tous', action='store_true', help='Aussi ceux qui ont déjà choisi leur mot de passe.'
        )

    def handle(self, *args, csv: str, matricules=None, tous=False, **options):
        dossiers = Participant.objects.select_related('adherent').filter(actif=True, etat='Actif')
        if matricules:
            dossiers = dossiers.filter(matricule__in=[m.zfill(4) for m in matricules])
        # Un agent, un code : sur le dossier qu'ouvre l'identification.
        par_matricule = {}
        for dossier in dossiers:
            par_matricule.setdefault(dossier.matricule, []).append(dossier)
        if not par_matricule:
            raise CommandError('Aucun dossier actif ne correspond.')

        ecrits = 0
        with open(csv, 'w', newline='', encoding='utf-8-sig') as fichier:
            sortie = csv_writer(fichier, delimiter=';')
            sortie.writerow(['Matricule', 'Société', 'Nom', 'Prénoms', 'Code', 'Valable jusqu’au'])
            for matricule in sorted(par_matricule):
                participant = _le_dossier_courant(par_matricule[matricule])
                if participant.mot_de_passe_choisi and not tous:
                    continue
                code = participant.generer_code_activation()
                sortie.writerow([
                    participant.matricule,
                    participant.adherent.code if participant.adherent_id else '',
                    participant.nom,
                    participant.prenoms,
                    code,
                    participant.code_activation_expire.strftime('%d/%m/%Y %H:%M'),
                ])
                ecrits += 1
        self.stdout.write(self.style.SUCCESS(f'{ecrits} code(s) écrit(s) dans {csv}.'))
