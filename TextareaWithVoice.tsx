// @ts-nocheck
import { useState, useRef, useCallback } from 'react'
import { useVoiceTranscription } from './useVoiceTranscription'
import type { TextareaWithVoiceProps } from './types'

export default function TextareaWithVoice({
  value,
  onChange,
  placeholder = "Describe what you want to write about...",
  rows,
  disabled = false,
  voiceLanguage,
  onVoiceLanguageChange,
  Button,
  Textarea,
  MicIcon,
  className = "",
  textareaClassName = "",
  buttonClassName = "",
  buttonPosition = 'top-right',
  transcriptionMode = 'replace'
}: TextareaWithVoiceProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isFocused, setIsFocused] = useState(false)
  const [showVoiceControl, setShowVoiceControl] = useState(false)
  const lastTranscriptRef = useRef<string>('') // last final transcript received from recognizer
  const interimTextRef = useRef<string>('') // currently inserted interim text
  const interimStartRef = useRef<number | null>(null) // start position of interim text
  const restartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const resetInterim = () => {
    interimTextRef.current = ''
    interimStartRef.current = null
  }

  // Voice transcription hook
  const {
    isRecording: isVoiceTranscribing,
    startRecording: startVoiceRecording,
    stopRecording: stopVoiceRecording,
    voiceServiceRef
  } = useVoiceTranscription({
    language: voiceLanguage,
    onTranscriptionUpdate: (text: string, isFinal: boolean) => {
      const raw = text.trim()
      if (!raw) return

      const textarea = textareaRef.current
      const currentValueOriginal = textarea?.value ?? value

      // Remove previous interim text so we can reapply cleanly
      let baseValue = currentValueOriginal
      if (interimStartRef.current !== null && interimTextRef.current) {
        const start = interimStartRef.current
        const end = start + interimTextRef.current.length
        baseValue = `${baseValue.slice(0, start)}${baseValue.slice(end)}`
      }

      const selectionStart = textarea?.selectionStart ?? baseValue.length
      const selectionEnd = textarea?.selectionEnd ?? baseValue.length

      // Compute delta relative to last final transcript to avoid re-appending history
      const prior = lastTranscriptRef.current
      const delta = prior && raw.startsWith(prior)
        ? raw.slice(prior.length).trimStart()
        : raw
      if (!delta) {
        if (isFinal) {
          resetInterim()
        } else {
          // Keep interim tracking even if no visible delta
          interimTextRef.current = ''
          interimStartRef.current = null
        }
        return
      }

      // If user selected text, replace that selection
      const insertStart = selectionEnd > selectionStart ? selectionStart : selectionStart
      const insertEnd = selectionEnd > selectionStart ? selectionEnd : insertStart

      const before = baseValue.slice(0, insertStart)
      const after = baseValue.slice(insertEnd)
      const nextValue = transcriptionMode === 'append'
        ? (baseValue ? `${baseValue} ${delta}` : delta)
        : `${before}${delta}${after}`

      onChange(nextValue)

      if (isFinal) {
        lastTranscriptRef.current = raw
        resetInterim()
        // Force-flush recognizer state after a short delay to avoid reusing buffered transcripts
        if (restartTimeoutRef.current) {
          clearTimeout(restartTimeoutRef.current)
        }
        if (isVoiceTranscribing) {
          restartTimeoutRef.current = setTimeout(async () => {
            try {
              await stopVoiceRecording(true)
              resetInterim()
              await startVoiceRecording()
            } catch (err) {
              console.error('Voice restart failed:', err)
            }
          }, 500)
        }
      } else {
        // Track interim insertion location for replacement on next tick
        interimTextRef.current = delta
        interimStartRef.current = insertStart
      }
    },
    onError: (error) => {
      console.error('Voice transcription error:', error)
      setShowVoiceControl(false)
    }
  })

  // Handle focus events
  const handleFocus = () => {
    setIsFocused(true)
    setShowVoiceControl(true)
  }

  const handleBlur = (e: React.FocusEvent) => {
    setIsFocused(false)
    // Don't hide voice control immediately if transcribing
    if (!isVoiceTranscribing) {
      setTimeout(() => {
        // Only hide if still not transcribing and textarea doesn't have focus
        if (!isVoiceTranscribing && document.activeElement !== textareaRef.current) {
          setShowVoiceControl(false)
        }
      }, 300) // Delay to allow for clicking voice control
    }
  }

  // Handle voice control actions
  const handleStartTranscription = useCallback(() => {
    resetInterim()
    startVoiceRecording()
  }, [startVoiceRecording])

  const handleStopTranscription = useCallback(() => {
    stopVoiceRecording()
    resetInterim()
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current)
      restartTimeoutRef.current = null
    }
    // Keep voice control visible after stopping transcription
    // It will be hidden when textarea loses focus
  }, [stopVoiceRecording])

  const handleVoiceLanguageChange = useCallback((language: string) => {
    onVoiceLanguageChange(language)
  }, [onVoiceLanguageChange])

  // Calculate positioning classes based on buttonPosition
  const getPositionClasses = () => {
    switch (buttonPosition) {
      case 'bottom-right':
        return 'bottom-2 right-2'
      case 'top-right':
      default:
        return 'top-3 right-3'
    }
  }

  return (
    <div className={`relative w-full ${className}`}>
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`${placeholder}${isFocused || showVoiceControl ? ' (Voice input available when focused)' : ''}`}
        {...(rows && { rows })}
        disabled={disabled}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={`resize pr-16 h-[300px] w-full min-w-0 md:min-w-[400px] ${textareaClassName}`}
      />

      {/* Voice Input Indicator - show when not focused */}
      {!showVoiceControl && (
        <div className={`absolute ${getPositionClasses()} text-muted-foreground pointer-events-none`}>
          <MicIcon className="h-4 w-4 opacity-40" />
        </div>
      )}

      {/* Inline Voice Control */}
      {showVoiceControl && (
        <div className={`absolute ${getPositionClasses()} z-10`}>
          <Button
            type="button"
            variant={isVoiceTranscribing ? "default" : "ghost"}
            size="sm"
            onClick={isVoiceTranscribing ? handleStopTranscription : handleStartTranscription}
            className={`h-8 w-8 rounded-full p-0 hover:bg-blue-50 hover:text-blue-600 transition-colors ${buttonClassName}`}
            title={isVoiceTranscribing ? "Stop voice input" : "Start voice input"}
          >
            <MicIcon className={`h-4 w-4 ${isVoiceTranscribing ? 'text-red-500' : ''}`} />
          </Button>
        </div>
      )}
    </div>
  )
}

