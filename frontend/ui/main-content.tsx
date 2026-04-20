import { preact, Signal, signals, JSX } from "../dep.ts"

import { D3Map }         from "./d3-map.tsx"
import { MSEED_Heatmap } from "./mseed-heatmap.tsx"
import { PlotImage }     from "./plot-image.tsx"
import { tremorwasm }    from "../lib/file-input.ts"

import { initialize_in_worker as initialize_pyodide } from "../lib/pyodide.ts"
import { is_deno, strftime_ISO8601 } from "../lib/util.ts"

import type { AppConfig }         from "../index.tsx"
import type { InferenceEvent }    from "./mseed-heatmap.tsx"
import type { IPyodide }          from "../lib/pyodide.ts"
import type { Marker, MarkerVisual } from "./d3-map.tsx"
import type { MSEED_Meta }        from "../../wasm-cpp/mseed-wasm.ts"
import type { MSEED_FileAndMeta } from "../lib/file-input.ts"
import type { Station }           from "../lib/station-xml.ts"
import type { QuakeEvent }        from "../lib/quakeml.ts"





type MainContentProps = {
    /** Currently loaded MSEED meta data */
    $mseeds: Readonly<Signal<MSEED_FileAndMeta[]>>

    /** Events recognized as positive during inference. */
    $inference: Signal<InferenceEvent[]>;

    /** Stations from a stationxml file */
    $stations: Signal<Station[]>;

    /** Events from a quakeml file */
    $events: Signal<QuakeEvent[]>;

    /** Config set during build */
    app_config: AppConfig;
}


/** The main UI, showing a heatmap, plots and a map with stations.
 *  Coordinating between them. */
export class MainContent extends preact.Component<MainContentProps> {
    render(): JSX.Element {
        return (
        <div style = {{
            display: 'flex',
            flexDirection:'column',
            height: '100%',
        }}>
            {/* Row 1 */}
            <div style = {{
                width: '100%',
                height: '50%',
            }}>
                <MSEED_Heatmap 
                    $mseed_meta = {this.$mseed_meta} 
                    $inference  = {this.props.$inference}
                    $events     = {this.props.$events}
                    on_click    = {this.on_heatmap_item_select}
                    on_mseed_hover  = {this.on_mseed_hover}
                    on_events_hover = {this.on_events_hover}
                    $highlighted_station = {this.$highlighted_station}
                />
            </div>

            {/* Row 2 */}
            <div style = {{
                display: 'flex',
                width: '100%',
                height: '50%',
            }}>
                <PlotImage ref={this.plotimg_ref} />
                
                <PlotImage ref={this.spectrogram_img_ref} />
                
                <D3Map 
                    $markers = {this.$map_markers} 
                    on_marker_hover = {this.on_marker_hover} 
                    $highlighted_markers = {this.$highlighted_station_index}
                    $overlay_visible = {this.$map_overlay_visible}
                />
            </div>
        </div>
        )
    }

    override async componentDidMount(): Promise<void> {
        const pyodide_vendored:boolean = 
            self.app_config?.pyodide_vendored ?? is_deno();
        const pyo:IPyodide|Error = await initialize_pyodide(pyodide_vendored)
        if(pyo instanceof Error) {
            console.error('Could not load pyodide')
            console.error(pyo as Error)
            return;
        }
        this.pyodide = pyo;
    }


    /** MSEED meta data without the files */
    $mseed_meta: Readonly<Signal<MSEED_Meta[]>> = signals.computed(
        () => this.props.$mseeds.value.map( m => m.meta )
    )

    /** Stations converted to D3Map Markers */
    $map_markers:Readonly<Signal<Marker[]>> = signals.computed( () => {
        const mseed_meta:MSEED_Meta[] = this.$mseed_meta.value
        const stations:Station[] = this.props.$stations.value
        const station_markers:Marker[] = stations.map((station:Station) => {
            const has_mseed_meta:boolean = 
                station_has_mseed_meta(station, mseed_meta);
            const visual:MarkerVisual = has_mseed_meta
                ? {
                    // station with associated mseed data (red)
                    shape:           'circle',
                    color:           'red',
                    highlight_color: '#f57c00',
                    stroke_color:    '#ffffff',
                    size:            6,
                }
                : {
                    // station without mseed data (gray)
                    shape:           'circle',
                    color:           '#9aa4ad',
                    highlight_color: '#f57c00',
                    stroke_color:    '#3f0f25',
                    size:            5
                }

            return {
                latitude:  station.latitude,
                longitude: station.longitude,
                label:     station.code,
                visual,
            }
        })

        const event_markers:Marker[] = this.$highlighted_events.value.map(
            (event:QuakeEvent) => ({
                latitude:  event.latitude,
                longitude: event.longitude,
                label:     `Event ${strftime_ISO8601(event.time)}`,
                visual: {
                    shape:           'diamond',
                    color:           '#1f6fb2',
                    highlight_color: '#ff8f00',
                    size:            8,
                },
                rings: {
                    distances_km: [50, 100],
                    color: 'rgba(31,111,178,0.5)',
                    stroke_width: 1.5,
                },
                ignore_for_centering: true,

            } as Marker)
        )

        return [
            ...station_markers,
            ...event_markers,
        ]
    })

    /** Show overlay only when no stations present */
    $map_overlay_visible:Readonly<Signal<boolean>> = signals.computed(
        () => this.props.$stations.value.length == 0
    )


    /** The currently highlighted station, either in the map or heatmap */
    $highlighted_station:Signal<Station|null> = new Signal(null)
    $highlighted_station_index:Signal<number[]> = new Signal([])

    /** Called when the user hovers on a station marker in the map */
    on_marker_hover = (index:number|null) => {
        this.$highlighted_station_index.value = (index != null) ? [index] : []

        const stations:Station[] = this.props.$stations.value
        if(index == null || !(index in stations))
            this.$highlighted_station.value = null;
        else
            this.$highlighted_station.value = stations[index]!
    }

    /** Called when user hovers on a data item in the heatmap */
    on_mseed_hover = (index:number|null) => {
        const mseeds:MSEED_FileAndMeta[] = this.props.$mseeds.value;
        if(index == null || !(index in mseeds)) {
            this.$highlighted_station.value = null;
            this.$highlighted_station_index.value = [];
        }
        else {
            const mseed:MSEED_FileAndMeta = mseeds[index]!
            const stations:Station[] = this.props.$stations.value
            for(const station_index in stations) {
                const station:Station = stations[station_index]!
                if(mseed.meta.code.includes(`.${station.code}.`)) {
                    this.$highlighted_station_index.value = [Number(station_index)];
                    this.$highlighted_station.value = station;
                    return;
                }
            }

            this.$highlighted_station.value = null;
            this.$highlighted_station_index.value = [];
        }
    }

    /** The currently hightlighted events */
    $highlighted_events: Signal<QuakeEvent[]> = new Signal([])

    /** Called when user hovers on a pixel in the heatmap. 
     *  Receives the events on this pixel. */
    on_events_hover = (event_indices:number[]) => {
        this.$highlighted_events.value = 
            event_indices
            .map( i => this.props.$events.value[i] )
            .filter(Boolean) as QuakeEvent[]
    }



    pyodide:IPyodide|undefined;

    /** Called when user clicks on an item in the heatmap.
     *  Reading the corresponding segment from the MSEED file and forwarding
     *  to other components for visualization. */
    on_heatmap_item_select = async (selected_file_index:number, i0:number, i1:number) => {
        this.plotimg_ref.current?.set_loading(true)
        this.spectrogram_img_ref.current?.set_loading(true)

        try {
            if(this.pyodide == undefined) {
                console.error('Pyodide not initialized')
                return
            }

            const mseed:MSEED_FileAndMeta|undefined = 
                this.props.$mseeds.value[selected_file_index]
            if(mseed == undefined) {
                console.error(`No mseed file at index ${selected_file_index}`)
                return;
            }
            
            const file:File|undefined = mseed.file;
            if(file == undefined)
                return;
            
            console.log('reading file: ', file.name)
            const data:Int32Array|Error = await tremorwasm.read_data(file)
            if(data instanceof Error) {
                console.log(`Could not read mseed data of ${file.name}`)
                return
            }
            console.log('data size:', data.length, i0, i1)

            const promise0:Promise<File|Error> = this.pyodide.plot_data(
                data,
                i0,
                i1,
                mseed.meta.start,
                mseed.meta.samplerate,
                mseed.meta.code,
            )
            const promise1:Promise<File|Error> = this.pyodide.plot_spectrogram(
                data,
                i0,
                i1,
                mseed.meta.start,
                mseed.meta.samplerate,
                mseed.meta.code,
            )

            const pngfile0:File|Error = await promise0;
            const pngfile1:File|Error = await promise1;
            if(pngfile0 instanceof Error) {
                console.error(`Error plotting data: ${pngfile0.message}`)
                return;
            }
            this.plotimg_ref.current?.set_src(pngfile0)

            if(pngfile1 instanceof Error) {
                console.error(`Error plotting spectrogram: ${pngfile1.message}`)
                return;
            }
            this.spectrogram_img_ref.current?.set_src(pngfile1)
        } finally {
            this.plotimg_ref.current?.set_loading(false)
            this.spectrogram_img_ref.current?.set_loading(false)
        }
    }


    // references to components
    plotimg_ref:preact.RefObject<PlotImage> = preact.createRef()
    spectrogram_img_ref:preact.RefObject<PlotImage> = preact.createRef()
}


/** Check if a station has matching MSEED meta. */
function station_has_mseed_meta(
    station:Station,
    mseed_meta:MSEED_Meta[],
): boolean {
    for(const meta of mseed_meta) {
        if(meta.code.includes(`.${station.code}.`))
            return true
    }

    return false
}
