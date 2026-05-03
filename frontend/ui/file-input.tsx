import * as preact from 'preact'
import { JSX }     from 'preact'
import { Signal }  from '@preact/signals'


const MESSAGE_UNINITIALIZED = <>
    Drop files to get started. 
    <br/>
    Supported file types: MiniSEED, QuakeML, StationXML.
</>
const MESSAGE_CAN_DROP      = 'Drop files here.'
const MESSAGE_LOADING       = 'Loading...'

const BACKGROUNDCOLOR_UNINITIALIZED = 'honeydew'
const BACKGROUNDCOLOR_CAN_DROP      = 'lightblue'


export type DropProgress = {
    processed: number,
    total: number,
}



export class DropZone extends preact.Component<{
    $initialized: Readonly<Signal<boolean>>
    $progress:    Readonly<Signal<DropProgress|null>>
    on_files:     (files:File[]) => void|Promise<void>;
}> {

    $css_display:Signal<'none'|'flex'> = new Signal('flex')
    $background: Signal<string|null>   = new Signal(BACKGROUNDCOLOR_UNINITIALIZED)
    $message:    Signal<string|JSX.Element>        = new Signal(MESSAGE_UNINITIALIZED)
    $opacity:    Signal<0|1>           = new Signal(1)

    #_ = this.props.$initialized.subscribe(
        (value:boolean) => { this.$opacity.value = value? 0 : 1; }
    )

    render(): JSX.Element {
        const progress:{processed:number, total:number}|null = this.props.$progress.value
        const loading_message:string =
            progress == null
                ? MESSAGE_LOADING
                : `Loading ${progress.processed}/${progress.total}...`
        const message:string|JSX.Element =
            this.$message.value == MESSAGE_LOADING
                ? loading_message
                : this.$message.value

        return <div
            style = {{
                background: this.$background.value,
                position:   'fixed',
                width:      '100%',
                height:     '100%',
                top:         0,
                left:        0,
                opacity:     this.$opacity.value,
                pointerEvents:  'none',
                fontFamily:     'sans-serif',
                display:        this.$css_display.value,
                justifyContent: 'center',
                alignItems:     'center',
                textAlign:      'center',
            }}
        >
            { message }
        </div>
    }

    override componentDidMount(): void {
        globalThis.ondragover  = this.on_drag_over;
        globalThis.ondragenter = this.on_drag_enter;
        globalThis.ondragleave = this.on_drag_leave;
        globalThis.ondrop      = this.on_drop;
    }

    on_drag_over = (event:DragEvent) => {
        event.preventDefault();
        if(event.dataTransfer)
            event.dataTransfer.dropEffect = 'copy'; // what for?
    }



    #current_drag_target: EventTarget|null = null;

    on_drag_enter = (event:DragEvent) => {
        event.preventDefault();
        this.$message.value    = MESSAGE_CAN_DROP;
        this.$background.value = BACKGROUNDCOLOR_CAN_DROP;
        this.$opacity.value    = 1;

        this.#current_drag_target = event.target;
    }

    on_drag_leave = (event:DragEvent) => {
        event.preventDefault();

        if(this.#current_drag_target == event.target) {
            this.$message.value    = MESSAGE_UNINITIALIZED;
            this.$background.value = BACKGROUNDCOLOR_UNINITIALIZED;
            this.$opacity.value    = this.props.$initialized.value? 0 : 1;
        }
    }

    on_drop = async (event:DragEvent) => {
        event.preventDefault();

        this.$message.value = MESSAGE_LOADING;

        try {
            const dropped_items:DataTransferItem[] = 
                Array.from(event.dataTransfer?.items ?? [])
            console.log('# of dropped items: ', dropped_items.length)

            const valid_files_promises:Promise<File[]>[] = []
            for(const item of dropped_items) {
                const entry:FileSystemEntry|null = item.webkitGetAsEntry?.();
                if(entry)
                    valid_files_promises.push( traverse_entry(entry) );
            }
            const valid_files:File[] = 
                (await Promise.all(valid_files_promises)).flat()
            
            console.log('# of valid files: ', valid_files.length)
            await this.props.on_files(valid_files)
        } finally {
            this.$message.value    = MESSAGE_UNINITIALIZED;
            this.$background.value = BACKGROUNDCOLOR_UNINITIALIZED;
            this.$opacity.value    = this.props.$initialized.value? 0 : 1;
        }
    }

}



async function traverse_entry(entry:FileSystemEntry): Promise<File[]> {
    if(entry.isFile) {
        const f:File = await new Promise( (resolve) => {
            (entry as FileSystemFileEntry).file(resolve)
        } )
        return [f]
    } else if(entry.isDirectory) {
        const dir_reader:FileSystemDirectoryReader = 
            (entry as FileSystemDirectoryEntry).createReader();

        const all:FileSystemEntry[] = []
        // NOTE: chrome only returns 100 entries at a time, therefore while loop
        while(true) {
            const entries:FileSystemEntry[] = await new Promise( (resolve) => {
                dir_reader.readEntries(resolve)
            } )
            if(entries.length == 0)
                break;

            all.push(...entries)
        }
        
        const all_files:File[] = []
        for(const entry of all)
            all_files.push( ...(await traverse_entry(entry)) )
        return all_files
    } else
        return []
}
