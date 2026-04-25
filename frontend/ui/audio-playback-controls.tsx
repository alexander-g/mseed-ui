import { preact, JSX } from '../dep.ts'


/** Show audio playback controls placeholder. */
export class AudioPlaybackControls extends preact.Component {
    render(): JSX.Element {
        return <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: '#4b4b4b',
        }}>
            <div style={{
                padding: '2px 8px',
                border: '1px dashed #9a9a9a',
                borderRadius: '999px',
                fontSize: '11px',
            }}>
                Audio playback
            </div>
            <div style={{ fontSize: '11px' }}>
                Placeholder for play, rate, gain
            </div>
        </div>
    }
}
