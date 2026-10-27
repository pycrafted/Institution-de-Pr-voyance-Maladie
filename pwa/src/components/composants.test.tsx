/**
 * Tests des composants imposés par SPEC_DESIGN §3 : ce sont eux que les
 * autres écrans réemploient, leur contrat (noms de classes, étiquettes,
 * rappels) doit tenir.
 *
 * On vérifie ce qui est vérifiable sous jsdom : la structure, les classes qui
 * portent la charte, l'accessibilité et les rappels. Le rendu (rayons,
 * ombres, dégradés) se contrôle en capture d'écran.
 */

import { IonReactRouter } from '@ionic/react-router'
import { eyeOutline } from 'ionicons/icons'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { DOCUMENTS, documentParCle } from '../services/catalogue'
import { preparerIonic } from '../pages/accueil/outils-test'
import Avatar from './Avatar'
import BandeauMarque from './BandeauMarque'
import BarreOngletsFlottante, { ONGLETS } from './BarreOngletsFlottante'
import { BoutonPrincipal, BoutonSecondaire } from './Boutons'
import CarteIdentite from './CarteIdentite'
import CarteListe from './CarteListe'
import Champ from './Champ'
import EtatVide from './EtatVide'
import Feuille, { ContenuFeuille } from './Feuille'
import GrilleServices from './GrilleServices'
import LogoSar from './LogoSar'
import OfflineBanner from './OfflineBanner'
import PucesFiltre from './PucesFiltre'
import StatutBadge from './StatutBadge'

beforeAll(() => preparerIonic())

/** Certains composants naviguent (CarteListe) : il leur faut un routeur. */
function rendre(noeud: ReactNode) {
  return render(<IonReactRouter>{noeud}</IonReactRouter>)
}

describe('§3.1 barre d’onglets flottante', () => {
  it('porte la classe flottante, trois onglets et « Mes retenues »', () => {
    const { container } = rendre(<BarreOngletsFlottante />)
    const barre = container.querySelector('ion-tab-bar')
    expect(barre).toHaveClass('ipm-onglets')
    const boutons = Array.from(container.querySelectorAll('ion-tab-button'))
    expect(boutons.map((b) => b.getAttribute('tab'))).toEqual([
      ...ONGLETS.map((o) => o.cle),
      'retenues',
    ])
    expect(boutons.slice(0, 3).map((b) => b.getAttribute('href'))).toEqual(
      ONGLETS.map((o) => o.href),
    )
    expect(boutons[3]).toHaveTextContent('Mes retenues')
  })

  it('mène aux trois écrans principaux, dont l’annuaire des structures', () => {
    // L'annuaire est un onglet et non un raccourci de l'accueil : c'est ce
    // qu'on consulte en cherchant où se soigner, il doit être à un toucher.
    // Le profil a rejoint la barre du haut.
    expect(ONGLETS.map((o) => o.href)).toEqual(['/accueil', '/bons', '/conventionnes'])
    expect(ONGLETS.map((o) => o.libelle)).toContain('Structures')
  })
})

describe('§3.2 bandeau de marque', () => {
  it('variante pleine : logo, titre et sous-titre', () => {
    const { container } = rendre(
      <BandeauMarque
        variante="plein"
        chevauche
        titre="Bonjour Moustapha"
        sousTitre="SAR · 01-1204"
      />,
    )
    const bandeau = container.querySelector('.ipm-bandeau')
    expect(bandeau).toHaveClass('ipm-bandeau--plein')
    // Le chevauchement de 24 px (§4) se réserve ici, pas dans la page.
    expect(bandeau).toHaveClass('ipm-bandeau--chevauche')
    // Plus de logo dans le bandeau : la carte d'adhérent le porte juste en
    // dessous, et la marque n'a pas à s'afficher deux fois d'affilée.
    expect(container.querySelector('.ipm-bandeau__pastille')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Bonjour Moustapha' })).toBeInTheDocument()
    expect(screen.getByText('SAR · 01-1204')).toBeInTheDocument()
  })

  it('variante compacte : bouton retour et titre', () => {
    const retour = vi.fn()
    const { container } = rendre(<BandeauMarque titre="Mes documents" onRetour={retour} />)
    expect(container.querySelector('.ipm-bandeau')).toHaveClass('ipm-bandeau--compact')
    fireEvent.click(screen.getByLabelText('Retour'))
    expect(retour).toHaveBeenCalledTimes(1)
  })

  it('reste une surface noire : le rouge est réservé aux actions', () => {
    const { container } = rendre(<BandeauMarque titre="BPI000079" />)
    expect(container.querySelector('.ipm-bandeau')).not.toHaveClass('ipm-bandeau--rouge')
  })
})

describe('§3.3 carte d’identité d’adhérent', () => {
  const carte = (props: Partial<Parameters<typeof CarteIdentite>[0]> = {}) =>
    rendre(
      <CarteIdentite
        nom="Diop"
        prenoms="Moustapha"
        matricule="01-1204"
        dateNaissance="1962-01-01"
        societe="SAR"
        {...props}
      />,
    )

  it('présente chaque valeur sous son libellé, comme une pièce d’identité', () => {
    const { container } = carte()
    const champs = Array.from(container.querySelectorAll('.ipm-carte-identite__champ')).map((c) => [
      c.querySelector('dt')?.textContent,
      c.querySelector('dd')?.textContent,
    ])
    expect(champs).toEqual([
      ['Nom', 'DIOP'],
      ['Prénom(s)', 'Moustapha'],
      ['Matricule', '01-1204'],
      ['Né(e) le', '01/01/1962'],
      ['Société', 'SAR'],
    ])
    expect(screen.getByText('01-1204')).toHaveClass('ipm-chiffres')
  })

  it('porte le logo en sceau au coin opposé à l’intitulé, et en filigrane', () => {
    const { container } = carte()
    const entete = container.querySelector('.ipm-carte-identite__entete') as HTMLElement
    // Intitulé d'abord, sceau ensuite : le logo n'est plus au-dessus de la photo.
    expect(entete.firstElementChild).toHaveClass('ipm-carte-identite__intitule')
    expect(entete.lastElementChild).toHaveClass('ipm-carte-identite__sceau')
    // En blanc, directement sur le rouge de la carte.
    expect(entete.querySelector('.ipm-logo--blanc')).not.toBeNull()
    // Le filigrane est décoratif : invisible des lecteurs d'écran.
    expect(container.querySelector('.ipm-carte-identite__embleme')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
  })

  it('n’imprime pas de case vide', () => {
    const { container } = carte({ dateNaissance: null, societe: undefined })
    const libelles = Array.from(container.querySelectorAll('dt')).map((d) => d.textContent)
    expect(libelles).toEqual(['Nom', 'Prénom(s)', 'Matricule'])
  })

  it('montre les initiales sans photo, et la photo quand elle existe', () => {
    const sans = carte()
    expect(sans.container.querySelector('.ipm-carte-identite__initiales')).toHaveTextContent('MD')
    sans.unmount()
    const avec = carte({ photo: 'data:image/jpeg;base64,aa' })
    expect(avec.container.querySelector('.ipm-carte-identite__photo img')).not.toBeNull()
  })

  it('ne porte rien de touchable : une pièce d’identité ne se modifie pas', () => {
    // La photo s'envoie depuis la feuille « Photos d'identité », une seule
    // fois ; la carte, elle, ne fait que montrer.
    const { container } = carte({ photo: 'data:image/jpeg;base64,aa' })
    expect(container.querySelector('button')).toBeNull()
    expect(container.querySelector('.ipm-carte-identite__crayon')).toBeNull()
  })
})

describe('§3.4 cartes de service et raccourcis', () => {
  it('n’affiche QUE les quatre types de documents, chacun en carte', () => {
    const { container } = rendre(<GrilleServices onOuvrir={vi.fn()} />)
    const cartes = container.querySelectorAll('.ipm-tuile')
    expect(cartes).toHaveLength(DOCUMENTS.length)
    // §4 : aucun écran utilitaire dans la grille des documents.
    expect(container.querySelector('[data-service="mon-profil"]')).toBeNull()
    expect(container.querySelector('[data-service="mes-documents"]')).toBeNull()
  })

  it('ne porte aucune mention sous le libellé', () => {
    // Demande de l'utilisateur : ni « Disponible » ni « Bientôt » sous le nom
    // du document. Seule la puce du coin signale une carte encore fermée.
    const { container } = rendre(<GrilleServices onOuvrir={vi.fn()} />)
    expect(container.querySelector('.ipm-tuile__mention')).toBeNull()
    expect(container.querySelector('[data-service="bon-pharmacie"] .ipm-tuile__puce')).toBeNull()
  })

  it('laisse l’apparition au conteneur et l’appui à la carte', () => {
    // Les deux classes sur le même élément : l'animation de transform
    // écraserait le scale(.97) de l'appui (SPEC_DESIGN §2).
    const { container } = rendre(<GrilleServices onOuvrir={vi.fn()} />)
    const carte = container.querySelector('.ipm-tuile') as HTMLElement
    expect(carte).toHaveClass('ipm-appui')
    expect(carte).not.toHaveClass('ipm-entree')
    expect(carte.parentElement).toHaveClass('ipm-entree')
  })

  it('ouvre un document disponible', () => {
    const ouvrir = vi.fn()
    rendre(<GrilleServices onOuvrir={ouvrir} />)
    fireEvent.click(screen.getByLabelText('Bon de pharmacie'))
    expect(ouvrir).toHaveBeenCalledWith(documentParCle('bon-pharmacie'))
  })

  it('ne peint pas toute la carte du document ouvert en rouge', () => {
    const { container } = rendre(<GrilleServices onOuvrir={vi.fn()} onIndisponible={vi.fn()} />)
    const carte = screen.getByLabelText('Bon de pharmacie')
    expect(carte).toHaveClass('ipm-tuile--ouverte')
    expect(carte).not.toHaveClass('ipm-tuile--rouge')
    // Plus d'icône sur la carte : le libellé seul.
    expect(container.querySelector('.ipm-tuile__icone')).toBeNull()
  })

  it('éteint un document à venir, le dit, mais le laisse touchable', () => {
    const ouvrir = vi.fn()
    const indisponible = vi.fn()
    const { container } = rendre(<GrilleServices onOuvrir={ouvrir} onIndisponible={indisponible} />)
    const carte = screen.getByLabelText('LG hospitalisation, bientôt disponible')
    // Éteinte d'un cran par rapport à un document ouvert (§3.4).
    expect(carte).toHaveClass('ipm-tuile--avenir')
    // Surtout pas aria-disabled : la carte réagit (elle ouvre la feuille).
    expect(carte).not.toHaveAttribute('aria-disabled')
    expect(
      container.querySelector('[data-service="hospitalisation"] .ipm-tuile__puce')?.textContent,
    ).toBe('Bientôt')
    fireEvent.click(carte)
    expect(indisponible).toHaveBeenCalledWith(documentParCle('hospitalisation'))
    expect(ouvrir).not.toHaveBeenCalled()
  })
})

describe('§3.5 carte de liste', () => {
  it('est une carte autonome, sans filet, avec puce et chevron', () => {
    const { container } = rendre(
      <CarteListe
        icone="x"
        teinte="valide"
        titre="Bon n° BPI000079"
        details={<span>Moustapha DIOP</span>}
        puce={<StatutBadge statut="valide" />}
        meta="Aujourd'hui"
        routerLink="/bons/1"
        rang={2}
      />,
    )
    const carte = container.querySelector('.ipm-carte-liste') as HTMLElement
    expect(carte.tagName).toBe('BUTTON')
    expect(carte).toHaveClass('ipm-appui')
    expect(carte.style.getPropertyValue('--rang')).toBe('2')
    expect(container.querySelector('.ipm-cercle--valide')).not.toBeNull()
    expect(container.querySelector('.ipm-carte-liste__chevron')).not.toBeNull()
  })

  it('reste une simple carte quand elle ne mène nulle part', () => {
    const { container } = rendre(<CarteListe titre="Pharmacie du Plateau" />)
    const carte = container.querySelector('.ipm-carte-liste') as HTMLElement
    expect(carte.tagName).toBe('DIV')
    expect(container.querySelector('.ipm-carte-liste__chevron')).toBeNull()
  })
})

describe('§3.6 puces de filtre', () => {
  const puces = [
    { cle: 'tous', libelle: 'Tous' },
    { cle: 'valide', libelle: 'Valides', nombre: 2 },
  ]

  it('marque la puce active et remonte le changement', () => {
    const changer = vi.fn()
    rendre(<PucesFiltre puces={puces} active="tous" onChanger={changer} etiquette="Statut" />)
    const active = screen.getByRole('tab', { name: 'Tous' })
    expect(active).toHaveClass('ipm-puce--active')
    expect(active).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('tab', { name: /Valides/ }))
    expect(changer).toHaveBeenCalledWith('valide')
  })

  it('ne renotifie pas quand on retouche la puce déjà active', () => {
    const changer = vi.fn()
    rendre(<PucesFiltre puces={puces} active="tous" onChanger={changer} etiquette="Statut" />)
    fireEvent.click(screen.getByRole('tab', { name: 'Tous' }))
    expect(changer).not.toHaveBeenCalled()
  })
})

describe('§3.7 boutons', () => {
  it('bouton principal : pilule rouge, rappel au toucher', () => {
    const action = vi.fn()
    const { container } = rendre(<BoutonPrincipal onClick={action}>Continuer</BoutonPrincipal>)
    const bouton = container.querySelector('button') as HTMLButtonElement
    expect(bouton).toHaveClass('ipm-bouton--principal', 'ipm-bouton--rouge')
    fireEvent.click(bouton)
    expect(action).toHaveBeenCalled()
  })

  it('occupé : roue affichée, bouton inerte', () => {
    const action = vi.fn()
    const { container } = rendre(
      <BoutonPrincipal occupe onClick={action}>
        Vérification…
      </BoutonPrincipal>,
    )
    const bouton = container.querySelector('button') as HTMLButtonElement
    expect(bouton).toBeDisabled()
    expect(bouton).toHaveAttribute('aria-busy', 'true')
    expect(container.querySelector('ion-spinner')).not.toBeNull()
    fireEvent.click(bouton)
    expect(action).not.toHaveBeenCalled()
  })

  it('bouton secondaire : surface et bordure', () => {
    const { container } = rendre(<BoutonSecondaire>Plus tard</BoutonSecondaire>)
    expect(container.querySelector('button')).toHaveClass('ipm-bouton--secondaire')
  })
})

describe('§3.8 champ de saisie', () => {
  it('libellé au-dessus, saisie remontée, erreur annoncée', () => {
    const changer = vi.fn()
    const { container, rerender } = rendre(
      <Champ libelle="Matricule" valeur="" onChanger={changer} aide="Ex. 01-1204" />,
    )
    expect(screen.getByText('Matricule')).toHaveClass('ipm-champ__libelle')
    expect(screen.getByText('Ex. 01-1204')).toHaveClass('ipm-champ__aide')

    const saisie = container.querySelector('ion-input') as HTMLIonInputElement
    fireEvent(saisie, new CustomEvent('ionInput', { detail: { value: '1204' } }))
    expect(changer).toHaveBeenCalledWith('1204')

    rerender(
      <IonReactRouter>
        <Champ libelle="Matricule" valeur="" onChanger={changer} erreur="Matricule obligatoire" />
      </IonReactRouter>,
    )
    expect(container.querySelector('.ipm-champ')).toHaveClass('ipm-champ--erreur')
    expect(screen.getByRole('alert')).toHaveTextContent('Matricule obligatoire')
  })
})

describe('§3.9 feuille', () => {
  it('pose une fenêtre en feuille, à ses paliers et sans la poignée d’Ionic', () => {
    // Fermée : sous jsdom, Ionic ne sait pas présenter une fenêtre (il lui
    // manque son « framework delegate »). On vérifie donc ce qui est posé
    // sur l'élément, et le dedans dans le test suivant.
    rendre(
      <Feuille ouverte={false} onFermer={vi.fn()} titre="Bon d’optique">
        <p>Bientôt disponible</p>
      </Feuille>,
    )
    // IonModal se pose à la racine du document, pas dans le conteneur rendu.
    const feuille = document.body.querySelector('ion-modal') as HTMLIonModalElement
    expect(feuille).toHaveClass('ipm-feuille')
    // Plus de paliers : ce n'est plus un bandeau monté du bas mais une page
    // entière, qui s'ouvre et dont on revient par la flèche.
    expect(feuille.breakpoints).toBeUndefined()
    expect(feuille.initialBreakpoint).toBeUndefined()
  })

  it('porte l’icône de ce dont elle parle, et pas d’IonContent sans hauteur', () => {
    const { container } = rendre(
      <ContenuFeuille titre="Bon d’optique" icone={eyeOutline}>
        <p>Bientôt disponible</p>
      </ContenuFeuille>,
    )
    expect(container.querySelector('.ipm-feuille__icone ion-icon')).not.toBeNull()
    expect(container.querySelector('ion-content')).toBeNull()
  })

  it('se présente comme une page : barre de titre, flèche retour, corps', () => {
    // IonModal ne monte ses enfants qu'une fois présenté : on rend le dedans.
    const fermer = vi.fn()
    const { container } = rendre(
      <ContenuFeuille titre="Bon d’optique" onFermer={fermer}>
        <p>Bientôt disponible</p>
      </ContenuFeuille>,
    )
    // La même barre de titre que les écrans de détail, pas un titre centré
    // sous une poignée : c'est ce qui fait la continuité.
    expect(container.querySelector('.ipm-feuille__poignee')).toBeNull()
    expect(screen.getByText('Bon d’optique')).toHaveClass('ipm-entete__titre')
    fireEvent.click(screen.getByLabelText('Retour'))
    expect(fermer).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Bientôt disponible')).toBeInTheDocument()
  })
})

describe('§3.10 état vide', () => {
  it('illustration, titre, message et action', () => {
    const action = vi.fn()
    const { container } = rendre(
      <EtatVide
        icone="x"
        titre="Aucun bon"
        message="Vos bons apparaîtront ici."
        action={{ libelle: 'Nouveau bon', onClick: action }}
      />,
    )
    expect(container.querySelector('.ipm-vide__disque')).not.toBeNull()
    expect(screen.getByText('Aucun bon')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Nouveau bon'))
    expect(action).toHaveBeenCalled()
  })
})

describe('briques partagées', () => {
  it('StatutBadge : classe du statut, couleurs tenues par les jetons', () => {
    rendre(<StatutBadge statut="annule" />)
    const puce = screen.getByText('Annulé')
    expect(puce).toHaveAttribute('data-statut', 'annule')
    expect(puce).toHaveClass('ipm-statut--annule')
    // Aucune couleur en dur dans le composant (SPEC_DESIGN §1).
    expect(puce.getAttribute('style')).toBeNull()
  })

  it('Avatar : initiales, et verre translucide sur une surface de marque', () => {
    const { container } = rendre(<Avatar nom="Moustapha DIOP" taille={44} ton="marque" />)
    expect(container.textContent).toBe('MD')
    expect(container.querySelector('.ipm-avatar')).toHaveClass('ipm-avatar--marque')
  })

  it('Avatar : teinte de la charte par classe, aucune couleur en dur (§1)', () => {
    const { container } = rendre(<Avatar nom="Moustapha DIOP" />)
    const pastille = container.querySelector('.ipm-avatar') as HTMLElement
    expect(pastille.className).toMatch(/ipm-avatar--[123]$/)
    // Le style en ligne ne porte que la taille, jamais une couleur.
    expect(pastille.getAttribute('style')).not.toMatch(/color|background/)
  })

  it('LogoSar : un seul fichier, blanchi par filtre sur fond de marque', () => {
    const { container } = rendre(<LogoSar largeur={40} ton="blanc" />)
    const logo = container.querySelector('img') as HTMLImageElement
    expect(logo).toHaveClass('ipm-logo--blanc')
    expect(logo.getAttribute('src')).toBe('/logo-sar.png')
  })

  it('OfflineBanner : invisible en ligne, visible hors ligne', () => {
    const enLigne = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    const { rerender } = render(<OfflineBanner />)
    expect(screen.queryByRole('status')).toBeNull()
    enLigne.mockReturnValue(false)
    rerender(<OfflineBanner synchroniseLe="2026-09-18T10:00:00Z" />)
    expect(screen.getByRole('status')).toHaveTextContent(/Hors ligne · données :/)
    enLigne.mockRestore()
  })
})
