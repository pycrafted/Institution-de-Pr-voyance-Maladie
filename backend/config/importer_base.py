"""
Import ponctuel d'une base (transfert vrai_base -> Railway), par-dessus le
pare-feu qui bloque l'accès direct au Postgres.

Point d'entrée TEMPORAIRE et protégé :
  - **désactivé** tant que la variable d'environnement ``IMPORT_BASE_TOKEN``
    n'est pas posée (répond 404 - l'endpoint n'existe pour ainsi dire pas) ;
  - exige le jeton exact dans l'en-tête ``X-Import-Token`` (comparaison à temps
    constant) ;
  - reçoit un dump SQL (``pg_dump --inserts``) gzippé dans le corps de la requête
    (HTTPS/443, le seul port ouvert), l'exécute dans une transaction, et répond
    un résumé.

À RETIRER après usage : on efface la variable ``IMPORT_BASE_TOKEN`` (l'endpoint
redevient 404), puis on supprime ce fichier et sa route.
"""

import gzip
import hmac
import os

from django.db import connection, transaction
from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt


@csrf_exempt
def importer_base(request):
    token_attendu = os.getenv('IMPORT_BASE_TOKEN')
    # Variable absente : l'endpoint est considéré inexistant.
    if not token_attendu:
        return HttpResponse(status=404)

    fourni = request.headers.get('X-Import-Token', '')
    if not hmac.compare_digest(fourni, token_attendu):
        return HttpResponse('Jeton invalide.', status=403)

    if request.method != 'POST':
        return HttpResponse(status=405)

    corps = request.body
    try:
        sql = gzip.decompress(corps).decode('utf-8')
    except (OSError, EOFError):
        # Corps non gzippé : on l'exécute tel quel.
        sql = corps.decode('utf-8', 'replace')

    # pg_dump (PG 17) insère des méta-commandes psql « \restrict / \unrestrict »
    # que psycopg2 ne comprend pas : on retire ces lignes de commande psql.
    sql = '\n'.join(ligne for ligne in sql.splitlines() if not ligne.lstrip().startswith('\\'))

    try:
        with transaction.atomic():
            with connection.cursor() as cur:
                cur.execute(sql)
    except Exception as exc:  # noqa: BLE001 - on renvoie la cause au client
        return JsonResponse({'ok': False, 'erreur': str(exc)[:1000]}, status=400)

    # Résumé : nombre de tables et quelques comptages repères.
    resume = {}
    with connection.cursor() as cur:
        cur.execute(
            "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"
        )
        resume['tables_public'] = cur.fetchone()[0]
        for table in ('auth_user', 'participants_participant', 'participants_beneficiaire'):
            try:
                cur.execute(f'SELECT count(*) FROM {table}')
                resume[table] = cur.fetchone()[0]
            except Exception:  # noqa: BLE001
                connection.rollback()
    return JsonResponse({'ok': True, 'resume': resume})
