import * as preact from 'preact'
import { JSX }     from 'preact'
import { Signal }  from '@preact/signals'




export class DropZone extends preact.Component<{
    on_files: (files:File[]) => void;
}> {

    $background:Signal<string|null> = new Signal(null)

    render(): JSX.Element {
        return <div
            style = {{
                background: this.$background.value,
                position:   'fixed',
                width:      '100%',
                height:     '100%',
                top:         0,
                left:        0,
                pointerEvents: 'none',
            }}
        >

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
        this.$background.value = 'pink';
        this.#current_drag_target = event.target;
    }

    on_drag_leave = (event:DragEvent) => {
        event.preventDefault();

        if(this.#current_drag_target == event.target)
            this.$background.value = null;
    }

    on_drop = async (event:DragEvent) => {
        event.preventDefault();
        this.$background.value = null;
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
        this.props.on_files(valid_files)
    }

}




function traverse_entry(entry:FileSystemEntry, path:string = ""): Promise<File[]> {

    const promise:Promise<File[]> = new Promise( (resolve) => {
        if(entry.isFile) {
            (entry as FileSystemFileEntry).file((file) => {
                const full_path = `${path}${file.name}`;
                //console.log("File:", full_path, file.size);
                resolve([file]);
            });
        } else if(entry.isDirectory) {
            const dir_reader:FileSystemDirectoryReader = 
                (entry as FileSystemDirectoryEntry).createReader();
            dir_reader.readEntries(async (entries) => {
                const output:File[] = []
                for(const child of entries)
                    output.push(
                        ...(await traverse_entry(child, `${path}${entry.name}/`))
                    );
                resolve(output);
            });
        }
    })
    return promise;
}
