import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// `!` asserts #root exists — it's hard-coded in index.html, and getElementById
// is typed as `HTMLElement | null`, which createRoot won't accept.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
