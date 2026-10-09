"""
Le barème ne garde que les natures de prestation en service.

Le référentiel portait deux fois « VISITE » - « 00 » et « 30 » -, et le
doublon a été désactivé lors du rapprochement des données de base. Ses taux,
eux, sont restés : vingt-quatre lignes par-dessous, une par société et par
qualité de bénéficiaire, que plus aucun écran ne montre puisque les listes ne
proposent que les natures actives.

Elles ne sont pas inoffensives. Le jour où la nature est réactivée - ou
reprise par une importation -, deux barèmes concurrents répondent pour les
mêmes soins, et rien ne dit lequel s'applique.

Le barème doit rester complet pour les natures en service ; il n'a rien à dire
de celles qui n'en sont plus. Ces lignes disparaissent donc, et l'opération ne
se défait pas : la valeur qu'elles portaient était celle du doublon, pas une
décision propre.
"""

from django.db import migrations


def oublier_les_natures_hors_service(apps, _schema_editor):
    TauxPriseEnCharge = apps.get_model('parametres', 'TauxPriseEnCharge')
    TauxExceptionnel = apps.get_model('parametres', 'TauxExceptionnel')
    for modele in (TauxPriseEnCharge, TauxExceptionnel):
        modele.objects.filter(prestation__actif=False).delete()


class Migration(migrations.Migration):
    dependencies = [
        ('parametres', '0001_initial'),
        ('donnees_de_base', '0015_numeros_a_quatre_chiffres'),
    ]

    operations = [
        migrations.RunPython(oublier_les_natures_hors_service, migrations.RunPython.noop),
    ]
