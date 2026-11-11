"""
Tout participant ouvre son compte mobile : mot de passe « 0000 » par défaut.

Jusqu'ici, une fiche créée n'avait pas de mot de passe mobile, et la PWA la
refusait donc faute d'identifiant. Désormais la création en pose un d'office
(cf. ParticipantSerializer.create) ; cette migration rattrape les fiches déjà
en base qui n'en ont aucun, pour qu'elles puissent se connecter avec « 0000 ».

On ne touche pas aux fiches qui ont déjà un mot de passe : un employé a pu le
changer, on ne le réinitialise pas.

Retour en arrière : on ne vide pas les mots de passe posés ici (rien ne les
distingue d'un mot de passe choisi) ; l'opération inverse ne fait rien.
"""

from django.contrib.auth.hashers import make_password
from django.db import migrations

# Même valeur que participants.models.participant.MOT_DE_PASSE_MOBILE_DEFAUT ;
# recopiée ici car une migration ne doit pas dépendre du code courant.
MOT_DE_PASSE_DEFAUT = '0000'


def poser_mot_de_passe_defaut(apps, schema_editor):
    Participant = apps.get_model('participants', 'Participant')
    chiffre = make_password(MOT_DE_PASSE_DEFAUT)
    Participant.objects.filter(mot_de_passe='').update(mot_de_passe=chiffre)


class Migration(migrations.Migration):
    dependencies = [('participants', '0008_alter_participant_departement_and_more')]

    operations = [
        migrations.RunPython(poser_mot_de_passe_defaut, migrations.RunPython.noop),
    ]
