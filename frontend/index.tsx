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

    $loaded_files:Signal<MSEED_Meta[]> = new Signal([])


    render(): JSX.Element {
        return <body>
            {/* <OSDImage /> */}
            <MSEED_Heatmap $files={this.$loaded_files} />
            
            <DropZone on_files={this.on_files}/>
        </body>
    }

    on_files = async (files:File[]) => {
        const all_metas:MSEED_Meta[] = []

        const t0:number = performance.now()
        for(const f of files) {
            const meta:MSEED_Meta|Error = await tremorwasm.read_metadata(f)
            if(meta instanceof Error) {
                console.log(`Could not read mseed meta data of ${f.name}`)
                continue;
            }
            
            all_metas.push(meta);
        }
        const t1:number = performance.now()
        console.log(`Metadata of ${all_metas.length} files loaded in ${t1-t0}`)
        this.$loaded_files.value = all_metas;
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


