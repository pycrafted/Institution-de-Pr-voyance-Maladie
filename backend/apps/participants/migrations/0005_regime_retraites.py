"""
« Retraité » se lit sur la société, et non plus sur une case à part.

L'IPM couvre les salariés en activité ; à leur départ, les anciens salariés
de la SAR passent aux deux mutuelles - « CMM CR-SAR » et « CMM NCR-SAR »,
régime MSS. Le régime de l'adhérent dit donc à lui seul de quelle liste
relève un participant.

La case « retraite » posée à côté disait autre chose : rien ne l'obligeait à
s'accorder avec la société, aucun écran ne la montrait ni ne la remplissait,
et la donnée de démonstration la tirait au sort. L'onglet « Participants
Retraités » listait ainsi huit salariés en activité et aucun des onze
mutualistes. Elle disparaît ; `Participant.retraite` la remplace, déduite de
l'adhérent, et les deux listes ne peuvent plus se contredire.

Rien à reprendre au retour en arrière : la colonne renaît vide, et la valeur
se relit du régime.
"""

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [('participants', '0004_matricules_a_quatre_chiffres')]

    operations = [
        migrations.RemoveField(model_name='participant', name='retraite'),
    ]
