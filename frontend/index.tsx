import { preact, Signal, JSX } from "./dep.ts"

import { DropZone }  from "./ui/file-input.tsx"
import { MSEED_Heatmap, type InferenceEvent } from "./ui/mseed-heatmap.tsx"
import { initialize as pyo_initialize, PYO } from "./lib/pyodide.ts"

import {
    initialize as tremorwasm_initialize,
    type TremorWasm,
    type MSEED_Meta,
} from "../wasm-cpp/tremor-wasm.ts"


const tremorwasm:TremorWasm = await tremorwasm_initialize()






/** Main application class */
class App extends preact.Component {
    pyodide:PYO|undefined;
    
    $files: Signal<File[]> = new Signal([])
    $files_metadata: Signal<MSEED_Meta[]> = new Signal([])
    $inference: Signal<InferenceEvent[]>  = new Signal([])

    plotimg_ref:preact.RefObject<HTMLImageElement> = preact.createRef()


    render(): JSX.Element {
        return <body>
            {/* <OSDImage /> */}
            <MSEED_Heatmap 
                $files     = {this.$files_metadata} 
                $inference = {this.$inference}
                on_click   = { this.on_heatmap_item_select}
            />
            <img ref={this.plotimg_ref}/>
            
            <DropZone on_files={this.on_files}/>
        </body>
    }

    on_files = async (files:File[]) => {
        const all_metas:MSEED_Meta[] = []
        const all_inference_events:InferenceEvent[] = []
        const all_files:File[] = []

        const t0:number = performance.now()
        for(const f of files) {
            const meta:MSEED_Meta|Error = await tremorwasm.read_metadata(f)
            if(meta instanceof Error) {
                const inference:InferenceEvent[]|Error = await read_csv_inference_file(f)
                if(inference instanceof Error){
                    console.log(`Could not read ${f.name}`)
                    continue;
                }
                
                all_inference_events.push(...inference);
                continue;
            }
            
            all_metas.push(meta);
            all_files.push(f);
        }
        const t1:number = performance.now()
        console.log(`Metadata of ${all_metas.length} files loaded in ${t1-t0}`)
        console.log(`${all_inference_events.length} inference events loaded`)
        
        this.$inference.value = all_inference_events;
        this.$files_metadata.value = all_metas;
        this.$files.value = all_files;
    }

    override async componentDidMount(): Promise<void> {
        const pyo:PYO|Error = await pyo_initialize()
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

        const pngfile:File = await this.pyodide!.plot_data( data.slice(i0, i1) )
        const objurl:string = URL.createObjectURL(pngfile)
        this.plotimg_ref.current!.src = objurl
        this.plotimg_ref.current?.addEventListener(
            'load',
            () => URL.revokeObjectURL(objurl),
            {once:true}
        )
    }
}



async function read_csv_inference_file(file:File): Promise<InferenceEvent[]|Error> {
    try {
        const code:string = file.name.split('.').slice(0,4).join('.')
        const content:string = await file.text()
        const lines:string[] = content.trim().split('\n')

        const inference:InferenceEvent[] = []
        for(const line of lines) {
            const d = new Date(line)
            if(isNaN(d.getTime())) {
                return new Error();
            }

            inference.push( {code, time:d} )
        }
        return inference;
    } catch {
        return new Error('Could not read inference csv file')
    }
}


function Head(props:{title:string, import_src:string}): JSX.Element {
    return <head>
        <title>{ props.title }</title>
        <script type="module" src={props.import_src}></script>
    </head>
}



/** Main JSX entry point */
export function Index(): JSX.Element {
    return <html>
        <Head title="Tremor UI" import_src="index.tsx.js" />
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


