import { preact, JSX } from "./dep.ts"

import { OSDImage } from "./ui/osd-image.tsx"
import { DropZone } from "./ui/file-input.tsx"

import { test_pyo } from "./lib/pyodide.ts"


class PyoTestButton extends preact.Component {
    render(): JSX.Element {
        return <button 
            type    = 'button'
            onClick = {this.onclick}
        >
            PYO
        </button>
    }

    onclick = () => {
        console.log('click');
        test_pyo();
    }
}



/** Main application class */
function App(): JSX.Element {
    return <body>
        <DropZone />

        <PyoTestButton />
        <OSDImage />
    </body>
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


