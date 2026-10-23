"""
Représentations de l'application mobile, et saisie d'un nouveau document :
bon de pharmacie ou lettre de garantie.

Le mobile ne manie pas les écrans d'IPM : il reçoit des objets prêts à
afficher (noms, âges, statut du bon déjà calculés), en camelCase comme le
reste de l'API. Rien ici n'écrit en base : la création du bon passe par
``BonPharmacieSerializer``, pour suivre exactement les règles d'IPM (cf.
views.BonsView).
"""

from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

from donnees_de_base.models import FournisseurDeSoins, Specialite, TypeBeneficiaire, TypePrestation
from donnees_de_base.models.fournisseur_de_soins import CODE_FOURNISSEURS_DIVERS
from participants.models import Beneficiaire
from participants.serializers.participant import TYPE_PARTICIPANT

# Libellés des spécialités tenues à part dans le référentiel : les
# pharmacies, où l'on retire les médicaments, et l'optique, qui a son propre
# bon. Ni l'une ni l'autre ne prescrit une ordonnance de pharmacie.
PHARMACIES = 'PHARMACIES'
OPTIQUE = 'OPTIQUE MEDICALE'

# Un bon se présente en pharmacie dans les trente jours de son émission ;
# l'ordonnance qu'il accompagne ne doit pas avoir plus de trente jours non plus.
VALIDITE_BON = timedelta(days=30)
ANCIENNETE_MAX_ORDONNANCE = timedelta(days=30)

# Le bon imprimé compte huit lignes de médicaments.
ARTICLES_MAX = 8

# Une lettre de garantie se présente au prestataire dans les trente jours,
# comme un bon ; la prescription qu'elle couvre ne doit pas être plus ancienne.
VALIDITE_LETTRE = VALIDITE_BON
ANCIENNETE_MAX_PRESCRIPTION = ANCIENNETE_MAX_ORDONNANCE

# Natures de prestation qui ont leur propre document : la pharmacie (le bon
# de pharmacie) et l'optique (le bon d'optique). Une lettre de garantie ne
# les couvre pas.
NATURES_HORS_LETTRE = [
    'PHARMACIE',
    'OPTIQUE',
    'VERRES CORRECTEURS',
    'MONTURE OPTIQUE',
    'LENTILLES DE CONTACT',
]


def age(naissance, au=None):
    """Âge révolu, ou None si la date de naissance manque."""
    if not naissance:
        return None
    au = au or timezone.localdate()
    return au.year - naissance.year - ((au.month, au.day) < (naissance.month, naissance.day))


def matricule_affiche(participant):
    """« 01-1204 » : code de la société puis matricule, comme sur le bon imprimé."""
    if participant.adherent_id:
        return f'{participant.adherent.code}-{participant.matricule}'
    return participant.matricule


def pharmacies():
    """
    Pharmacies proposées au mobile : conventionnées (actives) et classées en
    PHARMACIES. Le fournisseur « divers soins » en est écarté : il sert à IPM
    quand une pharmacie n'est pas conventionnée, décision qui ne revient pas
    à l'employé.
    """
    return (
        FournisseurDeSoins.objects.filter(actif=True, specialite__libelle=PHARMACIES)
        .exclude(code=CODE_FOURNISSEURS_DIVERS)
        .order_by('libelle')
    )


def conventionnes():
    """
    Toutes les structures conventionnées par l'IPM, quelle que soit leur
    spécialité : pharmacies, cliniques, hôpitaux, laboratoires, cabinets…
    C'est l'annuaire de l'écran « Conventionnés » du mobile.

    Même règle que pour les pharmacies et les prescripteurs : actives, dans
    une spécialité active, sans le fournisseur « divers soins » - une ligne
    comptable d'IPM, pas une structure où l'employé peut se présenter.
    """
    return (
        FournisseurDeSoins.objects.filter(actif=True, specialite__actif=True)
        .exclude(code=CODE_FOURNISSEURS_DIVERS)
        .select_related('specialite')
        .order_by('libelle')
    )


def natures_de_prestation():
    """
    Natures de prestation proposées pour une lettre de garantie : actives,
    sans celles qui ont leur propre document. Le référentiel porte parfois
    deux fois le même libellé (« VISITE ») : seul le premier code est gardé,
    l'employé n'a pas à choisir entre deux lignes identiques.
    """
    natures, vus = [], set()
    for nature in (
        TypePrestation.objects.filter(actif=True)
        .exclude(libelle__in=NATURES_HORS_LETTRE)
        .order_by('code')
    ):
        if nature.libelle not in vus:
            vus.add(nature.libelle)
            natures.append(nature)
    return natures


def ayants_droit_servis(participant):
    """
    Ayants droit du participant pour qui un bon peut être émis : fiche active
    ET dossier « Actif », comme pour le participant lui-même
    (cf. authentification.peut_se_servir). Un enfant radié (limite d'âge…)
    garde souvent ``actif=True`` : seul l'état le dit sorti de la couverture.
    Partagé par la famille affichée (views.MoiView) et par le contrôle de la
    saisie, pour que l'une ne propose jamais ce que l'autre refuse.
    """
    return participant.beneficiaires.filter(actif=True, etat='Actif').select_related('type_benef')


def specialites_de_prescription():
    """
    Spécialités où choisir le prescripteur : actives, hors pharmacies et
    optique. Partagé par la liste (views.SpecialitesView) et par le contrôle
    de la saisie : un appel direct à l'API ne peut pas passer outre.
    """
    return Specialite.objects.filter(actif=True).exclude(libelle__in=[PHARMACIES, OPTIQUE])


def prescripteurs(specialite):
    """
    Prescripteurs proposés pour une spécialité : conventionnés (actifs), sans
    le fournisseur « divers soins », réservé aux décisions d'IPM (cf.
    pharmacies()).
    """
    return (
        FournisseurDeSoins.objects.filter(actif=True, specialite=specialite)
        .exclude(code=CODE_FOURNISSEURS_DIVERS)
        .order_by('libelle')
    )


# ---------------------------------------------------------------------------
# Lecture
# ---------------------------------------------------------------------------


def representer_participant(participant):
    societe = participant.adherent
    return {
        'matricule': participant.matricule,
        'matriculeAffiche': matricule_affiche(participant),
        'prenoms': participant.prenoms,
        'nom': participant.nom,
        'nomComplet': participant.nom_complet,
        'sexe': participant.sexe,
        'dateNaissance': participant.date_naissance.isoformat() if participant.date_naissance else None,
        'age': age(participant.date_naissance),
        'lieuNaissance': participant.lieu_naissance or None,
        'situationFamiliale': participant.situation_familiale or None,
        'societe': {'code': societe.code, 'libelle': societe.libelle} if societe else None,
        # Coordonnées telles que l'IPM les tient : l'employé les lit sur son
        # profil et sait ainsi ce qu'il doit faire corriger. Le mobile ne les
        # modifie pas : elles se changent à l'IPM.
        'telephone': participant.mobile or None,
        'email': participant.email or None,
        'adresse': participant.adresse or None,
        # État du dossier IPM (« Actif », « Suspendu »…) : c'est lui qui dit
        # si les documents peuvent être demandés.
        'etat': participant.etat or None,
        # Photo d'identité, telle que l'IPM la tient : une URL de données
        # (« data:image/jpeg;base64,… »), vide tant qu'il n'y en a pas. C'est
        # la même que montre la fiche du participant dans l'application IPM -
        # l'employé qui la change ici la change pour tout le monde.
        'photo': participant.photo or None,
    }


def _type(type_benef):
    return {'code': type_benef.code, 'libelle': type_benef.libelle} if type_benef else None


def representer_beneficiaire(personne, type_benef):
    """
    Le participant lui-même (``Participant``) ou un de ses ayants droit
    (``Beneficiaire``). Le matricule est celui qu'attend la création d'un bon.
    """
    est_participant = not isinstance(personne, Beneficiaire)
    return {
        'matricule': personne.matricule if est_participant else personne.matricule_benef,
        'nomComplet': personne.nom_complet,
        'prenoms': personne.prenoms,
        'nom': personne.nom,
        'sexe': personne.sexe,
        'age': age(personne.date_naissance),
        'type': _type(type_benef),
        'estParticipant': est_participant,
        # Photo d'identité (participant comme ayant droit), pour la carte.
        'photo': personne.photo or None,
    }


def representer_fournisseur(fournisseur):
    if fournisseur is None:
        return None
    return {
        'code': fournisseur.code,
        'libelle': fournisseur.libelle,
        'adresse': fournisseur.adresse,
        # Le fixe d'abord, comme sur le bon imprimé ; à défaut, le portable.
        'telephone': fournisseur.telephone or fournisseur.mobile,
    }


def representer_conventionne(fournisseur):
    """Un fournisseur de l'annuaire, avec sa spécialité : c'est elle qui filtre."""
    donnees = representer_fournisseur(fournisseur)
    specialite = fournisseur.specialite
    donnees['specialite'] = (
        {'code': specialite.code, 'libelle': specialite.libelle} if specialite else None
    )
    # La position, pour le bouton « S'y rendre » : le téléphone ouvre sa carte
    # et trace l'itinéraire depuis là où se trouve l'employé. Null quand l'IPM
    # ne l'a pas renseignée - le mobile se rabat alors sur l'adresse écrite.
    a_position = fournisseur.latitude is not None and fournisseur.longitude is not None
    donnees['position'] = (
        {'latitude': float(fournisseur.latitude), 'longitude': float(fournisseur.longitude)}
        if a_position
        else None
    )
    return donnees


def statut(bon, aujourdhui=None):
    """
    Où en est le bon, pour l'employé. Un bon annulé l'est quoi qu'il arrive ;
    un bon traité l'a été avant d'expirer ; sinon, seule la date compte.
    """
    aujourdhui = aujourdhui or timezone.localdate()
    if not bon.actif:
        return 'annule'
    if bon.traite:
        return 'traite'
    if aujourdhui > bon.date + VALIDITE_BON:
        return 'expire'
    return 'valide'


def _beneficiaire_du_document(document):
    participant = document.participant
    if document.beneficiaire_id:
        return {
            'matricule': document.beneficiaire.matricule_benef,
            'nomComplet': document.beneficiaire.nom_complet,
            'type': _type(document.type_benef),
        }
    if participant:
        return {
            'matricule': participant.matricule,
            'nomComplet': participant.nom_complet,
            'type': _type(document.type_benef),
        }
    return None


def _code_libelle(objet):
    return {'code': objet.code, 'libelle': objet.libelle} if objet else None


def representer_bon(bon):
    beneficiaire = _beneficiaire_du_document(bon)
    specialite = bon.specialite
    return {
        'genre': 'bon-pharmacie',
        'id': bon.id,
        'code': bon.code,
        'date': bon.date.isoformat(),
        'valableJusquAu': (bon.date + VALIDITE_BON).isoformat(),
        'statut': statut(bon),
        'beneficiaire': beneficiaire,
        'pharmacie': representer_fournisseur(bon.pharmacie),
        'prestataire': None,
        'naturePrestation': None,
        'specialite': {'code': specialite.code, 'libelle': specialite.libelle} if specialite else None,
        'prescripteur': representer_fournisseur(bon.prescripteur),
        'nbArticles': bon.nb_articles,
        'dateOrdonnance': bon.date_ordonnance.isoformat() if bon.date_ordonnance else None,
        # Même rendu que les dates-heures de DRF (ISO 8601, fuseau de Dakar).
        'creeLe': serializers.DateTimeField().to_representation(bon.cree_le),
    }


def representer_lettre(lettre):
    """
    Une lettre de garantie, sous la même forme qu'un bon : « Mes documents »
    les montre ensemble. Ce qui n'a pas de sens pour elle (la pharmacie, le
    nombre d'articles) est null ; la date de prescription tient la place de
    celle de l'ordonnance.
    """
    return {
        'genre': 'lettre-garantie',
        'id': lettre.id,
        'code': lettre.code,
        'date': lettre.date.isoformat(),
        'valableJusquAu': (lettre.date + VALIDITE_LETTRE).isoformat(),
        'statut': statut(lettre),
        'beneficiaire': _beneficiaire_du_document(lettre),
        'pharmacie': None,
        'prestataire': representer_fournisseur(lettre.prestataire),
        'naturePrestation': _code_libelle(lettre.nature_prestation),
        'specialite': _code_libelle(lettre.specialite),
        'prescripteur': representer_fournisseur(lettre.prescripteur),
        'nbArticles': None,
        'dateOrdonnance': lettre.date_prescription.isoformat() if lettre.date_prescription else None,
        'creeLe': serializers.DateTimeField().to_representation(lettre.cree_le),
    }


# ---------------------------------------------------------------------------
# Saisie
# ---------------------------------------------------------------------------


class IdentificationSerializer(serializers.Serializer):
    matricule = serializers.CharField(max_length=30, trim_whitespace=True)
    # Pas de nettoyage : un espace fait partie du mot de passe.
    mot_de_passe = serializers.CharField(max_length=128, trim_whitespace=False)


class NouveauBonSerializer(serializers.Serializer):
    """
    Ce que l'employé choisit sur son téléphone, contrôlé dans les limites du
    mobile : il ne désigne que les siens, que des pharmacies conventionnées,
    et une ordonnance récente. Les données résolues (fiches) sont rendues par
    ``validate`` ; les règles propres à tout bon restent à
    ``BonPharmacieSerializer``.
    """

    # SEUL le bénéficiaire est exigé, comme à l'écran IPM : là-bas, seuls la
    # société, le participant et le type de bénéficiaire portent l'astérisque
    # (cf. documents/serializers/commun.py, CHAMPS_REQUIS) - la pharmacie, le
    # prescripteur et l'ordonnance se renseignent plus tard, quand l'employé
    # revient avec. Le mobile ne peut pas être plus sévère que l'écran des
    # gestionnaires pour le même document.
    beneficiaire = serializers.CharField(max_length=25)
    pharmacie = serializers.CharField(max_length=10, required=False, allow_blank=True)
    specialite = serializers.CharField(max_length=2, required=False, allow_blank=True)
    prescripteur = serializers.CharField(max_length=10, required=False, allow_blank=True)
    nbArticles = serializers.IntegerField(
        required=False,
        min_value=1,
        max_value=ARTICLES_MAX,
        error_messages={
            'min_value': 'Au moins un article.',
            'max_value': f'Au plus {ARTICLES_MAX} articles : le bon n’a que {ARTICLES_MAX} lignes.',
            'invalid': 'Nombre d’articles invalide.',
        },
    )
    dateOrdonnance = serializers.DateField(
        required=False,
        allow_null=True,
        error_messages={'invalid': 'Date d’ordonnance invalide (AAAA-MM-JJ).'},
    )

    def validate_beneficiaire(self, matricule):
        return beneficiaire_de_la_famille(self.context['participant'], matricule)

    def validate_pharmacie(self, code):
        if not code:
            return None
        pharmacie = pharmacies().filter(code=code).first()
        if pharmacie is None:
            raise serializers.ValidationError('Pharmacie inconnue ou non conventionnée.')
        return pharmacie

    def validate_specialite(self, code):
        return specialite_de_prescription(code) if code else None

    def validate_dateOrdonnance(self, jour):
        aujourdhui = timezone.localdate()
        if jour > aujourdhui:
            raise serializers.ValidationError('La date de l’ordonnance ne peut pas être dans le futur.')
        if jour < aujourdhui - ANCIENNETE_MAX_ORDONNANCE:
            raise serializers.ValidationError('L’ordonnance a plus de 30 jours.')
        return jour

    def validate(self, attrs):
        # Le prescripteur se juge avec la spécialité choisie : il est contrôlé
        # ici, une fois celle-ci résolue. Les deux vont de pair - on ne peut
        # pas désigner un prescripteur sans dire de quelle spécialité, c'est
        # elle qui dit parmi qui le chercher.
        prescripteur, specialite = attrs.get('prescripteur'), attrs.get('specialite')
        if prescripteur and not specialite:
            raise serializers.ValidationError(
                {'specialite': ['Choisissez la spécialité du prescripteur.']}
            )
        attrs['prescripteur'] = (
            fournisseur_de_la_specialite(prescripteur, specialite, 'prescripteur', 'Prescripteur')
            if prescripteur
            else None
        )
        return attrs

    def donnees_ipm(self):
        """
        Le bon, dans les termes de ``BonPharmacieSerializer`` (écran IPM) :
        c'est lui qui le crée, avec ses propres contrôles de cohérence.
        """
        participant = self.context['participant']
        donnees = self.validated_data
        ipm = dict(tiers_ipm(participant, donnees['beneficiaire']))
        # Un champ laissé de côté n'est pas envoyé : l'écran IPM le laisse vide
        # lui aussi, et le gestionnaire le complétera au traitement.
        if donnees.get('pharmacie'):
            ipm['codeFournisseur'] = donnees['pharmacie'].code
        if donnees.get('specialite'):
            ipm['specialite'] = donnees['specialite'].code
        if donnees.get('prescripteur'):
            ipm['prescripteur'] = donnees['prescripteur'].code
        if donnees.get('dateOrdonnance'):
            ipm['dateOrdonnance'] = donnees['dateOrdonnance'].isoformat()
        return ipm


def beneficiaire_de_la_famille(participant, matricule):
    """Le participant lui-même, ou un de ses ayants droit servis."""
    if matricule == participant.matricule:
        return participant
    ayant_droit = ayants_droit_servis(participant).filter(matricule_benef=matricule).first()
    # Même réponse pour un inconnu, pour un ayant droit sorti de la
    # couverture et pour le bénéficiaire d'un autre : le mobile ne doit
    # rien révéler des autres familles.
    if ayant_droit is None or ayant_droit.type_benef_id is None:
        raise serializers.ValidationError('Ce bénéficiaire ne fait pas partie de votre famille.')
    return ayant_droit


def specialite_de_prescription(code):
    """
    Les mêmes spécialités que la liste du mobile : ni les pharmacies, ni
    l'optique, ni une spécialité fermée ne désignent un prescripteur ou un
    prestataire.
    """
    specialite = specialites_de_prescription().filter(code=code).first()
    if specialite is None:
        raise serializers.ValidationError('Spécialité inconnue.')
    return specialite


def fournisseur_de_la_specialite(code, specialite, champ, nom):
    """
    Un fournisseur conventionné (actif, hors « divers soins », comme dans les
    listes) de la spécialité choisie. ``nom`` : « Prescripteur »,
    « Prestataire » - pour le message, posé sous ``champ``.
    """
    fournisseur = (
        FournisseurDeSoins.objects.filter(code=code, actif=True)
        .exclude(code=CODE_FOURNISSEURS_DIVERS)
        .first()
    )
    if fournisseur is None:
        raise serializers.ValidationError({champ: [f'{nom} inconnu ou non conventionné.']})
    if fournisseur.specialite_id != specialite.id:
        raise serializers.ValidationError(
            {champ: [f'Ce {nom.lower()} n’est pas de la spécialité choisie.']}
        )
    return fournisseur


def tiers_ipm(participant, beneficiaire):
    """Société, participant et bénéficiaire, dans les termes des écrans IPM."""
    if isinstance(beneficiaire, Beneficiaire):
        type_code = beneficiaire.type_benef.code
        matricule_benef = beneficiaire.matricule_benef
    else:
        # Le participant lui-même : type PARTICIPANT, sous son matricule.
        type_code = type_participant_code()
        matricule_benef = participant.matricule
    return {
        'codeSoc': participant.adherent.code if participant.adherent_id else None,
        'matriculePart': participant.matricule,
        'typeBenef': type_code,
        'matriculeBenef': matricule_benef,
    }


def type_participant_code():
    """Code du type « le participant lui-même » (« 1 » dans le référentiel)."""
    type_benef = TypeBeneficiaire.objects.filter(libelle=TYPE_PARTICIPANT).first()
    return type_benef.code if type_benef else None


# Champs de l'écran IPM → champs du mobile, pour qu'une erreur levée par
# BonPharmacieSerializer se pose sous le bon champ de l'assistant.
CHAMPS_IPM = {
    'codeSoc': 'beneficiaire',
    'matriculePart': 'beneficiaire',
    'typeBenef': 'beneficiaire',
    'matriculeBenef': 'beneficiaire',
    'codeFournisseur': 'pharmacie',
    'specialite': 'specialite',
    'prescripteur': 'prescripteur',
    'nbArticles': 'nbArticles',
    'dateOrdonnance': 'dateOrdonnance',
}


def erreurs_mobile(erreurs_ipm, champs=None):
    """Erreurs d'un serializer IPM, renommées pour le mobile (bon par défaut)."""
    champs = CHAMPS_IPM if champs is None else champs
    erreurs = {}
    for champ, messages in erreurs_ipm.items():
        erreurs.setdefault(champs.get(champ, 'non_field_errors'), []).extend(messages)
    return erreurs


# ---------------------------------------------------------------------------
# Saisie d'une lettre de garantie
# ---------------------------------------------------------------------------


class NouvelleLettreSerializer(serializers.Serializer):
    """
    La lettre de garantie choisie sur le téléphone : pour qui, chez quel
    prestataire, pour quelle prestation, sur la prescription de qui et de
    quand. Mêmes limites que le bon : les siens seulement, des fournisseurs
    conventionnés, une prescription récente. Les règles de toute lettre
    restent à ``LettreGarantieSerializer``.
    """

    # SEUL le beneficiaire est exige, comme a l'ecran IPM : prestataire,
    # nature, prescripteur et prescription s'y renseignent plus tard (cf.
    # documents/serializers/commun.py, CHAMPS_REQUIS). Meme regle que le bon.
    beneficiaire = serializers.CharField(max_length=25)
    specialitePrestataire = serializers.CharField(max_length=2, required=False, allow_blank=True)
    prestataire = serializers.CharField(max_length=10, required=False, allow_blank=True)
    naturePrestation = serializers.CharField(max_length=2, required=False, allow_blank=True)
    specialite = serializers.CharField(max_length=2, required=False, allow_blank=True)
    prescripteur = serializers.CharField(max_length=10, required=False, allow_blank=True)
    nbArticles = serializers.IntegerField(
        required=False,
        min_value=1,
        max_value=ARTICLES_MAX,
        error_messages={
            'min_value': 'Au moins un acte.',
            'max_value': 'Au plus %d actes : la lettre n’a que %d lignes.'
            % (ARTICLES_MAX, ARTICLES_MAX),
            'invalid': 'Nombre d’actes invalide.',
        },
    )
    datePrescription = serializers.DateField(
        required=False,
        allow_null=True,
        error_messages={'invalid': 'Date de prescription invalide (AAAA-MM-JJ).'},
    )

    def validate_beneficiaire(self, matricule):
        return beneficiaire_de_la_famille(self.context['participant'], matricule)

    def validate_specialitePrestataire(self, code):
        return specialite_de_prescription(code) if code else None

    def validate_specialite(self, code):
        return specialite_de_prescription(code) if code else None

    def validate_naturePrestation(self, code):
        if not code:
            return None
        nature = next((n for n in natures_de_prestation() if n.code == code), None)
        if nature is None:
            raise serializers.ValidationError('Nature de prestation inconnue.')
        return nature

    def validate_datePrescription(self, jour):
        aujourdhui = timezone.localdate()
        if jour > aujourdhui:
            raise serializers.ValidationError('La date de prescription ne peut pas être dans le futur.')
        if jour < aujourdhui - ANCIENNETE_MAX_PRESCRIPTION:
            raise serializers.ValidationError('La prescription a plus de 30 jours.')
        return jour

    def validate(self, attrs):
        # Un fournisseur se cherche DANS une specialite : l'un sans l'autre
        # n'a pas de sens, comme a l'ecran IPM.
        couples = (
            ('prestataire', 'specialitePrestataire', 'prestataire'),
            ('prescripteur', 'specialite', 'prescripteur'),
        )
        for fournisseur, specialite, nom in couples:
            if attrs.get(fournisseur) and not attrs.get(specialite):
                raise serializers.ValidationError(
                    {specialite: ['Choisissez la spécialité du %s.' % nom]}
                )
        attrs['prestataire'] = (
            fournisseur_de_la_specialite(
                attrs['prestataire'], attrs['specialitePrestataire'], 'prestataire', 'Prestataire'
            )
            if attrs.get('prestataire')
            else None
        )
        attrs['prescripteur'] = (
            fournisseur_de_la_specialite(
                attrs['prescripteur'], attrs['specialite'], 'prescripteur', 'Prescripteur'
            )
            if attrs.get('prescripteur')
            else None
        )
        return attrs

    def donnees_ipm(self):
        """La lettre, dans les termes de ``LettreGarantieSerializer`` (écran IPM)."""
        donnees = self.validated_data
        ipm = dict(tiers_ipm(self.context['participant'], donnees['beneficiaire']))
        # Un champ laisse de cote n'est pas envoye : l'ecran IPM le laisse vide
        # lui aussi, et le gestionnaire le completera au traitement.
        correspondances = (
            ('specialitePrestataire', 'specialitePrestataire'),
            ('prestataire', 'codePrestataire'),
            ('naturePrestation', 'naturePrestation'),
            ('specialite', 'specialite'),
            ('prescripteur', 'prescripteur'),
        )
        for depuis, vers in correspondances:
            if donnees.get(depuis):
                ipm[vers] = donnees[depuis].code
        if donnees.get('datePrescription'):
            ipm['datePrescription'] = donnees['datePrescription'].isoformat()
        return ipm


# Champs de l'écran IPM → champs du mobile, pour la lettre de garantie.
CHAMPS_IPM_LETTRE = {
    'codeSoc': 'beneficiaire',
    'matriculePart': 'beneficiaire',
    'typeBenef': 'beneficiaire',
    'matriculeBenef': 'beneficiaire',
    'specialitePrestataire': 'specialitePrestataire',
    'codePrestataire': 'prestataire',
    'naturePrestation': 'naturePrestation',
    'specialite': 'specialite',
    'prescripteur': 'prescripteur',
    'datePrescription': 'datePrescription',
}
