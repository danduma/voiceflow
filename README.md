# VoiceFlow

A reusable React library for voice input functionality in textareas. Provides a microphone button that appears when the textarea is focused, allowing users to dictate text using speech-to-text.

## Features

- 🎤 **Voice Transcription**: Supports both browser native speech recognition and OpenAI Whisper API
- 🔧 **Highly Flexible**: Accepts UI components as props for maximum customization
- 🌍 **Multi-language Support**: 15+ languages supported
- ⚡ **Real-time Updates**: Shows interim transcription results as you speak
- 🎨 **Theme Agnostic**: Works with any design system
- 🔄 **Auto-restart**: Automatically handles speech recognition timeouts

## Installation

```bash
# As a git submodule
git submodule add https://github.com/danduma/voiceflow.git libs/voiceflow
```

## Usage

```tsx
import { TextareaWithVoice, useVoiceSettings } from './libs/voiceflow'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Mic } from 'lucide-react'

function MyComponent() {
  const { voiceLanguage, handleLanguageChange } = useVoiceSettings()

  return (
    <TextareaWithVoice
      value={text}
      onChange={setText}
      placeholder="Start typing or click the microphone..."
      voiceLanguage={voiceLanguage}
      onVoiceLanguageChange={handleLanguageChange}
      Button={Button}
      Textarea={Textarea}
      MicIcon={Mic}
    />
  )
}
```

## API

### TextareaWithVoice Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `value` | `string` | ✅ | Current textarea value |
| `onChange` | `(value: string) => void` | ✅ | Callback when text changes |
| `voiceLanguage` | `string` | ✅ | Current language code (e.g., 'en-US', 'es', 'auto') |
| `onVoiceLanguageChange` | `(language: string) => void` | ✅ | Callback when language changes |
| `Button` | `React.ComponentType` | ✅ | Button component to render the mic button |
| `Textarea` | `React.ComponentType` | ✅ | Textarea component to render the input |
| `MicIcon` | `React.ComponentType` | ✅ | Microphone icon component |
| `placeholder` | `string` | ❌ | Placeholder text |
| `rows` | `number` | ❌ | Number of textarea rows |
| `disabled` | `boolean` | ❌ | Whether the component is disabled |
| `className` | `string` | ❌ | Additional CSS classes for container |
| `textareaClassName` | `string` | ❌ | Additional CSS classes for textarea |
| `buttonClassName` | `string` | ❌ | Additional CSS classes for button |
| `buttonPosition` | `'top-right' \| 'bottom-right'` | ❌ | Position of the mic button |

### Supported Languages

- `auto` - Auto-detect language
- `en-US` - English (US)
- `en-GB` - English (UK)
- `es` - Spanish
- `fr` - French
- `de` - German
- `it` - Italian
- `pt` - Portuguese
- `ru` - Russian
- `ja` - Japanese
- `ko` - Korean
- `zh` - Chinese
- `zh-TW` - Chinese (Taiwan)
- `nl` - Dutch
- `pl` - Polish
- `hi` - Hindi
- `ro` - Romanian

### Voice Services

The library automatically chooses the best available voice service:

1. **Browser Speech Recognition** (preferred) - Free, real-time, local processing
2. **OpenAI Whisper** (fallback) - Requires API key, cloud processing

Set the `VITE_OPENAI_API_KEY` environment variable for OpenAI fallback.

## Dependencies

- React 16+
- TypeScript (optional, but recommended)

## License

MIT
