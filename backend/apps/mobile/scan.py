"""
Reconnaissance d'un document par l'IA (Anthropic / Claude), pour le scan mobile.

L'assuré photographie un document (ordonnance, reçu, facture…) depuis la PWA ;
le téléphone l'envoie à **notre serveur**, et c'est le serveur - jamais le
navigateur - qui appelle l'IA avec la clé (dans backend/.env, hors Git). La clé
ne doit jamais partir dans le front, qui est téléchargé par tout le monde.

Appel direct à l'API Messages par la bibliothèque standard (urllib) : pas de
dépendance à installer, et on évite le proxy TLS de l'entreprise côté pip.
"""

import base64
import json
import os
import re
import urllib.error
import urllib.request
from datetime import date

# Au-delà de ce nombre de jours, une ordonnance n'est plus « récente » pour un
# pré-financement (réglable par ORDONNANCE_FRAICHEUR_JOURS dans backend/.env).
FRAICHEUR_JOURS_DEFAUT = 30

ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
ANTHROPIC_VERSION = '2023-06-01'
MODELE_DEFAUT = 'claude-sonnet-5-5'

# Claude accepte ~5 Mo par image ; la PWA réduit avant d'envoyer. On refuse
# au-delà pour ne pas gaspiller un appel voué à l'échec.
TAILLE_MAX = 5 * 1024 * 1024

PROMPT = (
    "Tu analyses la photo d'un document apporté par un assuré d'une mutuelle "
    "santé (IPM) au Sénégal, pour un pré-financement. Identifie le document, "
    "extrais ses informations, et - si c'est une ordonnance - juge sa fiabilité.\n"
    "Réponds UNIQUEMENT avec un objet JSON (aucun texte autour), de cette forme :\n"
    '{\n'
    '  "type": "ordonnance" | "recu" | "facture" | "bon" | "carte" | "autre",\n'
    '  "typeLibelle": "<nom lisible du type, en français>",\n'
    '  "lisible": true | false,   // false si la photo est floue ou illisible\n'
    '  "date": "AAAA-MM-JJ" | null,   // LIS la date du document avec soin\n'
    '  "prestataire": "<médecin, pharmacie, clinique, laboratoire…>" | null,\n'
    '  "patient": "<nom du patient>" | null,\n'
    '  "montantTotal": <nombre en francs CFA> | null,\n'
    '  "elements": [ { "libelle": "<médicament ou acte>", "quantite": "<texte>" | null, '
    '"montant": <nombre> | null } ],\n'
    '  "estOrdonnance": true | false,   // true seulement si c\'est une ordonnance médicale\n'
    '  "fiabilite": "haute" | "moyenne" | "faible",   // confiance que c\'est une '
    "ordonnance authentique et exploitable (lisible, avec un prescripteur et "
    'une signature/tampon)\n'
    '  "alertes": [ "<problème constaté>" ],   // ex: "écriture illisible", '
    '"aucune signature ni tampon visible", "date absente", "document raturé", '
    '"prescripteur non identifiable"\n'
    '  "resume": "<une phrase décrivant le document>"\n'
    '}\n'
    "Pour juger la fiabilité d'une ordonnance : regarde si l'écriture est "
    "lisible, s'il y a un médecin/service prescripteur identifiable, une "
    "signature ou un tampon, et si l'ensemble est cohérent. Les montants sont en "
    "francs CFA (entiers, sans séparateur). Une information absente vaut null "
    "(ou [] pour elements/alertes)."
)


def _media_et_donnees(data_url):
    """(media_type, base64) d'une URL de données image, ou (None, None)."""
    correspondance = re.fullmatch(
        r'data:(image/(?:jpeg|png|gif|webp));base64,(.+)', (data_url or '').strip(), re.DOTALL
    )
    if not correspondance:
        return None, None
    return correspondance.group(1), correspondance.group(2)


def reconnaitre_document(data_url):
    """Envoie l'image à Claude et renvoie les champs reconnus (dict).

    Lève ``ValueError`` si l'image est mal formée ou trop lourde, ``RuntimeError``
    si la clé manque, et laisse remonter ``urllib.error`` en cas d'échec réseau.
    """
    media, donnees = _media_et_donnees(data_url)
    if not media:
        raise ValueError('Image attendue : JPEG, PNG, GIF ou WEBP encodée en base64.')
    try:
        poids = len(base64.b64decode(donnees, validate=True))
    except (ValueError, base64.binascii.Error):
        raise ValueError('Image illisible (base64 invalide).')
    if poids > TAILLE_MAX:
        raise ValueError('Image trop lourde : 5 Mo au plus.')

    cle = os.getenv('ANTHROPIC_API_KEY')
    if not cle:
        raise RuntimeError('Clé Anthropic absente (ANTHROPIC_API_KEY).')
    modele = os.getenv('ANTHROPIC_MODEL', MODELE_DEFAUT)

    corps = json.dumps({
        'model': modele,
        'max_tokens': 1024,
        'messages': [{
            'role': 'user',
            'content': [
                {'type': 'image', 'source': {'type': 'base64', 'media_type': media, 'data': donnees}},
                {'type': 'text', 'text': PROMPT},
            ],
        }],
    }).encode('utf-8')
    requete = urllib.request.Request(
        ANTHROPIC_URL, data=corps, method='POST',
        headers={
            'x-api-key': cle,
            'anthropic-version': ANTHROPIC_VERSION,
            'content-type': 'application/json',
        },
    )
    with urllib.request.urlopen(requete, timeout=60) as reponse:
        charge = json.load(reponse)

    texte = ''.join(
        bloc.get('text', '') for bloc in charge.get('content', []) if bloc.get('type') == 'text'
    )
    return _evaluer(_extraire_json(texte))


def _evaluer(resultat):
    """Calcule l'ancienneté de l'ordonnance et un verdict clair à montrer.

    La date vient de l'IA ; le calcul d'ancienneté se fait ICI (le serveur sait
    quel jour on est), et le verdict en découle : récente + fiable = OK, sinon
    on signale pourquoi. Ne touche pas les documents qui ne sont pas des
    ordonnances - pour eux, pas de verdict.
    """
    seuil = int(os.getenv('ORDONNANCE_FRAICHEUR_JOURS', FRAICHEUR_JOURS_DEFAUT))

    age = None
    valeur = (resultat.get('date') or '')[:10]
    if valeur:
        try:
            age = (date.today() - date.fromisoformat(valeur)).days
        except ValueError:
            age = None
    recente = age is not None and 0 <= age <= seuil
    resultat['ageJours'] = age
    resultat['recente'] = recente
    resultat['seuilJours'] = seuil

    est_ordonnance = bool(resultat.get('estOrdonnance')) or resultat.get('type') == 'ordonnance'
    fiabilite = resultat.get('fiabilite') or ('faible' if not resultat.get('lisible') else 'moyenne')

    if not est_ordonnance:
        # Pas une ordonnance : on ne porte pas de verdict de pré-financement.
        resultat['verdict'] = 'autre'
        resultat['verdictMessage'] = 'Ce document n’est pas une ordonnance.'
    elif age is None:
        resultat['verdict'] = 'attention'
        resultat['verdictMessage'] = (
            'Date illisible : impossible de vérifier que l’ordonnance est récente.'
        )
    elif age < 0:
        resultat['verdict'] = 'attention'
        resultat['verdictMessage'] = 'La date est dans le futur : à vérifier.'
    elif not recente:
        resultat['verdict'] = 'attention'
        resultat['verdictMessage'] = (
            f'Ordonnance ancienne : {age} jours (au-delà de {seuil} jours).'
        )
    elif fiabilite == 'faible':
        resultat['verdict'] = 'attention'
        resultat['verdictMessage'] = (
            'Ordonnance peu fiable : écriture ou éléments difficiles à vérifier.'
        )
    else:
        resultat['verdict'] = 'ok'
        resultat['verdictMessage'] = f'Ordonnance récente ({age} j) et fiable.'
    return resultat


def _extraire_json(texte):
    """Le premier objet JSON du texte de l'IA ; un repli lisible si rien n'y est."""
    texte = (texte or '').strip()
    debut, fin = texte.find('{'), texte.rfind('}')
    if debut != -1 and fin > debut:
        try:
            return json.loads(texte[debut:fin + 1])
        except json.JSONDecodeError:
            pass
    return {
        'type': 'autre',
        'typeLibelle': 'Document',
        'lisible': False,
        'date': None,
        'prestataire': None,
        'patient': None,
        'montantTotal': None,
        'elements': [],
        'estOrdonnance': False,
        'fiabilite': 'faible',
        'alertes': [],
        'resume': texte[:200] or 'Document non reconnu.',
    }
