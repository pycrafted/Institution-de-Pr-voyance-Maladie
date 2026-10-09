"""
Vues de l'application mobile (pwa/), montées sous ``/api/mobile/``.

L'employé s'y identifie par son matricule et son mot de passe mobile, puis
consulte sa famille, les pharmacies et prescripteurs conventionnés, et émet
ses bons de pharmacie et ses lettres de garantie. Les documents ainsi émis
sont des documents IPM comme les autres : ils paraissent dans les tableaux
de l'application IPM, sans aucune marque d'origine.

Toutes les vues, sauf l'identification, déclarent explicitement
l'authentification par jeton participant : le verrou global (jeton
utilisateur IPM) ne s'applique pas ici, car un participant n'est pas un
utilisateur IPM - et un utilisateur IPM n'est pas un participant.
"""

import base64
import binascii
import ipaddress
import re

from django.contrib.auth.hashers import make_password
from django.db import IntegrityError, OperationalError, transaction
from django.db.models import Count, Q
from django.http import Http404, HttpResponse
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, SimpleRateThrottle
from rest_framework.views import APIView

from documents.impression import bon_pharmacie_pdf
from documents.impression_lettre import lettre_garantie_pdf
from documents.models import BonPharmacie, LettreGarantie
from documents.serializers import BonPharmacieSerializer, LettreGarantieSerializer
from donnees_de_base.models import TypeBeneficiaire
from donnees_de_base.models.fournisseur_de_soins import CODE_FOURNISSEURS_DIVERS
from participants.models import Participant
from participants.serializers.participant import TYPE_PARTICIPANT

from .authentification import (
    EstParticipant,
    ParticipantJetonAuthentication,
    emettre_jeton,
    peut_se_servir,
)
from .serializers import (
    CHAMPS_IPM_LETTRE,
    IdentificationSerializer,
    NouveauBonSerializer,
    NouvelleLettreSerializer,
    erreurs_mobile,
    ayants_droit_servis,
    conventionnes,
    matricule_affiche,
    natures_de_prestation,
    pharmacies,
    prescripteurs,
    representer_beneficiaire,
    representer_bon,
    representer_conventionne,
    representer_fournisseur,
    representer_lettre,
    representer_participant,
    specialites_de_prescription,
)

IDENTITE_INCORRECTE = 'Matricule ou mot de passe incorrect.'
DOSSIER_INACTIF = 'Votre dossier IPM n’est pas actif. Rapprochez-vous de l’IPM.'


def adresse_du_client(request):
    """
    Adresse du téléphone, telle que le relais IIS (ARR) l'a vue.

    Django est derrière IIS sur la même machine : REMOTE_ADDR vaut alors
    127.0.0.1 pour tout le monde, et la vraie adresse est dans
    X-Forwarded-For. Mais cet en-tête peut arriver déjà rempli par le client,
    qui y écrit ce qu'il veut : ARR ne fait qu'ajouter l'adresse qu'il a vue
    à la FIN. Seul le dernier élément est donc digne de foi, et seulement si
    la requête vient bien du relais local. ARR y joint le port TCP du client
    (« 1.2.3.4:5678 », « [2001:db8::1]:5678 ») : il change à chaque connexion
    et doit être retiré, sinon chaque connexion aurait son propre compteur.

    (La lecture par défaut de DRF prend tout l'en-tête tel quel : un
    X-Forwarded-For forgé, ou simplement un nouveau port, suffisait à
    remettre le compteur à zéro.)
    """
    distante = request.META.get('REMOTE_ADDR', '')
    try:
        locale = ipaddress.ip_address(distante).is_loopback
    except ValueError:
        locale = False
    relaye = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if not (locale and relaye.strip()):
        return distante
    dernier = relaye.split(',')[-1].strip()
    if dernier.startswith('['):
        # IPv6 avec port : « [2001:db8::1]:5678 ».
        dernier = dernier[1:].partition(']')[0]
    elif dernier.count(':') == 1:
        # IPv4 avec port : « 1.2.3.4:5678 ». (Un IPv6 nu a plusieurs « : ».)
        dernier = dernier.partition(':')[0]
    try:
        return str(ipaddress.ip_address(dernier))
    except ValueError:
        return distante


class IdentificationThrottle(AnonRateThrottle):
    """
    Dix essais par minute et par adresse. Un code à quatre chiffres se devine :
    sans ce frein, un matricule connu céderait en quelques milliers d'essais.
    Le débit est fixé ici et non dans les réglages, pour ne limiter aucune
    autre vue de l'API.
    """

    scope = 'mobile-identification'
    rate = '10/minute'

    def get_ident(self, request):
        return adresse_du_client(request)


class IdentificationMatriculeThrottle(SimpleRateThrottle):
    """
    Vingt essais par heure et par matricule, d'où qu'ils viennent : le frein
    par adresse ne suffit pas contre qui dispose de plusieurs adresses. Il
    faudrait alors des semaines pour parcourir les codes possibles. Le prix :
    un matricule visé est bloqué une heure pour son titulaire aussi, ce qui
    reste bien moins grave qu'un jeton volé.
    """

    scope = 'mobile-identification-matricule'
    rate = '20/hour'

    def get_cache_key(self, request, view):
        try:
            saisi = request.data.get('matricule')
        except AttributeError:
            return None
        if not isinstance(saisi, str) or not saisi.strip():
            return None
        # « 01-1204 » et « 1204 » désignent le même dossier : même compteur.
        matricule = saisi.strip().rpartition('-')[2].upper()
        return self.cache_format % {'scope': self.scope, 'ident': matricule}


class VueParticipant(APIView):
    """Socle des vues réservées au participant identifié (``request.auth``)."""

    authentication_classes = [ParticipantJetonAuthentication]
    permission_classes = [EstParticipant]


class IdentificationView(APIView):
    """Échange un matricule et un mot de passe mobile contre un jeton participant."""

    # Seconde exception au verrou global, avec LoginView et pour la même
    # raison : il faut bien un moyen d'obtenir un jeton. `authentication_classes`
    # vidé pour qu'un jeton périmé resté dans l'application ne fasse pas
    # échouer l'appel qui doit justement le remplacer.
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [IdentificationThrottle, IdentificationMatriculeThrottle]

    def post(self, request):
        serializer = IdentificationSerializer(data=request.data)
        if not serializer.is_valid():
            # Un champ mal formé ne mérite pas plus d'explications qu'une
            # identité fausse : même réponse.
            return self._refus()
        saisi = serializer.validated_data['matricule']
        mot_de_passe = serializer.validated_data['mot_de_passe']

        # Le matricule s'accepte tel que le bon l'affiche (« 01-1204 ») : le
        # préfixe est alors le code de la société, qui doit être la sienne.
        societe, _, matricule = saisi.rpartition('-')
        # Il s'enregistre sur quatre chiffres (« 0949 ») ; l'employé, lui, tape
        # le sien comme il le dit - « 949 ». Les zéros de tête se remettent ici
        # plutôt que de lui être réclamés.
        if matricule.isdigit():
            matricule = matricule.zfill(4)
        participant = (
            Participant.objects.select_related('adherent').filter(matricule=matricule).first()
        )
        if participant is None:
            # Même temps de réponse qu'un matricule connu : le chiffrement
            # du mot de passe est fait quand même, pour ne rien révéler.
            make_password(mot_de_passe)
            return self._refus()
        if (
            not participant.verifier_mot_de_passe(mot_de_passe)
            or (societe and (not participant.adherent_id or participant.adherent.code != societe))
        ):
            return self._refus()

        # L'identité est exacte : on peut dire pourquoi l'accès est refusé
        # sans rien révéler à un tiers.
        if not peut_se_servir(participant):
            return Response({'detail': DOSSIER_INACTIF}, status=status.HTTP_403_FORBIDDEN)

        return Response(
            {'jeton': emettre_jeton(participant), 'participant': representer_participant(participant)}
        )

    @staticmethod
    def _refus():
        # Une seule réponse que le matricule existe ou non : distinguer les cas
        # révélerait quels matricules sont enregistrés.
        return Response({'detail': IDENTITE_INCORRECTE}, status=status.HTTP_401_UNAUTHORIZED)


class MoiView(VueParticipant):
    """Le participant et sa famille : lui-même d'abord, puis ses ayants droit."""

    def get(self, request):
        participant = request.auth
        type_participant = TypeBeneficiaire.objects.filter(libelle=TYPE_PARTICIPANT).first()
        beneficiaires = [representer_beneficiaire(participant, type_participant)]
        beneficiaires += [
            representer_beneficiaire(ayant_droit, ayant_droit.type_benef)
            # Seulement ceux pour qui un bon peut être émis : l'assistant ne
            # doit pas proposer un ayant droit que la création refuserait.
            for ayant_droit in ayants_droit_servis(participant).order_by('matricule_benef')
        ]
        return Response(
            {'participant': representer_participant(participant), 'beneficiaires': beneficiaires}
        )


class PhotoView(VueParticipant):
    """
    Photo d'identité du participant : la poser (PUT) ou la retirer (DELETE).

    C'est la seule écriture que le mobile fait sur la fiche du participant, et
    elle ne touche qu'à lui-même - ``request.auth`` désigne le participant
    identifié, jamais un autre. La photo se voit ensuite dans l'application
    IPM, sur sa fiche : l'employé tient son portrait à jour, l'IPM n'a plus à
    le faire.

    Corps attendu : ``{"photo": "data:image/jpeg;base64,…"}``. L'image est
    réduite par le téléphone avant l'envoi (320 px, cf. pwa/src/utils/photo.ts).
    Le serveur ne fait pas confiance pour autant : il vérifie la forme, le type
    et le poids, et refuse tout le reste. Pas de décodage d'image côté serveur
    (Pillow n'est pas installé, et décoder une image envoyée par un tiers est
    précisément ce qu'on évite) : les premiers octets suffisent à écarter ce
    qui n'est pas une image.
    """

    # Une photo d'identité réduite à 320 px pèse une vingtaine de kilo-octets ;
    # 400 Ko laissent de la marge à un téléphone qui encoderait moins bien,
    # sans permettre d'utiliser la fiche comme un espace de stockage.
    TAILLE_MAX = 400 * 1024

    # Signatures des formats acceptés, une fois le base64 décodé : en
    # hexadécimal, pour que le fichier reste lisible.
    SIGNATURES = {
        'image/jpeg': bytes.fromhex('ffd8ff'),
        'image/png': bytes.fromhex('89504e470d0a1a0a'),
        'image/webp': b'RIFF',
    }

    def put(self, request):
        valeur = request.data.get('photo')
        if not isinstance(valeur, str) or not valeur.strip():
            raise ValidationError({'photo': ['Aucune photo envoyée.']})
        valeur = valeur.strip()

        entete, _, donnees = valeur.partition(',')
        correspondance = re.fullmatch(r'data:(image/(?:jpeg|png|webp));base64', entete)
        if not correspondance or not donnees:
            raise ValidationError(
                {'photo': ['Format attendu : une image JPEG, PNG ou WEBP encodée en base64.']}
            )
        if len(valeur) > self.TAILLE_MAX:
            raise ValidationError({'photo': ['Photo trop lourde : 400 Ko au plus.']})
        try:
            octets = base64.b64decode(donnees, validate=True)
        except (binascii.Error, ValueError):
            raise ValidationError({'photo': ['Photo illisible.']})
        if not octets.startswith(self.SIGNATURES[correspondance.group(1)]):
            raise ValidationError({'photo': ['Ce fichier n’est pas une image.']})

        participant = request.auth
        participant.photo = valeur
        participant.save(update_fields=['photo', 'modifie_le'])
        return Response({'photo': participant.photo})

    def delete(self, request):
        participant = request.auth
        if participant.photo:
            participant.photo = ''
            participant.save(update_fields=['photo', 'modifie_le'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class ConventionnesView(VueParticipant):
    """
    L'annuaire des structures conventionnées, toutes spécialités confondues
    (serializers.conventionnes). Le mobile le filtre par spécialité et le
    cherche par nom ou adresse lui-même : une liste de quelques centaines de
    fiches, lue une fois, plutôt qu'un aller-retour par filtre touché.
    """

    def get(self, request):
        return Response([representer_conventionne(f) for f in conventionnes()])


class PharmaciesView(VueParticipant):
    def get(self, request):
        return Response([representer_fournisseur(f) for f in pharmacies()])


class SpecialitesView(VueParticipant):
    """Spécialités où choisir le prescripteur : celles qui ont un conventionné."""

    def get(self, request):
        specialites = (
            specialites_de_prescription()
            # Compté comme la liste des prescripteurs : actifs, hors « divers ».
            .annotate(
                nombre=Count(
                    'fournisseurs',
                    filter=Q(fournisseurs__actif=True) & ~Q(fournisseurs__code=CODE_FOURNISSEURS_DIVERS),
                )
            )
            .filter(nombre__gte=1)
            .order_by('libelle')
        )
        return Response(
            [{'code': s.code, 'libelle': s.libelle, 'nombre': s.nombre} for s in specialites]
        )


class PrescripteursView(VueParticipant):
    """Prescripteurs conventionnés d'une spécialité (``?specialite=<code>``)."""

    def get(self, request):
        code = request.query_params.get('specialite', '').strip()
        if not code:
            raise ValidationError({'specialite': ['Choisissez une spécialité.']})
        specialite = specialites_de_prescription().filter(code=code).first()
        if specialite is None:
            raise ValidationError({'specialite': ['Spécialité inconnue.']})
        return Response([representer_fournisseur(f) for f in prescripteurs(specialite)])


class NaturesPrestationView(VueParticipant):
    """Natures de prestation qu'une lettre de garantie peut couvrir."""

    def get(self, request):
        return Response([{'code': n.code, 'libelle': n.libelle} for n in natures_de_prestation()])


def enregistrer_avec_numero(serializer_ipm, modele, donnees):
    """
    Crée le document par le serializer de l'écran IPM, sous le numéro suivant.

    Deux documents émis au même instant pourraient recevoir le même numéro :
    l'unicité en base tranche, et le perdant réessaie une fois avec le
    numéro suivant. Avec SQLite, le perdant ne voit d'ailleurs pas
    d'IntegrityError : sa transaction a lu le dernier numéro (verrou partagé)
    avant de vouloir écrire, et SQLite lui refuse aussitôt le verrou
    d'écriture (« database is locked ») plutôt que de risquer un
    interblocage. C'est le même conflit, d'où la même reprise, dans une
    transaction neuve qui relit le numéro après l'enregistrement du gagnant.

    Rend ``(document, None)``, ou ``(None, erreurs)`` si le serializer IPM
    refuse la saisie.
    """
    for essai in range(2):
        # Le serializer de l'écran IPM, pour que le document suive exactement
        # les mêmes règles qu'un document saisi à IPM. Refait à chaque essai :
        # un serializer déjà enregistré ne se réenregistre pas.
        document_ipm = serializer_ipm(data=donnees)
        if not document_ipm.is_valid():
            return None, document_ipm.errors
        try:
            with transaction.atomic():
                # Aucun utilisateur IPM ne l'a émis : « par : » reste vide
                # sur le document imprimé.
                return document_ipm.save(code=modele.prochain_code(), cree_par=None), None
        except (IntegrityError, OperationalError) as erreur:
            verrou = isinstance(erreur, IntegrityError) or 'locked' in str(erreur)
            if essai or not verrou:
                raise
    raise AssertionError('inaccessible')


def bons_du_participant(participant):
    """
    Tous les bons du participant, qu'ils aient été émis au mobile ou à IPM -
    et rien d'autre : c'est ce filtre qui isole un participant des autres.
    """
    return BonPharmacie.objects.filter(participant=participant).select_related(
        'adherent', 'type_benef', 'participant__adherent', 'beneficiaire', 'pharmacie',
        'specialite', 'prescripteur', 'cree_par',
    )


class BonsView(VueParticipant):
    """Les bons du participant, et l'émission d'un nouveau."""

    def get(self, request):
        bons = bons_du_participant(request.auth).order_by('-cree_le', '-id')
        return Response([representer_bon(bon) for bon in bons])

    def post(self, request):
        participant = request.auth
        saisie = NouveauBonSerializer(data=request.data, context={'participant': participant})
        saisie.is_valid(raise_exception=True)
        bon, erreurs = enregistrer_avec_numero(
            BonPharmacieSerializer, BonPharmacie, saisie.donnees_ipm()
        )
        if erreurs:
            return Response(erreurs_mobile(erreurs), status=status.HTTP_400_BAD_REQUEST)
        bon = bons_du_participant(participant).get(pk=bon.pk)
        return Response(representer_bon(bon), status=status.HTTP_201_CREATED)


class VueBon(VueParticipant):
    def bon(self, request, pk):
        # Le bon d'un autre participant répond comme un bon inexistant : son
        # existence même ne regarde pas l'employé.
        bon = bons_du_participant(request.auth).filter(pk=pk).first()
        if bon is None:
            raise Http404
        return bon


class BonView(VueBon):
    def get(self, request, pk):
        return Response(representer_bon(self.bon(request, pk)))


class BonPdfView(VueBon):
    """Le bon imprimé officiel, celui qu'IPM imprime (original et copie)."""

    def get(self, request, pk):
        bon = self.bon(request, pk)
        # « édité par » : le participant lui-même, sous son matricule affiché.
        contenu = bon_pharmacie_pdf(bon, matricule_affiche(request.auth))
        reponse = HttpResponse(contenu, content_type='application/pdf')
        reponse['Content-Disposition'] = f'inline; filename="{bon.code}.pdf"'
        return reponse


# ---------------------------------------------------------------------------
# Lettres de garantie
# ---------------------------------------------------------------------------


def lettres_du_participant(participant):
    """Toutes les lettres du participant, émises au mobile ou à IPM, et elles seules."""
    return LettreGarantie.objects.filter(participant=participant).select_related(
        'adherent', 'type_benef', 'participant__adherent', 'beneficiaire', 'specialite_prestataire',
        'prestataire', 'nature_prestation', 'specialite', 'prescripteur', 'cree_par',
    )


class LettresView(VueParticipant):
    """Les lettres de garantie du participant, et l'émission d'une nouvelle."""

    def get(self, request):
        lettres = lettres_du_participant(request.auth).order_by('-cree_le', '-id')
        return Response([representer_lettre(lettre) for lettre in lettres])

    def post(self, request):
        participant = request.auth
        saisie = NouvelleLettreSerializer(data=request.data, context={'participant': participant})
        saisie.is_valid(raise_exception=True)
        lettre, erreurs = enregistrer_avec_numero(
            LettreGarantieSerializer, LettreGarantie, saisie.donnees_ipm()
        )
        if erreurs:
            return Response(
                erreurs_mobile(erreurs, CHAMPS_IPM_LETTRE), status=status.HTTP_400_BAD_REQUEST
            )
        lettre = lettres_du_participant(participant).get(pk=lettre.pk)
        return Response(representer_lettre(lettre), status=status.HTTP_201_CREATED)


class VueLettre(VueParticipant):
    def lettre(self, request, pk):
        # Comme un bon : la lettre d'un autre répond comme une lettre inexistante.
        lettre = lettres_du_participant(request.auth).filter(pk=pk).first()
        if lettre is None:
            raise Http404
        return lettre


class LettreView(VueLettre):
    def get(self, request, pk):
        return Response(representer_lettre(self.lettre(request, pk)))


class LettrePdfView(VueLettre):
    """La lettre imprimée officielle, celle qu'IPM imprime (original et copie)."""

    def get(self, request, pk):
        lettre = self.lettre(request, pk)
        contenu = lettre_garantie_pdf(lettre, matricule_affiche(request.auth))
        reponse = HttpResponse(contenu, content_type='application/pdf')
        reponse['Content-Disposition'] = f'inline; filename="{lettre.code}.pdf"'
        return reponse
