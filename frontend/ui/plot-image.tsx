import { preact, Signal, signals, JSX } from "../dep.ts"
import { OverlayDiv } from "./overlay-div.tsx"



export class PlotImage extends preact.Component {
    img_ref:preact.RefObject<HTMLImageElement> = preact.createRef()

    $initialized:Signal<boolean> = new Signal(false)
    $is_loading: Signal<boolean> = new Signal(false)

    $overlay_message: Readonly<Signal<string>> = signals.computed(
        () => this.$is_loading.value
            ? 'Plots are loading...'
            : 'Select a MSEED channel and time to plot here.'
    )

    $overlay_on:Readonly<Signal<boolean>> = signals.computed(
        () => !this.$initialized.value || this.$is_loading.value
    )

    render(): JSX.Element {
        return <div class='container' style={{position:'relative', width:'100%'}}>
            <img 
                ref={this.img_ref} 
                style={{width:'100%', height:'100%', border:"1px gray solid"}} 
            />

            <OverlayDiv $visible={this.$overlay_on}>
                { this.$overlay_message.value }
            </OverlayDiv>
        </div>
    }

    set_loading(loading:boolean): void {
        this.$is_loading.value = loading
    }

    set_src(file:File) {
        const objurl:string = URL.createObjectURL(file)
        this.img_ref.current?.addEventListener(
            'load',
            () => URL.revokeObjectURL(objurl),
            {once:true}
        )
        this.img_ref.current!.src = objurl;
        this.$initialized.value = true;
        this.$is_loading.value = false
    }
}
