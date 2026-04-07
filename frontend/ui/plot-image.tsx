import { preact, Signal, signals, JSX } from "../dep.ts"
import { OverlayDiv } from "./overlay-div.tsx"



export class PlotImage extends preact.Component {
    img_ref:preact.RefObject<HTMLImageElement> = preact.createRef()

    $initialized:Signal<boolean> = new Signal(false)
    $overlay_on:Readonly<Signal<boolean>> = signals.computed(
        () => !this.$initialized.value
    )

    render(): JSX.Element {
        return <div class='container' style={{position:'relative', width:'100%'}}>
            <img 
                ref={this.img_ref} 
                style={{width:'100%', height:'100%', border:"1px gray solid"}} 
            />

            <OverlayDiv $visible={this.$overlay_on}>
                Select a MSEED channel and time to plot here.
            </OverlayDiv>
        </div>
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
    }
}
