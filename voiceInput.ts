export interface VoiceInputService {
  startRecording(onTranscription: (text: string, isFinal: boolean) => void): Promise<void>
  stopRecording(cancelled?: boolean): Promise<string>
  isRecording(): boolean
  setLanguage(language: string | 'auto'): void
  getLanguage(): string | 'auto'
  reset?(): void
}

export interface AudioVisualizationData {
  volume: number
  frequencies: number[]
}

// Language mappings for browser speech recognition
const BROWSER_LANGUAGE_MAP: Record<string, string> = {
  'en-US': 'en-US',
  'en-GB': 'en-GB',
  'es': 'es-ES',
  'fr': 'fr-FR', 
  'de': 'de-DE',
  'it': 'it-IT',
  'pt': 'pt-BR',
  'ru': 'ru-RU',
  'ja': 'ja-JP',
  'ko': 'ko-KR',
  'zh': 'zh-CN',
  'zh-TW': 'zh-TW',
  'nl': 'nl-NL',
  'pl': 'pl-PL',
  'hi': 'hi-IN',
  'ro': 'ro-RO'
}

// OpenAI Whisper supported languages (subset - OpenAI supports 50+ languages)
const OPENAI_LANGUAGE_MAP: Record<string, string> = {
  'en-US': 'en',
  'en-GB': 'en',
  'es': 'es', 
  'fr': 'fr',
  'de': 'de',
  'it': 'it',
  'pt': 'pt',
  'ru': 'ru',
  'ja': 'ja',
  'ko': 'ko',
  'zh': 'zh',
  'zh-TW': 'zh',
  'nl': 'nl',
  'pl': 'pl',
  'hi': 'hi',
  'ro': 'ro'
}

export class OpenAIVoiceInputService implements VoiceInputService {
  private mediaRecorder: MediaRecorder | null = null
  private audioStream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private dataArray: Uint8Array | null = null
  private isCurrentlyRecording = false
  private onTranscriptionCallback: ((text: string, isFinal: boolean) => void) | null = null
  private finalTranscription = ''
  private transcriptionDebounceTimer: NodeJS.Timeout | null = null
  private lastTranscriptionTime = 0
  private processedTranscriptions = new Set<string>()
  private language: string | 'auto' = 'auto'
  // No interval needed; we'll restart recorder per chunk

  private apiKey: string
  
  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  setLanguage(language: string | 'auto'): void {
    this.language = language
    console.log('OpenAI voice service language set to:', language)
  }

  getLanguage(): string | 'auto' {
    return this.language
  }

  private getOpenAILanguageCode(): string | undefined {
    if (this.language === 'auto') {
      return undefined // Let OpenAI auto-detect
    }
    return OPENAI_LANGUAGE_MAP[this.language] || undefined
  }

  async startRecording(onTranscription: (text: string, isFinal: boolean) => void): Promise<void> {
    this.onTranscriptionCallback = onTranscription
    this.finalTranscription = ''
    this.processedTranscriptions.clear() // Clear previous transcriptions
    this.chunkCounter = 0 // Reset chunk counter

    try {
      // Get user media
      this.audioStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      })

      // Setup audio context for visualization
      this.audioContext = new AudioContext({ sampleRate: 16000 })
      const source = this.audioContext.createMediaStreamSource(this.audioStream)
      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = 256
      source.connect(this.analyser)
      
      const bufferLength = this.analyser.frequencyBinCount
      this.dataArray = new Uint8Array(bufferLength)

      // Setup MediaRecorder for audio chunks - use OpenAI compatible formats
      let mimeType = 'audio/webm' // WebM is widely supported by OpenAI
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/wav' // WAV fallback
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/mp4' // MP4 last resort
        }
      }
      
      this.mediaRecorder = new MediaRecorder(this.audioStream, {
        mimeType: mimeType,
        audioBitsPerSecond: 128000 // Set a reasonable bitrate
      })

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.sendAudioChunk(event.data)
        }
      }

      this.mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event)
        console.error('MediaRecorder state after error:', this.mediaRecorder?.state)
      }

      this.mediaRecorder.onstop = () => {
        console.log('MediaRecorder stopped. Recording finished.')
      }

      this.mediaRecorder.onstart = () => {
        console.log('MediaRecorder started successfully, state:', this.mediaRecorder?.state)
      }

      // Start recording with 3-second timeslice. We'll stop after first chunk to ensure header, but keep timeslice just in case.
      this.mediaRecorder.start(3000)
      this.isCurrentlyRecording = true


    } catch (error) {
      console.error('Failed to start recording:', error)
      throw new Error('Failed to access microphone')
    }
  }


  private chunkCounter = 0

  private async transcribeAudio(audioBlob: Blob): Promise<void> {
    this.chunkCounter++

    try {
      // Validate audio blob - require minimum size for meaningful audio
      if (!audioBlob || audioBlob.size < 10000) {
        return
      }
      
      // Check if blob has a valid MIME type
      if (!audioBlob.type || (!audioBlob.type.includes('webm') && !audioBlob.type.includes('mp4') && !audioBlob.type.includes('wav'))) {
        return
      }

      // For first chunk, try OpenAI directly. For subsequent chunks, skip OpenAI due to header issues
      if (this.chunkCounter === 1) {
        await this.tryOpenAITranscription(audioBlob)
      } else {
        // We could implement a fallback here, but for now just continue recording
        // The visualization will still work, and user can manually stop when done
      }
    } catch (error) {
      console.error('Error in transcribeAudio:', error)
    }
  }

  private async tryOpenAITranscription(audioBlob: Blob): Promise<void> {
    try {
      const formData = new FormData()
      // Determine file extension based on MIME type
      let extension = 'webm'
      if (audioBlob.type.includes('mp4')) {
        extension = 'mp4'
      } else if (audioBlob.type.includes('wav')) {
        extension = 'wav'
      }
      
      formData.append('file', audioBlob, `audio.${extension}`)
      formData.append('model', 'whisper-1')
      
      // Add language parameter if specified (skip for auto-detection)
      const languageCode = this.getOpenAILanguageCode()
      if (languageCode) {
        formData.append('language', languageCode)
        console.log('Using OpenAI language:', languageCode)
      } else {
        console.log('Using OpenAI auto-detection')
      }
      
      formData.append('response_format', 'text')
      
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: formData
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error(`OpenAI API error (${response.status}):`, errorText)
        console.error('Failed audio blob details:', {
          size: audioBlob.size,
          type: audioBlob.type,
          extension: extension,
          language: languageCode || 'auto'
        })
        return
      }
      
      const transcript = await response.text()
      if (transcript && transcript.trim()) {
        console.log('Transcription received:', transcript)
        
        // Check if we've already processed this exact transcription
        if (this.processedTranscriptions.has(transcript)) {
          console.log('Skipping duplicate transcription:', transcript)
          return
        }
        
        // Add to processed set
        this.processedTranscriptions.add(transcript)
        
        // Update with the latest transcription
        this.onTranscriptionCallback?.(transcript, false)
        this.finalTranscription = transcript
        console.log('Updated transcription:', transcript)
      }
    } catch (error) {
      console.error('Error in OpenAI transcription:', error)
    }
  }


  private async validateAudioBlob(audioBlob: Blob): Promise<boolean> {
    try {
      // Check basic properties
      if (!audioBlob || audioBlob.size < 1000) return false
      
      // Read first few bytes to check for valid audio headers
      const arrayBuffer = await audioBlob.slice(0, 32).arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)
      
      // Check for common audio file signatures
      // WebM: 0x1A, 0x45, 0xDF, 0xA3
      // MP4: 'ftyp' at offset 4-7
      if (bytes.length >= 4) {
        // WebM signature
        if (bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) {
          return true
        }
        
        // MP4 signature (check for 'ftyp' box)
        const mp4Check = String.fromCharCode(...bytes.slice(4, 8))
        if (mp4Check === 'ftyp') {
          return true
        }
      }
      
      // If no clear signature found but it's a reasonable size, allow it
      return audioBlob.size > 8000
    } catch (error) {
      console.error('Error validating audio blob:', error)
      return false
    }
  }

  private sendAudioChunk(audioBlob: Blob): void {
    // Process each chunk immediately for real-time transcription
    console.log('Sending audio chunk for transcription:', audioBlob.size, 'bytes')  
    this.transcribeAudio(audioBlob)
  }




  async stopRecording(cancelled: boolean = false): Promise<string> {
    this.isCurrentlyRecording = false

    if (this.transcriptionDebounceTimer) {
      clearTimeout(this.transcriptionDebounceTimer)
      this.transcriptionDebounceTimer = null
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop()
      } catch (error) {
        console.warn('Error stopping media recorder:', error)
      }
    }

    // Ensure audio stream tracks are properly stopped
    if (this.audioStream) {
      try {
        this.audioStream.getTracks().forEach(track => {
          try {
            track.stop()
          } catch (error) {
            console.warn('Error stopping audio track:', error)
          }
        })
        // Clear the audio stream reference after stopping all tracks
        this.audioStream = null
      } catch (error) {
        console.warn('Error accessing audio stream tracks:', error)
        this.audioStream = null
      }
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        await this.audioContext.close()
      } catch (error) {
        console.warn('Error closing audio context:', error)
      }
    }

    return this.finalTranscription || 'Voice input completed'
  }

  isRecording(): boolean {
    return this.isCurrentlyRecording
  }

  getAudioVisualizationData(): AudioVisualizationData | null {
    if (!this.analyser || !this.dataArray) return null

    this.analyser.getByteFrequencyData(this.dataArray)
    
    // Calculate volume (RMS)
    let sum = 0
    for (let i = 0; i < this.dataArray.length; i++) {
      sum += this.dataArray[i] * this.dataArray[i]
    }
    const volume = Math.sqrt(sum / this.dataArray.length) / 255

    // Get frequency data for visualization
    const frequencies = Array.from(this.dataArray).map(value => value / 255)

    return { volume, frequencies }
  }

  reset(): void {
    this.isCurrentlyRecording = false
    this.finalTranscription = ''
    this.processedTranscriptions.clear()
    
    // Cleanup timers
    if (this.transcriptionDebounceTimer) {
      clearTimeout(this.transcriptionDebounceTimer)
      this.transcriptionDebounceTimer = null
    }
    
    // Cleanup media recorder
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop()
      } catch (error) {
        console.warn('Error stopping media recorder in reset:', error)
      }
    }
    
    // Cleanup audio stream
    if (this.audioStream) {
      try {
        this.audioStream.getTracks().forEach(track => {
          try {
            track.stop()
          } catch (error) {
            console.warn('Error stopping audio track in reset:', error)
          }
        })
        this.audioStream = null
      } catch (error) {
        console.warn('Error accessing audio stream tracks in reset:', error)
        this.audioStream = null
      }
    }
    
    // Cleanup audio context
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch((error) => {
        console.warn('Error closing audio context in reset:', error)
      })
    }
  }
}

// Fallback service that uses browser's built-in speech recognition
export class BrowserVoiceInputService implements VoiceInputService {
  private recognition: any = null
  private isCurrentlyRecording = false
  private fullTranscript = ''
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private dataArray: Uint8Array | null = null
  private audioStream: MediaStream | null = null
  private restartCount = 0
  private maxRestarts = 10
  private language: string | 'auto' = 'auto'

  constructor() {
    this.initializeRecognition()
  }

  private initializeRecognition() {
    if ('webkitSpeechRecognition' in window) {
      this.recognition = new (window as any).webkitSpeechRecognition()
      console.log('🎤 Initialized webkitSpeechRecognition')
    } else if ('SpeechRecognition' in window) {
      this.recognition = new (window as any).SpeechRecognition()
      console.log('🎤 Initialized SpeechRecognition')
    }

    if (this.recognition) {
      this.recognition.continuous = true
      this.recognition.interimResults = true
      console.log('🎤 BrowserVoiceInputService configured:', {
        continuous: this.recognition.continuous,
        interimResults: this.recognition.interimResults
      })
      this.updateRecognitionLanguage()
    } else {
      console.error('❌ Failed to initialize browser speech recognition')
    }
  }

  setLanguage(language: string | 'auto'): void {
    this.language = language
    console.log('Browser voice service language set to:', language)
    this.updateRecognitionLanguage()
  }

  getLanguage(): string | 'auto' {
    return this.language
  }

  private updateRecognitionLanguage(): void {
    if (!this.recognition) return
    
    if (this.language === 'auto') {
      // Use browser's default language or navigator language
      const detectedLang = navigator.language || 'en-US'
      this.recognition.lang = detectedLang
      console.log('Using auto-detected language for speech recognition:', detectedLang)
    } else {
      // Map app language to browser speech recognition language code
      const browserLangCode = BROWSER_LANGUAGE_MAP[this.language] || `${this.language}-US`
      this.recognition.lang = browserLangCode
      console.log('Using specified language for speech recognition:', browserLangCode)
    }
  }

  async startRecording(onTranscription: (text: string, isFinal: boolean) => void): Promise<void> {
    if (!this.recognition) {
      throw new Error('Speech recognition not supported in this browser')
    }

    this.fullTranscript = ''
    this.isCurrentlyRecording = true
    this.restartCount = 0 // Reset restart counter

    // Update language before starting (in case it changed)
    this.updateRecognitionLanguage()

    // Setup audio context for visualization
    try {
      this.audioStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      })

      this.audioContext = new AudioContext({ sampleRate: 16000 })
      const source = this.audioContext.createMediaStreamSource(this.audioStream)
      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = 256
      source.connect(this.analyser)
      
      const bufferLength = this.analyser.frequencyBinCount
      this.dataArray = new Uint8Array(bufferLength)
    } catch (error) {
      console.warn('Failed to setup audio visualization for browser speech recognition:', error)
    }

    // Set up event handlers
    this.setupRecognitionHandlers(onTranscription)

    try {
      this.recognition.start()
    } catch (error) {
      console.warn('Failed to start speech recognition:', error)
      throw error // Re-throw to maintain existing error handling behavior
    }
  }

  private setupRecognitionHandlers(onTranscription: (text: string, isFinal: boolean) => void) {
    this.recognition.onresult = (event: any) => {
      let interimTranscript = ''
      let finalTranscript = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalTranscript += transcript
        } else {
          interimTranscript += transcript
        }
      }

      // Always send interim results first if available (shows words as they come)
      if (interimTranscript) {
        console.log('Browser speech recognition - interim:', interimTranscript)
        onTranscription(this.fullTranscript + interimTranscript, false)
      }

      // Then send final results if available
      if (finalTranscript) {
        this.fullTranscript += finalTranscript
        console.log('Browser speech recognition - final:', finalTranscript)
        onTranscription(this.fullTranscript, true)
      }
    }

    this.recognition.onerror = (event: any) => {
      // Handle different error types appropriately
      if (event.error === 'no-speech') {
        // This is a normal condition, not an error - just restart silently
        console.log('No speech detected, restarting recognition...')
        if (this.isCurrentlyRecording && this.restartCount < this.maxRestarts) {
          this.restartCount++
          console.log(`Restarting after no-speech (attempt ${this.restartCount}/${this.maxRestarts})`)
          
          // Create a completely fresh recognition object
          setTimeout(() => {
            if (this.isCurrentlyRecording) {
              this.createFreshRecognition(onTranscription)
            }
          }, 100)
        } else {
          console.log('Not restarting after no-speech: isCurrentlyRecording =', this.isCurrentlyRecording, 'restartCount =', this.restartCount, 'maxRestarts =', this.maxRestarts)
        }
      } else if (event.error === 'aborted') {
        // Aborted is intentional, don't restart
        console.log('Speech recognition aborted')
      } else {
        // Handle other errors with restart logic
        console.warn('Speech recognition error:', event.error)
        if (this.isCurrentlyRecording && this.restartCount < this.maxRestarts) {
          this.restartCount++
          console.log(`Restarting speech recognition after error (attempt ${this.restartCount}/${this.maxRestarts})`)
          
          // Create a completely fresh recognition object
          setTimeout(() => {
            if (this.isCurrentlyRecording) {
              this.createFreshRecognition(onTranscription)
            }
          }, 500)
        }
      }
    }

    this.recognition.onend = () => {
      console.log('Speech recognition ended. Still recording?', this.isCurrentlyRecording)
      // Auto-restart if we're still supposed to be recording
      if (this.isCurrentlyRecording && this.restartCount < this.maxRestarts) {
        this.restartCount++
        console.log(`Restarting speech recognition to maintain continuous recording (attempt ${this.restartCount}/${this.maxRestarts})`)
        
        // Create a completely fresh recognition object
        setTimeout(() => {
          if (this.isCurrentlyRecording) {
            this.createFreshRecognition(onTranscription)
          }
        }, 100)
      } else {
        console.log('Not restarting after end: isCurrentlyRecording =', this.isCurrentlyRecording, 'restartCount =', this.restartCount, 'maxRestarts =', this.maxRestarts)
      }
    }
  }

  private createFreshRecognition(onTranscription: (text: string, isFinal: boolean) => void) {
    console.log('Creating fresh recognition object...')
    
    // Clean up old recognition object
    if (this.recognition) {
      try {
        this.recognition.stop()
      } catch (error) {
        // Ignore errors when stopping
      }
    }
    
    // Create completely new recognition object
    this.initializeRecognition()
    
    if (!this.recognition) {
      console.error('Failed to create fresh recognition object')
      return
    }
    
    // Set up event handlers on the new object
    this.setupRecognitionHandlers(onTranscription)
    
    // Start the new recognition
    try {
      this.recognition.start()
      console.log('Successfully started fresh recognition object')
    } catch (error) {
      console.warn('Failed to start fresh recognition object:', error)
    }
  }

  async stopRecording(cancelled?: boolean): Promise<string> {
    this.isCurrentlyRecording = false
    this.restartCount = 0 // Reset restart counter when stopping
    
    if (this.recognition) {
      try {
        this.recognition.stop()
      } catch (error) {
        console.warn('Error stopping speech recognition:', error)
      }
    }

    // Cleanup audio context
    if (this.audioStream) {
      try {
        this.audioStream.getTracks().forEach(track => {
          try {
            track.stop()
          } catch (error) {
            console.warn('Error stopping audio track:', error)
          }
        })
        // Clear the audio stream reference after stopping all tracks
        this.audioStream = null
      } catch (error) {
        console.warn('Error accessing audio stream tracks:', error)
        this.audioStream = null
      }
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        await this.audioContext.close()
      } catch (error) {
        console.warn('Error closing audio context:', error)
      }
    }

    return this.fullTranscript
  }

  // Reset service state for reuse
  reset(): void {
    this.isCurrentlyRecording = false
    this.restartCount = 0
    this.fullTranscript = ''
    
    // Cleanup recognition
    if (this.recognition) {
      try {
        this.recognition.stop()
      } catch (error) {
        console.warn('Error stopping recognition in reset:', error)
      }
    }
    
    // Cleanup audio context
    if (this.audioStream) {
      try {
        this.audioStream.getTracks().forEach(track => {
          try {
            track.stop()
          } catch (error) {
            console.warn('Error stopping audio track in reset:', error)
          }
        })
        this.audioStream = null
      } catch (error) {
        console.warn('Error accessing audio stream tracks in reset:', error)
        this.audioStream = null
      }
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch((error) => {
        console.warn('Error closing audio context in reset:', error)
      })
    }
  }

  private recreateRecognition(): void {
    console.log('Recreating speech recognition object...')
    
    // Cleanup old recognition
    if (this.recognition) {
      try {
        this.recognition.stop()
      } catch (error) {
        // Ignore errors
      }
    }
    
    // Create new recognition object
    this.initializeRecognition()
  }

  isRecording(): boolean {
    return this.isCurrentlyRecording
  }

  getAudioVisualizationData(): AudioVisualizationData | null {
    if (!this.analyser || !this.dataArray) {
      console.log('BrowserVoiceInputService: No audio analyser available')
      return null
    }

    this.analyser.getByteFrequencyData(this.dataArray)
    
    // Calculate volume (RMS)
    let sum = 0
    for (let i = 0; i < this.dataArray.length; i++) {
      sum += this.dataArray[i] * this.dataArray[i]
    }
    const volume = Math.sqrt(sum / this.dataArray.length) / 255

    // Get frequency data for visualization
    const frequencies = Array.from(this.dataArray).map(value => value / 255)

    return { volume, frequencies }
  }
}

// Factory function to create the appropriate service
export function createVoiceInputService(language: string | 'auto' = 'auto'): VoiceInputService {
  console.log('🎤 Creating voice input service with language:', language)
  console.log('🎤 Browser support check:', {
    webkitSpeechRecognition: 'webkitSpeechRecognition' in window,
    SpeechRecognition: 'SpeechRecognition' in window,
    hasOpenAIKey: !!import.meta.env.VITE_OPENAI_API_KEY
  })
  
  // Check if browser supports speech recognition first (free and real-time!)
  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    console.log('✅ Using browser speech recognition (free, local, real-time with interim results)')
    const service = new BrowserVoiceInputService()
    service.setLanguage(language)
    return service
  }
  
  // Fall back to OpenAI if browser doesn't support speech recognition
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY
  if (apiKey) {
    console.warn('⚠️ Browser speech recognition not available, falling back to OpenAI Whisper (paid, no real-time interim results)')
    const service = new OpenAIVoiceInputService(apiKey)
    service.setLanguage(language)
    return service
  } else {
    throw new Error('❌ No speech recognition available: Browser does not support speech recognition and no OpenAI API key provided')
  }
}