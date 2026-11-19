
import { supabase } from './supabase'
import { useEffect, useRef, useState } from 'react'
import './App.css'

function App() {
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  const [cameraOpen, setCameraOpen] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)
  const [photos, setPhotos] = useState([])
  const [selectedFrame, setSelectedFrame] = useState('classic')
  const [cameraError, setCameraError] = useState('')

  const frames = [
    { id: 'classic', name: 'Classic', description: 'Cream & minimal' },
    { id: 'sakura', name: 'Sakura', description: 'Soft pink' },
    { id: 'mono', name: 'Monochrome', description: 'Black & white' },
    { id: 'ringo', name: 'Ringo', description: 'Red signature' }
  ]

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
  }

  const [isSaving, setIsSaving] = useState(false)
  const [cloudStatus, setCloudStatus] = useState('')

  // Mengunggah empat foto ke Supabase Storage dan menyimpan data sesi
  const saveSessionToSupabase = async () => {
    if (photos.length !== 4 || isSaving) return

    setIsSaving(true)
    setCloudStatus('Menyimpan foto ke cloud...')

    try {
      const sessionId = crypto.randomUUID()
      const photoPaths = []

      for (let index = 0; index < photos.length; index++) {
        const response = await fetch(photos[index])
        const blob = await response.blob()
        const filePath = `${sessionId}/photo-${index + 1}.jpg`

        const { error: uploadError } = await supabase.storage
          .from('ringo-photos')
          .upload(filePath, blob, {
            contentType: 'image/jpeg',
            upsert: false
          })

        if (uploadError) throw uploadError
        photoPaths.push(filePath)
      }

      const { error: insertError } = await supabase
        .from('photobooth_sessions')
        .insert({
          frame: selectedFrame,
          photo_paths: photoPaths,
          delivery_status: 'pending'
        })

      if (insertError) throw insertError

      setCloudStatus('Berhasil! Empat foto dan data sesi tersimpan di Supabase.')
    } catch (error) {
      console.error('Gagal menyimpan sesi ke Supabase:', error)
      setCloudStatus(`Gagal menyimpan ke cloud: ${error.message}`)
    } finally {
      setIsSaving(false)
    }
  }


  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(() => {})
    }
  }, [cameraOpen])

  // Membuka kamera untuk sesi baru
  const startCamera = async () => {
    try {
      setCameraError('')
      setPhotos([])
      setResultOpen(false)

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      })

      streamRef.current = stream
      setCameraOpen(true)
    } catch (error) {
      console.error(error)
      setCameraError(
        'Kamera tidak dapat diakses. Periksa izin kamera pada browser.'
      )
    }
  }

  // Mengambil foto
  const takePhoto = () => {
    const video = videoRef.current

    if (!video || video.videoWidth === 0) return
    if (photos.length >= 4) return

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const context = canvas.getContext('2d')

    context.translate(canvas.width, 0)
    context.scale(-1, 1)
    context.drawImage(video, 0, 0, canvas.width, canvas.height)

    const photo = canvas.toDataURL('image/jpeg', 0.9)
    setPhotos(previous => [...previous, photo])
  }

  // Menghapus foto terakhir
  const retakePhoto = () => {
    setPhotos(previous => previous.slice(0, -1))
  }

  // Menutup kamera tanpa menghapus foto
  const closeCamera = () => {
    stopCamera()
    setCameraOpen(false)
  }

  // Menyelesaikan sesi, membuka hasil, lalu menyimpan foto ke Supabase
  const finishSession = () => {
    if (photos.length !== 4) return

    stopCamera()
    setCameraOpen(false)
    setResultOpen(true)
    saveSessionToSupabase()
  }

  // Memulai sesi baru
  const newSession = () => {
    setPhotos([])
    setSelectedFrame('classic')
    setCloudStatus('')
    setResultOpen(false)
  }

  // Membuat dan mengunduh photo strip
  const downloadPhoto = async () => {
    if (photos.length !== 4) return

    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')

    canvas.width = 800
    canvas.height = 2400

    const styles = {
      classic: {
        background: '#f4f0e8',
        text: '#242522',
        accent: '#bd302b',
        border: '#d8cdbb'
      },
      sakura: {
        background: '#f8e8eb',
        text: '#633c48',
        accent: '#d98a9d',
        border: '#e8b9c5'
      },
      mono: {
        background: '#eeeeee',
        text: '#171717',
        accent: '#555555',
        border: '#aaaaaa'
      },
      ringo: {
        background: '#bd302b',
        text: '#ffffff',
        accent: '#f4f0e8',
        border: '#f4f0e8'
      }
    }

    const style = styles[selectedFrame]

    context.fillStyle = style.background
    context.fillRect(0, 0, canvas.width, canvas.height)

    // Header photo strip
    context.fillStyle = style.text
    context.textAlign = 'center'
    context.font = 'bold 30px sans-serif'
    context.fillText('RINGO PHOTO CLUB', 400, 65)

    context.font = '16px sans-serif'
    context.fillText('YOUR MEMORIES · 2026', 400, 100)

    // Memuat empat foto
    const loadedPhotos = await Promise.all(
      photos.map(photo => new Promise((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = reject
        image.src = photo
      }))
    )

    // Menggambar setiap foto
    loadedPhotos.forEach((image, index) => {
      const x = 55
      const y = 135 + index * 535
      const width = 690
      const height = 475

      context.fillStyle = style.border
      context.fillRect(x - 5, y - 5, width + 10, height + 10)

      // Crop gambar agar memenuhi area foto
      const imageRatio = image.width / image.height
      const boxRatio = width / height

      let sx = 0
      let sy = 0
      let sw = image.width
      let sh = image.height

      if (imageRatio > boxRatio) {
        sw = image.height * boxRatio
        sx = (image.width - sw) / 2
      } else {
        sh = image.width / boxRatio
        sy = (image.height - sh) / 2
      }

      context.drawImage(
        image,
        sx, sy, sw, sh,
        x, y, width, height
      )

      context.fillStyle = style.text
      context.textAlign = 'left'
      context.font = 'bold 20px sans-serif'
      context.fillText(`0${index + 1}`, 55, y + height + 32)
    })

    // Footer photo strip
    context.fillStyle = style.text
    context.textAlign = 'center'
    context.font = 'bold 26px sans-serif'
    context.fillText('思い出を、あなたらしく。', 400, 2310)

    context.font = '16px sans-serif'
    context.fillText('RINGO PHOTO · 2026', 400, 2350)

    // Mengunduh hasil
    const link = document.createElement('a')
    link.download = 'ringo-photo-session.jpg'
    link.href = canvas.toDataURL('image/jpeg', 0.95)
    link.click()
  }

  return (
    <div className="app">

      {/* NAVBAR */}
      <header className="navbar">
        <a href="#home" className="logo">
          RINGO<span> PHOTO.</span>
        </a>

        <nav>
          <a href="#home">HOME</a>
          <a href="#concept">ABOUT</a>
          <a href="#features">FEATURES</a>
        </nav>

        <a href="#start" className="nav-button">
          START SESSION ↗
        </a>
      </header>

      <main>

        {/* HERO */}
        <section className="hero" id="home">
          <div className="hero-left">
            <div className="vertical-label">
              JAPANESE INSPIRED · 2026
            </div>

            <div className="hero-content">
              <p className="eyebrow">
                <span className="red-dot"></span>
                YOUR PERSONAL PHOTOBOOTH
              </p>

              <h1>
                Your Moments,
                <br />
                <span>Your Story.</span>
              </h1>

              <p className="japanese-title">
                思い出を、あなたらしく。
              </p>

              <p className="hero-description">
                Capture your favorite moments and turn
                them into beautiful memories. Take
                pictures, choose your favorite frame,
                and share your story with the world.
              </p>

              <a href="#start" className="primary-button">
                EXPLORE PHOTOBOOTH
                <span>↗</span>
              </a>

              <div className="hero-caption">
                <span>01 — 04</span>
                <span>FOUR FRAMES. ONE STORY.</span>
              </div>
            </div>
          </div>

          <div className="hero-right">
            <div className="sun-decoration"></div>
            <div className="japanese-stamp">写真</div>

            <div className="photo-strip">
              <div className="strip-heading">
                <span>RINGO PHOTO CLUB</span>
                <span>NO. 001</span>
              </div>

              <div className="strip-photo photo-one"><span>01</span></div>
              <div className="strip-photo photo-two"><span>02</span></div>
              <div className="strip-photo photo-three"><span>03</span></div>
              <div className="strip-photo photo-four"><span>04</span></div>

              <div className="strip-footer">
                <span>YOUR MEMORIES</span>
                <span>2026</span>
              </div>
            </div>

            <p className="vertical-japanese">思い出を残そう</p>

            <div className="hero-number">
              <span>04</span>
              <small>PHOTO FRAMES</small>
            </div>
          </div>
        </section>

        {/* CONCEPT */}
        <section className="concept" id="concept">
          <div className="concept-label">
            <span>01 / OUR CONCEPT</span>
            <span>私たちのコンセプト</span>
          </div>

          <div className="concept-content">
            <h2>
              Small moments,
              <br />
              <span>big memories.</span>
            </h2>

            <p>
              A little space to capture the moments
              that make life special. Inspired by
              Japanese visual aesthetics, Ringo Photo
              brings a simple and enjoyable
              photobooth experience.
            </p>
          </div>

          <div className="concept-symbol">
            <span>日の丸</span>
            <div></div>
          </div>
        </section>

        {/* FEATURES */}
        <section className="features" id="features">
          <div className="section-heading">
            <div>
              <p className="eyebrow">02 / THE EXPERIENCE</p>
              <h2>Made for your memories.</h2>
            </div>

            <p>
              シンプルに、楽しく。
              <br />
              Simple, fun, and memorable.
            </p>
          </div>

          <div className="feature-list">
            <article className="feature-card">
              <span className="feature-number">01</span>
              <div className="feature-icon">◎</div>
              <h3>Capture</h3>
              <p>Take four pictures and capture your favorite expressions.</p>
              <span className="feature-jp">撮影</span>
            </article>

            <article className="feature-card">
              <span className="feature-number">02</span>
              <div className="feature-icon">▧</div>
              <h3>Customize</h3>
              <p>Choose a beautiful frame that matches your personality.</p>
              <span className="feature-jp">デザイン</span>
            </article>

            <article className="feature-card">
              <span className="feature-number">03</span>
              <div className="feature-icon">↗</div>
              <h3>Share</h3>
              <p>Save your pictures and share your memories with others.</p>
              <span className="feature-jp">共有</span>
            </article>
          </div>
        </section>

        {/* START */}
        <section className="start-section" id="start">
          <p className="eyebrow">YOUR STORY STARTS HERE</p>

          <h2>
            Ready for your
            <br />
            <span>photo moment?</span>
          </h2>

          <p>Make today a memory worth keeping.</p>

          <button
            className="primary-button"
            type="button"
            onClick={startCamera}
          >
            START PHOTO SESSION ↗
          </button>

          {cameraError && (
            <p className="camera-error">{cameraError}</p>
          )}

          <span className="start-japanese">最高の瞬間を</span>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="footer">
        <a href="#home" className="logo">
          RINGO<span> PHOTO.</span>
        </a>

        <p>思い出を、あなたらしく。</p>

        <span>© 2026 RINGO PHOTO. ALL RIGHTS RESERVED.</span>
      </footer>

      {/* CAMERA MODAL */}
      {cameraOpen && (
        <div className="camera-overlay">
          <div className="camera-modal">
            <div className="camera-header">
              <div>
                <p className="eyebrow">RINGO PHOTO CLUB</p>
                <h2>Photo Session</h2>
              </div>

              <button
                className="camera-close"
                onClick={closeCamera}
                type="button"
              >
                ✕
              </button>
            </div>

            <p className="camera-counter">
              PHOTO {photos.length + 1} / 4
            </p>

            <div className="camera-view">
              <video ref={videoRef} autoPlay playsInline muted />

              <div className="camera-frame">
                <span>RINGO PHOTO</span>
              </div>
            </div>

            <div className="camera-controls">
              {photos.length < 4 ? (
                <button
                  className="capture-button"
                  onClick={takePhoto}
                  type="button"
                >
                  <span></span>
                  TAKE PHOTO
                </button>
              ) : (
                <p className="camera-complete">
                  FOUR PHOTOS COMPLETED!
                </p>
              )}
            </div>

            <div className="camera-previews">
              {photos.map((photo, index) => (
                <div className="camera-thumbnail" key={index}>
                  <img src={photo} alt={`Photo ${index + 1}`} />
                  <span>0{index + 1}</span>
                </div>
              ))}

              {[...Array(4 - photos.length)].map((_, index) => (
                <div className="camera-thumbnail empty" key={`empty-${index}`}>
                  <span>0{photos.length + index + 1}</span>
                </div>
              ))}
            </div>

            <div className="camera-footer">
              <button
                className="retake-button"
                onClick={retakePhoto}
                disabled={photos.length === 0}
                type="button"
              >
                ↶ RETAKE LAST PHOTO
              </button>

              <button
                className="finish-button"
                onClick={finishSession}
                disabled={photos.length !== 4}
                type="button"
              >
                FINISH SESSION ↗
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESULT MODAL */}
      {resultOpen && (
        <div className="camera-overlay result-overlay">
          <div className="result-modal">

            <div className="result-header">
              <div>
                <p className="eyebrow">YOUR SESSION IS READY</p>
                <h2>Your Photo Memories.</h2>
              </div>

              <button
                className="camera-close"
                onClick={() => setResultOpen(false)}
                type="button"
              >
                ✕
              </button>
            </div>

            <div className={`result-strip frame-${selectedFrame}`}>
              <div className="result-strip-heading">
                RINGO PHOTO CLUB
                <small>YOUR MEMORIES · 2026</small>
              </div>

              {photos.map((photo, index) => (
                <div className="result-photo" key={index}>
                  <img src={photo} alt={`Your photo ${index + 1}`} />
                  <span>0{index + 1}</span>
                </div>
              ))}

              <div className="result-strip-footer">
                思い出を、あなたらしく。
              </div>
            </div>

            <div className="frame-selection">
              <p className="eyebrow">CHOOSE YOUR FRAME</p>

              <div className="frame-options">
                {frames.map(frame => (
                  <button
                    key={frame.id}
                    type="button"
                    className={`frame-option ${selectedFrame === frame.id ? 'active' : ''}`}
                    onClick={() => setSelectedFrame(frame.id)}
                  >
                    <span className={`frame-swatch swatch-${frame.id}`}></span>
                    <strong>{frame.name}</strong>
                    <small>{frame.description}</small>
                  </button>
                ))}
              </div>
            </div>

            <p
              role="status"
              aria-live="polite"
              style={{ margin: '18px 0', textAlign: 'center', fontSize: '14px' }}
            >
              {cloudStatus}
            </p>

            {cloudStatus.startsWith('Gagal') && (
              <button
                className="retake-button"
                type="button"
                onClick={saveSessionToSupabase}
                disabled={isSaving}
                style={{ display: 'block', margin: '0 auto 16px' }}
              >
                {isSaving ? 'SAVING...' : 'TRY SAVING AGAIN'}
              </button>
            )}

            <div className="result-actions">
              <button
                className="retake-button"
                type="button"
                onClick={newSession}
              >
                NEW SESSION
              </button>

              <button
                className="finish-button"
                type="button"
                onClick={downloadPhoto}
              >
                DOWNLOAD PHOTO ↗
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  )
}

export default App
