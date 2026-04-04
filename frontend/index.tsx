import { preact, Signal, signals, JSX } from "./dep.ts"

import { DropZone }  from "./ui/file-input.tsx"
import { 
    MSEED_Heatmap, 
    type InferenceEvent 
} from "./ui/mseed-heatmap.tsx"
import { D3Map } from "./ui/d3-map.tsx"
import { 
    initialize_in_worker as pyo_initialize, 
    type IPyodide 
} from "./lib/pyodide.ts"
import { PlotImage } from "./ui/plot-image.tsx"

import { 
    process_dropped_files, 
    tremorwasm,  
    type ProcessedFiles 
}                       from "./lib/file-input.ts"
import type { Station } from "./lib/station-xml.ts"
import { is_deno }      from "./lib/util.ts";

import { type MSEED_Meta } from "../wasm-cpp/mseed-wasm.ts"


//const tremorwasm:TremorWasm = await tremorwasm_initialize()





export type AppConfig = null | {
    /** Whether to fetch pyodide files from "/" (true) or from CDN (false) */
    pyodide_vendored: boolean,
}

// app config is set during build in a <script> inside <Head>
declare global {
    interface Window {
        app_config: AppConfig;
    }
}



/** Main application class */
class App extends preact.Component {
    pyodide:IPyodide|undefined;
    
    $files: Signal<File[]> = new Signal([])
    $files_metadata: Signal<MSEED_Meta[]> = new Signal([])
    $inference: Signal<InferenceEvent[]>  = new Signal([])
    $stations:  Signal<Station[]> = new Signal([])

    plotimg_ref:preact.RefObject<PlotImage> = preact.createRef()

    $initialized: Readonly<Signal<boolean>> = signals.computed(
        () => this.$files.value.length > 0
    )

    render(): JSX.Element {
        return <body>
            {/* <OSDImage /> */}
            <MSEED_Heatmap 
                $files     = {this.$files_metadata} 
                $inference = {this.$inference}
                on_click   = {this.on_heatmap_item_select}
            />
            <div
                style = {{
                    display: 'flex'
                }}
            >
                <PlotImage ref={this.plotimg_ref} />
                <D3Map $markers={this.$stations} />
            </div>
            
            <DropZone 
                $initialized = {this.$initialized}
                on_files     = {this.on_files}
            />
        </body>
    }

    on_files = async (files:File[]) => {

        const t0:number = performance.now()
        const processed:ProcessedFiles = await process_dropped_files(
            files,
            (processed: number, total: number) => {
                console.log(`Progress: ${processed}/${total} files processed`)
            }
        )
        const t1:number = performance.now()

        console.log(`Files loaded in ${t1-t0} ms`)
        console.log(`# of MSEED files:      ${processed.mseeds.length}`)
        console.log(`# of stations:         ${processed.stations.length}`)
        console.log(`# of inference events: ${processed.inference_events.length}`)
        console.log(`# of unknown files:    ${processed.unknown_files.length}`)
        
        this.$inference.value      = processed.inference_events;
        this.$files_metadata.value = processed.mseeds.map( m => m.meta );
        this.$files.value          = processed.mseeds.map( m => m.file );
        this.$stations.value       = processed.stations
    }

    override async componentDidMount(): Promise<void> {
        const pyodide_vendored:boolean = 
            self.app_config?.pyodide_vendored ?? is_deno();
        const pyo:IPyodide|Error = await pyo_initialize(pyodide_vendored)
        if(pyo instanceof Error) {
            console.error('Could not load pyodide')
            console.error(pyo as Error)
            return;
        }
        this.pyodide = pyo;
    }
    
    
    on_heatmap_item_select = async (selected_file_index:number, i0:number, i1:number) => {
        const file:File|undefined = this.$files.value[selected_file_index];
        if(file == undefined)
            return;
        
        console.log('reading file: ', file.name)
        const data:Int32Array|Error = await tremorwasm.read_data(file)
        if(data instanceof Error) {
            console.log(`Could not read mseed data of ${file.name}`)
            return
        }
        console.log('data size:', data.length, i0, i1)

        const pngfile:File|Error = await this.pyodide!.plot_data( data.slice(i0, i1) )
        if(pngfile instanceof Error) {
            console.error(`Error plotting data: ${pngfile.message}`)
            return;
        }

        this.plotimg_ref.current?.set_src(pngfile)
    }
}





type HeadProps = {
    title:      string,
    import_src: string,
    config:     AppConfig,
}

function Head(props:HeadProps): JSX.Element {
    const configjson:string = JSON.stringify(props.config).replace(/</g, "\\u003c");
    return <head>
        <title>{ props.title }</title>
        <script type="module" src={props.import_src}></script>
        <script dangerouslySetInnerHTML={ {
            __html: `window.app_config = ${ configjson }`
        } } />
    </head>
}



/** Main JSX entry point */
export function Index(config?:AppConfig): JSX.Element {
    return <html>
        <Head title="MSEED UI" import_src="index.tsx.js" config={config ?? null}/>
        <App />
    </html>
}

export function hydrate_body(body_jsx:JSX.Element): void {
    const body: Element|null = document.querySelector(`body`)
    if(body && body.parentElement) {
        preact.hydrate(body_jsx, body.parentElement)
    }
}

if(!globalThis.Deno){
    hydrate_body(<App />)
}


