import { preact, Signal, JSX } from "./dep.ts"

import { OSDImage } from "./ui/osd-image.tsx"
import { DropZone }  from "./ui/file-input.tsx"
import { MSEED_Heatmap } from "./ui/mseed-heatmap.tsx"

import {
    initialize as tremorwasm_initialize,
    type TremorWasm,
    type MSEED_Meta,
} from "../wasm-cpp/tremor-wasm.ts"

const tremorwasm:TremorWasm = await tremorwasm_initialize()



/** Main application class */
class App extends preact.Component {
    
    $files: Signal<File[]> = new Signal([])
    $files_metadata: Signal<MSEED_Meta[]> = new Signal([])


    render(): JSX.Element {
        return <body>
            {/* <OSDImage /> */}
            <MSEED_Heatmap 
                $files = {this.$files_metadata} 
                on_click = { this.on_heatmap_item_select}
            />
            
            <DropZone on_files={this.on_files}/>
        </body>
    }

    on_files = async (files:File[]) => {
        const all_metas:MSEED_Meta[] = []
        const all_files:File[] = []

        const t0:number = performance.now()
        for(const f of files) {
            const meta:MSEED_Meta|Error = await tremorwasm.read_metadata(f)
            if(meta instanceof Error) {
                console.log(`Could not read mseed meta data of ${f.name}`)
                continue;
            }
            
            all_metas.push(meta);
            all_files.push(f);
        }
        const t1:number = performance.now()
        console.log(`Metadata of ${all_metas.length} files loaded in ${t1-t0}`)
        
        this.$files_metadata.value = all_metas;
        this.$files.value = all_files;
    }
    
    
    on_heatmap_item_select = async (selected_file_index:number) => {
        const file:File|undefined = this.$files.value[selected_file_index];
        if(file == undefined)
            return;
        
        console.log('reading file: ', file.name)
        const data:Int32Array|Error = await tremorwasm.read_data(file)
        if(data instanceof Error) {
            console.log(`Could not read mseed data of ${file.name}`)
            return
        }

        console.log('data size:', data.length)
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


