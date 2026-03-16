import { preact, JSX } from "./dep.ts"


function App(): JSX.Element {
    return <body>
        Hi.
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

export function hydrate_body(body_jsx:JSX.Element, id:string): void {
    const body: Element|null = document.querySelector(`body#${id}`)
    if(body && body.parentElement) {
        preact.hydrate(body_jsx, body.parentElement)
    }
}

if(!globalThis.Deno){
    hydrate_body(<App />, 'base')
}


