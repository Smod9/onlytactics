import { useState } from 'react'
import { persistReplay } from '@/replay/manager'

export const ReplaySaveButton = () => {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  )

  const save = async () => {
    setStatus('saving')
    const result = await persistReplay()
    if (result.ok) {
      setStatus('saved')
      window.setTimeout(() => setStatus('idle'), 2000)
    } else {
      setStatus('error')
      window.setTimeout(() => setStatus('idle'), 2000)
    }
  }

  return (
    <div className="replay-save">
      <button type="button" onClick={() => void save()} disabled={status === 'saving'}>
        {status === 'saving' ? 'Saving…' : 'Save Replay'}
      </button>
      {status === 'error' && <span>Replay not ready yet.</span>}
      {status === 'saved' && <span>Saved to library.</span>}
    </div>
  )
}

