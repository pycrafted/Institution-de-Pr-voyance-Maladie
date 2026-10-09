"""
Fournisseurs et demandes d'agrément passent à une même série de numéros : une
demande porte le numéro que prendra le fournisseur qu'elle fera naître.

Reprise des demandes existantes, numérotées jusqu'ici à part (« DA0001 ») :
  - une demande qui a fait naître un fournisseur prend son numéro ;
  - une demande en attente prend la suite de la série, dans l'ordre de dépôt ;
  - une demande validée dont le fournisseur a depuis été supprimé garde son
    ancien numéro : elle n'est plus qu'une archive, et lui donner un numéro de
    la série y ouvrirait un trou.
"""

from django.db import migrations


def aligner_numeros(apps, schema_editor):
    Demande = apps.get_model('donnees_de_base', 'DemandeAgrement')
    Fournisseur = apps.get_model('donnees_de_base', 'FournisseurDeSoins')

    for demande in Demande.objects.exclude(fournisseur=None).select_related('fournisseur'):
        if demande.code != demande.fournisseur.code:
            demande.code = demande.fournisseur.code
            demande.save(update_fields=['code'])

    def prochain():
        codes = list(Fournisseur.objects.values_list('code', flat=True))
        codes += list(Demande.objects.values_list('code', flat=True))
        return f'{max((int(c) for c in codes if c.isdigit()), default=0) + 1:03d}'

    for demande in Demande.objects.filter(statut='en_attente').order_by('cree_le', 'pk'):
        demande.code = prochain()
        demande.save(update_fields=['code'])


class Migration(migrations.Migration):
    dependencies = [
        ('donnees_de_base', '0009_demandeagrement_carte_autorite_and_more'),
    ]

    # Retour arrière sans effet : les numéros repris restent valides.
    operations = [migrations.RunPython(aligner_numeros, migrations.RunPython.noop)]
