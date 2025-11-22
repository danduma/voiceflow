import type { VoiceLanguage } from './types'

// Available languages for voice input
export const VOICE_LANGUAGES: VoiceLanguage[] = [
  { code: 'auto', name: 'Auto-detect', flag: '🌐' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'en-GB', name: 'English (UK)', flag: '🇬🇧' },
  { code: 'en-US', name: 'English (US)', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
  { code: 'it', name: 'Italian', flag: '🇮🇹' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', flag: '🇰🇷' },
  { code: 'nl', name: 'Dutch', flag: '🇳🇱' },
  { code: 'pl', name: 'Polish', flag: '🇵🇱' },
  { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
  { code: 'ro', name: 'Romanian', flag: '🇷🇴' },
  { code: 'ru', name: 'Russian', flag: '🇷🇺' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
  { code: 'zh-TW', name: 'Chinese (TW)', flag: '🇹🇼' }
]

export function getLanguageDisplay(languageCode: string): string {
  const lang = VOICE_LANGUAGES.find(l => l.code === languageCode)
  return lang ? `${lang.flag} ${lang.name}` : '🌐 Auto-detect'
}

export function getLanguageFlag(languageCode: string): string {
  const lang = VOICE_LANGUAGES.find(l => l.code === languageCode)
  return lang ? lang.flag : '🌐'
}