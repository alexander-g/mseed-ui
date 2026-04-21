import { preact, Signal, signals, JSX } from "../dep.ts"
import { OverlayDiv } from "./overlay-div.tsx"



type PlotImageProps = {
    $is_loading: Readonly<Signal<boolean>>
}

export class PlotImage extends preact.Component<PlotImageProps> {
    img_ref:preact.RefObject<HTMLImageElement> = preact.createRef()

    $initialized:Signal<boolean> = new Signal(false)
    $overlay_message: Readonly<Signal<string>> = signals.computed(
        () => this.props.$is_loading.value
            ? 'Loading...'
            : 'Select a MSEED channel and time to plot here.'
    )

    $overlay_on:Readonly<Signal<boolean>> = signals.computed(
        () => !this.$initialized.value || this.props.$is_loading.value
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

    set_src(file:File): void {
        const objurl:string = URL.createObjectURL(file)
        this.img_ref.current?.addEventListener(
            'load',
            () => URL.revokeObjectURL(objurl),
            {once:true}
        )
        this.img_ref.current!.src = objurl;
        this.$initialized.value = true;
    }
}
