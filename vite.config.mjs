import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import autoprefixer from 'autoprefixer'

export default defineConfig(() => {
  return {
    // Chemins absolus (« /assets/… ») et non relatifs (« ./assets/… »).
    // Depuis que l'application navigue en adresses pleines (BrowserRouter,
    // cf. src/App.jsx), le serveur voit chaque chemin — et un chemin à deux
    // niveaux, « /documents/bons-pharmacie », faisait résoudre « ./assets/… »
    // en « /documents/assets/… ». IIS, qui renvoie index.html pour tout ce
    // qui n'est pas un fichier, répondait alors du HTML là où le navigateur
    // attendait du JavaScript : la page restait blanche à l'ouverture directe
    // ou au rechargement. Le site est servi à la racine, « / » est donc juste.
    base: '/',
    build: {
      outDir: 'build',
    },
    css: {
      postcss: {
        plugins: [
          autoprefixer({}), // add options if needed
        ],
      },
    },
    plugins: [react()],
    resolve: {
      alias: [
        {
          find: 'src/',
          replacement: `${path.resolve(__dirname, 'src')}/`,
        },
      ],
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.scss'],
    },
    server: {
      port: 3000,
      proxy: {
        // https://vitejs.dev/config/server-options.html
      },
    },
    // « vite preview » sert le build de production, dont l'URL d'API est le
    // chemin relatif /api (cf. .env.production) : sans ce relais vers Django,
    // on ne pourrait éprouver localement que les écrans sans données.
    // En production, c'est IIS qui tient ce rôle.
    preview: {
      proxy: {
        '/api': 'http://127.0.0.1:8000',
      },
    },
  }
})
