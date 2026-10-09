"""
Fournisseur « FOURNISSEURS DIVERS SOINS » (99999), comme l'application
d'origine : le prestataire fourre-tout qu'un bon désigne quand la pharmacie
n'est pas conventionnée. Classé en PHARMACIES, puisque c'est comme pharmacie
que les bons l'emploient.
"""

from django.db import migrations

CODE = '99999'


def creer(apps, schema_editor):
    FournisseurDeSoins = apps.get_model('donnees_de_base', 'FournisseurDeSoins')
    Specialite = apps.get_model('donnees_de_base', 'Specialite')
    if FournisseurDeSoins.objects.filter(code=CODE).exists():
        return
    FournisseurDeSoins.objects.create(
        code=CODE,
        libelle='FOURNISSEURS DIVERS SOINS',
        specialite=Specialite.objects.filter(code='06').first(),
    )


def retirer(apps, schema_editor):
    FournisseurDeSoins = apps.get_model('donnees_de_base', 'FournisseurDeSoins')
    FournisseurDeSoins.objects.filter(code=CODE).delete()


class Migration(migrations.Migration):
    dependencies = [
        ('donnees_de_base', '0011_champs_facultatifs'),
    ]

    operations = [migrations.RunPython(creer, retirer)]
