"""
Numéros de prestataires sur quatre chiffres, comme l'application d'origine.

Celle-ci les écrit « 0001 », « 0817 », « 0826 » - quatre chiffres, zéros de
tête compris. Le nouveau projet les avait engendrés sur trois (« 001 »), et
son fourre-tout sur cinq (« 99999 »). Deux formats se seraient croisés le jour
de la reprise des 411 fiches réelles : « 0817 » et « 817 » auraient été deux
fiches différentes pour un même prestataire, et le tri aurait mélangé les
séries.

La renumérotation ne touche qu'à la forme : « 001 » devient « 0001 », la même
fiche, le même rang. Les documents déjà émis ne s'en aperçoivent pas - ils
désignent le prestataire par sa clé et non par son code.

Les demandes d'agrément partagent la série des fournisseurs : elles sont
renumérotées du même mouvement, sans quoi une demande validée redonnerait un
numéro déjà pris.
"""

from django.db import migrations

ANCIEN_FOURRE_TOUT = '99999'
NOUVEAU_FOURRE_TOUT = '9999'


def sur_quatre_chiffres(code):
    """« 001 » → « 0001 » ; « 99999 » → « 9999 » ; le reste inchangé."""
    if code == ANCIEN_FOURRE_TOUT:
        return NOUVEAU_FOURRE_TOUT
    if code.isdigit() and len(code) < 4:
        return f'{int(code):04d}'
    return code


def sur_trois_chiffres(code):
    if code == NOUVEAU_FOURRE_TOUT:
        return ANCIEN_FOURRE_TOUT
    if code.isdigit() and len(code) == 4:
        return f'{int(code):03d}'
    return code


def renumeroter(apps, _schema_editor, transformer):
    for nom in ('FournisseurDeSoins', 'DemandeAgrement'):
        modele = apps.get_model('donnees_de_base', nom)
        for fiche in modele.objects.all():
            nouveau = transformer(fiche.code or '')
            if nouveau != fiche.code:
                fiche.code = nouveau
                fiche.save(update_fields=['code'])


def avancer(apps, schema_editor):
    renumeroter(apps, schema_editor, sur_quatre_chiffres)


def reculer(apps, schema_editor):
    renumeroter(apps, schema_editor, sur_trois_chiffres)


class Migration(migrations.Migration):
    dependencies = [('donnees_de_base', '0014_compte_du_fournisseur')]

    operations = [migrations.RunPython(avancer, reculer)]
