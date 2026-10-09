"""
Retire le type de bénéficiaire « AUTRES », en trop.

L'application d'origine ne connaît que six liens de parenté :
« 1 PARTICIPANT, 2 EPOUSE, 3 ENFANT, 4 EPOUX, 5 ASCENDANT, 6 AUTRE » - vérifié
sur sa table `typebenef`. Nos données de base en portaient un septième,
« 7 AUTRES », doublon d'« AUTRE » hérité d'un ancien jeu de départ ; le seed
actuel ne le crée plus, mais la ligne subsistait en base.

Elle n'est portée par aucun bénéficiaire : on la retire. La suppression ne se
fait que si elle est bien inutilisée - sinon on la laisse, pour qu'aucune fiche
ne retombe sur un type disparu (la règle habituelle : on ne casse pas une
référence déjà employée).
"""

from django.db import migrations

CANONIQUES = {'PARTICIPANT', 'EPOUSE', 'ENFANT', 'EPOUX', 'ASCENDANT', 'AUTRE'}


def retirer_autres(apps, _schema_editor):
    TypeBeneficiaire = apps.get_model('donnees_de_base', 'TypeBeneficiaire')
    Beneficiaire = apps.get_model('participants', 'Beneficiaire')
    for type_benef in TypeBeneficiaire.objects.exclude(libelle__in=CANONIQUES):
        if not Beneficiaire.objects.filter(type_benef=type_benef).exists():
            type_benef.delete()


class Migration(migrations.Migration):
    dependencies = [
        ('donnees_de_base', '0015_numeros_a_quatre_chiffres'),
        ('participants', '0005_regime_retraites'),
    ]

    operations = [migrations.RunPython(retirer_autres, migrations.RunPython.noop)]
