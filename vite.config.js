// import react from '@vitejs/plugin-react'
// import { defineConfig } from 'vite'

// const API_PORT = process.env.API_PORT || 4000

// export default defineConfig({
//   plugins: [react()],
//   server: {
//     // host: true binds 0.0.0.0 so other machines on the LAN can reach the dev server.
//     host: true,
//     port: 5173,
//     proxy: {
//       // Proxied server-side, so the browser only ever sees one origin.
//       '/api': { target: `http://localhost:${API_PORT}`, changeOrigin: true },
//     },
//   },
//   preview: {
//     host: true,
//     port: 5173,
//   },
// })




import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const API_PORT = process.env.API_PORT || 4000

export default defineConfig({
  plugins: [react()],

  server: {
    // Listen on all network interfaces
    host: true,

    port: 5173,

    // Allow access through your DuckDNS hostname
    allowedHosts: [
      'hrmsoft.duckdns.org',
    ],

    proxy: {
      // Frontend /api requests → backend
      '/api': {
        target: `http://localhost:${API_PORT}`,
        changeOrigin: true,
      },
    },
  },

  preview: {
    host: true,
    port: 5173,

    // Also allow the hostname in preview mode
    allowedHosts: [
      'hrmsoft.duckdns.org',
    ],
  },
})

