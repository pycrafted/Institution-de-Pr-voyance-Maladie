"""
Régime mutuelle : code « MSS » au lieu de « CMM », comme l'application
d'origine. Le libellé affiché reste « CMM ».

Les adhérents déjà enregistrés sous « CMM » sont convertis. La migration se
défait : revenir en arrière rend « CMM » aux mêmes lignes.
"""

from django.db import migrations, models


def cmm_vers_mss(apps, schema_editor):
    Adherent = apps.get_model('adherents', 'Adherent')
    Adherent.objects.filter(type='CMM').update(type='MSS')


def mss_vers_cmm(apps, schema_editor):
    Adherent = apps.get_model('adherents', 'Adherent')
    Adherent.objects.filter(type='MSS').update(type='CMM')


class Migration(migrations.Migration):
    dependencies = [
        ('adherents', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='adherent',
            name='type',
            field=models.CharField(
                choices=[('IPM', 'IPM'), ('MSS', 'CMM')], max_length=3, verbose_name='Régime'
            ),
        ),
        migrations.RunPython(cmm_vers_mss, mss_vers_cmm),
    ]
