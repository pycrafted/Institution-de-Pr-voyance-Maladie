"""
Alignement sur l'application d'origine, qui fait foi :

  - le type d'un bénéficiaire devient un lien vers le référentiel « Types de
    bénéficiaire » des données de base (son libellé y est retrouvé) ;
  - le matricule d'un participant passe à quatre chiffres : « SAR01204 »
    devient « 1204 » ;
  - le matricule d'un bénéficiaire est recomposé : société, matricule du
    participant, code du type et rang dans le type (« 01-1204-21 »).
"""

import re

import django.db.models.deletion
from django.db import migrations, models


def vers_origine(apps, schema_editor):
    Participant = apps.get_model('participants', 'Participant')
    Beneficiaire = apps.get_model('participants', 'Beneficiaire')
    TypeBeneficiaire = apps.get_model('donnees_de_base', 'TypeBeneficiaire')
    types = {t.libelle: t for t in TypeBeneficiaire.objects.all()}

    for participant in Participant.objects.all():
        ancien = re.fullmatch(r'SAR(\d+)', participant.matricule)
        if ancien:
            participant.matricule = ancien.group(1)[-4:].zfill(4)
            participant.save(update_fields=['matricule'])

    for beneficiaire in Beneficiaire.objects.all():
        beneficiaire.type_beneficiaire = types.get(beneficiaire.type_benef)
        beneficiaire.save(update_fields=['type_beneficiaire'])

    rangs = {}
    lignes = Beneficiaire.objects.select_related(
        'participant__adherent', 'type_beneficiaire'
    ).order_by('participant_id', 'id')
    for beneficiaire in lignes:
        cle = (beneficiaire.participant_id, beneficiaire.type_beneficiaire_id)
        rangs[cle] = rangs.get(cle, 0) + 1
        participant = beneficiaire.participant
        societe = participant.adherent.code if participant.adherent_id else '00'
        code_type = beneficiaire.type_beneficiaire.code if beneficiaire.type_beneficiaire else '0'
        beneficiaire.matricule_benef = f'{societe}-{participant.matricule}-{code_type}{rangs[cle]}'
        beneficiaire.save(update_fields=['matricule_benef'])


class Migration(migrations.Migration):
    dependencies = [
        ('participants', '0001_initial'),
        ('donnees_de_base', '0011_champs_facultatifs'),
    ]

    operations = [
        migrations.AddField(
            model_name='beneficiaire',
            name='type_beneficiaire',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='+',
                to='donnees_de_base.typebeneficiaire',
            ),
        ),
        migrations.RunPython(vers_origine, migrations.RunPython.noop),
        migrations.RemoveField(model_name='beneficiaire', name='type_benef'),
        migrations.RenameField(
            model_name='beneficiaire', old_name='type_beneficiaire', new_name='type_benef'
        ),
        migrations.AlterField(
            model_name='beneficiaire',
            name='type_benef',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='beneficiaires',
                to='donnees_de_base.typebeneficiaire',
                verbose_name='Type',
            ),
        ),
    ]
