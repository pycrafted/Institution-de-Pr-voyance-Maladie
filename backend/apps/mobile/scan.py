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
    "Réponds UNIQUEMENT par un objet JSON STRICT et VALIDE : aucun texte autour, "
    "AUCUN commentaire (ni // ni /* */), aucune balise markdown. Les clés sont :\n"
    '{\n'
    '  "type": "ordonnance",\n'
    '  "typeLibelle": "Ordonnance médicale",\n'
    '  "lisible": true,\n'
    '  "date": "2024-10-24",\n'
    '  "prestataire": "Dr X, médecin généraliste",\n'
    '  "patient": "Nom du patient",\n'
    '  "montantTotal": null,\n'
    '  "elements": [ { "libelle": "médicament ou acte", "quantite": "texte", "montant": null } ],\n'
    '  "estOrdonnance": true,\n'
    '  "fiabilite": "moyenne",\n'
    '  "alertes": [],\n'
    '  "resume": "une phrase décrivant le document"\n'
    '}\n'
    "Règles des valeurs :\n"
    "- type : l'une de ordonnance, recu, facture, bon, carte, autre.\n"
    "- estOrdonnance : true UNIQUEMENT pour une ordonnance médicale (même "
    "ancienne : une vieille ordonnance reste une ordonnance).\n"
    "- lisible : false si la photo est floue ou illisible.\n"
    "- date : la date du document, format AAAA-MM-JJ, lue avec soin, ou null.\n"
    "- prestataire / patient : texte ou null.\n"
    "- montantTotal et montant : entiers en francs CFA (sans séparateur) ou null.\n"
    "- fiabilite : haute, moyenne ou faible - confiance que c'est une ordonnance "
    "authentique et exploitable (écriture lisible, prescripteur identifiable, "
    "signature ou tampon, cohérence).\n"
    "- alertes : liste de problèmes, ex. « écriture illisible », « aucune "
    "signature ni tampon », « prescripteur non identifiable ». [] si rien.\n"
    "SOIS ÉCONOME : si le document n'est PAS une ordonnance, ou s'il est "
    "illisible ou non exploitable, mets elements à [] et donne seulement un "
    "resume d'UNE phrase brève. N'extrais le détail complet (médicaments, "
    "montants, patient…) QUE pour une ordonnance exploitable."
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
        extrait = texte[debut:fin + 1]
        # Défense : Claude glisse parfois des commentaires ou une virgule
        # traînante, qui cassent json.loads. On les retire avant d'analyser.
        extrait = re.sub(r'/\*.*?\*/', '', extrait, flags=re.DOTALL)
        # `//` de commentaire, mais pas le `//` d'une URL (http://…).
        extrait = re.sub(r'(?<!:)//[^\n]*', '', extrait)
        extrait = re.sub(r',(\s*[}\]])', r'\1', extrait)
        for candidat in (texte[debut:fin + 1], extrait):
            try:
                return json.loads(candidat)
            except json.JSONDecodeError:
                continue
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
