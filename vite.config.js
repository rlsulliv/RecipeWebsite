import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' uses relative asset paths, so the site works at
// https://<you>.github.io/<repo-name>/ without hard-coding the repo name.
export default defineConfig({ plugins: [react()], base: './' })