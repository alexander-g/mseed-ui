import * as preact from 'preact'
import { JSX }     from 'preact'
import { Signal }  from '@preact/signals'




export class DropZone extends preact.Component {

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

    on_drop = (event:DragEvent) => {
        event.preventDefault();
        this.$background.value = null;

        for (const item of Array.from(event.dataTransfer?.items ?? [])) {
            const entry:FileSystemEntry|null = item.webkitGetAsEntry?.();
            if (entry)
              traverse_entry(entry);
        }
    }

}




function traverse_entry(entry:FileSystemEntry, path:string = ""): void {
    if(entry.isFile) {
        (entry as FileSystemFileEntry).file((file) => {
            const full_path = `${path}${file.name}`;
            console.log("File:", full_path, file.size);
        });
    } else if (entry.isDirectory) {
        const dir_reader:FileSystemDirectoryReader = 
            (entry as FileSystemDirectoryEntry).createReader();
        dir_reader.readEntries((entries) => {
            for (const child of entries)
                traverse_entry(child, `${path}${entry.name}/`);
        });
    }
}
