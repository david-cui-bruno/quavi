import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { Capacitor } from '@capacitor/core'
import { Keyboard } from '@capacitor/keyboard'

if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add('native-app')
  void Keyboard.addListener('keyboardWillShow', () => document.documentElement.classList.add('keyboard-open'))
  void Keyboard.addListener('keyboardWillHide', () => document.documentElement.classList.remove('keyboard-open'))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
