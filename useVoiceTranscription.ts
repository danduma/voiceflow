import { useState, useRef, useCallback, useEffect } from 'react'
import { createVoiceInputService, type VoiceInputService } from './voiceInput'
import type { UseVoiceTranscriptionOptions, UseVoiceTranscriptionReturn } from './types'

export function useVoiceTranscription(options: UseVoiceTranscriptionOptions = {}): UseVoiceTranscriptionReturn {
  const [isRecording, setIsRecording] = useState(false)
  const [transcription, setTranscription] = useState('')
  const [interimTranscription, setInterimTranscription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [language, setLanguageState] = useState<string>(options.language || 'auto')
  
  const voiceServiceRef = useRef<VoiceInputService | null>(null)
  const animationFrameRef = useRef<number | undefined>(undefined)
  const isCancelledRef = useRef(false);
  const processedRef = useRef<string>('') // last text we already emitted to consumers (for delta mode)

  const startRecording = useCallback(async () => {
    try {
      setError(null)
      setPermissionDenied(false)
      setTranscription('')
      setInterimTranscription('')
      isCancelledRef.current = false;
      // Initialize baseline for delta mode from consumer if provided
      if (options.emitMode === 'delta' && options.getBaselineText) {
        const baseline = options.getBaselineText()?.trim()
        if (baseline) {
          processedRef.current = baseline
        }
      }

      // Clean up existing voice service if any
      if (voiceServiceRef.current) {
        try {
          await voiceServiceRef.current.stopRecording(true)
        } catch {
          // Ignore cleanup errors
        }
      }
      
      // Always create a fresh voice service to avoid text accumulation
      voiceServiceRef.current = createVoiceInputService(language)
      console.log('useVoiceTranscription: Created fresh voice service', voiceServiceRef.current.constructor.name, 'with language:', language, 'options.language:', options.language)

      await voiceServiceRef.current.startRecording((text: string, isFinal: boolean) => {
        if (isCancelledRef.current) return;
        console.log('Transcription callback:', { text, isFinal, length: text.length })
        const newText = text
        const prev = processedRef.current
        const emitMode = options.emitMode ?? 'full'
        const delta = emitMode === 'delta'
          ? (newText.startsWith(prev) ? newText.slice(prev.length) : newText)
          : newText
        
        if (isFinal) {
          console.log('Final transcription received:', text)
          setTranscription(newText)
          setInterimTranscription('')
          
          if (delta) {
            options.onTranscriptionUpdate?.(delta, true)
          }
          processedRef.current = emitMode === 'delta' ? newText : processedRef.current
        } else {
          console.log('Interim transcription received:', text)
          setInterimTranscription(newText)
          
          if (delta) {
            options.onTranscriptionUpdate?.(delta, false)
          }
          if (emitMode === 'delta') {
            processedRef.current = newText
          }
        }
      })

      setIsRecording(true)
      console.log('useVoiceTranscription: setIsRecording(true) called')
      
      // Start visualization updates if callback provided
      if (options.onVisualizationUpdate) {
        const updateVisualization = () => {
          if (voiceServiceRef.current?.isRecording()) {
            const vizData = (voiceServiceRef.current as any).getAudioVisualizationData?.()
            if (vizData) {
              options.onVisualizationUpdate!(vizData.frequencies)
            }
            animationFrameRef.current = requestAnimationFrame(updateVisualization)
          }
        }
        updateVisualization()
      }
    } catch (error: any) {
      console.error('Failed to start recording:', error)
      if (error.name === 'NotAllowedError' || error.message.includes('microphone')) {
        setPermissionDenied(true)
        const errorMsg = 'Microphone permission denied'
        setError(errorMsg)
        options.onError?.(errorMsg)
      } else {
        const errorMsg = 'Failed to start recording'
        setError(errorMsg)
        options.onError?.(errorMsg)
      }
    }
  }, [language, transcription, options])

  const stopRecording = useCallback(async (cancelled: boolean = false) => {
    if (!voiceServiceRef.current || !isRecording) return
    isCancelledRef.current = cancelled;

    try {
      await voiceServiceRef.current.stopRecording(cancelled)
      setIsRecording(false)
      console.log('useVoiceTranscription: setIsRecording(false) called')
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = undefined
      }
      
      // Reset the service state for potential reuse
      if (voiceServiceRef.current?.reset) {
        voiceServiceRef.current.reset()
      }
    } catch (error) {
      console.error('Failed to stop recording:', error)
      const errorMsg = 'Failed to stop recording'
      setError(errorMsg)
      options.onError?.(errorMsg)
      
      // Reset service even on error
      if (voiceServiceRef.current?.reset) {
        voiceServiceRef.current.reset()
      }
    }
  }, [isRecording, options])

  const setLanguage = useCallback((newLanguage: string) => {
    setLanguageState(newLanguage);
  }, []);

  useEffect(() => {
    if (voiceServiceRef.current) {
      voiceServiceRef.current.setLanguage(language);
    }
  }, [language]);

  const getLanguage = useCallback(() => {
    return voiceServiceRef.current?.getLanguage() || language
  }, [language])

  // Cleanup effect
  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (voiceServiceRef.current) {
        try {
          voiceServiceRef.current.stopRecording(true)
        } catch {
          // Ignore cleanup errors
        }
        // Reset service state
        if (voiceServiceRef.current?.reset) {
          voiceServiceRef.current.reset()
        }
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  return {
    isRecording,
    transcription,
    interimTranscription,
    error,
    permissionDenied,
    startRecording,
    stopRecording,
    setLanguage,
    getLanguage,
    voiceServiceRef
  }
} 