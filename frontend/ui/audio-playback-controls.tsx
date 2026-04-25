import { preact, Signal, JSX } from '../dep.ts'
import { get_selectable_button_style } from './selectable-panels-row.tsx'


const SPEED_MIN:number = 0.5
const SPEED_MAX:number = 10
const SPEED_STEP:number = 0.5

const GAIN_MIN:number = 0
const GAIN_MAX:number = 5
const GAIN_STEP:number = 0.1



export type AudioWaveform = {
    /** Raw waveform data */
    data: Float32Array;

    /** Samples per second (Hz) */
    samplerate: number;
}


export type AudioPlaybackControlsProps = {
    /** @input Waveform to play back. None if null */
    $audiodata: Readonly<Signal<AudioWaveform | null>>
    
    /** Called during playback with the current position  */
    on_position_change?: (position_seconds:number) => void
}


/** Render audio transport controls and emit UI changes. */
export class AudioPlaybackControls extends preact.Component<AudioPlaybackControlsProps> {

    render(): JSX.Element {
        const duration_seconds:number = 
            get_duration_seconds(this.props.$audiodata.value)
        const has_audio:boolean = duration_seconds > 0
        const position_max:number = duration_seconds > 0 ? duration_seconds : 1
        const position_seconds:number = 
            clamp_audio_value(this.$position_seconds.value, 0, duration_seconds)

        const position_text:string = 
            get_position_status_text(position_seconds, duration_seconds)

        return <div style={{
            display:    'flex',
            alignItems: 'center',
            flexWrap:   'wrap',
            rowGap:     '8px',
            columnGap:  '12px',
            color:      '#3f3f3f',
            fontSize:   '12px',
        }}>
            <div style={{
                display:    'flex',
                alignItems: 'center',
                gap:        '6px',
            }}>
                <button
                    type     = 'button'
                    onClick  = {this.on_start_click}
                    style    = {get_selectable_button_style(this.$is_playing.value)}
                    disabled = {this.$is_playing.value || !has_audio}
                >
                    Start
                </button>
                <button
                    type     = 'button'
                    onClick  = {this.on_pause_click}
                    style    = {
                        get_selectable_button_style(!this.$is_playing.value && has_audio)
                    }
                    disabled = {!this.$is_playing.value || !has_audio}
                >
                    Pause
                </button>
                <button
                    type     = 'button'
                    onClick  = {this.on_stop_click}
                    style    = {get_selectable_button_style(false)}
                    disabled = {!this.$is_playing.value && position_seconds == 0}
                >
                    Stop
                </button>
            </div>

            <label style={{
                display:    'flex',
                alignItems: 'center',
                gap:        '6px',
            }}>
                <span>Speed</span>
                <input
                    type    = 'range'
                    min     = {SPEED_MIN}
                    max     = {SPEED_MAX}
                    step    = {SPEED_STEP}
                    value   = {this.$speed.value}
                    onInput = {this.on_speed_input}
                    disabled = {!has_audio}
                />
                <span style={{ minWidth: '42px' }}>
                    {this.$speed.value.toFixed(2)}x
                </span>
            </label>

            <label style={{
                display:    'flex',
                alignItems: 'center',
                gap:        '6px',
            }}>
                <span>Gain</span>
                <input
                    type    = 'range'
                    min     = {GAIN_MIN}
                    max     = {GAIN_MAX}
                    step    = {GAIN_STEP}
                    value   = {this.$gain.value}
                    onInput = {this.on_gain_input}
                    disabled = {!has_audio}
                />
                <span style={{ minWidth: '42px' }}>
                    {this.$gain.value.toFixed(2)}
                </span>
            </label>

            <label style={{
                display:    'flex',
                alignItems: 'center',
                gap:        '6px',
                minWidth:   '220px',
                flex:       '1 1 220px',
            }}>
                <span>Position</span>
                <input
                    type     = 'range'
                    min      = {0}
                    max      = {position_max}
                    step     = {0.01}
                    value    = {position_seconds}
                    onInput  = {this.on_position_input}
                    disabled = {!has_audio}
                    style    = {{ flex: '1 1 auto' }}
                />
                <output>{position_text}</output>
            </label>
        </div>
    }

    $is_playing: Signal<boolean> = new Signal(false)
    
    /** Current playback speed factor */
    $speed: Signal<number> = new Signal(1)
    
    /** Current gain factor */
    $gain:  Signal<number> = new Signal(1)

    /** Current playback position */
    $position_seconds: Signal<number> = new Signal(0)

    on_start_click = (): void => {
        this.$is_playing.value = true
    }

    on_pause_click = (): void => {
        this.$is_playing.value = false
    }

    on_stop_click = (): void => {
        this.$is_playing.value = false
        this.$position_seconds.value = 0
        this.props.on_position_change?.(0)
    }

    on_speed_input = (event:Event): void => {
        const target:HTMLInputElement = event.currentTarget as HTMLInputElement
        const parsed:number|Error = 
            parse_slider_number(target.value, SPEED_MIN, SPEED_MAX)
        if(parsed instanceof Error)
            return

        this.$speed.value = parsed
    }

    on_gain_input = (event:Event): void => {
        const target:HTMLInputElement = event.currentTarget as HTMLInputElement
        const parsed:number|Error = 
            parse_slider_number(target.value, GAIN_MIN, GAIN_MAX)
        if(parsed instanceof Error)
            return

        this.$gain.value = parsed
    }

    on_position_input = (event:Event): void => {
        const target:HTMLInputElement = event.currentTarget as HTMLInputElement
        const duration_seconds:number = get_duration_seconds(this.props.$audiodata.value)

        const parsed:number|Error = 
            parse_slider_number(target.value, 0, duration_seconds)
        if(parsed instanceof Error)
            return

        this.$position_seconds.value = parsed
        this.props.on_position_change?.(parsed)
    }
}


/** Clamp finite value to inclusive bounds. */
export function clamp_audio_value(value:number, min:number, max:number): number {
    if(!Number.isFinite(value))
        return min
    return Math.max( Math.min(value, max), min )
}

/** Parse value of a slider <input> and clamp into bounds. */
export function parse_slider_number(
    raw_value:string,
    minimum:number,
    maximum:number,
): number|Error {
    const parsed_value:number = Number(raw_value)
    if(!Number.isFinite(parsed_value))
        return new Error('Invalid slider number')

    return clamp_audio_value(parsed_value, minimum, maximum)
}

/** Format seconds into mm:ss.mmm. */
export function format_playback_position(seconds:number): string|Error {
    if(!Number.isFinite(seconds) || seconds < 0)
        return new Error('Invalid playback position seconds')

    const minutes:number = Math.floor(seconds / 60)
    const remaining_seconds:number = Math.floor(seconds % 60)
    const milliseconds:number = Math.floor((seconds % 1) * 1000)

    const minute_text:string = String(minutes).padStart(2, '0')
    const second_text:string = String(remaining_seconds).padStart(2, '0')
    const millisecond_text:string = String(milliseconds).padStart(3, '0')

    return `${minute_text}:${second_text}.${millisecond_text}`
}

/** Build position output text for the control. */
export function get_position_status_text(
    position_seconds:number,
    duration_seconds:number,
): string {
    const clamped_position:number = 
        clamp_audio_value(position_seconds, 0, duration_seconds)

    const formatted_position:string|Error =
        format_playback_position(clamped_position)
    const formatted_duration:string|Error =
        format_playback_position(duration_seconds)

    if(formatted_position instanceof Error || formatted_duration instanceof Error)
        return '--:--.--- / --:--.---'

    return `${formatted_position} / ${formatted_duration}`
}

/** Compute the number of seconds for an audio waveform */
function get_duration_seconds(audio:AudioWaveform|null): number {
    if(audio == null)
        return 0

    const seconds:number = audio.data.length / audio.samplerate
    if(!Number.isFinite(seconds) || seconds <= 0)
        return 0
    return seconds
}
