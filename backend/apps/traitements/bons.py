"""
Les bons « en instance » d'une facture.

Un bon/lettre est en instance pour une facture quand il a été émis **pour le
prestataire** de cette facture (sa pharmacie / prestataire / fournisseur / son
opticien), **dans la même société**, et qu'il n'a **pas encore été traité**. Les
bons vivent dans l'app ``documents``, en quatre modèles distincts : on les
rassemble ici sous une forme commune pour la liste « bons en instance »
(capture 38) et pour le rattachement.
"""

from documents.models import BonOptique, BonPharmacie, LettreGarantie, LettreHospitalisation

from .models import (
    TYPE_BON_OPTIQUE,
    TYPE_BON_PHARMACIE,
    TYPE_LETTRE_GARANTIE,
    TYPE_LG_HOSPITALISATION,
)

# type de document → (modèle, attribut portant le prestataire).
_DOCUMENTS = {
    TYPE_BON_PHARMACIE: (BonPharmacie, 'pharmacie'),
    TYPE_LETTRE_GARANTIE: (LettreGarantie, 'prestataire'),
    TYPE_LG_HOSPITALISATION: (LettreHospitalisation, 'prestataire'),
    TYPE_BON_OPTIQUE: (BonOptique, 'fournisseur'),
}


def modele_de(type_document):
    paire = _DOCUMENTS.get(type_document)
    return paire[0] if paire else None


def _montant_lignes(lignes):
    """Somme des quantités × tarifs d'une liste d'actes/médicaments."""
    total = 0
    for ligne in lignes or []:
        try:
            total += int(ligne.get('quantite') or 0) * int(ligne.get('tarif') or 0)
        except (TypeError, ValueError, AttributeError):
            continue
    return total


def montant_bon(bon, type_document):
    """
    Montant proposé du bon (le frais réel de départ) : la somme de ses actes /
    médicaments. Pour la pharmacie, les tarifs de référence peuvent valoir 0 -
    le montant se précise alors à la liquidation.
    """
    if type_document == TYPE_BON_PHARMACIE:
        return _montant_lignes(bon.medicaments)
    if type_document == TYPE_LG_HOSPITALISATION:
        return max(0, _montant_lignes(bon.actes) - int(bon.remise or 0))
    if type_document == TYPE_BON_OPTIQUE:
        return bon.montant_net
    # Lettre de garantie.
    return _montant_lignes(bon.actes)


def infos_bon(bon, type_document):
    """Forme commune d'un bon pour la liste et l'instantané de liquidation."""
    _, attr_presta = _DOCUMENTS[type_document]
    prestataire = getattr(bon, attr_presta, None)
    participant = bon.participant
    beneficiaire = bon.beneficiaire
    nom_benef = ''
    if beneficiaire is not None:
        nom_benef = beneficiaire.nom_complet
    elif participant is not None:
        nom_benef = participant.nom_complet
    code_soc = bon.adherent.code if bon.adherent_id else ''
    matricule = participant.matricule if participant else ''
    return {
        'typeDocument': type_document,
        'id': bon.id,
        'numero': bon.code,
        'date': bon.date,
        'codeSoc': code_soc,
        'matriculePart': f'{code_soc}-{matricule}' if (code_soc and matricule) else matricule,
        'participant': participant.nom_complet if participant else '',
        'typeBenef': bon.type_benef.code if bon.type_benef_id else '',
        'beneficiaire': nom_benef,
        'prestataire': prestataire.code if prestataire else '',
        'montant': montant_bon(bon, type_document),
    }


def bons_en_instance(facture):
    """Bons/lettres émis pour le prestataire de la facture, non encore traités."""
    code_presta = facture.fournisseur_code
    if not code_presta:
        return []
    code_soc = facture.adherent.code if facture.adherent_id else None
    resultat = []
    for type_document, (modele, attr_presta) in _DOCUMENTS.items():
        requete = modele.objects.filter(
            traite=False, actif=True, **{f'{attr_presta}__code': code_presta}
        )
        if code_soc:
            requete = requete.filter(adherent__code=code_soc)
        requete = requete.select_related(
            'adherent', 'participant', 'beneficiaire', 'type_benef', attr_presta
        )
        resultat.extend(infos_bon(bon, type_document) for bon in requete)
    # Le plus récent en haut, comme la liste d'origine.
    resultat.sort(key=lambda b: b['numero'], reverse=True)
    return resultat


def charger_bon(type_document, document_id):
    """Le bon désigné par son type et son identifiant, ou None."""
    modele = modele_de(type_document)
    if modele is None:
        return None
    return (
        modele.objects.select_related(
            'adherent', 'participant', 'beneficiaire', 'type_benef'
        )
        .filter(id=document_id)
        .first()
    )
