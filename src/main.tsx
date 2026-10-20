import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import './styles.css'
import { useSettings } from './store/settings'

// Tema antes do primeiro desenho (sem piscar o tema errado) e a cada troca nas configurações.
const applyTheme = () => (document.documentElement.dataset.theme = useSettings.getState().theme)
applyTheme()
useSettings.subscribe(applyTheme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
