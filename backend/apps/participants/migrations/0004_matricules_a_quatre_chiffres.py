"""
Matricules de participants sur quatre chiffres, comme l'application d'origine.

Celle-ci les écrit « 0781 », « 0949 » - quatre chiffres, zéros de tête
compris - et les montre après le code de la société sur les documents
(« 02-0949 »). Le matricule du bénéficiaire s'en déduit : « 02-0949-21 ».

Une fiche saisie à la main avait échappé à la règle (« 949 »), et ses quatre
bénéficiaires avec elle (« 01-949-21 »). Deux formats se seraient croisés le
jour de la reprise des matricules réels : « 0949 » et « 949 » auraient été
deux salariés différents, et le tri aurait mélangé les séries.

La renumérotation ne touche qu'à la forme, pas à l'identité : les documents
déjà émis désignent le participant et ses bénéficiaires par leur clé, pas par
leur matricule. Côté mobile, l'employé qui tape « 949 » entre toujours : la
vue d'identification complète de zéros ce qu'elle reçoit.
"""

from django.db import migrations


def sur_quatre_chiffres(matricule):
    """« 949 » → « 0949 » ; le reste inchangé."""
    return f'{int(matricule):04d}' if matricule.isdigit() and len(matricule) < 4 else matricule


def sur_trois_chiffres(matricule):
    return (
        f'{int(matricule):03d}'
        if matricule.isdigit() and len(matricule) == 4 and matricule.startswith('0')
        else matricule
    )


def renumeroter(apps, transformer):
    Participant = apps.get_model('participants', 'Participant')
    Beneficiaire = apps.get_model('participants', 'Beneficiaire')
    for participant in Participant.objects.all():
        nouveau = transformer(participant.matricule or '')
        if nouveau == participant.matricule:
            continue
        ancien, participant.matricule = participant.matricule, nouveau
        participant.save(update_fields=['matricule'])
        # Le matricule du bénéficiaire porte celui du participant en son
        # milieu (« 01-949-21 ») : il suit le même mouvement.
        for beneficiaire in Beneficiaire.objects.filter(participant=participant):
            societe, _, reste = beneficiaire.matricule_benef.partition(f'-{ancien}-')
            if reste:
                beneficiaire.matricule_benef = f'{societe}-{nouveau}-{reste}'
                beneficiaire.save(update_fields=['matricule_benef'])


def avancer(apps, _schema_editor):
    renumeroter(apps, sur_quatre_chiffres)


def reculer(apps, _schema_editor):
    renumeroter(apps, sur_trois_chiffres)


class Migration(migrations.Migration):
    dependencies = [('participants', '0003_mot_de_passe_mobile')]

    operations = [migrations.RunPython(avancer, reculer)]
